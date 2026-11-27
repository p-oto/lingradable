-- ============================================================
-- Тестовые данные для АИС «Lingradable»
-- Пароль для всех основных аккаунтов: одинаковый хэш
-- ============================================================

-- Пользователи (все с одинаковым хэшем пароля)
INSERT INTO users (login, email, password_hash, role, status) VALUES
('admin', 'admin@lingradable.ru', '$2a$10$VnPjj4ZBCouC3wZQIFWdpOcZ8UEduQgJcgb4ytssdxAe9dlQMTYI6', 'admin', 'active'),
('moderator1', 'mod@example.com', '$2a$10$VnPjj4ZBCouC3wZQIFWdpOcZ8UEduQgJcgb4ytssdxAe9dlQMTYI6', 'moderator', 'active'),
('testuser', 'test@example.com', '$2a$10$VnPjj4ZBCouC3wZQIFWdpOcZ8UEduQgJcgb4ytssdxAe9dlQMTYI6', 'user', 'active'),
('gladfuly', 'lingfuly@gmail.com', '$2a$10$VnPjj4ZBCouC3wZQIFWdpOcZ8UEduQgJcgb4ytssdxAe9dlQMTYI6', 'user', 'active'),
('mod_petrov', 'petrov@lingradable.ru', '$2a$10$VnPjj4ZBCouC3wZQIFWdpOcZ8UEduQgJcgb4ytssdxAe9dlQMTYI6', 'moderator', 'active')
ON CONFLICT (login) DO NOTHING;

-- Теги
INSERT INTO tags (name, description) VALUES
('Для новичков', 'Дистрибутивы и DE, подходящие для начинающих пользователей Linux'),
('Для серверов', 'Решения для серверной инфраструктуры'),
('Минимализм', 'Легковесные WM и DE с минимальным потреблением ресурсов'),
('Для старых ПК', 'Дистрибутивы, работающие на слабом железе'),
('Для гейминга', 'Оптимизированные для игр системы'),
('Для программирования', 'С удобными инструментами для разработки'),
('Стабильность', 'Долгосрочная поддержка (LTS)'),
('Кастомизация', 'Высокая степень настройки интерфейса'),
('Для работы', 'Инструменты для офисной и удаленной работы'),
('Для творчества', 'Программы для дизайна, музыки и видео'),
('Безопасность', 'Системы с упором на приватность и защиту')
ON CONFLICT (name) DO NOTHING;

-- Продукты (официальные)
INSERT INTO products (name, type, description, links, author_id, status, icon_url) VALUES
('Ubuntu 24.04 LTS', 'distro', 'Популярный дистрибутив на базе Debian с GNOME. Идеален для новичков.', 'https://ubuntu.com/download', NULL, 'approved', 'https://cdn.simpleicons.org/ubuntu'),
('Debian 12 Bookworm', 'distro', 'Стабильный и надежный дистрибутив, основа для многих других систем.', 'https://www.debian.org/distrib/', NULL, 'approved', 'https://cdn.simpleicons.org/debian'),
('Arch Linux', 'distro', 'Легковесный rolling-release дистрибутив для опытных пользователей.', 'https://archlinux.org/download/', NULL, 'approved', 'https://cdn.simpleicons.org/archlinux'),
('GNOME 45', 'de', 'Современное окружение рабочего стола с фокусом на простоту.', 'https://www.gnome.org/', NULL, 'approved', 'https://cdn.simpleicons.org/gnome'),
('KDE Plasma 5.27', 'de', 'Мощное и гибкое окружение с невероятными возможностями кастомизации.', 'https://kde.org/plasma-desktop/', NULL, 'approved', 'https://cdn.simpleicons.org/kde'),
('i3', 'wm', 'Тайловый оконный менеджер, ориентированный на продуктивность.', 'https://i3wm.org/', NULL, 'approved', 'https://cdn.simpleicons.org/i3'),
('Hyprland', 'wm', 'Современный динамический тайловый композитор для Wayland.', 'https://hyprland.org/', NULL, 'approved', 'https://cdn.simpleicons.org/hyprland')
ON CONFLICT DO NOTHING;

-- Связи продуктов и тегов
INSERT INTO product_tags (product_id, tag_id)
SELECT p.id, t.id FROM products p, tags t
WHERE (p.name = 'Ubuntu 24.04 LTS' AND t.name = 'Для новичков')
   OR (p.name = 'Ubuntu 24.04 LTS' AND t.name = 'Стабильность')
   OR (p.name = 'Debian 12 Bookworm' AND t.name = 'Для серверов')
   OR (p.name = 'Debian 12 Bookworm' AND t.name = 'Стабильность')
   OR (p.name = 'Arch Linux' AND t.name = 'Для программирования')
   OR (p.name = 'Arch Linux' AND t.name = 'Кастомизация')
   OR (p.name = 'GNOME 45' AND t.name = 'Для новичков')
   OR (p.name = 'KDE Plasma 5.27' AND t.name = 'Кастомизация')
   OR (p.name = 'i3' AND t.name = 'Минимализм')
   OR (p.name = 'i3' AND t.name = 'Для программирования')
   OR (p.name = 'Hyprland' AND t.name = 'Минимализм')
   OR (p.name = 'Hyprland' AND t.name = 'Для гейминга')
ON CONFLICT (product_id, tag_id) DO NOTHING;

-- Отзывы
INSERT INTO reviews (user_id, product_id, rating) VALUES
(3, 1, 5),
(4, 1, 4),
(5, 2, 5),
(3, 3, 5),
(4, 3, 4)
ON CONFLICT (user_id, product_id) DO NOTHING;

-- Комментарии
INSERT INTO comments (user_id, product_id, text) VALUES
(3, 1, 'Отличный дистрибутив для новичков!'),
(4, 1, 'Использую уже 5 лет, очень доволен.'),
(5, 2, 'Debian - это классика. Надежность проверенная временем.')
ON CONFLICT DO NOTHING;

-- Тикеты поддержки
INSERT INTO support_tickets (user_id, subject, status) VALUES
(4, 'Не прикрепляется логотип', 'open'),
(3, 'Вопрос по SHA256-хэшу', 'assigned')
ON CONFLICT DO NOTHING;

-- Сообщения поддержки
INSERT INTO support_messages (ticket_id, sender_type, sender_id, message) VALUES
(2, 'user', 3, 'Здравствуйте! Подскажите, как правильно вычислить SHA256-хэш?'),
(2, 'moderator', 5, 'Добрый день! Используйте команду: sha256sum файл.iso')
ON CONFLICT DO NOTHING;
