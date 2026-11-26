package repository

import (
    "database/sql"
    "lingradable/internal/model"
)

type UserRepository struct {
    db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
    return &UserRepository{db: db}
}

func (r *UserRepository) GetUserByID(id int) (*model.User, error) {
    query := `
        SELECT id, login, email, role, status, created_at, last_login
        FROM users WHERE id = $1
    `
    
    var user model.User
    err := r.db.QueryRow(query, id).Scan(
        &user.ID, &user.Login, &user.Email, &user.Role, 
        &user.Status, &user.CreatedAt, &user.LastLogin,
    )
    
    if err == sql.ErrNoRows {
        return nil, nil
    }
    if err != nil {
        return nil, err
    }
    
    return &user, nil
}

func (r *UserRepository) GetUserByEmail(email string) (*model.User, error) {
    query := `
        SELECT id, login, email, password_hash, role, status
        FROM users WHERE email = $1
    `
    
    var user model.User
    err := r.db.QueryRow(query, email).Scan(
        &user.ID, &user.Login, &user.Email, &user.PasswordHash, 
        &user.Role, &user.Status,
    )
    
    if err == sql.ErrNoRows {
        return nil, nil
    }
    if err != nil {
        return nil, err
    }
    
    return &user, nil
}

func (r *UserRepository) CreateUser(user model.User) (int, error) {
    query := `
        INSERT INTO users (login, email, password_hash, role, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
    `
    
    var id int
    err := r.db.QueryRow(query, user.Login, user.Email, user.PasswordHash, 
                        user.Role, user.Status).Scan(&id)
    
    return id, err
}

func (r *UserRepository) UpdateLastLogin(userID int) error {
    query := "UPDATE users SET last_login = NOW() WHERE id = $1"
    _, err := r.db.Exec(query, userID)
    return err
}

func (r *UserRepository) BanUser(userID int, reason string) error {
    query := `
        UPDATE users 
        SET status = 'banned', ban_reason = $2
        WHERE id = $1 AND role != 'admin'
    `
    _, err := r.db.Exec(query, userID, reason)
    return err
}