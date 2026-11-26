// ==========================================
// LINGRADABLE — ПОЛНЫЙ APP.JS
// Чистый код без ошибок
// ==========================================

// ==========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
let activeTags = new Set();
let showCustomOnly = false;
let searchQuery = '';
let sortBy = 'newest';
let currentProductID = null;

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================
function getAuthHeaders() {
    const u = JSON.parse(localStorage.getItem('user'));
    if (u && u.id) {
        return {
            'Content-Type': 'application/json',
            'X-User-ID': u.id.toString()
        };
    }
    return { 'Content-Type': 'application/json' };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// НАВИГАЦИЯ
// ==========================================
function showPage(pageName, addToHistory = true) {
    document.querySelectorAll('.page').forEach(function(page) {
        page.style.display = 'none';
    });
    
    const page = document.getElementById('page-' + pageName);
    if (page) {
        page.style.display = 'block';
        window.scrollTo(0, 0);
    }
    
    if (addToHistory) {
        const url = pageName === 'home' ? '/' : '/' + pageName;
        history.pushState({ page: pageName }, '', url);
    }
    
    if (pageName === 'home') {
        loadCatalog();
        loadTags();
    } else if (pageName === 'moderation') {
        setTimeout(function() { loadPendingProducts(); }, 100);
    } else if (pageName === 'add') {
        setTimeout(function() { initLogoSelector(); }, 50);
    }
}

function goToAddProject() {
    const navUser = JSON.parse(localStorage.getItem('user'));
    if (!navUser) {
        alert('⚠️ Для добавления проекта необходимо зарегистрироваться или войти в систему.');
        showPage('login');
        return;
    }
    showPage('add');
}

window.addEventListener('popstate', function(event) {
    if (event.state && event.state.page) {
        if (event.state.page === 'product' && event.state.productID) {
            showPage('product', false);
            showProduct(event.state.productID);
        } else {
            showPage(event.state.page, false);
        }
    } else {
        showPage('home', false);
    }
});

// ==========================================
// АВТОРИЗАЦИЯ
// ==========================================
function updateNavigation() {
    const authUser = JSON.parse(localStorage.getItem('user'));
    const authButtons = document.getElementById('auth-buttons');
    const navModeration = document.getElementById('nav-moderation');
    
    if (authUser) {
        authButtons.innerHTML = '<li class="nav-item"><span class="nav-link"><i class="fas fa-user"></i> ' + authUser.login + '</span></li>' +
            '<li class="nav-item"><a class="nav-link" href="#" onclick="logout(); return false;"><i class="fas fa-sign-out-alt"></i> Выйти</a></li>';
        
        if (navModeration) {
            if (authUser.role === 'moderator' || authUser.role === 'admin') {
                navModeration.style.display = 'block';
                loadPendingCount();
            } else {
                navModeration.style.display = 'none';
            }
        }
    } else {
        authButtons.innerHTML = '<li class="nav-item"><a class="nav-link" href="#" onclick="showPage(\'login\'); return false;"><i class="fas fa-sign-in-alt"></i> Войти</a></li>' +
            '<li class="nav-item"><a class="nav-link" href="#" onclick="showPage(\'register\'); return false;"><i class="fas fa-user-plus"></i> Регистрация</a></li>';
        if (navModeration) navModeration.style.display = 'none';
    }
}

function logout() {
    localStorage.removeItem('user');
    updateNavigation();
    showPage('home');
}

async function loadPendingCount() {
    const countUser = JSON.parse(localStorage.getItem('user'));
    if (!countUser || (countUser.role !== 'moderator' && countUser.role !== 'admin')) return;
    
    try {
        const response = await fetch('http://localhost:8080/api/products/pending', { headers: getAuthHeaders() });
        if (!response.ok) return;
        const products = await response.json();
        const countBadge = document.getElementById('pending-count');
        const tabCountBadge = document.getElementById('tab-pending-count');
        if (countBadge) countBadge.textContent = products.length;
        if (tabCountBadge) tabCountBadge.textContent = products.length;
    } catch (err) {
        console.error('Ошибка загрузки счётчика:', err);
    }
}

// ==========================================
// ФИЛЬТРЫ
// ==========================================
function toggleTag(tagName) {
    if (activeTags.has(tagName)) activeTags.delete(tagName);
    else activeTags.add(tagName);
    updateFilterButtons();
    loadCatalog();
}

function toggleCustomFilter() {
    showCustomOnly = !showCustomOnly;
    updateFilterButtons();
    loadCatalog();
}

function resetFilters() {
    activeTags.clear();
    showCustomOnly = false;
    searchQuery = '';
    sortBy = 'newest';
    const customBtn = document.getElementById('custom-filter-btn');
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');
    if (customBtn) { customBtn.classList.remove('active'); }
    if (searchInput) searchInput.value = '';
    if (sortSelect) sortSelect.value = 'newest';
    updateFilterButtons();
    loadCatalog();
}

function updateFilterButtons() {
    document.querySelectorAll('#tags-filter .btn').forEach(function(btn) {
        if (activeTags.has(btn.dataset.tag)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    const customBtn = document.getElementById('custom-filter-btn');
    if (customBtn) {
        if (showCustomOnly) { customBtn.classList.add('active'); }
        else { customBtn.classList.remove('active'); }
    }
    updateFilterStatus();
}

function updateFilterStatus() {
    const statusEl = document.getElementById('filter-status');
    if (!statusEl) return;
    const parts = [];
    if (activeTags.size > 0) parts.push('Теги: ' + Array.from(activeTags).join(', '));
    if (showCustomOnly) parts.push('Только кастомные');
    if (searchQuery) parts.push('Поиск: "' + searchQuery + '"');
    statusEl.textContent = parts.length > 0 ? 'Активные фильтры: ' + parts.join(' | ') : '';
}

// ==========================================
// КАТАЛОГ
// ==========================================
async function loadTags() {
    const tagsEl = document.getElementById('tags-filter');
    if (!tagsEl) return;
    try {
        const response = await fetch('http://localhost:8080/api/tags');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const tags = await response.json();
        tagsEl.innerHTML = '';
        if (tags && Array.isArray(tags)) {
            tags.forEach(function(t) {
                const btn = document.createElement('button');
                btn.className = 'btn category-btn';
                btn.dataset.tag = t.name;
                btn.textContent = t.name;
                btn.onclick = function() { toggleTag(t.name); };
                tagsEl.appendChild(btn);
            });
        }
        updateFilterButtons();
    } catch (err) { console.error('Ошибка загрузки тегов:', err); }
}

async function loadCatalog() {
    const listEl = document.getElementById('products-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="col-12 text-center mt-4"><div class="spinner-border" role="status"></div><p class="mt-2">Загрузка...</p></div>';
    
    try {
        const params = new URLSearchParams();
        if (activeTags.size > 0) params.append('tags', Array.from(activeTags).join(','));
        if (showCustomOnly) params.append('custom', 'true');
        if (searchQuery) params.append('search', searchQuery);
        if (sortBy) params.append('sort', sortBy);
        
        const response = await fetch('http://localhost:8080/api/products?' + params.toString());
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const products = await response.json();
        
        if (!products || products.length === 0) {
            listEl.innerHTML = '<div class="col-12 text-center mt-4"><p class="text-muted"><i class="fas fa-search"></i> Ничего не найдено.</p></div>';
            return;
        }
        
        listEl.innerHTML = '';
        products.forEach(function(p) {
            const typeClass = p.type === 'distro' ? 'badge-distro' : p.type === 'de' ? 'badge-de' : 'badge-wm';
            const typeName = p.type === 'distro' ? 'Дистрибутив' : p.type === 'de' ? 'DE' : 'WM';
            const customBadge = p.author_login ? '<span class="badge bg-warning text-dark ms-2"><i class="fas fa-user-cog"></i> Кастомный</span>' : '';
            const starsHtml = p.avg_rating > 0 ? '<div class="mb-2">' + '⭐'.repeat(Math.round(p.avg_rating)) + ' <small class="text-muted">(' + p.avg_rating.toFixed(1) + ')</small></div>' : '';
            const statsHtml = '<div class="d-flex justify-content-between align-items-center mt-2 small text-muted border-top pt-2"><span><i class="fas fa-star text-warning"></i> ' + (p.review_count || 0) + ' отзывов</span><span><i class="fas fa-comment text-primary"></i> ' + (p.comment_count || 0) + ' коммент.</span></div>';
            const fallbackSvg = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><circle cx=%2232%22 cy=%2232%22 r=%2230%22 fill=%22%23667eea%22/><text x=%2232%22 y=%2244%22 font-family=%22Arial%22 font-size=%2236%22 font-weight=%22bold%22 fill=%22white%22 text-anchor=%22middle%22>L</text></svg>';
            const iconHtml = p.icon_url 
                ? '<div class="product-icon mb-2"><img src="' + p.icon_url + '" alt="' + p.name + '" onerror="this.onerror=null; this.src=\'' + fallbackSvg + '\';" class="img-fluid" style="max-height: 60px; max-width: 60px;"></div>'
                : '<div class="product-icon mb-2"><i class="fab fa-linux fa-3x text-muted"></i></div>';
            
            const col = document.createElement('div');
            col.className = 'col-md-4 mb-4';
            col.innerHTML = '<div class="card product-card h-100"><div class="card-body">' + iconHtml +
                '<span class="product-type-badge ' + typeClass + '">' + typeName + '</span>' + customBadge +
                '<h5 class="card-title mt-2">' + p.name + '</h5>' + starsHtml +
                '<p class="card-text text-muted">' + p.description.substring(0, 100) + '...</p>' + statsHtml +
                '</div><div class="card-footer bg-white border-top-0"><button class="btn btn-primary btn-sm w-100" onclick="showProduct(' + p.id + ')"><i class="fas fa-info-circle"></i> Подробнее</button></div></div>';
            listEl.appendChild(col);
        });
    } catch (err) {
        console.error('Ошибка загрузки каталога:', err);
        listEl.innerHTML = '<div class="col-12"><div class="alert alert-danger">Ошибка загрузки каталога.</div></div>';
    }
}

// ==========================================
// ПРОДУКТ
// ==========================================
function showProduct(id) {
    currentProductID = id;
    showPage('product');
    history.replaceState({ page: 'product', productID: id }, '', '/product/' + id);
    
    const detailEl = document.getElementById('product-detail');
    detailEl.innerHTML = '<div class="text-center mt-4"><div class="spinner-border" role="status"></div><p>Загрузка...</p></div>';
    document.getElementById('reviews-list').innerHTML = '<div class="spinner-border spinner-border-sm"></div>';
    document.getElementById('comments-list').innerHTML = '<div class="spinner-border spinner-border-sm"></div>';
    
    fetch('http://localhost:8080/api/products/' + id)
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(product) {
            const typeClass = product.type === 'distro' ? 'badge-distro' : product.type === 'de' ? 'badge-de' : 'badge-wm';
            const typeName = product.type === 'distro' ? 'Дистрибутив' : product.type === 'de' ? 'DE' : 'WM';
            document.getElementById('product-name').textContent = product.name;
            
            const stars = product.avg_rating > 0 
                ? '⭐'.repeat(Math.round(product.avg_rating)) + ' <small class="text-muted">(' + product.avg_rating.toFixed(1) + ' из 5, ' + product.review_count + ' отзывов)</small>'
                : '<small class="text-muted">Пока нет оценок</small>';
            
            const authorHtml = product.author_login
                ? '<div class="alert alert-info mt-3"><i class="fas fa-user-cog"></i> <strong>Автор:</strong> ' + product.author_login + ' <span class="badge bg-warning text-dark ms-2">Кастомный проект</span></div>'
                : '<div class="alert alert-secondary mt-3"><i class="fas fa-check-circle"></i> <strong>Статус:</strong> Официальный проект</div>';
            
            const modUser = JSON.parse(localStorage.getItem('user'));
            let modControls = '';
            if (modUser && (modUser.role === 'moderator' || modUser.role === 'admin')) {
                modControls = '<div class="mt-4 p-3 border rounded bg-light"><h6 class="fw-bold"><i class="fas fa-cog"></i> Управление проектом (Модератор)</h6><div class="d-flex gap-2"><button class="btn btn-warning btn-sm" onclick="openEditProductModal(' + product.id + ')"><i class="fas fa-edit"></i> Редактировать</button><button class="btn btn-danger btn-sm" onclick="deleteProduct(' + product.id + ')"><i class="fas fa-trash"></i> Удалить проект</button></div></div>';
            }
            
            detailEl.innerHTML = '<div class="product-detail fade-in">' +
                '<div class="product-header d-flex align-items-center gap-3">' +
                (product.icon_url 
                    ? '<img src="' + product.icon_url + '" alt="' + product.name + '" class="img-fluid" style="max-height: 80px; max-width: 80px;" onerror="this.onerror=null; this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><circle cx=%2232%22 cy=%2232%22 r=%2230%22 fill=%22%23667eea%22/><text x=%2232%22 y=%2244%22 font-family=%22Arial%22 font-size=%2236%22 font-weight=%22bold%22 fill=%22white%22 text-anchor=%22middle%22>L</text></svg>\';">'
                    : '<i class="fab fa-linux fa-4x text-muted"></i>') +
                '<div><span class="product-type-badge ' + typeClass + '">' + typeName + '</span>' +
                '<h1 class="mt-2 mb-0">' + product.name + '</h1>' +
                '<div class="mt-2">' + stars + '</div></div></div>' +
                authorHtml + modControls +
                '<h3>Описание</h3><p>' + product.description + '</p>' +
                (product.links ? '<h3 class="mt-4">Ссылки</h3><a href="' + product.links + '" class="btn btn-success" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i> ПЕРЕЙТИ</a>' : '') +
                (product.sha256_hash ? '<div class="sha256-box mt-4"><span class="sha256-label"><i class="fas fa-shield-alt"></i> SHA256 хэш:</span><code class="d-block mt-2 text-break">' + product.sha256_hash + '</code></div>' : '') +
                '</div>';
            
            loadReviews(id);
            loadComments(id);
        })
        .catch(function(err) {
            detailEl.innerHTML = '<div class="alert alert-danger">Ошибка загрузки: ' + err.message + '</div>';
        });
}

// ==========================================
// ОТЗЫВЫ
// ==========================================
async function loadReviews(productID) {
    const reviewsList = document.getElementById('reviews-list');
    if (!reviewsList) return;
    const reviewUser = JSON.parse(localStorage.getItem('user'));
    
    try {
        const response = await fetch('http://localhost:8080/api/products/' + productID + '/reviews');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const reviews = await response.json();
        
        let html = '';
        if (reviewUser) {
            html += '<div class="mb-4 p-3 bg-light rounded border"><h6 class="fw-bold mb-2"><i class="fas fa-pen"></i> Оставить отзыв</h6>' +
                '<select id="review-rating" class="form-select mb-2" data-rating="5"><option value="5">⭐⭐⭐⭐⭐ (5)</option><option value="4">⭐⭐⭐⭐ (4)</option><option value="3">⭐⭐⭐ (3)</option><option value="2">⭐⭐ (2)</option><option value="1">⭐ (1)</option></select>' +
                '<button class="btn btn-primary btn-sm" onclick="submitReview(' + productID + ')"><i class="fas fa-paper-plane"></i> Отправить</button></div>';
        } else {
            html += '<div class="alert alert-info small mb-3"><i class="fas fa-info-circle"></i> <a href="#" onclick="showPage(\'login\'); return false;">Войдите</a>, чтобы оставить отзыв.</div>';
        }
        
        if (!reviews || reviews.length === 0) {
            html += '<p class="text-muted fst-italic">Отзывов пока нет.</p>';
        } else {
            reviews.forEach(function(review) {
                const stars = '⭐'.repeat(review.rating);
                const canDelete = reviewUser && (reviewUser.id === review.user_id || reviewUser.role === 'moderator' || reviewUser.role === 'admin');
                const deleteBtn = canDelete ? '<button class="btn btn-sm btn-outline-danger float-end" onclick="deleteReview(' + review.id + ', ' + productID + ')" title="Удалить"><i class="fas fa-trash"></i></button>' : '';
                html += '<div class="review-item mb-3 p-3 bg-light rounded position-relative">' + deleteBtn +
                    '<div class="review-stars mb-1">' + stars + '</div>' +
                    '<div class="review-author fw-bold text-primary">' + (review.user_name || 'Аноним') + '</div>' +
                    '<small class="text-muted">' + new Date(review.created_at).toLocaleDateString('ru-RU') + '</small></div>';
            });
        }
        reviewsList.innerHTML = html;
    } catch (err) {
        console.error('Ошибка загрузки отзывов:', err);
        reviewsList.innerHTML = '<p class="text-danger">Не удалось загрузить отзывы</p>';
    }
}

async function submitReview(productID) {
    if (!productID || productID <= 0) { alert(' Ошибка: Неверный ID продукта'); return; }
    const rating = parseInt(document.getElementById('review-rating').value);
    const reviewUser = JSON.parse(localStorage.getItem('user'));
    if (!reviewUser) { alert('Войдите, чтобы оставить отзыв'); return; }
    
    try {
        const response = await fetch('http://localhost:8080/api/products/' + productID + '/reviews', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ rating: rating })
        });
        if (!response.ok) { const error = await response.text(); throw new Error(error); }
        alert('✅ Отзыв добавлен!');
        loadReviews(productID);
        loadCatalog();
    } catch (err) { alert('❌ Ошибка: ' + err.message); }
}

async function deleteReview(reviewID, productID) {
    if (!confirm('Вы уверены, что хотите удалить этот отзыв?')) return;
    try {
        const response = await fetch('http://localhost:8080/api/reviews/' + reviewID, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (!response.ok) { const error = await response.text(); throw new Error(error); }
        alert('✅ Отзыв удалён!');
        loadReviews(productID);
        loadCatalog();
    } catch (err) { alert('❌ Ошибка: ' + err.message); }
}

// ==========================================
// КОММЕНТАРИИ
// ==========================================
async function loadComments(productID) {
    const commentsList = document.getElementById('comments-list');
    if (!commentsList) return;
    const commentUser = JSON.parse(localStorage.getItem('user'));
    
    try {
        const response = await fetch('http://localhost:8080/api/products/' + productID + '/comments');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const comments = await response.json();
        
        let html = '';
        if (commentUser) {
            html += '<div class="mb-4 p-3 bg-light rounded border"><h6 class="fw-bold mb-2"><i class="fas fa-comment-dots"></i> Добавить комментарий</h6>' +
                '<textarea id="comment-text" class="form-control mb-2" rows="3" placeholder="Ваш комментарий..."></textarea>' +
                '<button class="btn btn-primary btn-sm" onclick="submitComment(' + productID + ', null)"><i class="fas fa-paper-plane"></i> Отправить</button></div>';
        } else {
            html += '<div class="alert alert-info small mb-3"><i class="fas fa-info-circle"></i> <a href="#" onclick="showPage(\'login\'); return false;">Войдите</a>, чтобы добавить комментарий.</div>';
        }
        
        if (!comments || comments.length === 0) {
            html += '<p class="text-muted fst-italic">Комментариев пока нет.</p>';
        } else {
            comments.forEach(function(comment) {
                html += renderComment(comment, commentUser, productID, 0);
            });
        }
        commentsList.innerHTML = html;
    } catch (err) {
        console.error('Ошибка загрузки комментариев:', err);
        commentsList.innerHTML = '<p class="text-danger">Не удалось загрузить комментарии</p>';
    }
}

function renderComment(comment, commentUser, productID, depth) {
    const indent = depth * 30;
    const maxDepth = 5;
    const canDelete = commentUser && (commentUser.id === comment.user_id || commentUser.role === 'moderator' || commentUser.role === 'admin');
    const deleteBtn = canDelete ? '<button class="btn btn-sm btn-danger float-end" onclick="deleteComment(' + comment.id + ', ' + productID + ')" title="Удалить"><i class="fas fa-trash"></i></button>' : '';
    const replyBtn = (commentUser && depth < maxDepth) ? '<button class="btn btn-sm btn-outline-primary ms-2" onclick="showReplyForm(' + comment.id + ')"><i class="fas fa-reply"></i> Ответить</button>' : '';
    
    const repliesCount = comment.replies ? comment.replies.length : 0;
    let toggleBtn = '';
    if (repliesCount > 0) {
        toggleBtn = '<button class="btn btn-sm btn-link text-decoration-none mt-2 p-0" onclick="toggleReplies(' + comment.id + ')" id="toggle-btn-' + comment.id + '"><i class="fas fa-chevron-down" id="toggle-icon-' + comment.id + '"></i><span id="toggle-text-' + comment.id + '">Показать ответы (' + repliesCount + ')</span></button>';
    }
    
    let html = '<div class="comment-item mb-2 p-3 bg-light rounded border-start border-4 border-primary" style="margin-left: ' + indent + 'px;">' + deleteBtn +
        '<div class="comment-author fw-bold text-primary mb-1">' + (comment.user_name || 'Аноним') + '</div>' +
        '<p class="mb-1">' + escapeHtml(comment.text) + '</p>' +
        '<small class="text-muted">' + new Date(comment.created_at).toLocaleDateString('ru-RU') + '</small>' +
        replyBtn + toggleBtn +
        '<div id="reply-form-' + comment.id + '" style="display:none;" class="mt-2">' +
        '<textarea id="reply-text-' + comment.id + '" class="form-control mb-2" rows="2" placeholder="Ваш ответ..."></textarea>' +
        '<button class="btn btn-sm btn-primary" onclick="submitComment(' + productID + ', ' + comment.id + ')"><i class="fas fa-paper-plane"></i> Отправить ответ</button>' +
        '<button class="btn btn-sm btn-secondary ms-2" onclick="hideReplyForm(' + comment.id + ')">Отмена</button></div>';
    
    if (repliesCount > 0) {
        html += '<div id="replies-container-' + comment.id + '" style="display:none;" class="mt-2">';
        comment.replies.forEach(function(reply) {
            html += renderComment(reply, commentUser, productID, depth + 1);
        });
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function toggleReplies(commentID) {
    const container = document.getElementById('replies-container-' + commentID);
    const icon = document.getElementById('toggle-icon-' + commentID);
    const text = document.getElementById('toggle-text-' + commentID);
    if (!container) return;
    if (container.style.display === 'none') {
        container.style.display = 'block';
        if (icon) icon.className = 'fas fa-chevron-up';
        if (text) text.textContent = text.textContent.replace('Показать', 'Скрыть');
    } else {
        container.style.display = 'none';
        if (icon) icon.className = 'fas fa-chevron-down';
        if (text) text.textContent = text.textContent.replace('Скрыть', 'Показать');
    }
}

function showReplyForm(commentID) {
    document.querySelectorAll('[id^="reply-form-"]').forEach(function(f) { f.style.display = 'none'; });
    const form = document.getElementById('reply-form-' + commentID);
    if (form) {
        form.style.display = 'block';
        const ta = document.getElementById('reply-text-' + commentID);
        if (ta) ta.focus();
    }
}

function hideReplyForm(commentID) {
    const form = document.getElementById('reply-form-' + commentID);
    if (form) {
        form.style.display = 'none';
        const ta = document.getElementById('reply-text-' + commentID);
        if (ta) ta.value = '';
    }
}

async function submitComment(productID, parentID) {
    if (!productID || productID <= 0) { alert('❌ Ошибка: Неверный ID продукта'); return; }
    let text;
    if (parentID) {
        const ta = document.getElementById('reply-text-' + parentID);
        if (!ta) { alert('❌ Ошибка: Форма ответа не найдена'); return; }
        text = ta.value.trim();
    } else {
        const ta2 = document.getElementById('comment-text');
        if (!ta2) { alert('❌ Ошибка: Форма комментария не найдена'); return; }
        text = ta2.value.trim();
    }
    const commentUser = JSON.parse(localStorage.getItem('user'));
    if (!commentUser) { alert('Войдите, чтобы добавить комментарий'); return; }
    if (!text) { alert('Введите текст комментария'); return; }
    
    const body = { text: text };
    if (parentID) body.parent_id = parentID;
    
    try {
        const response = await fetch('http://localhost:8080/api/products/' + productID + '/comments', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });
        if (!response.ok) { const error = await response.text(); throw new Error(error); }
        if (parentID) hideReplyForm(parentID);
        else document.getElementById('comment-text').value = '';
        await loadComments(productID);
    } catch (err) { alert('❌ Ошибка: ' + err.message); }
}

async function deleteComment(commentID, productID) {
    if (!confirm('Вы уверены, что хотите удалить этот комментарий?')) return;
    try {
        const response = await fetch('http://localhost:8080/api/comments/' + commentID, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (!response.ok) { const error = await response.text(); throw new Error(error); }
        alert('✅ Комментарий удалён!');
        await loadComments(productID);
        await loadCatalog();
    } catch (err) { alert('❌ Ошибка: ' + err.message); }
}

// ==========================================
// МОДЕРАЦИЯ
// ==========================================
function showModerationTab(tabName) {
    document.querySelectorAll('.moderation-tab').forEach(function(tab) { tab.style.display = 'none'; });
    document.querySelectorAll('#page-moderation .nav-link').forEach(function(link) { link.classList.remove('active'); });
    const tabElement = document.getElementById('moderation-' + tabName);
    if (tabElement) tabElement.style.display = 'block';
    const links = document.querySelectorAll('#page-moderation .nav-link');
    for (let i = 0; i < links.length; i++) {
        const text = links[i].textContent.toLowerCase();
        if (tabName === 'pending' && text.indexOf('модерации') !== -1) links[i].classList.add('active');
        else if (tabName === 'rejected' && text.indexOf('отклон') !== -1) links[i].classList.add('active');
    }
    if (tabName === 'pending') loadPendingProducts();
    else if (tabName === 'rejected') loadRejectedProducts();
}

async function loadPendingProducts() {
    const listEl = document.getElementById('pending-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-center"><div class="spinner-border" role="status"></div><p class="mt-2">Загрузка...</p></div>';
    
    try {
        const response = await fetch('http://localhost:8080/api/products/pending', { method: 'GET', headers: getAuthHeaders() });
        if (!response.ok) { const errorText = await response.text(); throw new Error(errorText); }
        const products = await response.json();
        
        const countBadge = document.getElementById('pending-count');
        const tabCountBadge = document.getElementById('tab-pending-count');
        if (countBadge) countBadge.textContent = products.length;
        if (tabCountBadge) tabCountBadge.textContent = products.length;
        
        if (!products || products.length === 0) {
            listEl.innerHTML = '<div class="alert alert-success"><i class="fas fa-check-circle"></i> Нет проектов на модерации. Всё проверено!</div>';
            return;
        }
        
        listEl.innerHTML = '';
        products.forEach(function(p) {
            const typeClass = p.type === 'distro' ? 'badge-distro' : p.type === 'de' ? 'badge-de' : 'badge-wm';
            const typeName = p.type === 'distro' ? 'Дистрибутив' : p.type === 'de' ? 'DE' : 'WM';
            const card = document.createElement('div');
            card.className = 'card mb-3';
            card.innerHTML = '<div class="card-body"><div class="d-flex justify-content-between align-items-start mb-3"><div><span class="product-type-badge ' + typeClass + '">' + typeName + '</span>' +
                '<h4 class="mt-2 mb-0">' + p.name + '</h4><small class="text-muted"><i class="fas fa-user"></i> Автор: ' + (p.author_login || 'Неизвестно') + ' | <i class="fas fa-clock"></i> ' + new Date(p.created_at).toLocaleString('ru-RU') + '</small></div>' +
                '<span class="badge bg-warning text-dark">На модерации</span></div>' +
                '<h6>Описание:</h6><p>' + p.description + '</p>' +
                (p.links ? '<h6>Ссылки:</h6><a href="' + p.links + '" target="_blank" class="btn btn-sm btn-outline-primary mb-3"><i class="fas fa-external-link-alt"></i> Перейти</a>' : '') +
                (p.sha256_hash ? '<h6>SHA256 хэш:</h6><code class="d-block p-2 bg-light rounded text-break mb-3">' + p.sha256_hash + '</code>' : '') +
                '<div class="d-flex gap-2"><button class="btn btn-success" onclick="approveProduct(' + p.id + ')"><i class="fas fa-check"></i> Одобрить</button>' +
                '<button class="btn btn-danger" onclick="showRejectForm(' + p.id + ')"><i class="fas fa-times"></i> Отклонить</button></div>' +
                '<div id="reject-form-' + p.id + '" style="display:none;" class="mt-3"><textarea id="reject-reason-' + p.id + '" class="form-control mb-2" rows="3" placeholder="Причина отклонения..."></textarea>' +
                '<button class="btn btn-danger btn-sm" onclick="rejectProduct(' + p.id + ')"><i class="fas fa-check"></i> Подтвердить отклонение</button>' +
                '<button class="btn btn-secondary btn-sm ms-2" onclick="hideRejectForm(' + p.id + ')">Отмена</button></div></div>';
            listEl.appendChild(card);
        });
    } catch (err) {
        console.error('Ошибка загрузки проектов на модерации:', err);
        listEl.innerHTML = '<div class="alert alert-danger">Ошибка загрузки: ' + err.message + '</div>';
    }
}

async function loadRejectedProducts() {
    const listEl = document.getElementById('rejected-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-center"><div class="spinner-border" role="status"></div><p class="mt-2">Загрузка...</p></div>';
    
    try {
        const response = await fetch('http://localhost:8080/api/products/rejected', { method: 'GET', headers: getAuthHeaders() });
        if (!response.ok) { const errorText = await response.text(); throw new Error(errorText); }
        const products = await response.json();
        
        if (!products || products.length === 0) {
            listEl.innerHTML = '<div class="alert alert-info"><i class="fas fa-info-circle"></i> Нет отклонённых проектов.</div>';
            return;
        }
        
        listEl.innerHTML = '';
        products.forEach(function(p) {
            const typeClass = p.type === 'distro' ? 'badge-distro' : p.type === 'de' ? 'badge-de' : 'badge-wm';
            const typeName = p.type === 'distro' ? 'Дистрибутив' : p.type === 'de' ? 'DE' : 'WM';
            const card = document.createElement('div');
            card.className = 'card mb-3 border-danger';
            card.innerHTML = '<div class="card-body"><div class="d-flex justify-content-between align-items-start mb-3"><div><span class="product-type-badge ' + typeClass + '">' + typeName + '</span>' +
                '<h4 class="mt-2 mb-0">' + p.name + '</h4><small class="text-muted"><i class="fas fa-user"></i> Автор: ' + (p.author_login || 'Неизвестно') + ' | <i class="fas fa-clock"></i> Отклонён: ' + (p.moderated_at ? new Date(p.moderated_at).toLocaleString('ru-RU') : 'Неизвестно') + '</small></div>' +
                '<span class="badge bg-danger">Отклонён</span></div>' +
                '<h6>Описание:</h6><p>' + p.description + '</p>' +
                (p.rejection_reason ? '<div class="alert alert-danger"><strong>Причина отклонения:</strong> ' + p.rejection_reason + '</div>' : '') +
                '<button class="btn btn-warning" onclick="approveProduct(' + p.id + ')"><i class="fas fa-undo"></i> Одобрить (пересмотр)</button></div>';
            listEl.appendChild(card);
        });
    } catch (err) {
        console.error('Ошибка загрузки отклонённых проектов:', err);
        listEl.innerHTML = '<div class="alert alert-danger">Ошибка загрузки: ' + err.message + '</div>';
    }
}

async function approveProduct(productID) {
    if (!confirm('Вы уверены, что хотите одобрить этот проект?')) return;
    try {
        const response = await fetch('http://localhost:8080/api/products/' + productID + '/approve', { method: 'POST', headers: getAuthHeaders() });
        if (!response.ok) { const error = await response.text(); throw new Error(error); }
        alert('✅ Проект одобрен!');
        loadPendingProducts();
        loadRejectedProducts();
    } catch (err) { alert(' Ошибка: ' + err.message); }
}

function showRejectForm(productID) {
    const form = document.getElementById('reject-form-' + productID);
    if (form) form.style.display = 'block';
}

function hideRejectForm(productID) {
    const form = document.getElementById('reject-form-' + productID);
    if (form) {
        form.style.display = 'none';
        const ta = document.getElementById('reject-reason-' + productID);
        if (ta) ta.value = '';
    }
}

async function rejectProduct(productID) {
    const reason = document.getElementById('reject-reason-' + productID).value.trim();
    if (!reason) { alert('Укажите причину отклонения'); return; }
    try {
        const response = await fetch('http://localhost:8080/api/products/' + productID + '/reject', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ reason: reason })
        });
        if (!response.ok) { const error = await response.text(); throw new Error(error); }
        alert('✅ Проект отклонён!');
        hideRejectForm(productID);
        loadPendingProducts();
    } catch (err) { alert('❌ Ошибка: ' + err.message); }
}

// ==========================================
// УПРАВЛЕНИЕ ПРОЕКТАМИ (МОДЕРАТОРЫ)
// ==========================================
function openEditProductModal(productID) {
    fetch('http://localhost:8080/api/products/' + productID)
        .then(function(r) { return r.json(); })
        .then(function(product) {
            document.getElementById('edit-product-id').value = product.id;
            document.getElementById('edit-name').value = product.name;
            document.getElementById('edit-type').value = product.type;
            document.getElementById('edit-description').value = product.description;
            document.getElementById('edit-links').value = product.links || '';
            document.getElementById('edit-icon-url').value = product.icon_url || '';
            
            const editTypeOfficial = document.getElementById('edit-type-official');
            const editTypeCustom = document.getElementById('edit-type-custom');
            if (product.author_id) { editTypeCustom.checked = true; } 
            else { editTypeOfficial.checked = true; }
            
            initEditLogoSelector(product.icon_url);
            const modal = new bootstrap.Modal(document.getElementById('editProductModal'));
            modal.show();
        })
        .catch(function(err) { alert('Ошибка загрузки данных: ' + err.message); });
}

function initEditLogoSelector(currentIconUrl) {
    const container = document.getElementById('edit-logo-selector-container');
    if (!container) return;
    container.innerHTML = '';
    container.dataset.initialized = 'false';
    
    const logoUser = JSON.parse(localStorage.getItem('user'));
    const isModerator = logoUser && (logoUser.role === 'moderator' || logoUser.role === 'admin');
    
    container.innerHTML = '<div class="logo-selector">' +
        '<ul class="nav nav-tabs mb-3" role="tablist">' +
        '<li class="nav-item"><button class="nav-link active" data-tab="upload" type="button"><i class="fas fa-upload"></i> Загрузить</button></li>' +
        '<li class="nav-item"><button class="nav-link" data-tab="link" type="button"><i class="fas fa-link"></i> Ссылка</button></li>' +
        (isModerator ? '<li class="nav-item"><button class="nav-link" data-tab="library" type="button"><i class="fas fa-book"></i> Библиотека</button></li>' : '') +
        '</ul>' +
        '<div class="tab-content" id="edit-tab-upload"><div class="mb-3"><input type="file" class="form-control" id="edit-logo-file-input" accept=".png,.jpg,.jpeg,.svg"><div class="form-text">PNG, JPG или SVG. Максимум 2MB.</div></div>' +
        '<div id="edit-logo-upload-preview" class="logo-preview" style="display:none;"><img id="edit-logo-upload-img" src="" alt="Предпросмотр"><p class="text-success mt-2"><i class="fas fa-check"></i> Файл выбран</p></div></div>' +
        '<div class="tab-content" id="edit-tab-link" style="display:none;"><div class="mb-3"><input type="url" class="form-control" id="edit-logo-url-input" placeholder="https://example.com/logo.png" value="' + (currentIconUrl || '') + '"><div class="form-text">Прямая ссылка на изображение</div></div>' +
        '<div id="edit-logo-link-preview" class="logo-preview" style="display:none;"><img id="edit-logo-link-img" src="" alt="Предпросмотр"><p class="text-success mt-2"><i class="fas fa-check"></i> Ссылка проверена</p></div></div>' +
        (isModerator ? '<div class="tab-content" id="edit-tab-library" style="display:none;"><div class="mb-3"><input type="text" class="form-control" id="edit-logo-search-input" placeholder="🔍 Поиск логотипа..."></div><div id="edit-logo-library-content"><p class="text-muted">Введите запрос для поиска...</p></div></div>' : '') +
        '<div id="edit-logo-final-preview" class="logo-final-preview" style="display:none;"><h6 class="fw-bold mt-3">Выбранный логотип:</h6><div class="d-flex align-items-center gap-3 flex-wrap">' +
        '<img id="edit-logo-final-img" src="" alt="Логотип" style="max-height: 80px; max-width: 80px;"><div><code id="edit-logo-final-url" class="d-block text-break" style="max-width: 300px;"></code>' +
        '<div class="d-flex gap-2 mt-2">' +
        '<button class="btn btn-sm btn-outline-primary" onclick="clearEditLogoSelection()"><i class="fas fa-sync"></i> Очистить выбор</button>' +
        '<button class="btn btn-sm btn-outline-danger" onclick="deleteEditLogo()"><i class="fas fa-trash"></i> Удалить аватарку</button>' +
        '</div></div></div></div></div>';
    
    container.querySelectorAll('.nav-link[data-tab]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            container.querySelectorAll('.nav-link[data-tab]').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            container.querySelectorAll('.tab-content').forEach(function(c) { c.style.display = 'none'; });
            const tab = container.querySelector('#edit-tab-' + btn.dataset.tab);
            if (tab) tab.style.display = 'block';
        });
    });
    
    const fileInput = container.querySelector('#edit-logo-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { alert('❌ Файл слишком большой! Максимум 2MB.'); e.target.value = ''; return; }
            const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
            if (!allowedTypes.includes(file.type)) { alert('❌ Недопустимый формат! Разрешены: PNG, JPG, SVG.'); e.target.value = ''; return; }
            const reader = new FileReader();
            reader.onload = function(ev) {
                const preview = container.querySelector('#edit-logo-upload-preview');
                const img = container.querySelector('#edit-logo-upload-img');
                img.src = ev.target.result;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
            const formData = new FormData();
            formData.append('image', file);
            fetch('http://localhost:8080/api/upload', { method: 'POST', headers: getAuthHeaders(), body: formData })
                .then(function(r) { if (!r.ok) return r.text().then(function(t) { throw new Error(t); }); return r.json(); })
                .then(function(result) { selectEditLogo(result.url); })
                .catch(function(err) { alert('❌ Ошибка загрузки: ' + err.message); });
        });
    }
    
    const urlInput = container.querySelector('#edit-logo-url-input');
    if (urlInput) {
        let urlTimeout;
        urlInput.addEventListener('input', function(e) {
            clearTimeout(urlTimeout);
            urlTimeout = setTimeout(function() {
                const url = e.target.value.trim();
                if (!url) { container.querySelector('#edit-logo-link-preview').style.display = 'none'; return; }
                const img = new Image();
                img.onload = function() {
                    const preview = container.querySelector('#edit-logo-link-preview');
                    const previewImg = container.querySelector('#edit-logo-link-img');
                    previewImg.src = url;
                    preview.style.display = 'block';
                    selectEditLogo(url);
                };
                img.onerror = function() {};
                img.src = url;
            }, 500);
        });
        if (currentIconUrl) {
            const img = new Image();
            img.onload = function() {
                const preview = container.querySelector('#edit-logo-link-preview');
                const previewImg = container.querySelector('#edit-logo-link-img');
                previewImg.src = currentIconUrl;
                preview.style.display = 'block';
                selectEditLogo(currentIconUrl);
            };
            img.src = currentIconUrl;
        }
    }
    
    const searchInput = container.querySelector('#edit-logo-search-input');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', function(e) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function() { searchEditLibrary(e.target.value); }, 500);
        });
    }
}

function selectEditLogo(url) {
    const container = document.getElementById('edit-logo-selector-container');
    if (!container) return;
    const preview = container.querySelector('#edit-logo-final-preview');
    const img = container.querySelector('#edit-logo-final-img');
    const urlText = container.querySelector('#edit-logo-final-url');
    if (img) img.src = url;
    if (urlText) urlText.textContent = url;
    if (preview) preview.style.display = 'block';
    const iconInput = document.getElementById('edit-icon-url');
    if (iconInput) iconInput.value = url;
}

function clearEditLogoSelection() {
    const container = document.getElementById('edit-logo-selector-container');
    if (!container) return;
    const fp = container.querySelector('#edit-logo-final-preview'); if (fp) fp.style.display = 'none';
    const up = container.querySelector('#edit-logo-upload-preview'); if (up) up.style.display = 'none';
    const lp = container.querySelector('#edit-logo-link-preview'); if (lp) lp.style.display = 'none';
    const fi = container.querySelector('#edit-logo-file-input'); if (fi) fi.value = '';
    const ui = container.querySelector('#edit-logo-url-input'); if (ui) ui.value = '';
    const iconInput = document.getElementById('edit-icon-url');
    if (iconInput) iconInput.value = '';
    const notice = document.createElement('div');
    notice.className = 'alert alert-warning mt-2';
    notice.innerHTML = '<i class="fas fa-info-circle"></i> Аватарка будет удалена при сохранении';
    notice.id = 'edit-clear-notice';
    const oldNotice = document.getElementById('edit-clear-notice');
    if (oldNotice) oldNotice.remove();
    container.appendChild(notice);
}

function deleteEditLogo() {
    if (!confirm('⚠️ Вы уверены, что хотите УДАЛИТЬ аватарку проекта? Это действие необратимо.')) return;
    const container = document.getElementById('edit-logo-selector-container');
    if (!container) return;
    const fp = container.querySelector('#edit-logo-final-preview'); if (fp) fp.style.display = 'none';
    const up = container.querySelector('#edit-logo-upload-preview'); if (up) up.style.display = 'none';
    const lp = container.querySelector('#edit-logo-link-preview'); if (lp) lp.style.display = 'none';
    const fi = container.querySelector('#edit-logo-file-input'); if (fi) fi.value = '';
    const ui = container.querySelector('#edit-logo-url-input'); if (ui) ui.value = '';
    const iconInput = document.getElementById('edit-icon-url');
    if (iconInput) iconInput.value = '';
    const notice = document.createElement('div');
    notice.className = 'alert alert-danger mt-2';
    notice.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <strong>Аватарка будет УДАЛЕНА при сохранении</strong>';
    notice.id = 'edit-delete-notice';
    const oldNotice = document.getElementById('edit-delete-notice'); if (oldNotice) oldNotice.remove();
    const oldClearNotice = document.getElementById('edit-clear-notice'); if (oldClearNotice) oldClearNotice.remove();
    container.appendChild(notice);
}

async function searchEditLibrary(query) {
    const container = document.getElementById('edit-logo-selector-container');
    const content = container.querySelector('#edit-logo-library-content');
    if (!query.trim()) { content.innerHTML = '<p class="text-muted">Введите запрос для поиска...</p>'; return; }
    content.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm"></div></div>';
    try {
        const response = await fetch('http://localhost:8080/api/logos?search=' + encodeURIComponent(query), { headers: getAuthHeaders() });
        if (!response.ok) throw new Error('Ошибка загрузки библиотеки');
        const library = await response.json();
        renderEditLibrary(library);
    } catch (err) { content.innerHTML = '<div class="alert alert-danger">Ошибка: ' + err.message + '</div>'; }
}

function renderEditLibrary(library) {
    const container = document.getElementById('edit-logo-selector-container');
    const content = container.querySelector('#edit-logo-library-content');
    let html = '';
    const renderSection = function(title, items, icon) {
        if (!items || items.length === 0) return '';
        let s = '<h6 class="mt-3"><i class="' + icon + '"></i> ' + title + ' (' + items.length + ')</h6>';
        s += '<div class="logo-grid d-flex flex-wrap gap-2">';
        items.forEach(function(item) {
            s += '<div class="logo-item card p-2" style="cursor: pointer; width: 100px;" onclick="selectEditLogo(\'' + item.url + '\')">' +
                '<img src="' + item.url + '" alt="' + item.name + '" style="max-height: 40px; max-width: 80px; object-fit: contain;" ' +
                'onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><circle cx=%2232%22 cy=%2232%22 r=%2230%22 fill=%22%23667eea%22/><text x=%2232%22 y=%2244%22 font-family=%22Arial%22 font-size=%2220%22 fill=%22white%22 text-anchor=%22middle%22>L</text></svg>\';">' +
                '<small class="text-center mt-1 d-block text-truncate" title="' + item.name + '">' + item.name + '</small></div>';
        });
        s += '</div>';
        return s;
    };
    html += renderSection('Дистрибутивы', library.distros, 'fas fa-linux');
    html += renderSection('Окружения рабочего стола', library.desktop_environments, 'fas fa-desktop');
    html += renderSection('Оконные менеджеры', library.window_managers, 'fas fa-window-maximize');
    if (!html) html = '<p class="text-muted">Ничего не найдено.</p>';
    content.innerHTML = html;
}

async function saveProductEdit() {
    const id = document.getElementById('edit-product-id').value;
    const editTypeRadio = document.querySelector('input[name="edit-project-type"]:checked');
    const isOfficial = editTypeRadio && editTypeRadio.value === 'official';
    const iconUrlValue = document.getElementById('edit-icon-url').value;
    const deleteNotice = document.getElementById('edit-delete-notice');
    const isDeleteMode = deleteNotice !== null;
    let iconUrl;
    if (isDeleteMode) { iconUrl = null; } 
    else if (iconUrlValue.trim() !== '') { iconUrl = iconUrlValue.trim(); } 
    else { iconUrl = undefined; }
    
    const data = {
        name: document.getElementById('edit-name').value,
        type: document.getElementById('edit-type').value,
        description: document.getElementById('edit-description').value,
        links: document.getElementById('edit-links').value,
        icon_url: iconUrl,
        is_official: isOfficial
    };
    if (iconUrl === undefined) delete data.icon_url;
    
    try {
        const response = await fetch('http://localhost:8080/api/products/' + id, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        if (!response.ok) { const errorText = await response.text(); throw new Error(errorText); }
        const notice = document.getElementById('edit-clear-notice'); if (notice) notice.remove();
        const deleteNotice2 = document.getElementById('edit-delete-notice'); if (deleteNotice2) deleteNotice2.remove();
        alert('✅ Проект успешно обновлён!');
        bootstrap.Modal.getInstance(document.getElementById('editProductModal')).hide();
        showProduct(parseInt(id));
        loadCatalog();
    } catch (err) { console.error('Ошибка сохранения:', err); alert('❌ Ошибка: ' + err.message); }
}

async function deleteProduct(productID) {
    if (!confirm('⚠️ ВНИМАНИЕ! Вы уверены, что хотите БЕЗВОЗВРАТНО удалить этот проект и все связанные с ним отзывы/комментарии?')) return;
    try {
        const response = await fetch('http://localhost:8080/api/products/' + productID, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error(await response.text());
        alert('✅ Проект удалён!');
        showPage('home');
        loadCatalog();
    } catch (err) { alert('❌ Ошибка: ' + err.message); }
}

// ==========================================
// ЛОГОТИП-СЕЛЕКТОР (для добавления)
// ==========================================
function initLogoSelector() {
    const container = document.getElementById('logo-selector-container');
    if (!container) return;
    if (container.dataset.initialized === 'true') return;
    container.dataset.initialized = 'true';
    
    const logoUser = JSON.parse(localStorage.getItem('user'));
    const isModerator = logoUser && (logoUser.role === 'moderator' || logoUser.role === 'admin');

    container.innerHTML = '<div class="logo-selector">' +
        '<label class="form-label fw-bold"><i class="fas fa-image"></i> Логотип проекта</label>' +
        '<ul class="nav nav-tabs mb-3" role="tablist">' +
        '<li class="nav-item"><button class="nav-link active" data-tab="upload" type="button"><i class="fas fa-upload"></i> Загрузить</button></li>' +
        '<li class="nav-item"><button class="nav-link" data-tab="link" type="button"><i class="fas fa-link"></i> Ссылка</button></li>' +
        (isModerator ? '<li class="nav-item"><button class="nav-link" data-tab="library" type="button"><i class="fas fa-book"></i> Библиотека</button></li>' : '') +
        '</ul>' +
        '<div class="tab-content" id="tab-upload"><div class="mb-3"><input type="file" class="form-control" id="logo-file-input" accept=".png,.jpg,.jpeg,.svg"><div class="form-text">PNG, JPG или SVG. Максимум 2MB.</div></div>' +
        '<div id="logo-upload-preview" class="logo-preview" style="display:none;"><img id="logo-upload-img" src="" alt="Предпросмотр"><p class="text-success mt-2"><i class="fas fa-check"></i> Файл выбран</p></div></div>' +
        '<div class="tab-content" id="tab-link" style="display:none;"><div class="mb-3"><input type="url" class="form-control" id="logo-url-input" placeholder="https://example.com/logo.png"><div class="form-text">Прямая ссылка на изображение</div></div>' +
        '<div id="logo-link-preview" class="logo-preview" style="display:none;"><img id="logo-link-img" src="" alt="Предпросмотр"><p class="text-success mt-2"><i class="fas fa-check"></i> Ссылка проверена</p></div></div>' +
        (isModerator ? '<div class="tab-content" id="tab-library" style="display:none;"><div class="mb-3"><input type="text" class="form-control" id="logo-search-input" placeholder="🔍 Поиск логотипа..."></div><div id="logo-library-content"><p class="text-muted">Введите запрос для поиска...</p></div></div>' : '') +
        '<div id="logo-final-preview" class="logo-final-preview" style="display:none;"><h6 class="fw-bold mt-3">Выбранный логотип:</h6><div class="d-flex align-items-center gap-3">' +
        '<img id="logo-final-img" src="" alt="Логотип" style="max-height: 80px; max-width: 80px;"><div><code id="logo-final-url" class="d-block text-break" style="max-width: 400px;"></code>' +
        '<button class="btn btn-sm btn-outline-danger mt-2" onclick="clearLogoSelection()"><i class="fas fa-times"></i> Очистить выбор</button></div></div></div></div>';
    
    container.querySelectorAll('.nav-link[data-tab]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            container.querySelectorAll('.nav-link[data-tab]').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            container.querySelectorAll('.tab-content').forEach(function(c) { c.style.display = 'none'; });
            const tab = container.querySelector('#tab-' + btn.dataset.tab);
            if (tab) tab.style.display = 'block';
        });
    });
    
    const fileInput = container.querySelector('#logo-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { alert('❌ Файл слишком большой! Максимум 2MB.'); e.target.value = ''; return; }
            const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
            if (!allowedTypes.includes(file.type)) { alert(' Недопустимый формат! Разрешены: PNG, JPG, SVG.'); e.target.value = ''; return; }
            const reader = new FileReader();
            reader.onload = function(ev) {
                const preview = container.querySelector('#logo-upload-preview');
                const img = container.querySelector('#logo-upload-img');
                img.src = ev.target.result;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
            const formData = new FormData();
            formData.append('image', file);
            fetch('http://localhost:8080/api/upload', { method: 'POST', headers: getAuthHeaders(), body: formData })
                .then(function(r) { if (!r.ok) return r.text().then(function(t) { throw new Error(t); }); return r.json(); })
                .then(function(result) { selectLogo(result.url); })
                .catch(function(err) { alert('❌ Ошибка загрузки: ' + err.message); });
        });
    }
    
    const urlInput = container.querySelector('#logo-url-input');
    if (urlInput) {
        let urlTimeout;
        urlInput.addEventListener('input', function(e) {
            clearTimeout(urlTimeout);
            urlTimeout = setTimeout(function() {
                const url = e.target.value.trim();
                if (!url) { container.querySelector('#logo-link-preview').style.display = 'none'; return; }
                const img = new Image();
                img.onload = function() {
                    const preview = container.querySelector('#logo-link-preview');
                    const previewImg = container.querySelector('#logo-link-img');
                    previewImg.src = url;
                    preview.style.display = 'block';
                    selectLogo(url);
                };
                img.onerror = function() {};
                img.src = url;
            }, 500);
        });
    }
    
    const searchInput = container.querySelector('#logo-search-input');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', function(e) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function() { searchLibrary(e.target.value); }, 500);
        });
    }
    
    const typeSelector = document.getElementById('project-type-selector');
    if (typeSelector && logoUser) {
        typeSelector.style.display = 'block';
    }
}

function selectLogo(url) {
    const container = document.getElementById('logo-selector-container');
    if (!container) return;
    const preview = container.querySelector('#logo-final-preview');
    const img = container.querySelector('#logo-final-img');
    const urlText = container.querySelector('#logo-final-url');
    if (img) img.src = url;
    if (urlText) urlText.textContent = url;
    if (preview) preview.style.display = 'block';
    const iconInput = document.getElementById('icon-url-input');
    if (iconInput) iconInput.value = url;
}

function clearLogoSelection() {
    const container = document.getElementById('logo-selector-container');
    if (!container) return;
    const fp = container.querySelector('#logo-final-preview'); if (fp) fp.style.display = 'none';
    const up = container.querySelector('#logo-upload-preview'); if (up) up.style.display = 'none';
    const lp = container.querySelector('#logo-link-preview'); if (lp) lp.style.display = 'none';
    const fi = container.querySelector('#logo-file-input'); if (fi) fi.value = '';
    const ui = container.querySelector('#logo-url-input'); if (ui) ui.value = '';
    const iconInput = document.getElementById('icon-url-input');
    if (iconInput) iconInput.value = '';
}

async function searchLibrary(query) {
    const container = document.getElementById('logo-selector-container');
    const content = container.querySelector('#logo-library-content');
    if (!query.trim()) { content.innerHTML = '<p class="text-muted">Введите запрос для поиска...</p>'; return; }
    content.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm"></div></div>';
    try {
        const response = await fetch('http://localhost:8080/api/logos?search=' + encodeURIComponent(query), { headers: getAuthHeaders() });
        if (!response.ok) throw new Error('Ошибка загрузки библиотеки');
        const library = await response.json();
        renderLibrary(library);
    } catch (err) { content.innerHTML = '<div class="alert alert-danger">Ошибка: ' + err.message + '</div>'; }
}

function renderLibrary(library) {
    const container = document.getElementById('logo-selector-container');
    const content = container.querySelector('#logo-library-content');
    let html = '';
    const renderSection = function(title, items, icon) {
        if (!items || items.length === 0) return '';
        let s = '<h6 class="mt-3"><i class="' + icon + '"></i> ' + title + ' (' + items.length + ')</h6>';
        s += '<div class="logo-grid d-flex flex-wrap gap-2">';
        items.forEach(function(item) {
            s += '<div class="logo-item card p-2" style="cursor: pointer; width: 100px;" onclick="selectLogo(\'' + item.url + '\')">' +
                '<img src="' + item.url + '" alt="' + item.name + '" style="max-height: 40px; max-width: 80px; object-fit: contain;" ' +
                'onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><circle cx=%2232%22 cy=%2232%22 r=%2230%22 fill=%22%23667eea%22/><text x=%2232%22 y=%2244%22 font-family=%22Arial%22 font-size=%2220%22 fill=%22white%22 text-anchor=%22middle%22>L</text></svg>\';">' +
                '<small class="text-center mt-1 d-block text-truncate" title="' + item.name + '">' + item.name + '</small></div>';
        });
        s += '</div>';
        return s;
    };
    html += renderSection('Дистрибутивы', library.distros, 'fas fa-linux');
    html += renderSection('Окружения рабочего стола', library.desktop_environments, 'fas fa-desktop');
    html += renderSection('Оконные менеджеры', library.window_managers, 'fas fa-window-maximize');
    if (!html) html = '<p class="text-muted">Ничего не найдено.</p>';
    content.innerHTML = html;
}

// ==========================================
// 🐧 TUX COMPANION & TUTORIAL SYSTEM
// ==========================================
let _tuxTimer = null;

function typeText(text, elementId, speed = 40, callback) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = '';
    if (_tuxTimer) clearTimeout(_tuxTimer);
    const chars = Array.from(text);
    let i = 0;
    function next() {
        if (i < chars.length) {
            el.textContent += chars[i];
            i++;
            _tuxTimer = setTimeout(next, speed);
        } else if (callback) {
            setTimeout(callback, 200);
        }
    }
    next();
}

function showTuxCompanionOnly() {
    const companion = document.getElementById('tux-companion');
    if (!companion) {
        console.error('❌ Элемент #tux-companion не найден в HTML!');
        return;
    }
    companion.style.display = 'flex';
    console.log('✅ Пингвин показан!');
    
    const user = JSON.parse(localStorage.getItem('user'));
    const greeting = user && user.login
        ? `привет, ${user.login}! я твой проводник в мире Linux. чем могу помочь?`
        : "привет! я твой проводник в мире Linux. чем могу помочь?";
    
    typeText(greeting, 'tux-speech-text', 30);
}

// ==========================================
// ШАГИ ОБУЧЕНИЯ
// ==========================================
const tuxTutorialSteps = [
    {
        target: '#search-input',
        text: "глянь-ка! конфигуратор, давай мы подберём тебе нужную конфигурацию!",
        interactive: false
    },
    {
        target: '.product-card:first-child',
        text: "хмм... да, оно должно тебе подойти!, смело нажимай ПОДРОБНЕЕ",
        interactive: true,
        clickTarget: '.product-card:first-child .btn-primary, .product-card:first-child button'
    },
    {
        target: '#product-detail',
        text: "так... судя по описанию, звучит заманчиво, дальше уже можешь посмотреть на сам проект на GitHub — жми ПЕРЕЙТИ!",
        interactive: true,
        clickTarget: '.btn-success'
    },
    {
        target: '#reviews-list',
        text: "чтобы оставлять отзывы, комментарии и добавлять свои проекты — создай аккаунт! это бесплатно и займёт пару минут. нажми 'ВОЙТИ' в правом верхнем углу.",
        interactive: true,
        clickTarget: '.nav-link[href*="login"], a.nav-link'
    },
    {
        target: null,
        text: "ну, мне пора, увидимся на сайте!",
        interactive: false,
        isFinal: true
    }
];

let currentTuxStep = 0;

function startTuxTutorial() {
    currentTuxStep = 0;
    document.body.classList.add('tutorial-active');
    showTuxCompanionOnly();
    setTimeout(() => showTuxTutorialStep(), 500);
}

function showTuxTutorialStep() {
    document.querySelectorAll('.tutorial-highlight').forEach(el => {
        el.classList.remove('tutorial-highlight');
    });
    hideTutorialPointer();
    removeInteractiveClickHandlers();

    if (currentTuxStep >= tuxTutorialSteps.length) {
        finishTuxTutorial();
        return;
    }

    const step = tuxTutorialSteps[currentTuxStep];
    const targetElement = step.target ? document.querySelector(step.target) : null;

    // Элемент должен существовать И быть видимым (не на скрытой странице)
    const isVisible = !!targetElement && (
        targetElement.offsetWidth > 0 ||
        targetElement.offsetHeight > 0 ||
        targetElement.getClientRects().length > 0
    );

    if (step.target && !isVisible) {
        console.warn('Цель шага скрыта или не найдена, пропускаем:', step.target);
        currentTuxStep++;
        showTuxTutorialStep();
        return;
    }

    const executeStep = () => {
        if (targetElement) {
            targetElement.classList.add('tutorial-highlight');
            setTimeout(() => {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => showTutorialPointer(targetElement), 600);
            }, 100);
        }

        typeText(step.text, 'tux-speech-text', 30, () => {
            if (step.interactive) {
                showInteractiveControls();
                setupInteractiveClick(step.clickTarget);
            } else {
                showTuxControls();
            }
        });
    };

    if (step.delay) {
        setTimeout(executeStep, step.delay);
    } else {
        executeStep();
    }
}

function showTutorialPointer(targetElement) {
    const pointer = document.getElementById('tutorial-pointer');
    if (!pointer || !targetElement) return;

    function updatePointerPosition() {
        const rect = targetElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const tuxRect = document.getElementById('tux-companion').getBoundingClientRect();
        const tuxCenterX = tuxRect.left + tuxRect.width / 2;
        const tuxCenterY = tuxRect.top + tuxRect.height / 2;

        const ring = pointer.querySelector('.pointer-ring');
        ring.style.left = centerX + 'px';
        ring.style.top = centerY + 'px';
        ring.style.display = 'block';

        const arrow = pointer.querySelector('.pointer-arrow');
        const dx = centerX - tuxCenterX;
        const dy = centerY - tuxCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        arrow.style.left = tuxCenterX + 'px';
        arrow.style.top = tuxCenterY + 'px';
        arrow.style.width = Math.max(50, distance - 80) + 'px';
        arrow.style.transform = `rotate(${angle}deg)`;
        arrow.style.display = 'block';

        pointer.style.display = 'block';
    }

    updatePointerPosition();

    let scrollTimeout;
    pointer._scrollHandler = () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(updatePointerPosition, 50);
    };
    window.addEventListener('scroll', pointer._scrollHandler, { passive: true });
}

function hideTutorialPointer() {
    const pointer = document.getElementById('tutorial-pointer');
    if (pointer) {
        pointer.style.display = 'none';
        const ring = pointer.querySelector('.pointer-ring');
        const arrow = pointer.querySelector('.pointer-arrow');
        if (ring) ring.style.display = 'none';
        if (arrow) arrow.style.display = 'none';
    }
    if (pointer && pointer._scrollHandler) {
        window.removeEventListener('scroll', pointer._scrollHandler);
        pointer._scrollHandler = null;
    }
}

function showTuxControls() {
    const controlsDiv = document.getElementById('tux-speech-controls');
    if (!controlsDiv) return;
    const isLastStep = currentTuxStep === tuxTutorialSteps.length - 1;
    controlsDiv.innerHTML = `
        ${currentTuxStep > 0 ? '<button class="tux-btn" onclick="prevTuxStep()">← Назад</button>' : ''}
        ${isLastStep 
            ? '<button class="tux-btn primary" onclick="finishTuxTutorial()">Завершить ✓</button>'
            : '<button class="tux-btn primary" onclick="nextTuxStep()">Далее →</button>'}
        <button class="tux-btn skip" onclick="skipTuxTutorial()">Пропустить</button>
    `;
}

function nextTuxStep() { currentTuxStep++; showTuxTutorialStep(); }
function prevTuxStep() { if (currentTuxStep > 0) { currentTuxStep--; showTuxTutorialStep(); } }
function skipTuxTutorial() { removeInteractiveClickHandlers(); finishTuxTutorial(); }

function finishTuxTutorial() {
    document.body.classList.remove('tutorial-active');
    document.querySelectorAll('.tutorial-highlight').forEach(el => {
        el.classList.remove('tutorial-highlight');
    });
    hideTutorialPointer();
    removeInteractiveClickHandlers();
    localStorage.setItem('lingradable_tutorial_seen', 'true');

    const controlsDiv = document.getElementById('tux-speech-controls');
    if (controlsDiv) controlsDiv.innerHTML = '';

    typeText("ну, мне пора, увидимся на сайте!", 'tux-speech-text', 30, () => {
        setTimeout(() => {
            const bubble = document.getElementById('tux-speech-bubble');
            if (bubble) {
                bubble.style.opacity = '0';
                bubble.style.transform = 'translateY(-20px)';
                setTimeout(() => { bubble.style.display = 'none'; }, 500);
            }
        }, 3000);
    });
}

let _interactiveClickHandler = null;

function removeInteractiveClickHandlers() {
    if (_interactiveClickHandler) {
        document.removeEventListener('click', _interactiveClickHandler, true);
        _interactiveClickHandler = null;
    }
}

function setupInteractiveClick(clickTargetSelector) {
    removeInteractiveClickHandlers();

    _interactiveClickHandler = function(e) {
        const clickedElement = e.target.closest(clickTargetSelector) || e.target;
        const targetElement = document.querySelector(clickTargetSelector);

        if (targetElement && (targetElement.contains(clickedElement) || clickedElement === targetElement)) {
            // НЕ блокируем нативный клик: кнопка должна реально открыть продукт/ссылку
            removeInteractiveClickHandlers();

            const nextStep = tuxTutorialSteps[currentTuxStep + 1];
            if (nextStep && nextStep.isFinal) {
                setTimeout(() => { currentTuxStep++; showTuxTutorialStep(); }, 500);
            } else {
                setTimeout(() => { currentTuxStep++; showTuxTutorialStep(); }, 1000);
            }
        }
    };

    document.addEventListener('click', _interactiveClickHandler, true);
}

function showInteractiveControls() {
    const controlsDiv = document.getElementById('tux-speech-controls');
    if (!controlsDiv) return;
    controlsDiv.innerHTML = `<div style="color: var(--aero-cyan); font-size: 0.9rem; opacity: 0.8;">👆 Нажми на подсвеченный элемент, чтобы продолжить</div><button class="tux-btn skip" onclick="skipTuxTutorial()">Пропустить</button>`;
}

// ==========================================
// ЭФФЕКТЫ (DIVINE LIGHT, LIKE-SMILE, HELP-QUESTIONS)
// ==========================================
function spawnDivineLight() {
    if (Math.random() > 0.7) {
        const light = document.createElement('div');
        light.className = 'divine-light-popup';
        light.style.top = (Math.random() * 80 + 10) + '%';
        light.style.left = (Math.random() * 80 + 10) + '%';
        document.body.appendChild(light);
        setTimeout(() => { light.remove(); }, 3000);
    }
}
setInterval(spawnDivineLight, 10000);

function showLikeSmile() {
    const smile = document.createElement('div');
    smile.className = 'like-smile-popup';
    document.body.appendChild(smile);
    setTimeout(() => { smile.remove(); }, 2500);
}

document.addEventListener('click', function(e) {
    if (e.target.closest('.star-rating') || e.target.closest('[data-rating]')) {
        const starElement = e.target.closest('.star-rating') || e.target.closest('[data-rating]');
        const rating = parseInt(starElement.dataset.rating) || 5;
        if (rating === 5) showLikeSmile();
    }
});


// ==========================================
// ЗАСТАВКА (ИНТРО)
// ==========================================
function showCleanIntro(user) {
    const overlay = document.getElementById('intro-overlay');
    if (!overlay) return;
    const actions = document.getElementById('intro-actions');
    if (!actions) return;
    if (user && user.login) {
        actions.innerHTML = `<button class="btn-ethereal primary" onclick="enterSite('home')">В КАТАЛОГ</button><button class="btn-ethereal" onclick="enterSite('add')">ДОБАВИТЬ ПРОЕКТ</button>`;
    } else {
        actions.innerHTML = `<button class="btn-ethereal primary" onclick="startTutorialFlow()">НАЧАТЬ ОБУЧЕНИЕ</button><button class="btn-ethereal" onclick="enterSite('home')">ПРОПУСТИТЬ</button><button class="btn-ethereal skip" onclick="enterSite('login')">ВОЙТИ</button>`;
    }
    overlay.classList.remove('hidden');
}

function enterSite(page) {
    localStorage.setItem('lingradable_intro_seen', 'true');
    localStorage.setItem('lingradable_tutorial_seen', 'true');
    closeOverlay();
    setTimeout(() => showPage(page), 500);
}

function startTutorialFlow() {
    localStorage.setItem('lingradable_intro_seen', 'true');
    closeOverlay();
    setTimeout(() => {
        showPage('home');
        setTimeout(() => {
            showTuxCompanionOnly();
            setTimeout(() => startTuxTutorial(), 3000);
        }, 500);
    }, 500);
}

function closeOverlay() {
    const overlay = document.getElementById('intro-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.inert = true;
}

// ==========================================
// ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    const path = window.location.pathname;
    const productMatch = path.match(/^\/product\/(\d+)$/);
    
    if (path === '/' || path === '') showPage('home', false);
    else if (productMatch) { showPage('product', false); showProduct(parseInt(productMatch[1])); }
    else if (path === '/product') showPage('home', false);
    else if (path === '/add') showPage('add', false);
    else if (path === '/login') showPage('login', false);
    else if (path === '/register') showPage('register', false);
    else if (path === '/moderation') showPage('moderation', false);
    else showPage('home', false);
    
    updateNavigation();
    loadTags();
    loadCatalog();
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', function(e) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function() { searchQuery = e.target.value.trim(); loadCatalog(); }, 300);
        });
    }
    
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', function(e) { sortBy = e.target.value; loadCatalog(); });
    }
    
    const addForm = document.getElementById('add-project-form');
    if (addForm) {
        addForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(addForm);
            const sha = formData.get('sha256').trim();
            if (!/^[a-fA-F0-9]{64}$/.test(sha)) { alert('Ошибка: Неверный формат SHA256!'); return; }
            const iconUrl = document.getElementById('icon-url-input') ? document.getElementById('icon-url-input').value : '';
            const projectTypeRadio = document.querySelector('input[name="project_type"]:checked');
            const isOfficial = projectTypeRadio && projectTypeRadio.value === 'official';
            const data = {
                name: formData.get('name').trim(),
                type: formData.get('type'),
                description: formData.get('description').trim(),
                links: formData.get('links').trim(),
                sha256_hash: sha,
                icon_url: iconUrl || null,
                is_official: isOfficial
            };
            fetch('http://localhost:8080/api/products', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(data)
            })
            .then(function(r) { if (!r.ok) return r.text().then(function(t) { throw new Error(t); }); return r.json(); })
            .then(function(result) {
                if (result.status === 'approved') {
                    alert('✅ Проект сразу опубликован как ' + (isOfficial ? 'официальный' : 'кастомный') + '!');
                } else {
                    alert('✅ Проект отправлен на модерацию!');
                }
                addForm.reset();
                clearLogoSelection();
                showPage('home');
            })
            .catch(function(err) { alert(' Ошибка: ' + err.message); });
        });
    }
    
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(loginForm);
            fetch('http://localhost:8080/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.get('email').trim(), password: formData.get('password') })
            })
            .then(function(r) { if (!r.ok) throw new Error('Неверный email или пароль'); return r.json(); })
            .then(function(result) {
                localStorage.setItem('user', JSON.stringify({ id: result.id, login: result.login, role: result.role }));
                alert('✅ Вход выполнен успешно!');
                updateNavigation();
                history.replaceState({ page: 'home' }, '', '/');
                showPage('home', false);
            })
            .catch(function(err) { alert('❌ Ошибка: ' + err.message); });
        });
    }
    
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(registerForm);
            if (formData.get('password') !== formData.get('password_confirm')) { alert('❌ Ошибка: Пароли не совпадают!'); return; }
            fetch('http://localhost:8080/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login: formData.get('name').trim(), email: formData.get('email').trim(), password: formData.get('password') })
            })
            .then(function(r) { if (!r.ok) return r.text().then(function(t) { throw new Error(t); }); return r.json(); })
            .then(function() { alert('✅ Регистрация успешна!'); showPage('login'); })
            .catch(function(err) { alert('❌ Ошибка: ' + err.message); });
        });
    }

    // Проверка интро при загрузке
    const hasSeenIntro = localStorage.getItem('lingradable_intro_seen');
    if (!hasSeenIntro) {
        const user = JSON.parse(localStorage.getItem('user'));
        showCleanIntro(user);
    } else {
        setTimeout(() => { showTuxCompanionOnly(); }, 1000);
    }
});