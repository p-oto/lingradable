package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"lingradable/internal/middleware"

	"github.com/gorilla/mux"
)

// SupportHandler обрабатывает запросы поддержки
type SupportHandler struct {
	db *sql.DB
}

// NewSupportHandler создаёт новый обработчик поддержки
func NewSupportHandler(db *sql.DB) *SupportHandler {
	return &SupportHandler{db: db}
}

// SupportTicket — модель тикета
type SupportTicket struct {
	ID          int        `json:"id"`
	UserID      int        `json:"user_id"`
	ModeratorID *int       `json:"moderator_id,omitempty"`
	Subject     string     `json:"subject"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// SupportMessage — модель сообщения
type SupportMessage struct {
	ID         int       `json:"id"`
	TicketID   int       `json:"ticket_id"`
	SenderType string    `json:"sender_type"`
	SenderID   int       `json:"sender_id"`
	Message    string    `json:"message"`
	CreatedAt  time.Time `json:"created_at"`
}

// CreateTicket создаёт тикет (только для обычных пользователей)
func (h *SupportHandler) CreateTicket(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	userRole := middleware.GetUserRole(r.Context())

	if userID == 0 {
		http.Error(w, "Не авторизован", http.StatusUnauthorized)
		return
	}

	// Только обычные пользователи могут создавать тикеты
	if userRole == "moderator" || userRole == "admin" {
		http.Error(w, "Модераторы и администраторы не могут создавать тикеты", http.StatusForbidden)
		return
	}

	var req struct {
		Subject string `json:"subject"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Неверный формат", http.StatusBadRequest)
		return
	}

	if req.Subject == "" {
		http.Error(w, "Тема обязательна", http.StatusBadRequest)
		return
	}

	var ticketID int
	err := h.db.QueryRow(
		`INSERT INTO support_tickets (user_id, subject, status) VALUES ($1, $2, 'open') RETURNING id`,
		userID, req.Subject,
	).Scan(&ticketID)
	if err != nil {
		http.Error(w, "Ошибка создания тикета: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]int{"ticket_id": ticketID})
}

// GetMyTickets возвращает тикеты (все для модератора, свои для пользователя)
func (h *SupportHandler) GetMyTickets(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	userRole := middleware.GetUserRole(r.Context())

	if userID == 0 {
		http.Error(w, "Не авторизован", http.StatusUnauthorized)
		return
	}

	var rows *sql.Rows
	var err error

	if userRole == "moderator" || userRole == "admin" {
		rows, err = h.db.Query(`
			SELECT id, user_id, moderator_id, subject, status, created_at, updated_at
			FROM support_tickets
			WHERE status IN ('assigned', 'closed')
			ORDER BY updated_at DESC
		`)
	} else {
		rows, err = h.db.Query(`
			SELECT id, user_id, moderator_id, subject, status, created_at, updated_at
			FROM support_tickets
			WHERE user_id = $1
			ORDER BY updated_at DESC
		`, userID)
	}

	if err != nil {
		http.Error(w, "Ошибка получения тикетов", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tickets []SupportTicket
	for rows.Next() {
		var t SupportTicket
		if err := rows.Scan(&t.ID, &t.UserID, &t.ModeratorID, &t.Subject, &t.Status, &t.CreatedAt, &t.UpdatedAt); err != nil {
			continue
		}
		tickets = append(tickets, t)
	}
	if tickets == nil {
		tickets = []SupportTicket{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tickets)
}

// GetOpenTickets возвращает открытые тикеты (только для модераторов)
func (h *SupportHandler) GetOpenTickets(w http.ResponseWriter, r *http.Request) {
	userRole := middleware.GetUserRole(r.Context())
	if userRole != "moderator" && userRole != "admin" {
		http.Error(w, "Доступ запрещён", http.StatusForbidden)
		return
	}

	rows, err := h.db.Query(`
		SELECT id, user_id, moderator_id, subject, status, created_at, updated_at
		FROM support_tickets
		WHERE status = 'open'
		ORDER BY created_at ASC
	`)
	if err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tickets []SupportTicket
	for rows.Next() {
		var t SupportTicket
		if err := rows.Scan(&t.ID, &t.UserID, &t.ModeratorID, &t.Subject, &t.Status, &t.CreatedAt, &t.UpdatedAt); err != nil {
			continue
		}
		tickets = append(tickets, t)
	}
	if tickets == nil {
		tickets = []SupportTicket{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tickets)
}

// ClaimTicket — модератор берёт тикет в работу
func (h *SupportHandler) ClaimTicket(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	userRole := middleware.GetUserRole(r.Context())

	if userRole != "moderator" && userRole != "admin" {
		http.Error(w, "Доступ запрещён", http.StatusForbidden)
		return
	}

	ticketID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	result, err := h.db.Exec(
		`UPDATE support_tickets SET moderator_id = $1, status = 'assigned', updated_at = NOW()
		 WHERE id = $2 AND status = 'open'`,
		userID, ticketID,
	)
	if err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		http.Error(w, "Тикет уже занят или не существует", http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Тикет принят"})
}

// GetMessages возвращает сообщения тикета
func (h *SupportHandler) GetMessages(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	userRole := middleware.GetUserRole(r.Context())

	if userID == 0 {
		http.Error(w, "Не авторизован", http.StatusUnauthorized)
		return
	}

	ticketID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	var ticketUserID int
	var ticketModID *int
	var status string
	err = h.db.QueryRow(`SELECT user_id, moderator_id, status FROM support_tickets WHERE id = $1`, ticketID).
		Scan(&ticketUserID, &ticketModID, &status)
	if err == sql.ErrNoRows {
		http.Error(w, "Тикет не найден", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}

	isStaff := userRole == "moderator" || userRole == "admin"
	if userID != ticketUserID && !isStaff {
		http.Error(w, "Доступ запрещён", http.StatusForbidden)
		return
	}
	if isStaff && (ticketModID == nil || *ticketModID != userID) && userID != ticketUserID {
		http.Error(w, "Доступ запрещён", http.StatusForbidden)
		return
	}

	rows, err := h.db.Query(`
		SELECT id, ticket_id, sender_type, sender_id, message, created_at
		FROM support_messages
		WHERE ticket_id = $1
		ORDER BY created_at ASC
	`, ticketID)
	if err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []SupportMessage
	for rows.Next() {
		var m SupportMessage
		if err := rows.Scan(&m.ID, &m.TicketID, &m.SenderType, &m.SenderID, &m.Message, &m.CreatedAt); err != nil {
			continue
		}
		messages = append(messages, m)
	}
	if messages == nil {
		messages = []SupportMessage{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

// SendMessage отправляет сообщение в тикет
func (h *SupportHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	userRole := middleware.GetUserRole(r.Context())

	if userID == 0 {
		http.Error(w, "Не авторизован", http.StatusUnauthorized)
		return
	}

	ticketID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	var req struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Message == "" {
		http.Error(w, "Пустое сообщение", http.StatusBadRequest)
		return
	}

	var ownerID int
	var modID *int
	var status string
	err = h.db.QueryRow(`SELECT user_id, moderator_id, status FROM support_tickets WHERE id = $1`, ticketID).
		Scan(&ownerID, &modID, &status)
	if err == sql.ErrNoRows {
		http.Error(w, "Тикет не найден", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}

	if status == "closed" {
		http.Error(w, "Тикет закрыт", http.StatusConflict)
		return
	}

	isStaff := userRole == "moderator" || userRole == "admin"
	if isStaff {
		if modID == nil || *modID != userID {
			http.Error(w, "Сначала возьмите тикет в работу", http.StatusForbidden)
			return
		}
	} else if userID != ownerID {
		http.Error(w, "Доступ запрещён", http.StatusForbidden)
		return
	}

	senderType := "user"
	if isStaff {
		senderType = "moderator"
	}

	_, err = h.db.Exec(
		`INSERT INTO support_messages (ticket_id, sender_type, sender_id, message) VALUES ($1, $2, $3, $4)`,
		ticketID, senderType, userID, req.Message,
	)
	if err != nil {
		http.Error(w, "Ошибка отправки", http.StatusInternalServerError)
		return
	}

	h.db.Exec(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, ticketID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Сообщение отправлено"})
}

// CloseTicket закрывает тикет (только модератор/админ)
func (h *SupportHandler) CloseTicket(w http.ResponseWriter, r *http.Request) {
	userRole := middleware.GetUserRole(r.Context())
	if userRole != "moderator" && userRole != "admin" {
		http.Error(w, "Закрыть может только модератор", http.StatusForbidden)
		return
	}

	ticketID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Неверный ID", http.StatusBadRequest)
		return
	}

	res, err := h.db.Exec(
		`UPDATE support_tickets SET status = 'closed', updated_at = NOW() WHERE id = $1 AND status <> 'closed'`,
		ticketID,
	)
	if err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		http.Error(w, "Тикет не найден или уже закрыт", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Тикет закрыт"})
}