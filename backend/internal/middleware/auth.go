package middleware

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"strconv"
	"strings"
)

type contextKey string

const userIDKey contextKey = "userID"
const userRoleKey contextKey = "userRole"

// AuthMiddleware проверяет авторизацию пользователя через заголовок X-User-ID
func AuthMiddleware(db *sql.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			log.Printf("🔍 AuthMiddleware вызван для: %s %s", r.Method, r.URL.Path)

			userIDStr := r.Header.Get("X-User-ID")

			if userIDStr == "" {
				log.Printf("❌ AuthMiddleware: нет заголовка X-User-ID")
				http.Error(w, "Требуется авторизация (отсутствует X-User-ID)", http.StatusUnauthorized)
				return
			}

			userID, err := strconv.Atoi(userIDStr)
			if err != nil {
				log.Printf("❌ AuthMiddleware: неверный формат userID: %s", userIDStr)
				http.Error(w, "Неверный формат userID", http.StatusBadRequest)
				return
			}

			// Получаем роль пользователя из БД
			var role string
			err = db.QueryRow("SELECT role FROM users WHERE id = $1", userID).Scan(&role)
			if err != nil {
				log.Printf("❌ AuthMiddleware: ошибка получения роли для user_id=%d: %v", userID, err)
				http.Error(w, "Пользователь не найден", http.StatusNotFound)
				return
			}

			// Очищаем роль от пробелов и приводим к нижнему регистру
			role = strings.ToLower(strings.TrimSpace(role))

			log.Printf("✅ AuthMiddleware: user_id=%d, role='%s'", userID, role)

			// Сохраняем в контекст
			ctx := context.WithValue(r.Context(), userIDKey, userID)
			ctx = context.WithValue(ctx, userRoleKey, role)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserID получает userID из контекста запроса
func GetUserID(ctx context.Context) int {
	if val := ctx.Value(userIDKey); val != nil {
		if id, ok := val.(int); ok {
			return id
		}
	}
	return 0
}

// GetUserRole получает роль пользователя из контекста запроса
func GetUserRole(ctx context.Context) string {
	if val := ctx.Value(userRoleKey); val != nil {
		if role, ok := val.(string); ok {
			return role
		}
	}
	return ""
}

