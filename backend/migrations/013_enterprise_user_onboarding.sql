ALTER TABLE users
ADD COLUMN IF NOT EXISTS activation_status VARCHAR(30) NOT NULL DEFAULT 'Active',
ADD COLUMN IF NOT EXISTS email_status VARCHAR(20) NOT NULL DEFAULT 'Queued',
ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS welcome_email_last_attempt_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

UPDATE users SET activation_status = CASE WHEN status = 'Active' THEN 'Active' ELSE 'Disabled' END
WHERE activation_status IS NULL OR activation_status = '';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_activation_status_check;
ALTER TABLE users ADD CONSTRAINT users_activation_status_check
CHECK (activation_status IN ('Pending Activation', 'Active', 'Locked', 'Disabled'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_status_check;
ALTER TABLE users ADD CONSTRAINT users_email_status_check
CHECK (email_status IN ('Queued', 'Sent', 'Delivered', 'Failed'));

CREATE TABLE IF NOT EXISTS email_deliveries (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    email_type VARCHAR(80) NOT NULL,
    recipient_email VARCHAR(320) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Queued'
        CHECK (status IN ('Queued', 'Sent', 'Delivered', 'Failed')),
    provider_message_id TEXT,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempted_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_user_created ON email_deliveries(user_id, created_at DESC);
