package repository

import (
	"database/sql"
	"fmt"
	"lingradable/internal/model"
	"strings"
)

type ProductRepository struct {
	db *sql.DB
}

func NewProductRepository(db *sql.DB) *ProductRepository {
	return &ProductRepository{db: db}
}

// GetProducts с поиском, фильтрацией и сортировкой
func (r *ProductRepository) GetProducts(tags []string, isCustom bool, search string, sortBy string) ([]model.Product, error) {
	query := `
		SELECT DISTINCT p.id, p.name, p.type, p.description, p.links, p.icon_url, p.sha256_hash, 
		       p.author_id, p.status, p.created_at, u.login as author_login,
		       COUNT(DISTINCT r.id) as review_count,
		       COALESCE(AVG(r.rating), 0) as avg_rating,
		       COUNT(DISTINCT c.id) as comment_count
		FROM products p
		LEFT JOIN product_tags pt ON p.id = pt.product_id
		LEFT JOIN tags t ON pt.tag_id = t.id
		LEFT JOIN users u ON p.author_id = u.id
		LEFT JOIN reviews r ON p.id = r.product_id
		LEFT JOIN comments c ON p.id = c.product_id
		WHERE p.status = 'approved'
	`

	var args []interface{}
	argIndex := 1

	// Поиск по названию и описанию
	if search != "" {
		query += fmt.Sprintf(" AND (p.name ILIKE $%d OR p.description ILIKE $%d)", argIndex, argIndex+1)
		searchPattern := "%" + search + "%"
		args = append(args, searchPattern, searchPattern)
		argIndex += 2
	}

	// Фильтр по тегам
	if len(tags) > 0 {
		placeholders := make([]string, len(tags))
		for i, tag := range tags {
			placeholders[i] = fmt.Sprintf("$%d", argIndex)
			args = append(args, tag)
			argIndex++
		}
		query += fmt.Sprintf(" AND t.name IN (%s)", strings.Join(placeholders, ","))
	}

	// Фильтр кастомных
	if isCustom {
		query += " AND p.author_id IS NOT NULL"
	}

	query += " GROUP BY p.id, u.login"

	// Сортировка
	switch sortBy {
	case "rating":
		query += " ORDER BY avg_rating DESC, review_count DESC"
	case "reviews":
		query += " ORDER BY review_count DESC"
	case "comments":
		query += " ORDER BY comment_count DESC"
	case "newest":
		query += " ORDER BY p.created_at DESC"
	case "oldest":
		query += " ORDER BY p.created_at ASC"
	default:
		query += " ORDER BY p.created_at DESC"
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []model.Product
	for rows.Next() {
		var p model.Product
		var authorLogin, iconURL sql.NullString
		var reviewCount, commentCount sql.NullInt64
		var avgRating sql.NullFloat64

		err := rows.Scan(
			&p.ID, &p.Name, &p.Type, &p.Description, &p.Links, &iconURL,
			&p.SHA256Hash, &p.AuthorID, &p.Status, &p.CreatedAt, &authorLogin,
			&reviewCount, &avgRating, &commentCount,
		)
		if err != nil {
			return nil, err
		}

		if iconURL.Valid {
			p.IconURL = &iconURL.String
		}
		if authorLogin.Valid {
			p.AuthorLogin = &authorLogin.String
		}
		if reviewCount.Valid {
			p.ReviewCount = int(reviewCount.Int64)
		}
		if commentCount.Valid {
			p.CommentCount = int(commentCount.Int64)
		}
		if avgRating.Valid {
			p.AvgRating = avgRating.Float64
		}

		products = append(products, p)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return products, nil
}

// GetProductByID получает один продукт с полной статистикой
func (r *ProductRepository) GetProductByID(id int) (*model.Product, error) {
	query := `
		SELECT p.id, p.name, p.type, p.description, p.links, p.icon_url, p.sha256_hash, 
		       p.author_id, p.status, p.rejection_reason, p.created_at, 
		       p.moderated_at, p.moderator_id,
		       u.login as author_login,
		       COUNT(DISTINCT r.id) as review_count,
		       COALESCE(AVG(r.rating), 0) as avg_rating,
		       COUNT(DISTINCT c.id) as comment_count
		FROM products p
		LEFT JOIN users u ON p.author_id = u.id
		LEFT JOIN reviews r ON p.id = r.product_id
		LEFT JOIN comments c ON p.id = c.product_id
		WHERE p.id = $1
		GROUP BY p.id, u.login
	`

	var p model.Product
	var authorLogin, iconURL, rejectionReason sql.NullString
	var reviewCount, commentCount sql.NullInt64
	var avgRating sql.NullFloat64

	err := r.db.QueryRow(query, id).Scan(
		&p.ID, &p.Name, &p.Type, &p.Description, &p.Links, &iconURL,
		&p.SHA256Hash, &p.AuthorID, &p.Status, &rejectionReason,
		&p.CreatedAt, &p.ModeratedAt, &p.ModeratorID, &authorLogin,
		&reviewCount, &avgRating, &commentCount,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if authorLogin.Valid {
		p.AuthorLogin = &authorLogin.String
	}
	if rejectionReason.Valid {
		p.RejectionReason = &rejectionReason.String
	}
	if iconURL.Valid {
		p.IconURL = &iconURL.String
	}
	if reviewCount.Valid {
		p.ReviewCount = int(reviewCount.Int64)
	}
	if commentCount.Valid {
		p.CommentCount = int(commentCount.Int64)
	}
	if avgRating.Valid {
		p.AvgRating = avgRating.Float64
	}

	return &p, nil
}

// CreateProduct создаёт проект со статусом pending (для обычных пользователей)
func (r *ProductRepository) CreateProduct(p model.Product) (int, error) {
	query := `
        INSERT INTO products (name, type, description, links, sha256_hash, icon_url, author_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING id
    `

	var id int
	err := r.db.QueryRow(query, p.Name, p.Type, p.Description, p.Links,
		p.SHA256Hash, p.IconURL, p.AuthorID).Scan(&id)

	return id, err
}

// ApproveProduct одобряет продукт
func (r *ProductRepository) ApproveProduct(id, moderatorID int) error {
	query := `
		UPDATE products 
		SET status = 'approved', moderated_at = NOW(), moderator_id = $2
		WHERE id = $1 AND status = 'pending'
	`

	result, err := r.db.Exec(query, id, moderatorID)
	if err != nil {
		return err
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("продукт не найден или уже обработан")
	}

	return nil
}

// RejectProduct отклоняет продукт
func (r *ProductRepository) RejectProduct(id, moderatorID int, reason string) error {
	query := `
		UPDATE products 
		SET status = 'rejected', moderated_at = NOW(), 
		    moderator_id = $2, rejection_reason = $3
		WHERE id = $1 AND status = 'pending'
	`

	_, err := r.db.Exec(query, id, moderatorID, reason)
	return err
}

// GetTags получает список всех тегов
func (r *ProductRepository) GetTags() ([]model.Tag, error) {
	query := "SELECT id, name, description FROM tags ORDER BY name"

	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []model.Tag
	for rows.Next() {
		var t model.Tag
		err := rows.Scan(&t.ID, &t.Name, &t.Description)
		if err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return tags, nil
}

// CreateProductApproved создаёт проект сразу со статусом approved (для модераторов/админов)
func (r *ProductRepository) CreateProductApproved(p model.Product, moderatorID int) (int, error) {
	query := `
        INSERT INTO products (name, type, description, links, sha256_hash, icon_url, author_id, status, moderated_at, moderator_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', NOW(), $8)
        RETURNING id
    `

	var id int
	err := r.db.QueryRow(query, p.Name, p.Type, p.Description, p.Links,
		p.SHA256Hash, p.IconURL, p.AuthorID, moderatorID).Scan(&id)

	return id, err
}

// UpdateProduct обновляет данные проекта (только для модераторов)
func (r *ProductRepository) UpdateProduct(p model.Product) error {
	query := `
        UPDATE products 
        SET name = $1, type = $2, description = $3, links = $4, sha256_hash = $5, icon_url = $6
        WHERE id = $7
    `
	_, err := r.db.Exec(query, p.Name, p.Type, p.Description, p.Links, p.SHA256Hash, p.IconURL, p.ID)
	return err
}

// DeleteProduct удаляет проект (только для модераторов)
func (r *ProductRepository) DeleteProduct(id int) error {
	// CASCADE удалит связанные отзывы и комментарии автоматически, если настроены внешние ключи
	_, err := r.db.Exec("DELETE FROM products WHERE id = $1", id)
	return err
}

// UpdateProductWithAuthor обновляет проект с возможностью изменения author_id и icon_url
func (r *ProductRepository) UpdateProductWithAuthor(id int, name, ptype, description, links string, iconURL *string, authorID *int) error {
	query := `
        UPDATE products 
        SET name = $1, type = $2, description = $3, links = $4, icon_url = $5, author_id = $6
        WHERE id = $7
    `
	_, err := r.db.Exec(query, name, ptype, description, links, iconURL, authorID, id)
	return err
}

// В internal/repository/product_repo.go добавь:
func (r *ProductRepository) GetUserRole(userID int) (string, error) {
    var role string
    err := r.db.QueryRow(`SELECT role FROM users WHERE id = $1`, userID).Scan(&role)
    if err != nil {
        return "", err
    }
    return role, nil
}