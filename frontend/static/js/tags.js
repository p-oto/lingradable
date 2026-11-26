// ==========================================
// LINGRADABLE — TAGS (tags.js)
// ==========================================

let selectedTagIds = new Set();

function tagsUser() {
    try { return JSON.parse(localStorage.getItem('user')); } catch (e) { return null; }
}
function tagsHeaders() {
    if (typeof getAuthHeaders === 'function') return getAuthHeaders();
    const u = tagsUser();
    const h = { 'Content-Type': 'application/json' };
    if (u && u.id) h['X-User-ID'] = String(u.id);
    return h;
}
function tagsEscape(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}
function tagsToast(msg, type) {
    if (typeof supportToast === 'function') { supportToast(msg, type); return; }
    const t = document.createElement('div');
    t.className = 'support-toast ' + (type || 'info');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}
function tagsIsStaff(u) { return !!u && (u.role === 'moderator' || u.role === 'admin'); }

// ---------- Выбор тегов в форме добавления проекта ----------
async function renderTagPicker() {
    const box = document.getElementById('project-tags-container');
    if (!box) return;
    box.innerHTML =
        '<label class="form-label fw-bold"><i class="fas fa-tags"></i> Теги проекта</label>' +
        '<div class="form-text mb-2">Выбери существующие теги. После одобрения модератором они появятся на странице проекта.</div>' +
        '<div id="tag-picker-chips" class="d-flex flex-wrap gap-2"><span class="text-muted small">Загрузка тегов…</span></div>';

    try {
        const res = await fetch('/api/tags');
        const tags = (await res.json()) || [];
        const chips = document.getElementById('tag-picker-chips');
        chips.innerHTML = '';
        if (!tags.length) {
            chips.innerHTML = '<span class="text-muted small">Тегов пока нет — предложи первый через «Добавить тэг».</span>';
            return;
        }
        tags.forEach(t => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tag-chip';
            b.textContent = t.name;
            b.onclick = () => {
                if (selectedTagIds.has(t.id)) { selectedTagIds.delete(t.id); b.classList.remove('active'); }
                else { selectedTagIds.add(t.id); b.classList.add('active'); }
            };
            chips.appendChild(b);
        });
    } catch (e) {
        const chips = document.getElementById('tag-picker-chips');
        if (chips) chips.innerHTML = '<span class="text-danger small">Не удалось загрузить теги</span>';
    }
}

async function attachSelectedTags(productId) {
    if (!selectedTagIds.size) return;
    const staff = tagsIsStaff(tagsUser());
    for (const id of selectedTagIds) {
        const url = staff
            ? '/api/products/' + productId + '/tags/attach'
            : '/api/products/' + productId + '/tags/suggest';
        try {
            await fetch(url, { method: 'POST', headers: tagsHeaders(), body: JSON.stringify({ tag_id: id }) });
        } catch (e) { /* игнорируем отдельные ошибки */ }
    }
    selectedTagIds.clear();
    document.querySelectorAll('#tag-picker-chips .tag-chip.active').forEach(b => b.classList.remove('active'));
    tagsToast(staff ? 'Теги привязаны к проекту' : 'Теги отправлены на модерацию', 'success');
}

// Перехватываем ответ создания проекта, чтобы привязать выбранные теги
(function patchProductCreate() {
    const origFetch = window.fetch;
    window.fetch = async function (url, opts) {
        const res = await origFetch.apply(this, arguments);
        try {
            if (typeof url === 'string' && /\/api\/products\/?$/.test(url) &&
                opts && String(opts.method || '').toUpperCase() === 'POST') {
                res.clone().json().then(data => {
                    if (data && data.id) attachSelectedTags(data.id);
                }).catch(() => {});
            }
        } catch (e) { /* noop */ }
        return res;
    };
})();

// ---------- Теги на странице продукта ----------
async function loadProductTags(productId) {
    let tries = 0;
    const wait = () => {
        const host = document.querySelector('#product-detail .product-detail');
        if (!host) { if (tries++ < 25) setTimeout(wait, 150); return; }
        injectTagBlock(host, productId);
    };
    wait();
}

async function injectTagBlock(host, productId) {
    if (host.querySelector('.product-tags-block')) return;

    let tags = [];
    try { tags = (await (await fetch('/api/products/' + productId + '/tags')).json()) || []; } catch (e) { tags = []; }

    const block = document.createElement('div');
    block.className = 'product-tags-block';
    block.innerHTML =
        '<h6 class="fw-bold mb-2"><i class="fas fa-tags"></i> Теги проекта</h6>' +
        '<div class="product-tags-list d-flex flex-wrap gap-2 mb-2"></div>' +
        '<div class="product-tag-suggest"></div>';

    const list = block.querySelector('.product-tags-list');
    if (!tags.length) {
        list.innerHTML = '<span class="text-muted small">Тегов пока нет.</span>';
    } else {
        tags.forEach(t => {
            const s = document.createElement('span');
            s.className = 'tag-badge';
            s.textContent = t.name;
            if (t.description) s.title = t.description;
            list.appendChild(s);
        });
    }

    const u = tagsUser();
    if (u) {
        const sug = block.querySelector('.product-tag-suggest');
        sug.innerHTML =
            '<div class="d-flex gap-2 align-items-center flex-wrap">' +
            '<select class="form-select form-select-sm" style="max-width:260px" id="product-tag-select"></select>' +
            '<button class="btn btn-sm btn-outline-primary" id="product-tag-suggest-btn"><i class="fas fa-plus"></i> Предложить тег</button></div>';
        const sel = sug.querySelector('#product-tag-select');
        try {
            const all = (await (await fetch('/api/tags')).json()) || [];
            const existing = new Set(tags.map(t => t.id));
            all.filter(t => !existing.has(t.id)).forEach(t => {
                const o = document.createElement('option');
                o.value = t.id; o.textContent = t.name;
                sel.appendChild(o);
            });
        } catch (e) { /* noop */ }
        sug.querySelector('#product-tag-suggest-btn').onclick = async () => {
            const tid = parseInt(sel.value, 10);
            if (!tid) { tagsToast('Выбери тег из списка', 'warn'); return; }
            const r = await fetch('/api/products/' + productId + '/tags/suggest', {
                method: 'POST', headers: tagsHeaders(), body: JSON.stringify({ tag_id: tid })
            });
            if (r.ok) tagsToast('Тег отправлен на модерацию', 'success');
            else tagsToast((await r.text()) || 'Ошибка', 'error');
        };
    }

    const header = host.querySelector('.product-header');
    if (header && header.nextSibling) host.insertBefore(block, header.nextSibling);
    else host.appendChild(block);
}

// ---------- Модерация предложений тегов ----------
async function loadTagSuggestions() {
    const box = document.getElementById('tag-suggestions-list');
    if (!box) return;
    box.innerHTML = '<div class="text-center"><div class="spinner-border" role="status"></div><p class="mt-2">Загрузка…</p></div>';

    const r = await fetch('/api/tag-suggestions', { headers: tagsHeaders() });
    if (!r.ok) { box.innerHTML = '<div class="alert alert-danger">Нет доступа к предложениям тегов</div>'; return; }
    const list = (await r.json()) || [];
    box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<div class="alert alert-success"><i class="fas fa-check-circle"></i> Предложений тегов нет.</div>'; return; }

    list.forEach(s => {
        const card = document.createElement('div');
        card.className = 'card mb-3';
        card.innerHTML =
            '<div class="card-body"><div class="d-flex justify-content-between align-items-start flex-wrap gap-2">' +
            '<div>' +
            '<span class="tag-badge">' + tagsEscape(s.tag_name) + '</span>' +
            (s.is_new_tag ? '<span class="badge bg-info text-dark ms-2">новый тег</span>' : '<span class="badge bg-secondary ms-2">к проекту</span>') +
            '<div class="small text-muted mt-1">от ' + tagsEscape(s.user_login || ('#' + s.user_id)) + ' · ' + new Date(s.created_at).toLocaleString('ru-RU') + '</div>' +
            (s.product_name ? '<div class="small mt-1"><i class="fas fa-box"></i> Проект: <strong>' + tagsEscape(s.product_name) + '</strong></div>' : '') +
            (s.tag_description ? '<div class="small mt-1">' + tagsEscape(s.tag_description) + '</div>' : '') +
            '</div>' +
            '<div class="d-flex gap-2">' +
            '<button class="btn btn-success btn-sm" data-approve="' + s.id + '"><i class="fas fa-check"></i> Одобрить</button>' +
            '<button class="btn btn-danger btn-sm" data-reject="' + s.id + '"><i class="fas fa-times"></i> Отклонить</button>' +
            '</div></div></div>';
        card.querySelector('[data-approve]').onclick = () => approveTagSuggestion(s.id);
        card.querySelector('[data-reject]').onclick = () => rejectTagSuggestion(s.id);
        box.appendChild(card);
    });
}

async function approveTagSuggestion(id) {
    if (!confirm('Одобрить это предложение тега?')) return;
    const r = await fetch('/api/tag-suggestions/' + id + '/approve', { method: 'POST', headers: tagsHeaders() });
    if (r.ok) { tagsToast('Предложение одобрено', 'success'); loadTagSuggestions(); }
    else tagsToast((await r.text()) || 'Ошибка', 'error');
}

async function rejectTagSuggestion(id) {
    if (!confirm('Отклонить это предложение тега?')) return;
    const r = await fetch('/api/tag-suggestions/' + id + '/reject', { method: 'POST', headers: tagsHeaders() });
    if (r.ok) { tagsToast('Предложение отклонено', 'success'); loadTagSuggestions(); }
    else tagsToast((await r.text()) || 'Ошибка', 'error');
}

// ---------- Обёртки существующих функций ----------
(function wrapNavigation() {
    if (typeof window.showPage === 'function') {
        const origShowPage = window.showPage;
        window.showPage = function (page) {
            origShowPage.apply(this, arguments);
            if (page === 'add') { selectedTagIds.clear(); renderTagPicker(); }
        };
    }
    if (typeof window.showProduct === 'function') {
        const origShowProduct = window.showProduct;
        window.showProduct = function (id) {
            origShowProduct.apply(this, arguments);
            loadProductTags(id);
        };
    }
    if (typeof window.showModerationTab === 'function') {
        const origTab = window.showModerationTab;
        window.showModerationTab = function (tab) {
            origTab.apply(this, arguments);
            if (tab === 'tags') {
                document.querySelectorAll('#page-moderation .nav-link').forEach(l => l.classList.remove('active'));
                const link = Array.from(document.querySelectorAll('#page-moderation .nav-link'))
                    .find(l => l.textContent.toLowerCase().includes('тег'));
                if (link) link.classList.add('active');
                loadTagSuggestions();
            }
        };
    }
})();

// ---------- Форма нового тега ----------
document.addEventListener('DOMContentLoaded', function () {
    const f = document.getElementById('add-tag-form');
    if (!f) return;
    f.addEventListener('submit', async function (e) {
        e.preventDefault();
        const u = tagsUser();
        if (!u) { tagsToast('Войдите в аккаунт, чтобы предложить тег', 'warn'); showPage('login'); return; }
        const name = f.querySelector('[name=tag_name]').value.trim();
        const desc = f.querySelector('[name=tag_description]').value.trim();
        if (!name) { tagsToast('Введите название тега', 'warn'); return; }
        const r = await fetch('/api/tags/suggest', {
            method: 'POST', headers: tagsHeaders(), body: JSON.stringify({ name: name, description: desc })
        });
        if (r.ok) { tagsToast('Тег отправлен на модерацию', 'success'); f.reset(); showPage('home'); }
        else tagsToast((await r.text()) || 'Ошибка', 'error');
    });
});