package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"lingradable/internal/handler"
	"lingradable/internal/middleware"
	"lingradable/internal/repository"

	"github.com/gorilla/mux"
)

// enableCORS добавляет заголовки для кросс-доменных запросов
func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID, X-User-Id")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	// 1. Инициализация базы данных
	db, err := repository.NewDatabase()
	if err != nil {
		log.Fatal("Ошибка подключения к БД:", err)
	}
	defer db.DB.Close()

	// 2. Инициализация репозиториев
	productRepo := repository.NewProductRepository(db.DB)
	userRepo := repository.NewUserRepository(db.DB)
	reviewRepo := repository.NewReviewRepository(db.DB)
	commentRepo := repository.NewCommentRepository(db.DB)

	// 3. Инициализация обработчиков (handlers)
	productHandler := handler.NewProductHandler(productRepo)
	authHandler := handler.NewAuthHandler(db.DB, userRepo)
	reviewHandler := handler.NewReviewHandler(reviewRepo)
	commentHandler := handler.NewCommentHandler(commentRepo)

	// Пути относительно расположения main.go (backend/cmd/server/)
	// Поднимаемся на 3 уровня вверх до корня проекта lingradable/
	uploadDir := filepath.Join("..", "..", "..", "frontend", "static", "img", "uploads")
	logoDataPath := filepath.Join("..", "..", "..", "backend", "internal", "data", "logos.json")
	frontendStaticPath := filepath.Join("..", "..", "..", "frontend", "static")
	frontendIndexPath := filepath.Join("..", "..", "..", "frontend", "templates", "index.html")

	uploadHandler := handler.NewUploadHandler(uploadDir)
	logoHandler := handler.NewLogoHandler(logoDataPath)

	// 4. Настройка роутера
	router := mux.NewRouter()
	api := router.PathPrefix("/api").Subrouter()

	// Инициализация middleware (должна быть до защищенных маршрутов)
	authMiddleware := middleware.AuthMiddleware(db.DB)

	// ============================================
	// 5. ПУБЛИЧНЫЕ МАРШРУТЫ (без авторизации)
	// ============================================
	api.HandleFunc("/tags", productHandler.GetTags).Methods("GET", "OPTIONS")
	api.HandleFunc("/auth/register", authHandler.Register).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/login", authHandler.Login).Methods("POST", "OPTIONS")

	// ============================================
	// 6. МАРШРУТЫ ПРОДУКТОВ (/api/products)
	// ВАЖНО: Точные пути должны идти ДО путей с параметрами ({id}, {productID})
	// ============================================
	products := api.PathPrefix("/products").Subrouter()

	// 6.1. Корневые и точные маршруты (без параметров)
	products.HandleFunc("", productHandler.GetProducts).Methods("GET", "OPTIONS")
	products.Handle("", authMiddleware(http.HandlerFunc(productHandler.CreateProduct))).Methods("POST", "OPTIONS")
	products.Handle("/pending", authMiddleware(http.HandlerFunc(productHandler.GetPendingProducts))).Methods("GET", "OPTIONS")
	products.Handle("/rejected", authMiddleware(http.HandlerFunc(productHandler.GetRejectedProducts))).Methods("GET", "OPTIONS")

	// 6.2. Маршруты с параметром {id}
	products.HandleFunc("/{id}", productHandler.GetProduct).Methods("GET", "OPTIONS")
	products.Handle("/{id}", authMiddleware(http.HandlerFunc(productHandler.UpdateProduct))).Methods("PUT", "OPTIONS")
	products.Handle("/{id}", authMiddleware(http.HandlerFunc(productHandler.DeleteProduct))).Methods("DELETE", "OPTIONS")
	products.Handle("/{id}/approve", authMiddleware(http.HandlerFunc(productHandler.ApproveProduct))).Methods("POST", "OPTIONS")
	products.Handle("/{id}/reject", authMiddleware(http.HandlerFunc(productHandler.RejectProduct))).Methods("POST", "OPTIONS")

	// 6.3. Вложенные ресурсы (отзывы и комментарии)
	products.HandleFunc("/{productID}/reviews", reviewHandler.GetReviews).Methods("GET", "OPTIONS")
	products.Handle("/{productID}/reviews", authMiddleware(http.HandlerFunc(reviewHandler.CreateReview))).Methods("POST", "OPTIONS")
	products.HandleFunc("/{productID}/comments", commentHandler.GetComments).Methods("GET", "OPTIONS")
	products.Handle("/{productID}/comments", authMiddleware(http.HandlerFunc(commentHandler.CreateComment))).Methods("POST", "OPTIONS")

	// ============================================
	// 7. ПРОЧИЕ ЗАЩИЩЁННЫЕ МАРШРУТЫ
	// ============================================
	api.Handle("/upload", authMiddleware(http.HandlerFunc(uploadHandler.UploadImage))).Methods("POST", "OPTIONS")
	api.Handle("/logos", authMiddleware(http.HandlerFunc(logoHandler.GetLogos))).Methods("GET", "OPTIONS")
	api.Handle("/products/logo", authMiddleware(http.HandlerFunc(logoHandler.UpdateProductLogo))).Methods("POST", "OPTIONS")
	api.Handle("/products/logo/delete", authMiddleware(http.HandlerFunc(logoHandler.DeleteProductLogo))).Methods("POST", "OPTIONS")

	api.Handle("/reviews/{id}", authMiddleware(http.HandlerFunc(reviewHandler.DeleteReview))).Methods("DELETE", "OPTIONS")
	api.Handle("/comments/{id}", authMiddleware(http.HandlerFunc(commentHandler.DeleteComment))).Methods("DELETE", "OPTIONS")

	supportHandler := handler.NewSupportHandler(db.DB)

	// Поддержка
	api.Handle("/support/tickets", authMiddleware(http.HandlerFunc(supportHandler.CreateTicket))).Methods("POST", "OPTIONS")
	api.Handle("/support/tickets", authMiddleware(http.HandlerFunc(supportHandler.GetMyTickets))).Methods("GET", "OPTIONS")
	api.Handle("/support/tickets/open", authMiddleware(http.HandlerFunc(supportHandler.GetOpenTickets))).Methods("GET", "OPTIONS")
	api.Handle("/support/tickets/{id}/claim", authMiddleware(http.HandlerFunc(supportHandler.ClaimTicket))).Methods("POST", "OPTIONS")
	api.Handle("/support/tickets/{id}/messages", authMiddleware(http.HandlerFunc(supportHandler.GetMessages))).Methods("GET", "OPTIONS")
	api.Handle("/support/tickets/{id}/messages", authMiddleware(http.HandlerFunc(supportHandler.SendMessage))).Methods("POST", "OPTIONS")
	api.Handle("/support/tickets/{id}/close", authMiddleware(http.HandlerFunc(supportHandler.CloseTicket))).Methods("PUT", "OPTIONS")

	// ============================================
	// ТЕГИ И ПРЕДЛОЖЕНИЯ ТЕГОВ
	// ============================================
	tagHandler := handler.NewTagHandler(db.DB)
	api.HandleFunc("/products/{id}/tags", tagHandler.GetProductTags).Methods("GET", "OPTIONS")
	api.Handle("/products/{id}/tags/suggest", authMiddleware(http.HandlerFunc(tagHandler.SuggestTagForProduct))).Methods("POST", "OPTIONS")
	api.Handle("/products/{id}/tags/attach", authMiddleware(http.HandlerFunc(tagHandler.AttachTagDirect))).Methods("POST", "OPTIONS")
	api.Handle("/tags/suggest", authMiddleware(http.HandlerFunc(tagHandler.SuggestNewTag))).Methods("POST", "OPTIONS")
	api.Handle("/tag-suggestions", authMiddleware(http.HandlerFunc(tagHandler.ListSuggestions))).Methods("GET", "OPTIONS")
	api.Handle("/tag-suggestions/{id}/approve", authMiddleware(http.HandlerFunc(tagHandler.ApproveSuggestion))).Methods("POST", "OPTIONS")
	api.Handle("/tag-suggestions/{id}/reject", authMiddleware(http.HandlerFunc(tagHandler.RejectSuggestion))).Methods("POST", "OPTIONS")
	api.Handle("/tags/{id}", authMiddleware(http.HandlerFunc(tagHandler.DeleteTag))).Methods("DELETE", "OPTIONS")
	api.Handle("/products/{id}/tags/{tagId}", authMiddleware(http.HandlerFunc(tagHandler.DetachTagFromProduct))).Methods("DELETE", "OPTIONS")
	// ============================================
	// 8. ОБРАБОТЧИК 404
	// ============================================
	router.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Endpoint not found",
			"path":  r.URL.Path,
		})
	})

	// ============================================
	// 9. СТАТИЧЕСКИЕ ФАЙЛЫ И SPA FALLBACK
	// ============================================
	// Раздача статических файлов (CSS, JS, изображения)
	router.PathPrefix("/static/").Handler(http.StripPrefix("/static/",
		http.FileServer(http.Dir(frontendStaticPath))))

	// SPA Fallback: все остальные запросы отдают index.html
	router.PathPrefix("/").Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, frontendIndexPath)
	}))

	// Создаём папку для загрузок, если её нет
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		log.Printf("Предупреждение: не удалось создать папку для загрузок: %v", err)
	}

	// Применяем CORS ко всему роутеру
	corsHandler := enableCORS(router)

	// ============================================
	// 10. ЗАПУСК СЕРВЕРА
	// ============================================
	fmt.Println("✅ Сервер запущен на http://localhost:8080")
	fmt.Println("📋 Доступные endpoints:")
	fmt.Println("  GET    /api/products")
	fmt.Println("  GET    /api/products/pending (auth)")
	fmt.Println("  GET    /api/products/rejected (auth)")
	fmt.Println("  GET    /api/products/{id}")
	fmt.Println("  POST   /api/products (auth)")
	fmt.Println("  PUT    /api/products/{id} (auth)")
	fmt.Println("  DELETE /api/products/{id} (auth)")
	fmt.Println("  POST   /api/products/{id}/approve (auth)")
	fmt.Println("  POST   /api/products/{id}/reject (auth)")
	fmt.Println("  GET    /api/products/{productID}/reviews")
	fmt.Println("  POST   /api/products/{productID}/reviews (auth)")
	fmt.Println("  DELETE /api/reviews/{id} (auth)")
	fmt.Println("  GET    /api/products/{productID}/comments")
	fmt.Println("  POST   /api/products/{productID}/comments (auth)")
	fmt.Println("  DELETE /api/comments/{id} (auth)")
	fmt.Println("  GET    /api/tags")
	fmt.Println("  POST   /api/upload (auth)")
	fmt.Println("  GET    /api/logos (auth)")
	fmt.Println("  POST   /api/auth/register")
	fmt.Println("  POST   /api/auth/login")

	log.Fatal(http.ListenAndServe(":8080", corsHandler))
}
