package repository

import (
    "database/sql"
    "lingradable/internal/model"
)

type ReviewRepository struct {
    db *sql.DB
}

func NewReviewRepository(db *sql.DB) *ReviewRepository {
    return &ReviewRepository{db: db}
}

func (r *ReviewRepository) GetReviewsByProductID(productID int) ([]model.Review, error) {
    query := `
        SELECT r.id, r.user_id, r.product_id, r.rating, r.created_at, u.login
        FROM reviews r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.product_id = $1
        ORDER BY r.created_at DESC
    `
    
    rows, err := r.db.Query(query, productID)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var reviews []model.Review
    for rows.Next() {
        var review model.Review
        err := rows.Scan(&review.ID, &review.UserID, &review.ProductID, 
                        &review.Rating, &review.CreatedAt, &review.UserName)
        if err != nil {
            return nil, err
        }
        reviews = append(reviews, review)
    }
    
    if err = rows.Err(); err != nil {
        return nil, err
    }
    
    return reviews, nil
}

func (r *ReviewRepository) CreateOrUpdateReview(review model.Review) (int, error) {
    query := `
        INSERT INTO reviews (user_id, product_id, rating)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, product_id) 
        DO UPDATE SET rating = $3, created_at = NOW()
        RETURNING id
    `
    
    var id int
    err := r.db.QueryRow(query, review.UserID, review.ProductID, review.Rating).Scan(&id)
    
    return id, err
}

func (r *ReviewRepository) DeleteReview(id int) error {
    _, err := r.db.Exec("DELETE FROM reviews WHERE id = $1", id)
    return err
}

func (r *ReviewRepository) GetReviewByID(id int) (*model.Review, error) {
    query := "SELECT id, user_id, product_id, rating, created_at FROM reviews WHERE id = $1"
    var review model.Review
    err := r.db.QueryRow(query, id).Scan(&review.ID, &review.UserID, &review.ProductID, &review.Rating, &review.CreatedAt)
    if err == sql.ErrNoRows {
        return nil, nil
    }
    return &review, err
}