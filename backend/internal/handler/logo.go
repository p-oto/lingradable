package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"lingradable/internal/middleware"
)

type LogoHandler struct {
	logosPath string
}

type LogoItem struct {
	Name string   `json:"name"`
	URL  string   `json:"url"`
	Tags []string `json:"tags"`
}

type LogoLibrary struct {
	Distros             []LogoItem `json:"distros"`
	DesktopEnvironments []LogoItem `json:"desktop_environments"`
	WindowManagers      []LogoItem `json:"window_managers"`
}

func NewLogoHandler(logosPath string) *LogoHandler {
	return &LogoHandler{logosPath: logosPath}
}

// GetLogos возвращает библиотеку логотипов (только для модераторов/админов)
func (h *LogoHandler) GetLogos(w http.ResponseWriter, r *http.Request) {
	userRole := middleware.GetUserRole(r.Context())
	if userRole != "moderator" && userRole != "admin" {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	// Читаем JSON файл
	data, err := os.ReadFile(h.logosPath)
	if err != nil {
		http.Error(w, "Ошибка чтения библиотеки логотипов", http.StatusInternalServerError)
		return
	}

	var library LogoLibrary
	if err := json.Unmarshal(data, &library); err != nil {
		http.Error(w, "Ошибка парсинга библиотеки", http.StatusInternalServerError)
		return
	}

	// Фильтрация по поисковому запросу
	search := strings.ToLower(r.URL.Query().Get("search"))
	if search != "" {
		library.Distros = filterLogos(library.Distros, search)
		library.DesktopEnvironments = filterLogos(library.DesktopEnvironments, search)
		library.WindowManagers = filterLogos(library.WindowManagers, search)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(library)
}

func filterLogos(items []LogoItem, search string) []LogoItem {
	var filtered []LogoItem
	for _, item := range items {
		if strings.Contains(strings.ToLower(item.Name), search) {
			filtered = append(filtered, item)
			continue
		}
		for _, tag := range item.Tags {
			if strings.Contains(strings.ToLower(tag), search) {
				filtered = append(filtered, item)
				break
			}
		}
	}
	return filtered
}

// UpdateProductLogo обновляет логотип продукта (только для модераторов/админов)
func (h *LogoHandler) UpdateProductLogo(w http.ResponseWriter, r *http.Request) {
	userRole := middleware.GetUserRole(r.Context())
	if userRole != "moderator" && userRole != "admin" {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	var req struct {
		ProductID int    `json:"product_id"`
		IconURL   string `json:"icon_url"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Неверный формат данных", http.StatusBadRequest)
		return
	}

	if req.ProductID <= 0 || req.IconURL == "" {
		http.Error(w, "Неверные данные", http.StatusBadRequest)
		return
	}

	// Валидация URL (должен быть http/https или локальный путь)
	if !strings.HasPrefix(req.IconURL, "http://") &&
		!strings.HasPrefix(req.IconURL, "https://") &&
		!strings.HasPrefix(req.IconURL, "/static/") {
		http.Error(w, "Неверный URL логотипа", http.StatusBadRequest)
		return
	}

	// TODO: Вызвать метод репозитория для обновления
	// err := productRepo.UpdateProductIcon(req.ProductID, req.IconURL)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message":  "Логотип обновлён",
		"icon_url": req.IconURL,
	})
}

// DeleteProductLogo удаляет логотип продукта
func (h *LogoHandler) DeleteProductLogo(w http.ResponseWriter, r *http.Request) {
	userRole := middleware.GetUserRole(r.Context())
	if userRole != "moderator" && userRole != "admin" {
		http.Error(w, "Недостаточно прав", http.StatusForbidden)
		return
	}

	var req struct {
		ProductID int `json:"product_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Неверный формат данных", http.StatusBadRequest)
		return
	}

	if req.ProductID <= 0 {
		http.Error(w, "Неверный ID продукта", http.StatusBadRequest)
		return
	}

	// TODO: Вызвать метод репозитория для удаления логотипа
	// err := productRepo.RemoveProductIcon(req.ProductID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Логотип удалён",
	})
}
