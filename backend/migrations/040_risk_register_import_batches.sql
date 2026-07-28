CREATE TABLE IF NOT EXISTS risk_register_import_batches (
    id BIGSERIAL PRIMARY KEY,
    division VARCHAR(100) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    sheet_name VARCHAR(255),
    template_type VARCHAR(100) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Champion Review',
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    champion_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    champion_reviewed_at TIMESTAMPTZ,
    champion_comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT risk_register_import_batch_status_check
        CHECK (status IN ('Champion Review','Awaiting Chairman','Finalised','Returned'))
);

ALTER TABLE risks
    ADD COLUMN IF NOT EXISTS import_batch_id BIGINT
    REFERENCES risk_register_import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_risk_register_import_batches_scope
    ON risk_register_import_batches(division,status,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risks_import_batch
    ON risks(import_batch_id,id);
