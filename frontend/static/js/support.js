// ==========================================
// LINGRADABLE — SUPPORT CHAT (support.js)
// ==========================================

const SUPPORT_API = '/api/support';

const supportState = {
    open: false,
    view: 'list',          // list | create | chat
    ticketId: null,
    ticketSubject: '',
    ticketStatus: null,
    pollTimer: null,
    sending: false
};

const SUPPORT_STATUS = {
    open:     { label: 'Ожидает модератора', cls: 'open' },
    assigned: { label: 'В работе',           cls: 'assigned' },
    closed:   { label: 'Закрыт',             cls: 'closed' }
};

// ---------- Утилиты ----------
function supportUser() {
    try { return JSON.parse(localStorage.getItem('user')); } catch (e) { return null; }
}

function isSupportStaff(u) {
    return !!u && (u.role === 'moderator' || u.role === 'admin');
}

function supportHeaders() {
    if (typeof getAuthHeaders === 'function') return getAuthHeaders();
    const u = supportUser();
    const h = { 'Content-Type': 'application/json' };
    if (u && u.id) h['X-User-ID'] = String(u.id);
    return h;
}

function supportEscape(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

function supportTime(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function supportToast(text, type) {
    const t = document.createElement('div');
    t.className = 'support-toast ' + (type || 'info');
    t.textContent = text;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

// ---------- Управление видами ----------
function setSupportView(view) {
    supportState.view = view;
    const staff = isSupportStaff(supportUser());

    const list     = document.getElementById('support-tickets-list');
    const create   = document.getElementById('create-ticket-form');
    const chat     = document.getElementById('support-chat');
    const modPanel = document.getElementById('moderator-panel');

    if (list)     list.style.display     = view === 'list' ? 'block' : 'none';
    if (create)   create.style.display   = (view === 'create' && !staff) ? 'block' : 'none';
    if (chat)     chat.style.display     = view === 'chat' ? 'flex' : 'none';
    if (modPanel) modPanel.style.display = (view === 'list' && staff) ? 'block' : 'none';

    const newBtn = document.getElementById('support-new-ticket-btn');
    if (newBtn) newBtn.style.display = staff ? 'none' : 'inline-flex';

    const title = document.getElementById('support-list-title');
    if (title) title.textContent = staff ? 'Мои активные чаты' : 'Мои обращения';
}

function openSupportModal() {
    // Во время обучения пингвин занят — поддержка не перехватывает клики и навигацию
    if (document.body.classList.contains('tutorial-active')) {
        supportToast('Идёт обучение — заверши его или нажми «Пропустить»', 'info');
        return;
    }

    const user = supportUser();
    if (!user) {
        supportToast('Войдите в аккаунт, чтобы написать в поддержку', 'info');
        if (typeof showPage === 'function') showPage('login');
        return;
    }
    if (supportState.open) return;
    supportState.open = true;
    supportState.ticketId = null;
    supportState.ticketStatus = null;

    const modal = document.getElementById('support-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    document.body.classList.add('support-open');

    setSupportView('list');
    loadTickets();
    startSupportPolling();
}

function closeSupportModal() {
    supportState.open = false;
    supportState.ticketId = null;
    stopSupportPolling();
    const modal = document.getElementById('support-modal');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('support-open');
}

function showCreateTicketForm() {
    if (isSupportStaff(supportUser())) {
        supportToast('Модераторы отвечают на вопросы, а не создают их', 'warn');
        return;
    }
    setSupportView('create');
    const input = document.getElementById('ticket-subject');
    if (input) setTimeout(() => input.focus(), 50);
}

function showTicketsList() {
    supportState.ticketId = null;
    setSupportView('list');
    loadTickets();
}

// ---------- Живое обновление ----------
function startSupportPolling() {
    stopSupportPolling();
    supportState.pollTimer = setInterval(() => {
        if (!supportState.open) return;
        if (supportState.view === 'chat' && supportState.ticketId) loadMessages(true);
        else if (supportState.view === 'list') loadTickets(true);
    }, 3000);
}

function stopSupportPolling() {
    if (supportState.pollTimer) { clearInterval(supportState.pollTimer); supportState.pollTimer = null; }
}

// ---------- Списки тикетов ----------
async function loadTickets(silent) {
    const user = supportUser();
    if (!user) return;
    const container = document.getElementById('tickets-container');
    if (!container) return;
    if (!silent) container.innerHTML = '<div class="support-loading"><span class="support-spinner"></span> Загрузка…</div>';

    try {
        const res = await fetch(SUPPORT_API + '/tickets', { headers: supportHeaders() });
        if (!res.ok) throw new Error(await res.text());
        const tickets = (await res.json()) || [];
        const staff = isSupportStaff(user);

        let active, closed;
        if (staff) {
            active = tickets.filter(t => t.status === 'assigned' && t.moderator_id === user.id);
            closed = tickets.filter(t => t.status === 'closed' && t.moderator_id === user.id);
        } else {
            active = tickets.filter(t => t.status !== 'closed');
            closed = tickets.filter(t => t.status === 'closed');
        }

        container.innerHTML = '';
        if (!active.length) {
            container.innerHTML = '<div class="support-empty">' +
                (staff ? 'У вас пока нет чатов в работе. Возьмите свободный вопрос ниже 👇'
                       : 'Обращений пока нет. Задайте первый вопрос!') + '</div>';
        } else {
            active.forEach(t => container.appendChild(supportTicketCard(t, 'chat')));
        }

        const closedBox = document.getElementById('support-closed-box');
        const closedContainer = document.getElementById('support-closed-container');
        if (closedBox && closedContainer) {
            closedBox.style.display = closed.length ? 'block' : 'none';
            closedContainer.innerHTML = '';
            closed.slice(0, 10).forEach(t => closedContainer.appendChild(supportTicketCard(t, 'readonly')));
        }

        if (staff) loadOpenTickets(true);
    } catch (err) {
        if (!silent) container.innerHTML = '<div class="support-error">Не удалось загрузить обращения</div>';
    }
}

async function loadOpenTickets(silent) {
    if (!isSupportStaff(supportUser())) return;
    const container = document.getElementById('open-tickets-container');
    if (!container) return;
    if (!silent) container.innerHTML = '<div class="support-loading"><span class="support-spinner"></span> Загрузка…</div>';

    try {
        const res = await fetch(SUPPORT_API + '/tickets/open', { headers: supportHeaders() });
        if (!res.ok) throw new Error();
        const tickets = (await res.json()) || [];

        const badge = document.getElementById('support-queue-count');
        if (badge) badge.textContent = tickets.length;

        container.innerHTML = '';
        if (!tickets.length) {
            container.innerHTML = '<div class="support-empty">Свободных вопросов нет — всё разобрано 🎉</div>';
            return;
        }
        tickets.forEach(t => container.appendChild(supportTicketCard(t, 'queue')));
    } catch (e) {
        if (!silent) container.innerHTML = '<div class="support-error">Не удалось загрузить очередь</div>';
    }
}

function supportTicketCard(t, mode) {
    const st = SUPPORT_STATUS[t.status] || SUPPORT_STATUS.open;
    const card = document.createElement('div');
    card.className = 'ticket-item' + (mode === 'queue' ? ' ticket-queue' : ' clickable');
    card.innerHTML =
        '<div class="ticket-top">' +
            '<span class="ticket-subject">' + supportEscape(t.subject) + '</span>' +
            '<span class="ticket-status ' + st.cls + '">' + st.label + '</span>' +
        '</div>' +
        '<div class="ticket-meta">#' + t.id + ' · ' + supportTime(t.created_at) +
            (mode === 'queue' ? ' · от пользователя #' + t.user_id : '') + '</div>' +
        '<div class="ticket-actions"></div>';

    const actions = card.querySelector('.ticket-actions');
    const btn = document.createElement('button');

    if (mode === 'queue') {
        btn.className = 'support-btn primary';
        btn.innerHTML = '<i class="fas fa-hand-paper"></i> Взять в работу';
        btn.onclick = (e) => { e.stopPropagation(); claimTicket(t.id, t.subject); };
    } else {
        btn.className = 'support-btn ghost';
        btn.innerHTML = mode === 'readonly'
            ? '<i class="fas fa-eye"></i> Открыть историю'
            : '<i class="fas fa-comments"></i> Перейти к чату';
        btn.onclick = (e) => { e.stopPropagation(); openTicket(t.id, t.subject, t.status); };
        card.onclick = () => openTicket(t.id, t.subject, t.status);
    }
    actions.appendChild(btn);
    return card;
}

// ---------- Взять в работу → СРАЗУ чат ----------
async function claimTicket(ticketId, subject) {
    try {
        const res = await fetch(SUPPORT_API + '/tickets/' + ticketId + '/claim', {
            method: 'POST', headers: supportHeaders()
        });
        if (res.status === 409) {
            supportToast('Этот вопрос уже взял другой модератор', 'warn');
            loadTickets();
            return;
        }
        if (!res.ok) throw new Error(await res.text());
        supportToast('Вопрос ваш — можете отвечать пользователю', 'success');
        openTicket(ticketId, subject, 'assigned');
    } catch (err) {
        supportToast('Не удалось взять вопрос: ' + err.message, 'error');
    }
}

// ---------- Чат ----------
function openTicket(ticketId, subject, status) {
    supportState.ticketId = ticketId;
    supportState.ticketSubject = subject || '';
    supportState.ticketStatus = status || 'assigned';

    setSupportView('chat');

    const subj = document.getElementById('chat-ticket-subject');
    if (subj) subj.textContent = supportState.ticketSubject;
    const num = document.getElementById('chat-ticket-num');
    if (num) num.textContent = '#' + ticketId;

    updateChatControls();
    const box = document.getElementById('chat-messages');
    if (box) box.innerHTML = '<div class="support-loading"><span class="support-spinner"></span> Загрузка переписки…</div>';
    loadMessages();

    if (supportState.ticketStatus !== 'closed') {
        const input = document.getElementById('chat-message-input');
        if (input) setTimeout(() => input.focus(), 50);
    }
}

function updateChatControls() {
    const staff = isSupportStaff(supportUser());
    const closed = supportState.ticketStatus === 'closed';
    const st = SUPPORT_STATUS[supportState.ticketStatus] || SUPPORT_STATUS.open;

    const badge = document.getElementById('chat-ticket-status');
    if (badge) { badge.className = 'ticket-status ' + st.cls; badge.textContent = st.label; }

    const closeBtn = document.getElementById('close-ticket-btn');
    if (closeBtn) closeBtn.style.display = (staff && !closed) ? 'inline-flex' : 'none';

    const inputRow = document.getElementById('chat-input-row');
    const closedNote = document.getElementById('chat-closed-note');
    if (inputRow) inputRow.style.display = closed ? 'none' : 'flex';
    if (closedNote) closedNote.style.display = closed ? 'block' : 'none';
}

async function loadMessages(silent) {
    if (!supportState.ticketId) return;
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const ticketId = supportState.ticketId;

    try {
        const res = await fetch(SUPPORT_API + '/tickets/' + ticketId + '/messages', { headers: supportHeaders() });
        if (!res.ok) throw new Error();
        const messages = (await res.json()) || [];
        if (supportState.ticketId !== ticketId || supportState.view !== 'chat') return;

        const user = supportUser();
        const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
        box.innerHTML = '';

        if (!messages.length) {
            box.innerHTML = '<div class="support-empty">Сообщений пока нет. Напишите первым — ответ появится прямо здесь.</div>';
            return;
        }
        messages.forEach(m => {
            const own = user && m.sender_id === user.id;
            const row = document.createElement('div');
            row.className = 'chat-message ' + (own ? 'own' : (m.sender_type === 'moderator' ? 'moderator' : 'user'));
            const who = own ? 'Вы' : (m.sender_type === 'moderator' ? '🛡 Поддержка' : 'Пользователь');
            row.innerHTML =
                '<div class="msg-author">' + who + '</div>' +
                '<div class="msg-text">' + supportEscape(m.message) + '</div>' +
                '<div class="msg-time">' + supportTime(m.created_at) + '</div>';
            box.appendChild(row);
        });
        if (!silent || atBottom) box.scrollTop = box.scrollHeight;
    } catch (e) {
        if (!silent) box.innerHTML = '<div class="support-error">Не удалось загрузить сообщения</div>';
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-message-input');
    if (!input || !supportState.ticketId || supportState.sending) return;
    const text = input.value.trim();
    if (!text) return;
    if (supportState.ticketStatus === 'closed') { supportToast('Тикет закрыт', 'warn'); return; }

    supportState.sending = true;
    const sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    const box = document.getElementById('chat-messages');
    const ghost = document.createElement('div');
    ghost.className = 'chat-message own sending';
    ghost.innerHTML = '<div class="msg-author">Вы</div><div class="msg-text">' + supportEscape(text) + '</div><div class="msg-time">отправляется…</div>';
    if (box) { box.appendChild(ghost); box.scrollTop = box.scrollHeight; }
    input.value = '';

    try {
        const res = await fetch(SUPPORT_API + '/tickets/' + supportState.ticketId + '/messages', {
            method: 'POST', headers: supportHeaders(), body: JSON.stringify({ message: text })
        });
        if (!res.ok) throw new Error(await res.text());
        await loadMessages();
    } catch (err) {
        ghost.remove();
        input.value = text;
        supportToast('Не удалось отправить: ' + err.message, 'error');
    } finally {
        supportState.sending = false;
        if (sendBtn) sendBtn.disabled = false;
        input.focus();
    }
}

async function createTicket() {
    const user = supportUser();
    if (!user) { supportToast('Войдите в аккаунт', 'warn'); return; }
    if (isSupportStaff(user)) { supportToast('Модераторы не создают обращения', 'warn'); return; }

    const input = document.getElementById('ticket-subject');
    const subject = input ? input.value.trim() : '';
    if (!subject) { supportToast('Опишите вопрос хотя бы парой слов', 'warn'); if (input) input.focus(); return; }

    try {
        const res = await fetch(SUPPORT_API + '/tickets', {
            method: 'POST', headers: supportHeaders(), body: JSON.stringify({ subject })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (input) input.value = '';
        supportToast('Вопрос отправлен модераторам', 'success');
        openTicket(data.ticket_id, subject, 'open');
    } catch (err) {
        supportToast('Ошибка: ' + err.message, 'error');
    }
}

async function closeTicket() {
    if (!isSupportStaff(supportUser())) { supportToast('Закрыть вопрос может только модератор', 'warn'); return; }
    if (!supportState.ticketId) return;
    if (!confirm('Закрыть этот вопрос? Переписка сохранится в истории.')) return;

    try {
        const res = await fetch(SUPPORT_API + '/tickets/' + supportState.ticketId + '/close', {
            method: 'PUT', headers: supportHeaders()
        });
        if (!res.ok) throw new Error(await res.text());
        supportState.ticketStatus = 'closed';
        updateChatControls();
        supportToast('Вопрос закрыт', 'success');
    } catch (err) {
        supportToast('Ошибка: ' + err.message, 'error');
    }
}

// ---------- Привязки ----------
(function initSupport() {
    // Поддержка открывается ТОЛЬКО по клику на самого пингвина (#tux-character),
    // а не на всё облачко с кнопками обучения.
    const tuxChar = document.getElementById('tux-character');
    const bubble  = document.getElementById('tux-speech-bubble');

    if (tuxChar) {
        tuxChar.addEventListener('click', function (e) {
            e.stopPropagation();
            openSupportModal();
        });
    } else {
        const tux = document.getElementById('tux-companion');
        if (tux) tux.addEventListener('click', function (e) {
            if (e.target.closest('#tux-speech-bubble')) return;
            openSupportModal();
        });
    }

    // Клики по кнопкам обучения (Далее / Назад / Пропустить) не всплывают
    // до #tux-companion и НЕ открывают поддержку / не уводят на страницу входа.
    if (bubble) {
        bubble.addEventListener('click', function (e) {
            e.stopPropagation();
        });
    }

    const modal = document.getElementById('support-modal');
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeSupportModal(); });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && supportState.open) closeSupportModal();
        if (e.key === 'Enter' && supportState.open && supportState.view === 'chat' &&
            document.activeElement && document.activeElement.id === 'chat-message-input') {
            e.preventDefault();
            sendMessage();
        }
    });

    const subjInput = document.getElementById('ticket-subject');
    if (subjInput) subjInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); createTicket(); }
    });

    if (typeof window.logout === 'function' && !window.__supportLogoutPatched) {
        const original = window.logout;
        window.logout = function () { closeSupportModal(); original.apply(this, arguments); };
        window.__supportLogoutPatched = true;
    }
})();