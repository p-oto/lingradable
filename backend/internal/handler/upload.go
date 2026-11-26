package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/microcosm-cc/bluemonday"
)

type UploadHandler struct {
	uploadDir string
}

func NewUploadHandler(uploadDir string) *UploadHandler {
	// Создаём папку если её нет
	os.MkdirAll(uploadDir, 0755)
	return &UploadHandler{uploadDir: uploadDir}
}

// UploadImage обрабатывает загрузку изображений (PNG, JPG, SVG)
func (h *UploadHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	// Ограничение размера: 2MB
	const maxFileSize = 2 * 1024 * 1024
	r.Body = http.MaxBytesReader(w, r.Body, maxFileSize)

	if err := r.ParseMultipartForm(maxFileSize); err != nil {
		http.Error(w, "Файл слишком большой (максимум 2MB)", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "Файл не получен", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Проверяем расширение
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowedExts := map[string]string{
		".png":  "image/png",
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".svg":  "image/svg+xml",
	}

	expectedMIME, ok := allowedExts[ext]
	if !ok {
		http.Error(w, "Недопустимый формат файла. Разрешены: PNG, JPG, SVG", http.StatusBadRequest)
		return
	}

	// Проверяем MIME-тип
	buffer := make([]byte, 512)
	_, err = file.Read(buffer)
	if err != nil {
		http.Error(w, "Ошибка чтения файла", http.StatusInternalServerError)
		return
	}
	file.Seek(0, 0)

	detectedMIME := http.DetectContentType(buffer)

	// Для SVG DetectContentType возвращает text/plain, это нормально
	if ext != ".svg" && detectedMIME != expectedMIME {
		http.Error(w, "Неверный тип файла", http.StatusBadRequest)
		return
	}

	// Читаем файл
	fileBytes, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Ошибка чтения файла", http.StatusInternalServerError)
		return
	}

	// Санитизация SVG
	if ext == ".svg" {
		fileBytes = sanitizeSVG(fileBytes)
	}

	// Генерируем уникальное имя файла
	randomBytes := make([]byte, 8)
	rand.Read(randomBytes)
	randomStr := hex.EncodeToString(randomBytes)

	timestamp := fmt.Sprintf("%d", os.Getpid())
	newFilename := fmt.Sprintf("%s_%s%s", timestamp, randomStr, ext)
	filePath := filepath.Join(h.uploadDir, newFilename)

	// Сохраняем файл
	if err := os.WriteFile(filePath, fileBytes, 0644); err != nil {
		http.Error(w, "Ошибка сохранения файла", http.StatusInternalServerError)
		return
	}

	// Возвращаем URL
	url := "/static/img/uploads/" + newFilename

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"url": "%s", "filename": "%s"}`, url, newFilename)
}

// sanitizeSVG очищает SVG от потенциально опасного кода
func sanitizeSVG(data []byte) []byte {
	content := string(data)

	// 1. Удаляем <script> теги и их содержимое
	scriptRegex := regexp.MustCompile(`(?i)<script[^>]*>.*?</script>`)
	content = scriptRegex.ReplaceAllString(content, "")

	// 2. Удаляем одиночные <script/> теги
	scriptSelfClose := regexp.MustCompile(`(?i)<script[^>]*/>`)
	content = scriptSelfClose.ReplaceAllString(content, "")

	// 3. Удаляем on* атрибуты (onclick, onload, onerror и т.д.)
	onEventRegex := regexp.MustCompile(`(?i)\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)`)
	content = onEventRegex.ReplaceAllString(content, "")

	// 4. Удаляем javascript: в URL
	jsURLRegex := regexp.MustCompile(`(?i)javascript\s*:`)
	content = jsURLRegex.ReplaceAllString(content, "")

	// 5. Удаляем vbscript:
	vbsURLRegex := regexp.MustCompile(`(?i)vbscript\s*:`)
	content = vbsURLRegex.ReplaceAllString(content, "")

	// 6. Удаляем <!ENTITY и внешние ссылки
	entityRegex := regexp.MustCompile(`(?i)<!ENTITY[^>]*>`)
	content = entityRegex.ReplaceAllString(content, "")

	// 7. Удаляем <?xml-stylesheet и processing instructions с внешними ссылками
	piRegex := regexp.MustCompile(`(?i)<\?xml-stylesheet[^>]*\?>`)
	content = piRegex.ReplaceAllString(content, "")

	// 8. Используем bluemonday для финальной очистки
	policy := bluemonday.UGCPolicy()
	// Разрешаем SVG-специфичные теги
	policy.AllowElements(
		"svg", "g", "path", "circle", "rect", "ellipse", "line", "polyline", "polygon",
		"text", "tspan", "defs", "use", "symbol", "clipPath", "mask", "pattern",
		"linearGradient", "radialGradient", "stop", "filter", "feGaussianBlur",
		"feOffset", "feBlend", "feComposite", "feFlood", "feMerge", "feMergeNode",
		"image", "foreignObject",
	)
	policy.AllowAttrs("viewBox", "width", "height", "xmlns", "fill", "stroke",
		"stroke-width", "opacity", "transform", "d", "cx", "cy", "r", "rx", "ry",
		"x", "y", "x1", "y1", "x2", "y2", "points", "id", "class", "style",
		"font-family", "font-size", "font-weight", "text-anchor",
	).OnElements("svg", "g", "path", "circle", "rect", "ellipse", "line",
		"polyline", "polygon", "text", "tspan")
	policy.AllowAttrs("href", "xlink:href").OnElements("use", "image")

	cleaned := policy.Sanitize(content)
	return []byte(cleaned)
}
