-- ============================================================
-- АИС «Lingradable» — тестовые данные
-- Пароль у всех пользователей: qwerty123
-- ============================================================

-- ============================================================
-- ПОЛЬЗОВАТЕЛИ
-- ============================================================
INSERT INTO users (login, email, password, role, status) VALUES
('admin',     'admin@lingradable.local',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin',     'active'),
('moderator', 'mod@lingradable.local',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'moderator', 'active'),
('testuser',  'user@lingradable.local',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'user',      'active'),
('banned_user', 'banned@lingradable.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'user',      'banned')
ON CONFLICT (login) DO NOTHING;

-- ============================================================
-- ПРОДУКТЫ
-- ============================================================
INSERT INTO products (name, type, description, link, icon_url, sha256_hash, author_id, moderator_id, status, creation_date, moderation_date) VALUES
-- Официальные продукты (добавлены модератором, сразу approved)
('Arch Linux', 'distro',
 'Независимый дистрибутив общего назначения, оптимизированный для x86-64. Следует модели rolling-release.',
 'https://archlinux.org', '/img/logos/arch.png',
 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
 NULL, 1, 'approved', NOW() - INTERVAL '30 days', NOW() - INTERVAL '29 days'),

('Debian', 'distro',
 'Универсальная операционная система на базе ядра Linux. Один из старейших и наиболее уважаемых дистрибутивов.',
 'https://debian.org', '/img/logos/debian.png',
 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
 NULL, 1, 'approved', NOW() - INTERVAL '25 days', NOW() - INTERVAL '24 days'),

('XFCE', 'de',
 'Лёгкое и быстрое окружение рабочего стола для UNIX-подобных систем. Идеально для слабых ПК.',
 'https://xfce.org', '/img/logos/xfce.png',
 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
 NULL, 1, 'approved', NOW() - INTERVAL '20 days', NOW() - INTERVAL '19 days'),

('i3', 'wm',
 'Тайловый оконный менеджер, управляемый клавиатурой. Минималистичный и быстрый.',
 'https://i3wm.org', '/img/logos/i3.png',
 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
 NULL, 1, 'approved', NOW() - INTERVAL '15 days', NOW() - INTERVAL '14 days'),

-- Пользовательский проект на модерации
('MyCustomDistro', 'distro',
 'Кастомная сборка на базе Arch Linux с предустановленными инструментами для разработки.',
 'https://github.com/testuser/mycustom', NULL,
 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
 3, NULL, 'pending', NOW() - INTERVAL '2 days', NULL),

-- Отклонённый проект
('BadProject', 'wm',
 'Проект отклонён за нарушение правил.',
 'https://example.com/bad', NULL,
 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
 3, 2, 'rejected', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ТЕГИ
-- ============================================================
INSERT INTO tags (name, description) VALUES
('Для слабых ПК',    'Продукты, оптимизированные для маломощного оборудования'),
('Для серверов',     'Продукты, подходящие для серверных задач'),
('Минимализм',       'Минималистичные решения без излишеств'),
('Для программирования', 'Продукты с удобным окружением для разработчиков'),
('Rolling Release',  'Дистрибутивы с непрерывным обновлением'),
('Тайловый WM',      'Оконные менеджеры с тайловой компоновкой'),
('Для новичков',     'Продукты с низким порогом входа'),
('Официальный',      'Официально поддерживаемые продукты')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- СВЯЗИ ПРОДУКТОВ И ТЕГОВ
-- ============================================================
INSERT INTO product_tags (product_id, tag_id)
SELECT p.id, t.id FROM products p, tags t
WHERE (p.name = 'Arch Linux'      AND t.name = 'Rolling Release')
   OR (p.name = 'Arch Linux'      AND t.name = 'Для программирования')
   OR (p.name = 'Debian'          AND t.name = 'Для серверов')
   OR (p.name = 'Debian'          AND t.name = 'Официальный')
   OR (p.name = 'XFCE'            AND t.name = 'Для слабых ПК')
   OR (p.name = 'XFCE'            AND t.name = 'Для новичков')
   OR (p.name = 'i3'              AND t.name = 'Минимализм')
   OR (p.name = 'i3'              AND t.name = 'Тайловый WM')
ON CONFLICT (product_id, tag_id) DO NOTHING;

-- ============================================================
-- ОТЗЫВЫ
-- ============================================================
INSERT INTO reviews (user_id, product_id, rating) VALUES
(3, 1, 5),  -- testuser оценил Arch Linux на 5
(3, 2, 4),  -- testuser оценил Debian на 4
(3, 3, 5),  -- testuser оценил XFCE на 5
(2, 1, 4),  -- moderator оценил Arch Linux на 4
(2, 4, 5)   -- moderator оценил i3 на 5
ON CONFLICT (user_id, product_id) DO NOTHING;

-- ============================================================
-- КОММЕНТАРИИ (с вложенностью)
-- ============================================================
INSERT INTO comments (user_id, product_id, parent_id, text) VALUES
-- Корневые комментарии к Arch Linux (product_id = 1)
(3, 1, NULL, 'Отличный дистрибутив! Wiki — лучшая документация в мире Linux.'),
(2, 1, NULL, 'Согласен, но порог входа высок для новичков.'),
-- Ответ на первый комментарий (вложенность 1)
(2, 1, 1,   'Да, зато после установки получаешь именно ту систему, которую хочешь.'),
-- Ответ на ответ (вложенность 2)
(3, 1, 3,   'Именно поэтому я рекомендую начинать с Arch Wiki, даже если ставишь другой дистрибутив.'),
-- Комментарий к XFCE (product_id = 3)
(3, 3, NULL, 'XFCE — мой выбор для старого ноутбука. Работает шустро!')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ПРЕДЛОЖЕНИЯ ТЕГОВ
-- ============================================================
INSERT INTO tag_suggestions (user_id, product_id, tag_id, tag_name, tag_description, status) VALUES
-- Предложение привязать существующий тег к продукту
(3, 5, 4, NULL, NULL, 'pending'),
-- Предложение нового тега
(3, NULL, NULL, 'Для гейминга', 'Продукты, подходящие для игр', 'pending')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ТИКЕТЫ ПОДДЕРЖКИ
-- ============================================================
INSERT INTO support_tickets (user_id, moderator_id, subject, status, creation_date, update_date) VALUES
(3, NULL, 'Не прикрепляется логотип при создании проекта', 'open',
 NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour'),
(3, 2,    'Вопрос по SHA256-хэшу', 'assigned',
 NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;

-- ============================================================
-- СООБЩЕНИЯ ПОДДЕРЖКИ
-- ============================================================
INSERT INTO support_messages (ticket_id, user_id, sender_type, text) VALUES
-- Переписка по второму тикуету (он уже назначен модератору)
(2, 3, 'user',      'Здравствуйте! Подскажите, как правильно вычислить SHA256-хэш ISO-образа?'),
(2, 2, 'moderator', 'Добрый день! На Linux используйте команду: sha256sum файл.iso'),
(2, 3, 'user',      'Спасибо, получилось!')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ГОТОВО. База наполнена тестовыми данными.
-- Логины для входа:
--   admin     / qwerty123  (роль admin)
--   moderator / qwerty123  (роль moderator)
--   testuser  / qwerty123  (роль user)
--   banned_user / qwerty123 (роль user, заблокирован)
-- ============================================================