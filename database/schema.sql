-- ============================================================
-- АИС «Lingradable» — физическая структура базы данных
-- СУБД: PostgreSQL 15+
-- ============================================================

-- Удаление таблиц в обратном порядке (с учётом внешних ключей)
DROP TABLE IF EXISTS support_messages CASCADE;
DROP TABLE IF EXISTS support_tickets CASCADE;
DROP TABLE IF EXISTS tag_suggestions CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS product_tags CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- Таблица пользователей
-- ============================================================
CREATE TABLE users (
    id                SERIAL PRIMARY KEY,
    login             VARCHAR(50)  NOT NULL UNIQUE,
    email             VARCHAR(100) NOT NULL UNIQUE,
    password          VARCHAR(255) NOT NULL,  -- bcrypt хэш
    role              VARCHAR(20)  NOT NULL DEFAULT 'user'
                        CHECK (role IN ('user', 'moderator', 'admin')),
    status            VARCHAR(20)  NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'banned')),
    registration_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login        TIMESTAMP WITH TIME ZONE,
    ban_reason        VARCHAR(500)
);

-- ============================================================
-- Таблица продуктов (дистрибутивы, DE, WM)
-- ============================================================
CREATE TABLE products (
    id                SERIAL PRIMARY KEY,
    name              VARCHAR(200) NOT NULL,
    type              VARCHAR(20)  NOT NULL
                        CHECK (type IN ('distro', 'de', 'wm')),
    description       TEXT         NOT NULL,
    link              TEXT,
    icon_url          VARCHAR(500),
    sha256_hash       CHAR(64)     CHECK (sha256_hash ~ '^[a-fA-F0-9]{64}$'),
    author_id         INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    moderator_id      INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    status            VARCHAR(20)  NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
    creation_date     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    moderation_date   TIMESTAMP WITH TIME ZONE,
    rejection_reason  VARCHAR(500)
);

-- ============================================================
-- Таблица тегов (справочник)
-- ============================================================
CREATE TABLE tags (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(500)
);

-- ============================================================
-- Связующая таблица «продукт – тег» (многие-ко-многим)
-- ============================================================
CREATE TABLE product_tags (
    id         SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
    UNIQUE (product_id, tag_id)
);

-- ============================================================
-- Таблица отзывов
-- ============================================================
CREATE TABLE reviews (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    creation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, product_id)
);

-- ============================================================
-- Таблица комментариев (с поддержкой вложенности через parent_id)
-- ============================================================
CREATE TABLE comments (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    parent_id     INTEGER     REFERENCES comments(id)      ON DELETE CASCADE,
    text          TEXT        NOT NULL,
    creation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Таблица предложений тегов (очередь модерации)
-- ============================================================
CREATE TABLE tag_suggestions (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    product_id      INTEGER     REFERENCES products(id)      ON DELETE CASCADE,
    tag_id          INTEGER     REFERENCES tags(id)          ON DELETE CASCADE,
    tag_name        VARCHAR(100),
    tag_description VARCHAR(500),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
    creation_date   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    moderation_date TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- Таблица тикетов поддержки
-- ============================================================
CREATE TABLE support_tickets (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    moderator_id  INTEGER     REFERENCES users(id)         ON DELETE SET NULL,
    subject       VARCHAR(200) NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'assigned', 'closed')),
    creation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date   TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- Таблица сообщений поддержки
-- ============================================================
CREATE TABLE support_messages (
    id            SERIAL PRIMARY KEY,
    ticket_id     INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id)           ON DELETE CASCADE,
    sender_type   VARCHAR(20) NOT NULL
                        CHECK (sender_type IN ('user', 'moderator')),
    text          TEXT        NOT NULL,
    creation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Индексы для ускорения типовых запросов
-- ============================================================
CREATE INDEX idx_products_status      ON products(status);
CREATE INDEX idx_products_type        ON products(type);
CREATE INDEX idx_products_author      ON products(author_id);
CREATE INDEX idx_reviews_product_id   ON reviews(product_id);
CREATE INDEX idx_reviews_user_id      ON reviews(user_id);
CREATE INDEX idx_comments_product_id  ON comments(product_id);
CREATE INDEX idx_comments_user_id     ON comments(user_id);
CREATE INDEX idx_product_tags_tag_id  ON product_tags(tag_id);
CREATE INDEX idx_product_tags_pid     ON product_tags(product_id);
CREATE INDEX idx_tag_suggestions_stat ON tag_suggestions(status);
CREATE INDEX idx_tickets_status       ON support_tickets(status);
CREATE INDEX idx_tickets_moderator    ON support_tickets(moderator_id);
CREATE INDEX idx_messages_ticket      ON support_messages(ticket_id);