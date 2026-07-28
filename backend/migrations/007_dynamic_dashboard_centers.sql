ALTER TABLE users ADD COLUMN IF NOT EXISTS division VARCHAR(150);
ALTER TABLE risks ADD COLUMN IF NOT EXISTS division VARCHAR(150);
UPDATE risks SET division = COALESCE(NULLIF(division, ''), NULLIF(business_unit, ''), directorate) WHERE division IS NULL OR division = '';

CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(60) NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low','Normal','High','Critical')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    reference_module VARCHAR(80),
    reference_id VARCHAR(80),
    directorate VARCHAR(150),
    division VARCHAR(150)
);

CREATE TABLE IF NOT EXISTS announcements (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low','Normal','High','Critical')),
    publish_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    target_audience VARCHAR(80) NOT NULL DEFAULT 'All',
    directorate VARCHAR(150),
    division VARCHAR(150),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcement_dismissals (
    announcement_id BIGINT REFERENCES announcements(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    dismissed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (announcement_id,user_id)
);

CREATE TABLE IF NOT EXISTS internal_messages (
    id BIGSERIAL PRIMARY KEY,
    sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    message_type VARCHAR(60) NOT NULL DEFAULT 'General',
    reference_module VARCHAR(80),
    reference_id VARCHAR(80),
    directorate VARCHAR(150),
    division VARCHAR(150),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_risks_division ON risks(division);
CREATE INDEX IF NOT EXISTS idx_users_division ON users(division);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id,is_read,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON internal_messages(recipient_user_id,is_read,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(publish_at,expires_at);
