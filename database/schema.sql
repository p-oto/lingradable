-- ============================================
-- LINGRADABLE - База данных
-- СУБД: MySQL 8.0+ / PostgreSQL 14+
-- ============================================
-- Создание базы данных
CREATE DATABASE IF NOT EXISTS lingradable CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lingradable;
-- ============================================
-- ТАБЛИЦА: Пользователи (users)
-- ============================================
-- ============================================
-- LINGRADABLE - База данных (PostgreSQL 14+)
-- ============================================

-- Создаем ENUM типы для ограничений
CREATE TYPE user_role AS ENUM ('guest', 'user', 'moderator', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'banned');
CREATE TYPE product_type AS ENUM ('distro', 'de', 'wm');
CREATE TYPE product_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE suggestion_status AS ENUM ('pending', 'approved', 'rejected');

-- ============================================
-- ТАБЛИЦА: Пользователи (users)
-- ============================================
CREATE TABLE users (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    login VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'user',
    status user_status NOT NULL DEFAULT 'active',
    ban_reason VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL
);

COMMENT ON TABLE users IS 'Пользователи системы';
COMMENT ON COLUMN users.password_hash IS 'Хэш пароля (bcrypt/argon2)';
COMMENT ON COLUMN users.ban_reason IS 'Причина блокировки';

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_login ON users(login);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- ТАБЛИЦА: Продукты (products)
-- ============================================
CREATE TABLE products (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name VARCHAR(200) NOT NULL,
    type product_type NOT NULL,
    description TEXT NOT NULL,
    links VARCHAR(1000) NULL,
    sha256_hash CHAR(64) NULL,
    author_id INT NULL,
    status product_status NOT NULL DEFAULT 'pending',
    rejection_reason VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    moderated_at TIMESTAMP NULL,
    moderator_id INT NULL,
    
    CONSTRAINT fk_products_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_products_moderator FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_sha256_length CHECK (sha256_hash IS NULL OR LENGTH(sha256_hash) = 64)
);

COMMENT ON TABLE products IS 'Дистрибутивы, DE и WM';
COMMENT ON COLUMN products.type IS 'Тип: distro (дистрибутив), de (окружение рабочего стола), wm (оконный менеджер)';
COMMENT ON COLUMN products.links IS 'Ссылки на зеркала/GitHub';
COMMENT ON COLUMN products.sha256_hash IS 'SHA256 хэш файла (64 hex символа)';

CREATE INDEX idx_products_type ON products(type);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_author ON products(author_id);
CREATE INDEX idx_products_sha256 ON products(sha256_hash);

-- Полнотекстовый поиск для PostgreSQL
CREATE INDEX idx_products_fts ON products USING GIN (to_tsvector('russian', description));

-- ============================================
-- ТАБЛИЦА: Теги (tags)
-- ============================================
CREATE TABLE tags (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE tags IS 'Теги для классификации продуктов';
COMMENT ON COLUMN tags.description IS 'Описание тега';

CREATE INDEX idx_tags_name ON tags(name);

-- ============================================
-- ТАБЛИЦА: Связь Продукт-Тег (product_tags)
-- ============================================
CREATE TABLE product_tags (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    product_id INT NOT NULL,
    tag_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_pt_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_pt_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    CONSTRAINT unique_product_tag UNIQUE (product_id, tag_id)
);

COMMENT ON TABLE product_tags IS 'Связь многие ко многим: продукты и теги';

CREATE INDEX idx_pt_product ON product_tags(product_id);
CREATE INDEX idx_pt_tag ON product_tags(tag_id);

-- ============================================
-- ТАБЛИЦА: Отзывы (reviews)
-- ============================================
CREATE TABLE reviews (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT unique_user_product_review UNIQUE (user_id, product_id)
);

COMMENT ON TABLE reviews IS 'Отзывы пользователей о продуктах';
COMMENT ON COLUMN reviews.rating IS 'Оценка от 1 до 5';

CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);

-- ============================================
-- ТАБЛИЦА: Комментарии (comments)
-- ============================================
CREATE TABLE comments (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL
);

COMMENT ON TABLE comments IS 'Комментарии к продуктам';

CREATE INDEX idx_comments_product ON comments(product_id);
CREATE INDEX idx_comments_user ON comments(user_id);
CREATE INDEX idx_comments_created ON comments(created_at);

-- Триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ТАБЛИЦА: Предложения тегов (tag_suggestions)
-- ============================================
CREATE TABLE tag_suggestions (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    tag_id INT NOT NULL,
    status suggestion_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    moderated_at TIMESTAMP NULL,
    moderator_id INT NULL,
    
    CONSTRAINT fk_ts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ts_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_ts_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    CONSTRAINT fk_ts_moderator FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE tag_suggestions IS 'Предложения пользователей по добавлению тегов';

CREATE INDEX idx_ts_status ON tag_suggestions(status);
CREATE INDEX idx_ts_product ON tag_suggestions(product_id);

-- ============================================
-- НАЧАЛЬНЫЕ ДАННЫЕ (Seed Data)
-- ============================================

-- Администратор по умолчанию (пароль: admin123, хэш bcrypt)
INSERT INTO users (login, email, password_hash, role, status) VALUES
('admin', 'admin@lingradable.ru', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin', 'active');

-- Тестовые пользователи
INSERT INTO users (login, email, password_hash, role, status) VALUES
('testuser', 'test@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'user', 'active'),
('moderator1', 'mod@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'moderator', 'active');

-- Теги по умолчанию
INSERT INTO tags (name, description) VALUES
('Для новичков', 'Дистрибутивы и DE, подходящие для начинающих пользователей Linux'),
('Для серверов', 'Решения для серверной инфраструктуры'),
('Минимализм', 'Легковесные WM и DE с минимальным потреблением ресурсов'),
('Для старых ПК', 'Дистрибутивы, работающие на слабом железе'),
('Для гейминга', 'Оптимизированные для игр системы'),
('Для программирования', 'С удобными инструментами для разработки'),
('Стабильность', 'Долгосрочная поддержка (LTS)'),
('Кастомизация', 'Высокая степень настройки интерфейса');

-- Тестовые продукты
INSERT INTO products (name, type, description, links, sha256_hash, author_id, status) VALUES
('Ubuntu 24.04 LTS', 'distro', 
 'Популярный дистрибутив на базе Debian с GNOME. Идеален для новичков благодаря огромному сообществу и документации.',
 'https://ubuntu.com/download,https://releases.ubuntu.com/24.04/',
 '877d4cb593e7e30b9b20c0659c1c2d29931b593e20fa1b3029f1b1db79271b4d',
 NULL, 'approved'),

('Arch Linux', 'distro',
 'Легковесный rolling-release дистрибутив для опытных пользователей. Максимальная кастомизация.',
 'https://archlinux.org/download/',
 NULL, NULL, 'approved'),

('i3', 'wm',
 'Тайловый оконный менеджер, ориентированный на продуктивность. Управляется с клавиатуры.',
 'https://i3wm.org/',
 NULL, NULL, 'approved'),

('KDE Plasma', 'de',
 'Мощное окружение рабочего стола с невероятными возможностями кастомизации и современным дизайном.',
 'https://kde.org/plasma-desktop/',
 NULL, NULL, 'approved'),

('Lubuntu', 'distro',
 'Официальный вариант Ubuntu с LXQt. Отлично работает на старом железе.',
 'https://lubuntu.me/downloads/',
 NULL, NULL, 'approved');

-- Связи продуктов с тегами
INSERT INTO product_tags (product_id, tag_id) VALUES
(1, 1), (1, 7),  -- Ubuntu: Для новичков, Стабильность
(2, 6), (2, 8),  -- Arch: Для программирования, Кастомизация
(3, 3), (3, 6),  -- i3: Минимализм, Для программирования
(4, 8),          -- KDE: Кастомизация
(5, 1), (5, 4);  -- Lubuntu: Для новичков, Для старых ПК

-- Тестовые отзывы
INSERT INTO reviews (user_id, product_id, rating) VALUES
(2, 1, 5),  -- testuser поставил Ubuntu 5 звёзд
(2, 3, 4);  -- testuser поставил i3 4 звезды

-- Тестовые комментарии
INSERT INTO comments (user_id, product_id, text) VALUES
(2, 1, 'Отличная система для старта! Всё работает из коробки.'),
(2, 3, 'Кто-нибудь пробовал на старом ноутбуке? Как производительность?');

-- ============================================
-- ПРЕДСТАВЛЕНИЯ (Views)
-- ============================================

-- Представление: Продукты с авторами и средним рейтингом
CREATE OR REPLACE VIEW v_products_with_stats AS
SELECT 
    p.id,
    p.name,
    p.type,
    p.description,
    p.status,
    u.login AS author_login,
    COUNT(r.id) AS review_count,
    COALESCE(AVG(r.rating), 0) AS avg_rating,
    p.created_at
FROM products p
LEFT JOIN users u ON p.author_id = u.id
LEFT JOIN reviews r ON p.id = r.product_id
GROUP BY p.id, p.name, p.type, p.description, p.status, u.login, p.created_at;

-- Представление: Продукты с тегами
CREATE OR REPLACE VIEW v_products_with_tags AS
SELECT 
    p.id,
    p.name,
    p.type,
    STRING_AGG(t.name, ', ') AS tags
FROM products p
LEFT JOIN product_tags pt ON p.id = pt.product_id
LEFT JOIN tags t ON pt.tag_id = t.id
GROUP BY p.id, p.name, p.type;

-- ============================================
-- ФУНКЦИИ (вместо хранимых процедур MySQL)
-- ============================================

-- Функция: Одобрить проект
CREATE OR REPLACE FUNCTION approve_product(p_product_id INT, p_moderator_id INT)
RETURNS INT AS $$
DECLARE
    affected INT;
BEGIN
    UPDATE products 
    SET status = 'approved', 
        moderated_at = CURRENT_TIMESTAMP, 
        moderator_id = p_moderator_id
    WHERE id = p_product_id AND status = 'pending';
    
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- Функция: Отклонить проект
CREATE OR REPLACE FUNCTION reject_product(p_product_id INT, p_moderator_id INT, p_reason VARCHAR)
RETURNS INT AS $$
DECLARE
    affected INT;
BEGIN
    UPDATE products 
    SET status = 'rejected', 
        moderated_at = CURRENT_TIMESTAMP, 
        moderator_id = p_moderator_id,
        rejection_reason = p_reason
    WHERE id = p_product_id AND status = 'pending';
    
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- Функция: Забанить пользователя
CREATE OR REPLACE FUNCTION ban_user(p_user_id INT, p_reason VARCHAR)
RETURNS INT AS $$
DECLARE
    affected INT;
BEGIN
    UPDATE users 
    SET status = 'banned', 
        ban_reason = p_reason
    WHERE id = p_user_id AND role != 'admin';
    
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ТРИГГЕРЫ
-- ============================================

-- Триггер: Автоматическое обновление last_login при входе
CREATE OR REPLACE FUNCTION update_last_login()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.last_login IS DISTINCT FROM OLD.last_login THEN
        -- Можно добавить логику логирования
        NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_last_login
    AFTER UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_last_login();

    -- Таблица тикетов поддержки
CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    moderator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'closed')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица сообщений в тикетах
CREATE TABLE IF NOT EXISTS support_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'moderator')),
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для производительности
CREATE INDEX idx_tickets_user ON support_tickets(user_id);
CREATE INDEX idx_tickets_moderator ON support_tickets(moderator_id);
CREATE INDEX idx_tickets_status ON support_tickets(status);
CREATE INDEX idx_messages_ticket ON support_messages(ticket_id);