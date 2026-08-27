CREATE TABLE IF NOT EXISTS risk_register_admin_upload_groups (
    id UUID PRIMARY KEY,
    status VARCHAR(40) NOT NULL DEFAULT 'Awaiting Focal Review',
    division_count INTEGER NOT NULL DEFAULT 0,
    total_risks INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT risk_register_admin_upload_group_status_check CHECK (
        status IN ('Awaiting Focal Review','Partially Submitted','Submitted to Champion','Returned')
    )
);

ALTER TABLE risk_register_import_batches
    ADD COLUMN IF NOT EXISTS upload_group_id UUID
        REFERENCES risk_register_admin_upload_groups(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS accountable_focal_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS focal_submitted_by INTEGER
        REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS focal_submitted_at TIMESTAMPTZ;

ALTER TABLE risk_register_import_batches
    DROP CONSTRAINT IF EXISTS risk_register_import_batch_status_check;

ALTER TABLE risk_register_import_batches
    ADD CONSTRAINT risk_register_import_batch_status_check CHECK (
        status IN (
            'Awaiting Focal Review','Champion Review','Awaiting Chairman',
            'Finalised','Returned'
        )
    );

ALTER TABLE risks
    ADD COLUMN IF NOT EXISTS accountable_focal_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_import_batches_focal_status
    ON risk_register_import_batches(accountable_focal_id,status,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_batches_upload_group
    ON risk_register_import_batches(upload_group_id,division,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risks_accountable_focal
    ON risks(accountable_focal_id,import_batch_id,updated_at DESC);
