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

type CommentHandler struct {
    repo *repository.CommentRepository
}

func NewCommentHandler(repo *repository.CommentRepository) *CommentHandler {
    return &CommentHandler{repo: repo}
}

func (h *CommentHandler) GetComments(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    productID, err := strconv.Atoi(vars["productID"])
    if err != nil {
        http.Error(w, "Неверный ID продукта", http.StatusBadRequest)
        return
    }
    
    comments, err := h.repo.GetCommentsByProductID(productID)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(comments)
}

func (h *CommentHandler) CreateComment(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    productID, err := strconv.Atoi(vars["productID"])
    if err != nil {
        http.Error(w, "Неверный ID продукта", http.StatusBadRequest)
        return
    }
    
    var comment model.Comment
    if err := json.NewDecoder(r.Body).Decode(&comment); err != nil {
        http.Error(w, "Неверный формат данных: "+err.Error(), http.StatusBadRequest)
        return
    }
    
    userID := middleware.GetUserID(r.Context())
    if userID == 0 {
        http.Error(w, "Пользователь не авторизован", http.StatusUnauthorized)
        return
    }
    
    comment.UserID = userID
    comment.ProductID = productID
    
    id, err := h.repo.CreateComment(comment)
    if err != nil {
        http.Error(w, "Ошибка создания комментария: "+err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(map[string]int{"id": id})
}

func (h *CommentHandler) DeleteComment(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id, err := strconv.Atoi(vars["id"])
    if err != nil {
        http.Error(w, "Неверный ID", http.StatusBadRequest)
        return
    }
    
    userID := middleware.GetUserID(r.Context())
    userRole := middleware.GetUserRole(r.Context())
    
    comment, err := h.repo.GetCommentByID(id)
    if err != nil {
        http.Error(w, "Ошибка получения комментария: "+err.Error(), http.StatusInternalServerError)
        return
    }
    
    if comment == nil {
        http.Error(w, "Комментарий не найден", http.StatusNotFound)
        return
    }
    
    if comment.UserID != userID && userRole != "moderator" && userRole != "admin" {
        http.Error(w, "Недостаточно прав", http.StatusForbidden)
        return
    }
    
    err = h.repo.DeleteComment(id)
    if err != nil {
        http.Error(w, "Ошибка удаления: "+err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"message": "Комментарий удалён"})
}