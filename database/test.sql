-- ============================================================
-- АИС «Lingradable» — полный набор SQL-запросов
-- Все запросы, используемые в приложении
-- ============================================================

-- ============================================================
-- ПОЛЬЗОВАТЕЛИ (users)
-- ============================================================

-- Регистрация нового пользователя
INSERT INTO users (login, email, password, role, status)
VALUES ($1, $2, $3, 'user', 'active')
RETURNING id, login, email, role, status;

-- Авторизация: поиск пользователя по email
SELECT id, login, email, password, role, status
FROM users
WHERE email = $1 AND status = 'active';

-- Обновление даты последнего входа
UPDATE users
SET last_login = NOW()
WHERE id = $1;

-- Получение пользователя по ID
SELECT id, login, email, role, status, registration_date, last_login
FROM users
WHERE id = $1;

-- Получение списка всех пользователей (для администратора)
SELECT id, login, email, role, status, registration_date, last_login, ban_reason
FROM users
ORDER BY registration_date DESC;

-- Блокировка пользователя (администратор)
UPDATE users
SET status = 'banned', ban_reason = $2
WHERE id = $1 AND role != 'admin';

-- Разблокировка пользователя (администратор)
UPDATE users
SET status = 'active', ban_reason = NULL
WHERE id = $1;

-- Проверка уникальности email при регистрации
SELECT COUNT(*) FROM users WHERE email = $1;

-- Проверка уникальности логина при регистрации
SELECT COUNT(*) FROM users WHERE login = $1;

-- ============================================================
-- ПРОДУКТЫ (products)
-- ============================================================

-- Создание нового проекта (на модерацию)
INSERT INTO products (name, type, description, link, icon_url, sha256_hash, author_id, status)
VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
RETURNING id;

-- Получение списка опубликованных продуктов (каталог)
SELECT p.id, p.name, p.type, p.description, p.icon_url, p.link,
       p.sha256_hash, p.status, p.creation_date,
       u.login AS author_login,
       AVG(r.rating) AS avg_rating,
       COUNT(DISTINCT r.id) AS review_count,
       COUNT(DISTINCT c.id) AS comment_count
FROM products p
LEFT JOIN users u ON p.author_id = u.id
LEFT JOIN reviews r ON p.id = r.product_id
LEFT JOIN comments c ON p.id = c.product_id
WHERE p.status = 'approved'
GROUP BY p.id, u.login
ORDER BY p.creation_date DESC;

-- Получение продукта по ID (детальная страница)
SELECT p.id, p.name, p.type, p.description, p.link, p.icon_url,
       p.sha256_hash, p.status, p.creation_date, p.moderation_date,
       p.rejection_reason,
       u.login AS author_login,
       AVG(r.rating) AS avg_rating,
       COUNT(DISTINCT r.id) AS review_count,
       COUNT(DISTINCT c.id) AS comment_count
FROM products p
LEFT JOIN users u ON p.author_id = u.id
LEFT JOIN reviews r ON p.id = r.product_id
LEFT JOIN comments c ON p.id = c.product_id
WHERE p.id = $1
GROUP BY p.id, u.login;

-- Получение продуктов на модерации (для модератора)
SELECT p.id, p.name, p.type, p.description, p.link, p.icon_url,
       p.sha256_hash, p.creation_date,
       u.login AS author_login
FROM products p
LEFT JOIN users u ON p.author_id = u.id
WHERE p.status = 'pending'
ORDER BY p.creation_date ASC;

-- Получение отклонённых продуктов (для модератора)
SELECT p.id, p.name, p.type, p.description, p.link, p.icon_url,
       p.sha256_hash, p.moderation_date, p.rejection_reason,
       u.login AS author_login
FROM products p
LEFT JOIN users u ON p.author_id = u.id
WHERE p.status = 'rejected'
ORDER BY p.moderation_date DESC;

-- Одобрение проекта (модератор)
UPDATE products
SET status = 'approved',
    moderator_id = $2,
    moderation_date = NOW()
WHERE id = $1 AND status = 'pending';

-- Отклонение проекта (модератор)
UPDATE products
SET status = 'rejected',
    moderator_id = $2,
    moderation_date = NOW(),
    rejection_reason = $3
WHERE id = $1 AND status = 'pending';

-- Редактирование своего проекта (автор)
UPDATE products
SET name = $2, type = $3, description = $4, link = $5, icon_url = $6
WHERE id = $1 AND author_id = $7 AND status != 'rejected';

-- Удаление проекта (автор или модератор)
DELETE FROM products
WHERE id = $1 AND (author_id = $2 OR $3 IN ('moderator', 'admin'));

-- Проверка прав на редактирование проекта
SELECT COUNT(*) FROM products
WHERE id = $1 AND author_id = $2;

-- Поиск продуктов по названию или описанию
SELECT p.id, p.name, p.type, p.description, p.icon_url,
       AVG(r.rating) AS avg_rating
FROM products p
LEFT JOIN reviews r ON p.id = r.product_id
WHERE p.status = 'approved'
  AND (p.name ILIKE $1 OR p.description ILIKE $1)
GROUP BY p.id
ORDER BY p.creation_date DESC;

-- Фильтрация продуктов по типу
SELECT p.id, p.name, p.type, p.description, p.icon_url,
       AVG(r.rating) AS avg_rating
FROM products p
LEFT JOIN reviews r ON p.id = r.product_id
WHERE p.status = 'approved' AND p.type = $1
GROUP BY p.id
ORDER BY p.creation_date DESC;

-- ============================================================
-- ТЕГИ (tags)
-- ============================================================

-- Получение всех тегов (справочник)
SELECT id, name, description
FROM tags
ORDER BY name ASC;

-- Создание нового тега (модератор)
INSERT INTO tags (name, description)
VALUES ($1, $2)
RETURNING id;

-- Удаление тега из каталога (модератор)
DELETE FROM tags WHERE id = $1;

-- Получение тега по ID
SELECT id, name, description FROM tags WHERE id = $1;

-- Проверка уникальности названия тега
SELECT COUNT(*) FROM tags WHERE name = $1;

-- ============================================================
-- СВЯЗИ ПРОДУКТОВ И ТЕГОВ (product_tags)
-- ============================================================

-- Привязка тега к продукту (модератор)
INSERT INTO product_tags (product_id, tag_id)
VALUES ($1, $2)
ON CONFLICT (product_id, tag_id) DO NOTHING;

-- Удаление связи тега с продуктом (модератор)
DELETE FROM product_tags
WHERE product_id = $1 AND tag_id = $2;

-- Получение тегов продукта
SELECT t.id, t.name, t.description
FROM tags t
INNER JOIN product_tags pt ON t.id = pt.tag_id
WHERE pt.product_id = $1
ORDER BY t.name ASC;

-- Фильтрация продуктов по тегам (множественный выбор)
SELECT DISTINCT p.id, p.name, p.type, p.description, p.icon_url,
       AVG(r.rating) AS avg_rating
FROM products p
INNER JOIN product_tags pt ON p.id = pt.product_id
LEFT JOIN reviews r ON p.id = r.product_id
WHERE p.status = 'approved' AND pt.tag_id = ANY($1::integer[])
GROUP BY p.id
HAVING COUNT(DISTINCT pt.tag_id) = array_length($1, 1);

-- ============================================================
-- ОТЗЫВЫ (reviews)
-- ============================================================

-- Создание или обновление отзыва (пользователь)
INSERT INTO reviews (user_id, product_id, rating)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, product_id)
DO UPDATE SET rating = $3, creation_date = NOW()
RETURNING id;

-- Получение отзывов продукта
SELECT r.id, r.rating, r.creation_date,
       u.login AS user_login
FROM reviews r
LEFT JOIN users u ON r.user_id = u.id
WHERE r.product_id = $1
ORDER BY r.creation_date DESC;

-- Проверка: оставлял ли пользователь отзыв
SELECT COUNT(*) FROM reviews
WHERE user_id = $1 AND product_id = $2;

-- Удаление отзыва (автор или модератор)
DELETE FROM reviews
WHERE id = $1 AND (user_id = $2 OR $3 IN ('moderator', 'admin'));

-- Получение среднего рейтинга продукта
SELECT AVG(rating) AS avg_rating, COUNT(*) AS review_count
FROM reviews
WHERE product_id = $1;

-- ============================================================
-- КОММЕНТАРИИ (comments)
-- ============================================================

-- Создание комментария (пользователь)
INSERT INTO comments (user_id, product_id, parent_id, text)
VALUES ($1, $2, $3, $4)
RETURNING id, creation_date;

-- Получение комментариев продукта (с вложенностью)
SELECT c.id, c.text, c.creation_date, c.parent_id,
       u.login AS user_login
FROM comments c
LEFT JOIN users u ON c.user_id = u.id
WHERE c.product_id = $1
ORDER BY c.creation_date ASC;

-- Удаление комментария (автор или модератор)
DELETE FROM comments
WHERE id = $1 AND (user_id = $2 OR $3 IN ('moderator', 'admin'));

-- Получение ответов на комментарий
SELECT c.id, c.text, c.creation_date,
       u.login AS user_login
FROM comments c
LEFT JOIN users u ON c.user_id = u.id
WHERE c.parent_id = $1
ORDER BY c.creation_date ASC;

-- Проверка глубины вложенности (для ограничения до 5 уровней)
WITH RECURSIVE comment_tree AS (
    SELECT id, parent_id, 1 AS depth
    FROM comments
    WHERE id = $1
    UNION ALL
    SELECT c.id, c.parent_id, ct.depth + 1
    FROM comments c
    INNER JOIN comment_tree ct ON c.id = ct.parent_id
    WHERE ct.depth < 5
)
SELECT MAX(depth) FROM comment_tree;

-- ============================================================
-- ПРЕДЛОЖЕНИЯ ТЕГОВ (tag_suggestions)
-- ============================================================

-- Создание предложения тега к продукту (пользователь)
INSERT INTO tag_suggestions (user_id, product_id, tag_id, status)
VALUES ($1, $2, $3, 'pending')
RETURNING id;

-- Создание предложения нового тега (пользователь)
INSERT INTO tag_suggestions (user_id, tag_name, tag_description, status)
VALUES ($1, $2, $3, 'pending')
RETURNING id;

-- Получение очереди предложений тегов (модератор)
SELECT ts.id, ts.tag_name, ts.tag_description, ts.status,
       ts.creation_date,
       u.login AS user_login,
       p.name AS product_name,
       t.name AS existing_tag_name
FROM tag_suggestions ts
LEFT JOIN users u ON ts.user_id = u.id
LEFT JOIN products p ON ts.product_id = p.id
LEFT JOIN tags t ON ts.tag_id = t.id
WHERE ts.status = 'pending'
ORDER BY ts.creation_date ASC;

-- Одобрение предложения тега (модератор)
UPDATE tag_suggestions
SET status = 'approved', moderation_date = NOW()
WHERE id = $1 AND status = 'pending';

-- Отклонение предложения тега (модератор)
UPDATE tag_suggestions
SET status = 'rejected', moderation_date = NOW()
WHERE id = $1 AND status = 'pending';

-- Проверка: существует ли уже предложение с таким тегом
SELECT COUNT(*) FROM tag_suggestions
WHERE (tag_id = $1 OR tag_name = $2) AND status = 'pending';

-- Удаление обработанных предложений (очистка очереди)
DELETE FROM tag_suggestions
WHERE status IN ('approved', 'rejected')
  AND moderation_date < NOW() - INTERVAL '30 days';

-- ============================================================
-- ТИКЕТЫ ПОДДЕРЖКИ (support_tickets)
-- ============================================================

-- Создание тикета поддержки (пользователь)
INSERT INTO support_tickets (user_id, subject, status)
VALUES ($1, $2, 'open')
RETURNING id;

-- Получение тикетов пользователя
SELECT st.id, st.subject, st.status, st.creation_date, st.update_date
FROM support_tickets st
WHERE st.user_id = $1
ORDER BY st.update_date DESC;

-- Получение свободных тикетов (очередь для модератора)
SELECT st.id, st.subject, st.creation_date,
       u.login AS user_login
FROM support_tickets st
LEFT JOIN users u ON st.user_id = u.id
WHERE st.status = 'open'
ORDER BY st.creation_date ASC;

-- Получение назначенных тикетов (для модератора)
SELECT st.id, st.subject, st.status, st.creation_date, st.update_date,
       u.login AS user_login
FROM support_tickets st
LEFT JOIN users u ON st.user_id = u.id
WHERE st.moderator_id = $1 AND st.status IN ('assigned', 'open')
ORDER BY st.update_date DESC;

-- Взятие тикета в работу (модератор)
UPDATE support_tickets
SET status = 'assigned', moderator_id = $2, update_date = NOW()
WHERE id = $1 AND status = 'open';

-- Закрытие тикета (модератор)
UPDATE support_tickets
SET status = 'closed', update_date = NOW()
WHERE id = $1 AND moderator_id = $2;

-- Получение тикета по ID
SELECT st.id, st.subject, st.status, st.creation_date, st.update_date,
       u.login AS user_login,
       m.login AS moderator_login
FROM support_tickets st
LEFT JOIN users u ON st.user_id = u.id
LEFT JOIN users m ON st.moderator_id = m.id
WHERE st.id = $1;

-- ============================================================
-- СООБЩЕНИЯ ПОДДЕРЖКИ (support_messages)
-- ============================================================

-- Отправка сообщения в тикет
INSERT INTO support_messages (ticket_id, user_id, sender_type, text)
VALUES ($1, $2, $3, $4)
RETURNING id, creation_date;

-- Получение переписки тикета
SELECT sm.id, sm.text, sm.sender_type, sm.creation_date,
       u.login AS sender_login
FROM support_messages sm
LEFT JOIN users u ON sm.user_id = u.id
WHERE sm.ticket_id = $1
ORDER BY sm.creation_date ASC;

-- Обновление даты последнего изменения тикета при новом сообщении
UPDATE support_tickets
SET update_date = NOW()
WHERE id = $1;

-- ============================================================
-- КОМБИНИРОВАННЫЕ ЗАПРОСЫ (для страниц приложения)
-- ============================================================

-- Главная страница каталога: продукты с тегами и рейтингом
SELECT p.id, p.name, p.type, p.description, p.icon_url,
       AVG(r.rating) AS avg_rating,
       COUNT(DISTINCT r.id) AS review_count,
       COUNT(DISTINCT c.id) AS comment_count,
       array_agg(DISTINCT t.name) AS tags
FROM products p
LEFT JOIN reviews r ON p.id = r.product_id
LEFT JOIN comments c ON p.id = c.product_id
LEFT JOIN product_tags pt ON p.id = pt.product_id
LEFT JOIN tags t ON pt.tag_id = t.id
WHERE p.status = 'approved'
GROUP BY p.id
ORDER BY p.creation_date DESC
LIMIT 20 OFFSET $1;

-- Страница продукта: полная информация с тегами, отзывами и комментариями
SELECT p.*,
       u.login AS author_login,
       array_agg(DISTINCT t.name) AS tags,
       (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) AS avg_rating
FROM products p
LEFT JOIN users u ON p.author_id = u.id
LEFT JOIN product_tags pt ON p.id = pt.product_id
LEFT JOIN tags t ON pt.tag_id = t.id
WHERE p.id = $1
GROUP BY p.id, u.login;

-- Панель модерации: статистика
SELECT
    (SELECT COUNT(*) FROM products WHERE status = 'pending') AS pending_products,
    (SELECT COUNT(*) FROM products WHERE status = 'rejected') AS rejected_products,
    (SELECT COUNT(*) FROM tag_suggestions WHERE status = 'pending') AS pending_tags,
    (SELECT COUNT(*) FROM support_tickets WHERE status = 'open') AS open_tickets,
    (SELECT COUNT(*) FROM support_tickets WHERE moderator_id = $1 AND status = 'assigned') AS assigned_tickets;

-- ============================================================
-- ИНДЕКСЫ И ОПТИМИЗАЦИЯ (для ускорения запросов)
-- ============================================================

-- Индексы уже созданы в schema.sql, но вот дополнительные для частых запросов:

-- Составной индекс для фильтрации по статусу и дате
CREATE INDEX IF NOT EXISTS idx_products_status_date
ON products(status, creation_date DESC);

-- Индекс для поиска по названию продукта
CREATE INDEX IF NOT EXISTS idx_products_name
ON products USING gin(to_tsvector('russian', name));

-- Индекс для быстрого получения отзывов пользователя
CREATE INDEX IF NOT EXISTS idx_reviews_user_product
ON reviews(user_id, product_id);

-- Индекс для комментариев с вложенностью
CREATE INDEX IF NOT EXISTS idx_comments_parent
ON comments(parent_id);

-- ============================================================
-- ТРАНЗАКЦИИ (для атомарных операций)
-- ============================================================

-- Транзакция: одобрение проекта с привязкой тегов
BEGIN;
    UPDATE products SET status = 'approved', moderator_id = $2, moderation_date = NOW()
    WHERE id = $1;
    INSERT INTO product_tags (product_id, tag_id)
    SELECT $1, tag_id FROM tag_suggestions
    WHERE product_id = $1 AND status = 'approved';
    DELETE FROM tag_suggestions WHERE product_id = $1;
COMMIT;

-- Транзакция: удаление тега из каталога
BEGIN;
    DELETE FROM product_tags WHERE tag_id = $1;
    DELETE FROM tag_suggestions WHERE tag_id = $1;
    DELETE FROM tags WHERE id = $1;
COMMIT;

-- Транзакция: удаление проекта с каскадом
BEGIN;
    DELETE FROM comments WHERE product_id = $1;
    DELETE FROM reviews WHERE product_id = $1;
    DELETE FROM product_tags WHERE product_id = $1;
    DELETE FROM tag_suggestions WHERE product_id = $1;
    DELETE FROM products WHERE id = $1;
COMMIT;