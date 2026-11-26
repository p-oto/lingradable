package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"lingradable/internal/middleware"

	"github.com/gorilla/mux"
)

type TagHandler struct {
	db *sql.DB
}

func NewTagHandler(db *sql.DB) *TagHandler {
	return &TagHandler{db: db}
}

type Tag struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type TagSuggestion struct {
	ID             int       `json:"id"`
	UserID         int       `json:"user_id"`
	UserLogin      string    `json:"user_login"`
	ProductID      *int      `json:"product_id"`
	ProductName    string    `json:"product_name"`
	TagID          *int      `json:"tag_id"`
	TagName        string    `json:"tag_name"`
	TagDescription string    `json:"tag_description"`
	IsNewTag       bool      `json:"is_new_tag"`
	CreatedAt      time.Time `json:"created_at"`
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// GET /api/products/{id}/tags — теги продукта
func (h *TagHandler) GetProductTags(w http.ResponseWriter, r *http.Request) {
	pid, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	rows, err := h.db.Query(`
		SELECT t.id, t.name, COALESCE(t.description, '')
		FROM product_tags pt JOIN tags t ON t.id = pt.tag_id
		WHERE pt.product_id = $1 ORDER BY t.name`, pid)
	if err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	tags := []Tag{}
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.Name, &t.Description); err == nil {
			tags = append(tags, t)
		}
	}
	writeJSON(w, tags)
}

// POST /api/products/{id}/tags/suggest — предложить существующий тег к продукту
func (h *TagHandler) SuggestTagForProduct(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == 0 {
		http.Error(w, "Не авторизован", http.StatusUnauthorized)
		return
	}

	pid, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	var req struct {
		TagID int `json:"tag_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TagID == 0 {
		http.Error(w, "Неверный тег", http.StatusBadRequest)
		return
	}

	var exists bool
	h.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM product_tags WHERE product_id=$1 AND tag_id=$2)`, pid, req.TagID).Scan(&exists)
	if exists {
		http.Error(w, "Этот тег уже привязан к проекту", http.StatusConflict)
		return
	}
	h.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM tag_suggestions WHERE product_id=$1 AND tag_id=$2 AND status='pending')`, pid, req.TagID).Scan(&exists)
	if exists {
		http.Error(w, "Этот тег уже предложен и ждёт модерации", http.StatusConflict)
		return
	}

	_, err = h.db.Exec(`INSERT INTO tag_suggestions (user_id, product_id, tag_id, status) VALUES ($1,$2,$3,'pending')`,
		userID, pid, req.TagID)
	if err != nil {
		http.Error(w, "Ошибка: "+err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"message": "Тег отправлен на модерацию"})
}

// POST /api/products/{id}/tags/attach — модератор привязывает тег сразу
func (h *TagHandler) AttachTagDirect(w http.ResponseWriter, r *http.Request) {
	role := middleware.GetUserRole(r.Context())
	if role != "moderator" && role != "admin" {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	pid, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	var req struct {
		TagID int `json:"tag_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TagID == 0 {
		http.Error(w, "Неверный тег", http.StatusBadRequest)
		return
	}

	_, err = h.db.Exec(`INSERT INTO product_tags (product_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, pid, req.TagID)
	if err != nil {
		http.Error(w, "Ошибка: "+err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"message": "Тег привязан"})
}

// POST /api/tags/suggest — предложить НОВЫЙ тег
func (h *TagHandler) SuggestNewTag(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == 0 {
		http.Error(w, "Не авторизован", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Неверный формат", http.StatusBadRequest)
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)
	if req.Name == "" || len(req.Name) > 100 {
		http.Error(w, "Название тега обязательно (до 100 символов)", http.StatusBadRequest)
		return
	}

	var exists bool
	h.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM tags WHERE lower(name)=lower($1))`, req.Name).Scan(&exists)
	if exists {
		http.Error(w, "Такой тег уже существует", http.StatusConflict)
		return
	}
	h.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM tag_suggestions WHERE tag_id IS NULL AND lower(tag_name)=lower($1) AND status='pending')`, req.Name).Scan(&exists)
	if exists {
		http.Error(w, "Такой тег уже предложен и ждёт модерации", http.StatusConflict)
		return
	}

	_, err := h.db.Exec(`INSERT INTO tag_suggestions (user_id, product_id, tag_id, tag_name, tag_description, status)
		VALUES ($1, NULL, NULL, $2, $3, 'pending')`, userID, req.Name, req.Description)
	if err != nil {
		http.Error(w, "Ошибка: "+err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"message": "Тег отправлен на модерацию"})
}

// GET /api/tag-suggestions — очередь предложений (модератор)
func (h *TagHandler) ListSuggestions(w http.ResponseWriter, r *http.Request) {
	role := middleware.GetUserRole(r.Context())
	if role != "moderator" && role != "admin" {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	rows, err := h.db.Query(`
		SELECT s.id, s.user_id, COALESCE(u.login,''), s.product_id, COALESCE(p.name,''),
		       s.tag_id, COALESCE(t.name, s.tag_name, ''), COALESCE(s.tag_description,''), s.created_at
		FROM tag_suggestions s
		LEFT JOIN users u ON u.id = s.user_id
		LEFT JOIN products p ON p.id = s.product_id
		LEFT JOIN tags t ON t.id = s.tag_id
		WHERE s.status = 'pending'
		ORDER BY s.created_at ASC`)
	if err != nil {
		http.Error(w, "Ошибка: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	list := []TagSuggestion{}
	for rows.Next() {
		var s TagSuggestion
		var login, pname, tname, tdesc sql.NullString
		var pid, tid sql.NullInt64
		if err := rows.Scan(&s.ID, &s.UserID, &login, &pid, &pname, &tid, &tname, &tdesc, &s.CreatedAt); err != nil {
			continue
		}
		s.UserLogin = login.String
		s.ProductName = pname.String
		s.TagName = tname.String
		s.TagDescription = tdesc.String
		if pid.Valid {
			v := int(pid.Int64)
			s.ProductID = &v
		}
		if tid.Valid {
			v := int(tid.Int64)
			s.TagID = &v
		}
		s.IsNewTag = !tid.Valid
		list = append(list, s)
	}
	writeJSON(w, list)
}

// POST /api/tag-suggestions/{id}/approve — одобрить и удалить предложение
func (h *TagHandler) ApproveSuggestion(w http.ResponseWriter, r *http.Request) {
	role := middleware.GetUserRole(r.Context())
	if role != "moderator" && role != "admin" {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	sid, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var pid, tid sql.NullInt64
	var tname, tdesc sql.NullString
	var status string
	err = tx.QueryRow(`SELECT product_id, tag_id, tag_name, tag_description, status FROM tag_suggestions WHERE id=$1`, sid).
		Scan(&pid, &tid, &tname, &tdesc, &status)
	if err == sql.ErrNoRows {
		http.Error(w, "Предложение не найдено", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}
	if status != "pending" {
		http.Error(w, "Предложение уже обработано", http.StatusConflict)
		return
	}

	finalTagID := 0
	if tid.Valid {
		finalTagID = int(tid.Int64)
	} else {
		// новый тег: создаём (или берём существующий по имени)
		err = tx.QueryRow(`
			INSERT INTO tags (name, description) VALUES ($1, $2)
			ON CONFLICT (name) DO UPDATE SET description = COALESCE(EXCLUDED.description, tags.description)
			RETURNING id`, tname.String, tdesc.String).Scan(&finalTagID)
		if err != nil {
			http.Error(w, "Ошибка создания тега: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	if pid.Valid {
		if _, err := tx.Exec(`INSERT INTO product_tags (product_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
			int(pid.Int64), finalTagID); err != nil {
			http.Error(w, "Ошибка привязки: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	if _, err := tx.Exec(`DELETE FROM tag_suggestions WHERE id=$1`, sid); err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"message": "Предложение одобрено"})
}

// POST /api/tag-suggestions/{id}/reject — отклонить (удалить) предложение
func (h *TagHandler) RejectSuggestion(w http.ResponseWriter, r *http.Request) {
	role := middleware.GetUserRole(r.Context())
	if role != "moderator" && role != "admin" {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	sid, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	res, err := h.db.Exec(`DELETE FROM tag_suggestions WHERE id=$1 AND status='pending'`, sid)
	if err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		http.Error(w, "Предложение не найдено", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]string{"message": "Предложение отклонено"})
}

// ============================================================
// backend/internal/handler/tag.go
// ДОБАВЬ эти две функции в конец файла
// ============================================================

// DeleteTag — DELETE /api/tags/{id}
// Полное удаление тега: связи с проектами и предложения тоже удаляются.
func (h *TagHandler) DeleteTag(w http.ResponseWriter, r *http.Request) {
	role := middleware.GetUserRole(r.Context())
	if role != "moderator" && role != "admin" {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM tag_suggestions WHERE tag_id = $1`, id); err != nil {
		http.Error(w, "Ошибка: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err := tx.Exec(`DELETE FROM product_tags WHERE tag_id = $1`, id); err != nil {
		http.Error(w, "Ошибка: "+err.Error(), http.StatusInternalServerError)
		return
	}

	res, err := tx.Exec(`DELETE FROM tags WHERE id = $1`, id)
	if err != nil {
		http.Error(w, "Ошибка: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		http.Error(w, "Тег не найден", http.StatusNotFound)
		return
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"message": "Тег удалён"})
}

// DetachTagFromProduct — DELETE /api/products/{id}/tags/{tagId}
// Убирает тег у конкретного проекта (сам тег остаётся в каталоге).
func (h *TagHandler) DetachTagFromProduct(w http.ResponseWriter, r *http.Request) {
	role := middleware.GetUserRole(r.Context())
	if role != "moderator" && role != "admin" {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	pid, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Неверный ID продукта", http.StatusBadRequest)
		return
	}
	tid, err := strconv.Atoi(mux.Vars(r)["tagId"])
	if err != nil {
		http.Error(w, "Неверный ID тега", http.StatusBadRequest)
		return
	}

	res, err := h.db.Exec(`DELETE FROM product_tags WHERE product_id = $1 AND tag_id = $2`, pid, tid)
	if err != nil {
		http.Error(w, "Ошибка: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		http.Error(w, "Связь не найдена", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]string{"message": "Тег убран от проекта"})
}