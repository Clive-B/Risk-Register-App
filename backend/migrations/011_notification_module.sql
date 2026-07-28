CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'notifications'
    ) AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'recipient_user_id'
    ) THEN
        ALTER TABLE notifications RENAME TO notifications_legacy;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(60) NOT NULL DEFAULT 'General',
    category VARCHAR(80) NOT NULL DEFAULT 'General',
    priority VARCHAR(20) NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low','Normal','High','Critical')),
    entity_type VARCHAR(80),
    entity_id VARCHAR(120),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'notifications_legacy'
    ) THEN
        INSERT INTO notifications (
            user_id,
            title,
            message,
            type,
            category,
            priority,
            entity_type,
            entity_id,
            is_read,
            created_at,
            read_at,
            created_by,
            updated_at
        )
        SELECT
            recipient_user_id,
            title,
            message,
            COALESCE(NULLIF(notification_type, ''), 'General'),
            COALESCE(NULLIF(reference_module, ''), 'General'),
            COALESCE(NULLIF(priority, 'Normal'), 'Normal'),
            COALESCE(NULLIF(reference_module, ''), 'General'),
            reference_id,
            is_read,
            created_at,
            read_at,
            created_by,
            created_at
        FROM notifications_legacy;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority, created_at DESC);
