package model

import "time"

type User struct {
	ID           int        `json:"id"`
	Login        string     `json:"login"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"`
	Role         string     `json:"role"`
	Status       string     `json:"status"`
	CreatedAt    time.Time  `json:"created_at"`
	LastLogin    *time.Time `json:"last_login"`
}

type Product struct {
	ID              int        `json:"id"`
	Name            string     `json:"name"`
	Type            string     `json:"type"`
	Description     string     `json:"description"`
	Links           string     `json:"links"`
	IconURL         *string    `json:"icon_url"`
	SHA256Hash      *string    `json:"sha256_hash"`
	AuthorID        *int       `json:"author_id"`
	AuthorLogin     *string    `json:"author_login"`
	Status          string     `json:"status"`
	RejectionReason *string    `json:"rejection_reason"`
	CreatedAt       time.Time  `json:"created_at"`
	ModeratedAt     *time.Time `json:"moderated_at"`
	ModeratorID     *int       `json:"moderator_id"`
	ReviewCount     int        `json:"review_count"`
	CommentCount    int        `json:"comment_count"`
	AvgRating       float64    `json:"avg_rating"`
}

type Tag struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type Review struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	ProductID int       `json:"product_id"`
	Rating    int       `json:"rating"`
	CreatedAt time.Time `json:"created_at"`
	UserName  string    `json:"user_name"`
}

type Comment struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	ProductID int       `json:"product_id"`
	ParentID  *int      `json:"parent_id"`
	Text      string    `json:"text"`
	CreatedAt time.Time `json:"created_at"`
	UserName  string    `json:"user_name"`
	Replies   []Comment `json:"replies"` // Без omitempty!
}
