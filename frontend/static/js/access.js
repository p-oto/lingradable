// ============================================================
// frontend/static/js/access.js — НОВЫЙ ФАЙЛ
// Права доступа: гости, автор проекта, модераторские действия с тегами
// ============================================================

function accessUser() {
    try { return JSON.parse(localStorage.getItem('user')); } catch (e) { return null; }
}
function accessIsStaff(u) { return !!u && (u.role === 'moderator' || u.role === 'admin'); }
function accessHeaders() {
    if (typeof getAuthHeaders === 'function') return getAuthHeaders();
    const u = accessUser();
    const h = { 'Content-Type': 'application/json' };
    if (u && u.id) h['X-User-ID'] = String(u.id);
    return h;
}
function accessToast(msg, type) {
    if (typeof supportToast === 'function') { supportToast(msg, type); return; }
    if (typeof tagsToast === 'function') { tagsToast(msg, type); return; }
    alert(msg);
}
function accessEscape(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

// ------------------------------------------------------------
// 1) Гости не видят и не могут открыть «Добавить тэг»
// ------------------------------------------------------------
(function guardAddTag() {
    if (typeof window.showPage === 'function') {
        const origShowPage = window.showPage;
        window.showPage = function (page) {
            if (page === 'add-tag' && !accessUser()) {
                accessToast('Войдите в аккаунт, чтобы предложить тег', 'warn');
                return origShowPage.call(this, 'login');
            }
            return origShowPage.apply(this, arguments);
        };
    }

    if (typeof window.updateNavigation === 'function') {
        const origUpdateNav = window.updateNavigation;
        window.updateNavigation = function () {
            origUpdateNav.apply(this, arguments);
            const u = accessUser();
            const addTag = document.getElementById('nav-add-tag');
            if (addTag) addTag.style.display = u ? '' : 'none';
            const allTagsTab = document.getElementById('mod-tab-all-tags');
            if (allTagsTab) allTagsTab.style.display = accessIsStaff(u) ? '' : 'none';
        };
    }
})();

// ------------------------------------------------------------
// 2) Автор проекта может редактировать свой проект
// ------------------------------------------------------------
(function ownerEditing() {
    if (typeof window.showProduct !== 'function') return;
    const origShowProduct = window.showProduct;
    window.showProduct = function (id) {
        origShowProduct.apply(this, arguments);
        injectOwnerControls(id);
    };

    async function injectOwnerControls(id) {
        const u = accessUser();
        if (!u || accessIsStaff(u)) return; // у модераторов своя панель
        let tries = 0;
        const wait = async () => {
            const host = document.querySelector('#product-detail .product-detail');
            if (!host) { if (tries++ < 25) setTimeout(wait, 150); return; }
            if (host.querySelector('.owner-controls')) return;

            let product = null;
            try { product = await (await fetch('/api/products/' + id)).json(); } catch (e) { return; }
            if (!product || !product.author_id || product.author_id !== u.id) return;

            const block = document.createElement('div');
            block.className = 'owner-controls';
            block.innerHTML =
                '<h6 class="fw-bold"><i class="fas fa-user-cog" aria-hidden="true"></i> Управление моим проектом</h6>' +
                '<button class="btn btn-warning btn-sm" type="button" id="owner-edit-btn">' +
                '<i class="fas fa-edit" aria-hidden="true"></i> Редактировать мой проект</button>';
            block.querySelector('#owner-edit-btn').onclick = () => openEditProductModal(id);

            const header = host.querySelector('.product-header');
            if (header && header.nextSibling) host.insertBefore(block, header.nextSibling);
            else host.appendChild(block);
        };
        wait();
    }

    // Автору недоступен переключатель «Официальный / Кастомный»
    if (typeof window.openEditProductModal === 'function') {
        const origOpenEdit = window.openEditProductModal;
        window.openEditProductModal = function (id) {
            origOpenEdit.apply(this, arguments);
            const block = document.getElementById('edit-project-type-block');
            if (block) block.style.display = accessIsStaff(accessUser()) ? '' : 'none';
        };
    }
})();

// ------------------------------------------------------------
// 3) Модератор убирает тег у продукта (кнопка × на бейдже)
// ------------------------------------------------------------
(function tagDetach() {
    if (typeof window.injectTagBlock !== 'function') return;
    const origInject = window.injectTagBlock;
    window.injectTagBlock = async function (host, pid) {
        await origInject.apply(this, arguments);
        if (!accessIsStaff(accessUser())) return;

        const block = host.querySelector('.product-tags-block');
        if (!block || block.dataset.removeReady) return;

        let tags = [];
        try { tags = (await (await fetch('/api/products/' + pid + '/tags')).json()) || []; } catch (e) { return; }

        block.querySelectorAll('.tag-badge').forEach(badge => {
            const t = tags.find(x => x.name === badge.textContent.trim());
            if (!t) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tag-remove-btn';
            btn.innerHTML = '&times;';
            btn.title = 'Убрать тег от проекта';
            btn.setAttribute('aria-label', 'Убрать тег ' + t.name);
            btn.onclick = async (e) => {
                e.stopPropagation();
                if (!confirm('Убрать тег «' + t.name + '» от этого проекта?')) return;
                const r = await fetch('/api/products/' + pid + '/tags/' + t.id, {
                    method: 'DELETE', headers: accessHeaders()
                });
                if (r.ok) { accessToast('Тег убран от проекта', 'success'); badge.remove(); }
                else accessToast((await r.text()) || 'Ошибка', 'error');
            };
            badge.appendChild(btn);
        });
        block.dataset.removeReady = '1';
    };
})();

// ------------------------------------------------------------
// 4) Вкладка «Все теги»: полное удаление тега (модератор/админ)
// ------------------------------------------------------------
(function tagManagement() {
    if (typeof window.showModerationTab !== 'function') return;
    const origTab = window.showModerationTab;
    window.showModerationTab = function (tab) {
        origTab.apply(this, arguments);
        if (tab === 'all-tags') {
            document.querySelectorAll('#page-moderation .nav-link').forEach(l => l.classList.remove('active'));
            const link = document.getElementById('mod-tab-all-tags-link');
            if (link) link.classList.add('active');
            loadAllTags();
        }
    };

    async function loadAllTags() {
        const box = document.getElementById('all-tags-list');
        if (!box) return;
        box.innerHTML = '<div class="text-center"><div class="spinner-border" role="status"></div><p class="mt-2">Загрузка тегов…</p></div>';

        let tags = [];
        try { tags = (await (await fetch('/api/tags')).json()) || []; }
        catch (e) { box.innerHTML = '<div class="alert alert-danger">Не удалось загрузить теги</div>'; return; }

        box.innerHTML = '';
        if (!tags.length) {
            box.innerHTML = '<div class="alert alert-info">Тегов пока нет.</div>';
            return;
        }

        tags.forEach(t => {
            const card = document.createElement('div');
            card.className = 'all-tag-card';
            card.innerHTML =
                '<div class="all-tag-info">' +
                '<span class="tag-badge">' + accessEscape(t.name) + '</span>' +
                (t.description ? '<div class="all-tag-desc">' + accessEscape(t.description) + '</div>' : '') +
                '</div>' +
                '<button class="btn btn-danger btn-sm" type="button">' +
                '<i class="fas fa-trash" aria-hidden="true"></i> Удалить тег</button>';
            card.querySelector('button').onclick = () => deleteTagGlobal(t.id, t.name);
            box.appendChild(card);
        });
    }

    async function deleteTagGlobal(id, name) {
        if (!accessIsStaff(accessUser())) { accessToast('Недостаточно прав', 'error'); return; }
        if (!confirm('Удалить тег «' + name + '» полностью?\nОн будет убран у всех проектов, все предложения с ним тоже удалятся.')) return;
        const r = await fetch('/api/tags/' + id, { method: 'DELETE', headers: accessHeaders() });
        if (r.ok) { accessToast('Тег удалён', 'success'); loadAllTags(); }
        else accessToast((await r.text()) || 'Ошибка', 'error');
    }
})();

// Первичное применение видимости при загрузке
document.addEventListener('DOMContentLoaded', function () {
    if (typeof window.updateNavigation === 'function') window.updateNavigation();
});