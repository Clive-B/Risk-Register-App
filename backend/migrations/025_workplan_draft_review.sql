ALTER TABLE workplan_risk_assessments
    ADD COLUMN IF NOT EXISTS reviewed_programme TEXT,
    ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_workplan_assessment_updated
    ON workplan_risk_assessments (updated_at DESC)
    WHERE updated_at IS NOT NULL;

COMMENT ON COLUMN workplan_risk_assessments.edit_count IS
    'Number of focal-person review edits made before submission.';
