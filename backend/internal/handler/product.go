package handler

import (
	"encoding/json"
	"lingradable/internal/middleware"
	"lingradable/internal/model"
	"lingradable/internal/repository"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
)

type ProductHandler struct {
	repo *repository.ProductRepository
}

func NewProductHandler(repo *repository.ProductRepository) *ProductHandler {
	return &ProductHandler{repo: repo}
}

func (h *ProductHandler) GetProducts(w http.ResponseWriter, r *http.Request) {
	tagsParam := r.URL.Query().Get("tags")
	var tags []string
	if tagsParam != "" {
		tags = strings.Split(tagsParam, ",")
		for i := range tags {
			tags[i] = strings.TrimSpace(tags[i])
		}
	}

	isCustom := r.URL.Query().Get("custom") == "true"
	search := r.URL.Query().Get("search")
	sortBy := r.URL.Query().Get("sort")

	products, err := h.repo.GetProducts(tags, isCustom, search, sortBy)
	if err != nil {
		http.Error(w, "Ошибка получения продуктов: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(products)
}

func (h *ProductHandler) GetProduct(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	product, err := h.repo.GetProductByID(id)
	if err != nil {
		http.Error(w, "Ошибка получения продукта: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if product == nil {
		http.Error(w, "Продукт не найден", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(product)
}

func (h *ProductHandler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	userRole := middleware.GetUserRole(r.Context())

	if userID == 0 {
		http.Error(w, "Пользователь не авторизован", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name        string  `json:"name"`
		Type        string  `json:"type"`
		Description string  `json:"description"`
		Links       string  `json:"links"`
		SHA256Hash  *string `json:"sha256_hash"`
		IconURL     *string `json:"icon_url"`
		IsOfficial  bool    `json:"is_official"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Неверный формат данных: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.Type == "" || req.Description == "" || req.Links == "" {
		http.Error(w, "Все поля обязательны для заполнения", http.StatusBadRequest)
		return
	}

	// Определяем author_id в зависимости от типа проекта
	var authorID *int
	if req.IsOfficial && (userRole == "moderator" || userRole == "admin") {
		// Официальный проект - без автора
		authorID = nil
	} else {
		// Кастомный проект - с автором
		authorID = &userID
	}

	p := model.Product{
		Name:        req.Name,
		Type:        req.Type,
		Description: req.Description,
		Links:       req.Links,
		SHA256Hash:  req.SHA256Hash,
		IconURL:     req.IconURL,
		AuthorID:    authorID,
	}

	// Если модератор/админ — сразу одобряем
	if userRole == "moderator" || userRole == "admin" {
		id, err := h.repo.CreateProductApproved(p, userID)
		if err != nil {
			http.Error(w, "Ошибка создания продукта: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":      id,
			"status":  "approved",
			"message": "Проект сразу опубликован",
		})
		return
	}

	// Обычный пользователь — на модерацию
	id, err := h.repo.CreateProduct(p)
	if err != nil {
		http.Error(w, "Ошибка создания продукта: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":      id,
		"status":  "pending",
		"message": "Проект отправлен на модерацию",
	})
}

func (h *ProductHandler) GetTags(w http.ResponseWriter, r *http.Request) {
	tags, err := h.repo.GetTags()
	if err != nil {
		http.Error(w, "Ошибка получения тегов: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tags)
}

// GetPendingProducts получает проекты на модерации
func (h *ProductHandler) GetPendingProducts(w http.ResponseWriter, r *http.Request) {
	// Пробуем получить userID из заголовка ИЛИ из query-параметра
	userIDStr := r.Header.Get("X-User-ID")
	if userIDStr == "" {
		userIDStr = r.URL.Query().Get("userId")
	}

	if userIDStr == "" {
		http.Error(w, "Неверный ID: не передан X-User-ID заголовок или userId параметр", http.StatusBadRequest)
		return
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		http.Error(w, "Неверный ID: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Проверяем роль пользователя
	userRole, err := h.repo.GetUserRole(userID)
	if err != nil || (userRole != "moderator" && userRole != "admin") {
		http.Error(w, "Недостаточно прав. Ваша роль: "+userRole, http.StatusForbidden)
		return
	}

	products, err := h.repo.GetPendingProducts()
	if err != nil {
		http.Error(w, "Ошибка получения проектов: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(products)
}

// GetRejectedProducts получает отклонённые проекты
func (h *ProductHandler) GetRejectedProducts(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.Header.Get("X-User-ID")
	if userIDStr == "" {
		userIDStr = r.URL.Query().Get("userId")
	}

	if userIDStr == "" {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		http.Error(w, "Неверный ID: "+err.Error(), http.StatusBadRequest)
		return
	}

	userRole, err := h.repo.GetUserRole(userID)
	if err != nil || (userRole != "moderator" && userRole != "admin") {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	products, err := h.repo.GetRejectedProducts()
	if err != nil {
		http.Error(w, "Ошибка получения проектов: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(products)
}

// ApproveProduct одобряет проект
func (h *ProductHandler) ApproveProduct(w http.ResponseWriter, r *http.Request) {
	userRole := middleware.GetUserRole(r.Context())
	if userRole != "moderator" && userRole != "admin" {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r.Context())

	err = h.repo.ApproveProduct(id, userID)
	if err != nil {
		http.Error(w, "Ошибка одобрения: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Проект одобрен"})
}

// RejectProduct отклоняет проект с причиной
func (h *ProductHandler) RejectProduct(w http.ResponseWriter, r *http.Request) {
	userRole := middleware.GetUserRole(r.Context())
	if userRole != "moderator" && userRole != "admin" {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	var req struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Неверный формат данных", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r.Context())

	err = h.repo.RejectProduct(id, userID, req.Reason)
	if err != nil {
		http.Error(w, "Ошибка отклонения: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Проект отклонён"})
}

// UpdateProduct обновляет проект
// ============================================================
// backend/internal/handler/product.go
// ЗАМЕНИ функцию UpdateProduct целиком
// ============================================================

// UpdateProduct обновляет проект: модератор/админ ИЛИ автор проекта.
// Автор не может сделать проект официальным и не теряет авторство.
func (h *ProductHandler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	userRole := middleware.GetUserRole(r.Context())
	if userID == 0 {
		http.Error(w, "Не авторизован", http.StatusUnauthorized)
		return
	}

	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	product, err := h.repo.GetProductByID(id)
	if err != nil {
		http.Error(w, "Ошибка получения продукта: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if product == nil {
		http.Error(w, "Продукт не найден", http.StatusNotFound)
		return
	}

	isStaff := userRole == "moderator" || userRole == "admin"
	isOwner := product.AuthorID != nil && *product.AuthorID == userID
	if !isStaff && !isOwner {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	var req struct {
		Name        string  `json:"name"`
		Type        string  `json:"type"`
		Description string  `json:"description"`
		Links       string  `json:"links"`
		IconURL     *string `json:"icon_url"`
		IsOfficial  bool    `json:"is_official"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Неверный формат данных", http.StatusBadRequest)
		return
	}

	var authorID *int
	if isStaff {
		if req.IsOfficial {
			authorID = nil
		} else {
			authorID = &userID
		}
	} else {
		// Автор сохраняет авторство; официальный статус недоступен
		authorID = product.AuthorID
	}

	if err := h.repo.UpdateProductWithAuthor(id, req.Name, req.Type, req.Description, req.Links, req.IconURL, authorID); err != nil {
		http.Error(w, "Ошибка обновления: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Проект обновлён"})
}

// DeleteProduct удаляет проект
func (h *ProductHandler) DeleteProduct(w http.ResponseWriter, r *http.Request) {
	userRole := middleware.GetUserRole(r.Context())
	if userRole != "moderator" && userRole != "admin" {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	if err := h.repo.DeleteProduct(id); err != nil {
		http.Error(w, "Ошибка удаления: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Проект удалён"})
}
