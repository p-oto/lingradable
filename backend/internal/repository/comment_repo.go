package repository

import (
    "database/sql"
    "lingradable/internal/model"
    "sort"
)

type CommentRepository struct {
    db *sql.DB
}

func NewCommentRepository(db *sql.DB) *CommentRepository {
    return &CommentRepository{db: db}
}

func (r *CommentRepository) GetCommentsByProductID(productID int) ([]model.Comment, error) {
    query := `
        SELECT c.id, c.user_id, c.product_id, c.parent_id, c.text, c.created_at, u.login
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.product_id = $1
        ORDER BY c.created_at ASC
    `
    
    rows, err := r.db.Query(query, productID)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var allComments []model.Comment
    for rows.Next() {
        var comment model.Comment
        var parentID sql.NullInt64
        err := rows.Scan(&comment.ID, &comment.UserID, &comment.ProductID, 
                        &parentID, &comment.Text, &comment.CreatedAt, &comment.UserName)
        if err != nil {
            return nil, err
        }
        if parentID.Valid {
            pid := int(parentID.Int64)
            comment.ParentID = &pid
        }
        allComments = append(allComments, comment)
    }
    
    if err = rows.Err(); err != nil {
        return nil, err
    }
    
    sort.Slice(allComments, func(i, j int) bool {
        return allComments[i].CreatedAt.Before(allComments[j].CreatedAt)
    })
    
    return buildCommentTree(allComments), nil
}

func buildCommentTree(comments []model.Comment) []model.Comment {
    if len(comments) == 0 {
        return []model.Comment{}
    }
    
    // Шаг 1: Создаём мапу ID -> указатель на комментарий
    commentMap := make(map[int]*model.Comment)
    for i := range comments {
        commentMap[comments[i].ID] = &comments[i]
        comments[i].Replies = []model.Comment{}
    }
    
    // Шаг 2: Собираем ID корневых комментариев
    var rootIDs []int
    
    for i := range comments {
        if comments[i].ParentID == nil {
            // Корневой комментарий
            rootIDs = append(rootIDs, comments[i].ID)
        } else {
            // Ответ - добавляем к родителю через указатель
            parentID := *comments[i].ParentID
            if parent, exists := commentMap[parentID]; exists {
                parent.Replies = append(parent.Replies, comments[i])
            } else {
                // Если родитель не найден (удалён), делаем корневым
                rootIDs = append(rootIDs, comments[i].ID)
            }
        }
    }
    
    // Шаг 3: Возвращаем корневые комментарии (указатели уже содержат все replies)
    var result []model.Comment
    for _, id := range rootIDs {
        result = append(result, *commentMap[id])
    }
    
    return result
}

func (r *CommentRepository) CreateComment(comment model.Comment) (int, error) {
    var parentID sql.NullInt64
    if comment.ParentID != nil {
        parentID = sql.NullInt64{
            Int64: int64(*comment.ParentID),
            Valid: true,
        }
    }
    
    query := `
        INSERT INTO comments (user_id, product_id, parent_id, text)
        VALUES ($1, $2, $3, $4)
        RETURNING id
    `
    
    var id int
    err := r.db.QueryRow(query, comment.UserID, comment.ProductID, 
                        parentID, comment.Text).Scan(&id)
    
    return id, err
}

func (r *CommentRepository) DeleteComment(id int) error {
    query := "DELETE FROM comments WHERE id = $1"
    _, err := r.db.Exec(query, id)
    return err
}

func (r *CommentRepository) GetCommentByID(id int) (*model.Comment, error) {
    query := `
        SELECT id, user_id, product_id, parent_id, text, created_at
        FROM comments WHERE id = $1
    `
    
    var comment model.Comment
    var parentID sql.NullInt64
    err := r.db.QueryRow(query, id).Scan(
        &comment.ID, &comment.UserID, &comment.ProductID, 
        &parentID, &comment.Text, &comment.CreatedAt,
    )
    
    if err == sql.ErrNoRows {
        return nil, nil
    }
    if err != nil {
        return nil, err
    }
    
    if parentID.Valid {
        pid := int(parentID.Int64)
        comment.ParentID = &pid
    }
    
    return &comment, nil
}

// GetPendingProducts получает проекты на модерации
func (r *ProductRepository) GetPendingProducts() ([]model.Product, error) {
    query := `
        SELECT p.id, p.name, p.type, p.description, p.links, p.sha256_hash, 
               p.author_id, p.status, p.created_at, u.login as author_login
        FROM products p
        LEFT JOIN users u ON p.author_id = u.id
        WHERE p.status = 'pending'
        ORDER BY p.created_at DESC
    `
    
    rows, err := r.db.Query(query)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var products []model.Product
    for rows.Next() {
        var p model.Product
        var authorLogin sql.NullString
        err := rows.Scan(&p.ID, &p.Name, &p.Type, &p.Description, &p.Links,
                        &p.SHA256Hash, &p.AuthorID, &p.Status, &p.CreatedAt, &authorLogin)
        if err != nil {
            return nil, err
        }
        if authorLogin.Valid {
            p.AuthorLogin = &authorLogin.String
        }
        products = append(products, p)
    }
    
    if err = rows.Err(); err != nil {
        return nil, err
    }
    
    return products, nil
}

// GetRejectedProducts получает отклонённые проекты
func (r *ProductRepository) GetRejectedProducts() ([]model.Product, error) {
    query := `
        SELECT p.id, p.name, p.type, p.description, p.links, p.sha256_hash, 
               p.author_id, p.status, p.rejection_reason, p.created_at, 
               p.moderated_at, u.login as author_login
        FROM products p
        LEFT JOIN users u ON p.author_id = u.id
        WHERE p.status = 'rejected'
        ORDER BY p.moderated_at DESC
    `
    
    rows, err := r.db.Query(query)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var products []model.Product
    for rows.Next() {
        var p model.Product
        var authorLogin, rejectionReason sql.NullString
        err := rows.Scan(&p.ID, &p.Name, &p.Type, &p.Description, &p.Links,
                        &p.SHA256Hash, &p.AuthorID, &p.Status, &rejectionReason,
                        &p.CreatedAt, &p.ModeratedAt, &authorLogin)
        if err != nil {
            return nil, err
        }
        if authorLogin.Valid {
            p.AuthorLogin = &authorLogin.String
        }
        if rejectionReason.Valid {
            p.RejectionReason = &rejectionReason.String
        }
        products = append(products, p)
    }
    
    if err = rows.Err(); err != nil {
        return nil, err
    }
    
    return products, nil
}