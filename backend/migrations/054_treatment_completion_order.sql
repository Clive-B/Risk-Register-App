ALTER TABLE treatment_plans
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE treatment_plans
SET completed_at = COALESCE(completed_at, updated_at, created_at)
WHERE status = 'Completed' AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_treatment_plans_completed_at
    ON treatment_plans(completed_at DESC)
    WHERE completed_at IS NOT NULL;
