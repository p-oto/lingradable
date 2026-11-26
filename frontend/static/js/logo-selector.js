// ==========================================
// КОМПОНЕНТ ВЫБОРА ЛОГОТИПА
// ==========================================

class LogoSelector {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.onSelect = options.onSelect || (() => {});
        this.userRole = options.userRole || 'user';
        this.selectedUrl = null;
        
        this.render();
    }

    render() {
        const isModerator = this.userRole === 'moderator' || this.userRole === 'admin';
        
        this.container.innerHTML = `
            <div class="logo-selector">
                <label class="form-label fw-bold">
                    <i class="fas fa-image"></i> Логотип проекта
                </label>
                
                <!-- Вкладки -->
                <ul class="nav nav-tabs mb-3" role="tablist">
                    <li class="nav-item">
                        <button class="nav-link active" data-tab="upload" type="button">
                            <i class="fas fa-upload"></i> Загрузить
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" data-tab="link" type="button">
                            <i class="fas fa-link"></i> Ссылка
                        </button>
                    </li>
                    ${isModerator ? `
                    <li class="nav-item">
                        <button class="nav-link" data-tab="library" type="button">
                            <i class="fas fa-book"></i> Библиотека
                        </button>
                    </li>
                    ` : ''}
                </ul>
                
                <!-- Вкладка: Загрузить -->
                <div class="tab-content" id="tab-upload">
                    <div class="mb-3">
                        <input type="file" class="form-control" id="logo-file-input" 
                               accept=".png,.jpg,.jpeg,.svg">
                        <div class="form-text">
                            PNG, JPG или SVG. Максимум 2MB.
                        </div>
                    </div>
                    <div id="logo-upload-preview" class="logo-preview" style="display:none;">
                        <img id="logo-upload-img" src="" alt="Предпросмотр">
                        <p class="text-success mt-2">
                            <i class="fas fa-check"></i> Файл выбран
                        </p>
                    </div>
                </div>
                
                <!-- Вкладка: Ссылка -->
                <div class="tab-content" id="tab-link" style="display:none;">
                    <div class="mb-3">
                        <input type="url" class="form-control" id="logo-url-input" 
                               placeholder="https://example.com/logo.png">
                        <div class="form-text">
                            Прямая ссылка на изображение (PNG, JPG или SVG)
                        </div>
                    </div>
                    <div id="logo-link-preview" class="logo-preview" style="display:none;">
                        <img id="logo-link-img" src="" alt="Предпросмотр">
                        <p class="text-success mt-2">
                            <i class="fas fa-check"></i> Ссылка проверена
                        </p>
                    </div>
                </div>
                
                ${isModerator ? `
                <!-- Вкладка: Библиотека -->
                <div class="tab-content" id="tab-library" style="display:none;">
                    <div class="mb-3">
                        <input type="text" class="form-control" id="logo-search-input" 
                               placeholder="🔍 Поиск логотипа...">
                    </div>
                    <div id="logo-library-content">
                        <p class="text-muted">Введите запрос для поиска...</p>
                    </div>
                </div>
                ` : ''}
                
                <!-- Общий предпросмотр выбранного -->
                <div id="logo-final-preview" class="logo-final-preview" style="display:none;">
                    <h6 class="fw-bold mt-3">Выбранный логотип:</h6>
                    <div class="d-flex align-items-center gap-3">
                        <img id="logo-final-img" src="" alt="Логотип" style="max-height: 80px; max-width: 80px;">
                        <div>
                            <code id="logo-final-url" class="d-block text-break" style="max-width: 400px;"></code>
                            <button class="btn btn-sm btn-outline-danger mt-2" onclick="logoSelector.clearSelection()">
                                <i class="fas fa-times"></i> Очистить выбор
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.bindEvents();
    }

    bindEvents() {
        // Переключение вкладок
        this.container.querySelectorAll('.nav-link[data-tab]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(btn.dataset.tab);
            });
        });
        
        // Загрузка файла
        const fileInput = this.container.querySelector('#logo-file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }
        
        // Ввод ссылки
        const urlInput = this.container.querySelector('#logo-url-input');
        if (urlInput) {
            let urlTimeout;
            urlInput.addEventListener('input', (e) => {
                clearTimeout(urlTimeout);
                urlTimeout = setTimeout(() => this.handleUrlInput(e.target.value), 500);
            });
        }
        
        // Поиск в библиотеке
        const searchInput = this.container.querySelector('#logo-search-input');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.searchLibrary(e.target.value), 500);
            });
        }
    }

    switchTab(tabName) {
        // Переключаем активную вкладку
        this.container.querySelectorAll('.nav-link[data-tab]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Показываем нужный контент
        this.container.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
        });
        const tabContent = this.container.querySelector(`#tab-${tabName}`);
        if (tabContent) {
            tabContent.style.display = 'block';
        }
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Проверка размера
        if (file.size > 2 * 1024 * 1024) {
            alert('❌ Файл слишком большой! Максимум 2MB.');
            event.target.value = '';
            return;
        }
        
        // Проверка типа
        const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
        if (!allowedTypes.includes(file.type)) {
            alert('❌ Недопустимый формат! Разрешены: PNG, JPG, SVG.');
            event.target.value = '';
            return;
        }
        
        // Предпросмотр
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = this.container.querySelector('#logo-upload-preview');
            const img = this.container.querySelector('#logo-upload-img');
            img.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
        
        // Загрузка на сервер
        try {
            const formData = new FormData();
            formData.append('image', file);
            
            const response = await fetch('http://localhost:8080/api/upload', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(error);
            }
            
            const result = await response.json();
            this.selectLogo(result.url);
            
        } catch (err) {
            alert('❌ Ошибка загрузки: ' + err.message);
        }
    }

    handleUrlInput(url) {
        if (!url) {
            this.container.querySelector('#logo-link-preview').style.display = 'none';
            return;
        }
        
        // Проверяем, что это изображение
        const img = new Image();
        img.onload = () => {
            const preview = this.container.querySelector('#logo-link-preview');
            const previewImg = this.container.querySelector('#logo-link-img');
            previewImg.src = url;
            preview.style.display = 'block';
            this.selectLogo(url);
        };
        img.onerror = () => {
            // Не показываем ошибку сразу — возможно, пользователь ещё печатает
        };
        img.src = url;
    }

    async searchLibrary(query) {
        const content = this.container.querySelector('#logo-library-content');
        if (!query.trim()) {
            content.innerHTML = '<p class="text-muted">Введите запрос для поиска...</p>';
            return;
        }
        
        content.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm"></div></div>';
        
        try {
            const response = await fetch(`http://localhost:8080/api/logos?search=${encodeURIComponent(query)}`, {
                headers: getAuthHeaders()
            });
            
            if (!response.ok) {
                throw new Error('Ошибка загрузки библиотеки');
            }
            
            const library = await response.json();
            this.renderLibrary(library);
            
        } catch (err) {
            content.innerHTML = `<div class="alert alert-danger">Ошибка: ${err.message}</div>`;
        }
    }

    renderLibrary(library) {
        const content = this.container.querySelector('#logo-library-content');
        let html = '';
        
        const renderSection = (title, items, icon) => {
            if (!items || items.length === 0) return '';
            let sectionHtml = `<h6 class="mt-3"><i class="${icon}"></i> ${title} (${items.length})</h6>`;
            sectionHtml += '<div class="logo-grid d-flex flex-wrap gap-2">';
            items.forEach(item => {
                sectionHtml += `
                    <div class="logo-item card p-2" style="cursor: pointer; width: 100px;" 
                         onclick="logoSelector.selectFromLibrary('${item.url}', '${item.name.replace(/'/g, "\\'")}')">
                        <img src="${item.url}" alt="${item.name}" 
                             style="max-height: 40px; max-width: 80px; object-fit: contain;"
                             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><circle cx=%2232%22 cy=%2232%22 r=%2230%22 fill=%22%23667eea%22/><text x=%2232%22 y=%2244%22 font-family=%22Arial%22 font-size=%2220%22 fill=%22white%22 text-anchor=%22middle%22>L</text></svg>';">
                        <small class="text-center mt-1 d-block text-truncate" title="${item.name}">${item.name}</small>
                    </div>
                `;
            });
            sectionHtml += '</div>';
            return sectionHtml;
        };
        
        html += renderSection('Дистрибутивы', library.distros, 'fas fa-linux');
        html += renderSection('Окружения рабочего стола', library.desktop_environments, 'fas fa-desktop');
        html += renderSection('Оконные менеджеры', library.window_managers, 'fas fa-window-maximize');
        
        if (!html) {
            html = '<p class="text-muted">Ничего не найдено.</p>';
        }
        
        content.innerHTML = html;
    }

    selectFromLibrary(url, name) {
        this.selectLogo(url);
    }

    selectLogo(url) {
        this.selectedUrl = url;
        
        const preview = this.container.querySelector('#logo-final-preview');
        const img = this.container.querySelector('#logo-final-img');
        const urlText = this.container.querySelector('#logo-final-url');
        
        img.src = url;
        urlText.textContent = url;
        preview.style.display = 'block';
        
        // Вызываем callback
        if (this.onSelect) {
            this.onSelect(url);
        }
    }

    clearSelection() {
        this.selectedUrl = null;
        this.container.querySelector('#logo-final-preview').style.display = 'none';
        this.container.querySelector('#logo-upload-preview').style.display = 'none';
        this.container.querySelector('#logo-link-preview').style.display = 'none';
        this.container.querySelector('#logo-file-input').value = '';
        this.container.querySelector('#logo-url-input').value = '';
        
        if (this.onSelect) {
            this.onSelect(null);
        }
    }

    getSelectedUrl() {
        return this.selectedUrl;
    }
}

// Глобальный экземпляр (для onclick handlers)
let logoSelector = null;