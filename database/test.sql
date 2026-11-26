-- Администратор / пароль: admin123
INSERT INTO users (login, email, password, role, status) VALUES
('admin', 'admin@lingradable.local',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
 'admin', 'active')
ON CONFLICT (login) DO NOTHING;

-- Модератор / пароль: moderator123
INSERT INTO users (login, email, password, role, status) VALUES
('moderator', 'mod@lingradable.local',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
 'moderator', 'active')
ON CONFLICT (login) DO NOTHING;

-- Обычный пользователь / пароль: user123
INSERT INTO users (login, email, password, role, status) VALUES
('testuser', 'user@lingradable.local',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
 'user', 'active')
ON CONFLICT (login) DO NOTHING;