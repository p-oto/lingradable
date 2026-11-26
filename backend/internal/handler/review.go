package handler

import (
    "encoding/json"
    "lingradable/internal/middleware"
    "lingradable/internal/model"
    "lingradable/internal/repository"
    "net/http"
    "strconv"
    
    "github.com/gorilla/mux"
)

type ReviewHandler struct {
    repo *repository.ReviewRepository
}

func NewReviewHandler(repo *repository.ReviewRepository) *ReviewHandler {
    return &ReviewHandler{repo: repo}
}

func (h *ReviewHandler) GetReviews(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    productID, err := strconv.Atoi(vars["productID"])
    if err != nil {
        http.Error(w, "Неверный ID продукта", http.StatusBadRequest)
        return
    }
    
    reviews, err := h.repo.GetReviewsByProductID(productID)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(reviews)
}

func (h *ReviewHandler) CreateReview(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    productID, err := strconv.Atoi(vars["productID"])
    if err != nil {
        http.Error(w, "Неверный ID продукта", http.StatusBadRequest)
        return
    }
    
    var review model.Review
    if err := json.NewDecoder(r.Body).Decode(&review); err != nil {
        http.Error(w, "Неверный формат данных: "+err.Error(), http.StatusBadRequest)
        return
    }
    
    userID := middleware.GetUserID(r.Context())
    if userID == 0 {
        http.Error(w, "Пользователь не авторизован", http.StatusUnauthorized)
        return
    }
    
    review.UserID = userID
    review.ProductID = productID
    
    id, err := h.repo.CreateOrUpdateReview(review)
    if err != nil {
        http.Error(w, "Ошибка создания отзыва: "+err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(map[string]int{"id": id})
}

func (h *ReviewHandler) DeleteReview(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id, err := strconv.Atoi(vars["id"])
    if err != nil {
        http.Error(w, "Неверный ID", http.StatusBadRequest)
        return
    }

    userID := middleware.GetUserID(r.Context())
    userRole := middleware.GetUserRole(r.Context())

    // Получаем отзыв, чтобы проверить автора
    review, err := h.repo.GetReviewByID(id)
    if err != nil {
        http.Error(w, "Ошибка сервера", http.StatusInternalServerError)
        return
    }
    if review == nil {
        http.Error(w, "Отзыв не найден", http.StatusNotFound)
        return
    }

    // Проверка прав: владелец отзыва ИЛИ модератор/админ
    if review.UserID != userID && userRole != "moderator" && userRole != "admin" {
        http.Error(w, "Недостаточно прав для удаления этого отзыва", http.StatusForbidden)
        return
    }

    if err := h.repo.DeleteReview(id); err != nil {
        http.Error(w, "Ошибка удаления", http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"message": "Отзыв удалён"})
}