ALTER TABLE workplan_uploads
    ALTER COLUMN file_data DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS json_snapshot_gzip BYTEA,
    ADD COLUMN IF NOT EXISTS snapshot_encoding VARCHAR(30) NOT NULL DEFAULT 'gzip-json-v1',
    ADD COLUMN IF NOT EXISTS source_size_bytes INTEGER,
    ADD COLUMN IF NOT EXISTS snapshot_size_bytes INTEGER,
    ADD COLUMN IF NOT EXISTS original_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS original_purged_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE workplan_risk_assessments
    ADD COLUMN IF NOT EXISTS intelligent_recommendation JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_workplan_archive_lookup
    ON workplan_uploads (division, plan_year DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workplan_original_retention
    ON workplan_uploads (original_expires_at)
    WHERE file_data IS NOT NULL;

COMMENT ON COLUMN workplan_uploads.json_snapshot_gzip IS
    'Gzip-compressed canonical JSON snapshot used to reconstruct and analyse the uploaded work plan.';
COMMENT ON COLUMN workplan_uploads.file_data IS
    'Temporary original workbook retained according to the configured evidential retention period.';
COMMENT ON COLUMN workplan_risk_assessments.intelligent_recommendation IS
    'Traceable recommendation derived from successful historical risks and treatments, or a declared baseline when no match exists.';
