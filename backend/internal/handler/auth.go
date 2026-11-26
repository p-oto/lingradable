package handler

import (
	"database/sql"
	"encoding/json"
	"lingradable/internal/repository"
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	db       *sql.DB
	userRepo *repository.UserRepository
}

func NewAuthHandler(db *sql.DB, userRepo *repository.UserRepository) *AuthHandler {
	return &AuthHandler{db: db, userRepo: userRepo}
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RegisterRequest struct {
	Login    string `json:"login"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Неверный формат данных", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Ошибка хэширования пароля", http.StatusInternalServerError)
		return
	}

	query := `
		INSERT INTO users (login, email, password_hash, role, status)
		VALUES ($1, $2, $3, 'user', 'active')
		RETURNING id
	`

	var userID int
	err = h.db.QueryRow(query, req.Login, req.Email, string(hash)).Scan(&userID)
	if err != nil {
		http.Error(w, "Ошибка регистрации (возможно, email уже занят)", http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":      userID,
		"message": "Регистрация успешна",
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Неверный формат данных", http.StatusBadRequest)
		return
	}

	user, err := h.userRepo.GetUserByEmail(req.Email)
	if err != nil {
		http.Error(w, "Ошибка сервера", http.StatusInternalServerError)
		return
	}

	if user == nil {
		http.Error(w, "Неверный email или пароль", http.StatusUnauthorized)
		return
	}

	if user.Status == "banned" {
		http.Error(w, "Аккаунт заблокирован", http.StatusForbidden)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		http.Error(w, "Неверный email или пароль", http.StatusUnauthorized)
		return
	}

	h.userRepo.UpdateLastLogin(user.ID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":      user.ID,
		"login":   user.Login,
		"role":    user.Role,
		"message": "Вход выполнен успешно",
	})
}
