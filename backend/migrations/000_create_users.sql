CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    staff_id VARCHAR(30) UNIQUE,
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(320) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(100) NOT NULL,
    directorate VARCHAR(150),
    phone VARCHAR(30),
    status VARCHAR(20) NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active', 'Inactive', 'Disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, status);
