-- ============================================================
-- АИС «Lingradable» — физическая структура БД (актуальная)
-- PostgreSQL 18.6
-- ============================================================

-- Удаление существующих объектов
DROP VIEW IF EXISTS v_products_with_tags CASCADE;
DROP VIEW IF EXISTS v_products_with_stats CASCADE;
DROP TABLE IF EXISTS support_messages CASCADE;
DROP TABLE IF EXISTS support_tickets CASCADE;
DROP TABLE IF EXISTS tag_suggestions CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS product_tags CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Удаление enum-ов
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS suggestion_status CASCADE;
DROP TYPE IF EXISTS product_type CASCADE;
DROP TYPE IF EXISTS product_status CASCADE;

-- Удаление функций
DROP FUNCTION IF EXISTS approve_product CASCADE;
DROP FUNCTION IF EXISTS reject_product CASCADE;
DROP FUNCTION IF EXISTS ban_user CASCADE;
DROP FUNCTION IF EXISTS update_last_login CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;

-- ============================================================
-- ENUM-ы
-- ============================================================

CREATE TYPE product_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE product_type AS ENUM ('distro', 'de', 'wm');
CREATE TYPE suggestion_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE user_role AS ENUM ('guest', 'user', 'moderator', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'banned');

-- ============================================================
-- Функции
-- ============================================================

CREATE FUNCTION update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE FUNCTION update_last_login() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.last_login IS DISTINCT FROM OLD.last_login THEN
        NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION approve_product(p_product_id integer, p_moderator_id integer) RETURNS integer
LANGUAGE plpgsql AS $$
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
$$;

CREATE FUNCTION reject_product(p_product_id integer, p_moderator_id integer, p_reason character varying) RETURNS integer
LANGUAGE plpgsql AS $$
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
$$;

CREATE FUNCTION ban_user(p_user_id integer, p_reason character varying) RETURNS integer
LANGUAGE plpgsql AS $$
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
$$;

-- ============================================================
-- Таблицы
-- ============================================================

CREATE TABLE users (
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
    login character varying(50) NOT NULL UNIQUE,
    email character varying(100) NOT NULL UNIQUE,
    password_hash character varying(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'user'::user_role,
    status user_status NOT NULL DEFAULT 'active'::user_status,
    ban_reason character varying(500),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp without time zone,
    CONSTRAINT users_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE users IS 'Пользователи системы';
COMMENT ON COLUMN users.password_hash IS 'Хэш пароля (bcrypt/argon2)';
COMMENT ON COLUMN users.ban_reason IS 'Причина блокировки';

CREATE TABLE products (
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
    name character varying(200) NOT NULL,
    type product_type NOT NULL,
    description text NOT NULL,
    links character varying(1000),
    sha256_hash character(64),
    author_id integer,
    status product_status NOT NULL DEFAULT 'pending'::product_status,
    rejection_reason character varying(500),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    moderated_at timestamp without time zone,
    moderator_id integer,
    icon_url character varying(500),
    CONSTRAINT products_pkey PRIMARY KEY (id),
    CONSTRAINT chk_sha256_length CHECK (((sha256_hash IS NULL) OR (length(sha256_hash) = 64)))
);

COMMENT ON TABLE products IS 'Дистрибутивы, DE и WM';
COMMENT ON COLUMN products.type IS 'Тип: distro (дистрибутив), de (окружение рабочего стола), wm (оконный менеджер)';
COMMENT ON COLUMN products.links IS 'Ссылки на зеркала/GitHub';
COMMENT ON COLUMN products.sha256_hash IS 'SHA256 хэш файла (64 hex символа)';
COMMENT ON COLUMN products.icon_url IS 'URL иконки/логотипа продукта';

CREATE TABLE tags (
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
    name character varying(100) NOT NULL UNIQUE,
    description character varying(500),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tags_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE tags IS 'Теги для классификации продуктов';
COMMENT ON COLUMN tags.description IS 'Описание тега';

CREATE TABLE product_tags (
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
    product_id integer NOT NULL,
    tag_id integer NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT product_tags_pkey PRIMARY KEY (id),
    CONSTRAINT unique_product_tag UNIQUE (product_id, tag_id)
);

COMMENT ON TABLE product_tags IS 'Связь многие ко многим: продукты и теги';

CREATE TABLE reviews (
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
    user_id integer NOT NULL,
    product_id integer NOT NULL,
    rating smallint NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reviews_pkey PRIMARY KEY (id),
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT unique_user_product_review UNIQUE (user_id, product_id)
);

COMMENT ON TABLE reviews IS 'Отзывы пользователей о продуктах';
COMMENT ON COLUMN reviews.rating IS 'Оценка от 1 до 5';

CREATE TABLE comments (
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
    user_id integer NOT NULL,
    product_id integer NOT NULL,
    text text NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone,
    parent_id integer,
    CONSTRAINT comments_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE comments IS 'Комментарии к продуктам';

CREATE TABLE tag_suggestions (
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
    user_id integer NOT NULL,
    product_id integer,
    tag_id integer,
    status suggestion_status NOT NULL DEFAULT 'pending'::suggestion_status,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    moderated_at timestamp without time zone,
    moderator_id integer,
    tag_name character varying(100),
    tag_description character varying(500),
    CONSTRAINT tag_suggestions_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE tag_suggestions IS 'Предложения пользователей по добавлению тегов';

CREATE TABLE support_tickets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    moderator_id integer,
    subject character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT support_tickets_pkey PRIMARY KEY (id),
    CONSTRAINT support_tickets_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'assigned'::character varying, 'closed'::character varying])::text[])))
);

CREATE SEQUENCE support_tickets_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE support_tickets_id_seq OWNED BY support_tickets.id;
ALTER TABLE ONLY support_tickets ALTER COLUMN id SET DEFAULT nextval('support_tickets_id_seq'::regclass);

CREATE TABLE support_messages (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    sender_type character varying(10) NOT NULL,
    sender_id integer NOT NULL,
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT support_messages_pkey PRIMARY KEY (id),
    CONSTRAINT support_messages_sender_type_check CHECK (((sender_type)::text = ANY ((ARRAY['user'::character varying, 'moderator'::character varying])::text[])))
);

CREATE SEQUENCE support_messages_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE support_messages_id_seq OWNED BY support_messages.id;
ALTER TABLE ONLY support_messages ALTER COLUMN id SET DEFAULT nextval('support_messages_id_seq'::regclass);

-- ============================================================
-- Внешние ключи
-- ============================================================

ALTER TABLE ONLY products ADD CONSTRAINT fk_products_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ONLY products ADD CONSTRAINT fk_products_moderator FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ONLY product_tags ADD CONSTRAINT fk_pt_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE ONLY product_tags ADD CONSTRAINT fk_pt_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
ALTER TABLE ONLY reviews ADD CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ONLY reviews ADD CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE ONLY comments ADD CONSTRAINT fk_comments_parent FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE;
ALTER TABLE ONLY tag_suggestions ADD CONSTRAINT fk_ts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ONLY tag_suggestions ADD CONSTRAINT fk_ts_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE ONLY tag_suggestions ADD CONSTRAINT fk_ts_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
ALTER TABLE ONLY tag_suggestions ADD CONSTRAINT fk_ts_moderator FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ONLY support_tickets ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ONLY support_tickets ADD CONSTRAINT support_tickets_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ONLY support_messages ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE;
ALTER TABLE ONLY support_messages ADD CONSTRAINT support_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================
-- Триггеры
-- ============================================================

CREATE TRIGGER comments_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_update_last_login AFTER UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_last_login();

-- ============================================================
-- Индексы
-- ============================================================

CREATE INDEX idx_users_login ON users USING btree (login);
CREATE INDEX idx_users_email ON users USING btree (email);
CREATE INDEX idx_users_role ON users USING btree (role);
CREATE INDEX idx_products_status ON products USING btree (status);
CREATE INDEX idx_products_type ON products USING btree (type);
CREATE INDEX idx_products_author ON products USING btree (author_id);
CREATE INDEX idx_products_sha256 ON products USING btree (sha256_hash);
CREATE INDEX idx_products_fts ON products USING gin (to_tsvector('russian'::regconfig, description));
CREATE INDEX idx_pt_product ON product_tags USING btree (product_id);
CREATE INDEX idx_pt_tag ON product_tags USING btree (tag_id);
CREATE INDEX idx_tags_name ON tags USING btree (name);
CREATE INDEX idx_reviews_user ON reviews USING btree (user_id);
CREATE INDEX idx_reviews_product ON reviews USING btree (product_id);
CREATE INDEX idx_comments_user ON comments USING btree (user_id);
CREATE INDEX idx_comments_product ON comments USING btree (product_id);
CREATE INDEX idx_comments_parent ON comments USING btree (parent_id);
CREATE INDEX idx_comments_created ON comments USING btree (created_at);
CREATE INDEX idx_ts_status ON tag_suggestions USING btree (status);
CREATE INDEX idx_ts_product ON tag_suggestions USING btree (product_id);
CREATE INDEX idx_tickets_user ON support_tickets USING btree (user_id);
CREATE INDEX idx_tickets_moderator ON support_tickets USING btree (moderator_id);
CREATE INDEX idx_tickets_status ON support_tickets USING btree (status);
CREATE INDEX idx_messages_ticket ON support_messages USING btree (ticket_id);

-- ============================================================
-- Представления
-- ============================================================

CREATE VIEW v_products_with_stats AS
SELECT p.id, p.name, p.type, p.description, p.status, u.login AS author_login,
       count(r.id) AS review_count,
       COALESCE(avg(r.rating), (0)::numeric) AS avg_rating,
       p.created_at
FROM ((products p LEFT JOIN users u ON ((p.author_id = u.id)))
      LEFT JOIN reviews r ON ((p.id = r.product_id)))
GROUP BY p.id, p.name, p.type, p.description, p.status, u.login, p.created_at;

CREATE VIEW v_products_with_tags AS
SELECT p.id, p.name, p.type,
       string_agg((t.name)::text, ', '::text) AS tags
FROM ((products p LEFT JOIN product_tags pt ON ((p.id = pt.product_id)))
      LEFT JOIN tags t ON ((pt.tag_id = t.id)))
GROUP BY p.id, p.name, p.type;
