ALTER TABLE treatment_plans
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) NOT NULL DEFAULT 'Pending Approval',
    ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approval_comments TEXT;

ALTER TABLE treatment_plans
    DROP CONSTRAINT IF EXISTS treatment_plans_approval_status_check;

ALTER TABLE treatment_plans
    ADD CONSTRAINT treatment_plans_approval_status_check
    CHECK (approval_status IN ('Pending Approval','Approved','Returned'));

UPDATE treatment_plans
SET approval_status = CASE
        WHEN lifecycle_status IN ('Active Monitoring','Completed') THEN 'Approved'
        ELSE 'Pending Approval'
    END,
    approved_at = CASE
        WHEN lifecycle_status IN ('Active Monitoring','Completed') THEN COALESCE(approved_at,updated_at)
        ELSE NULL
    END;

CREATE INDEX IF NOT EXISTS idx_treatment_plans_approval_status
    ON treatment_plans(approval_status);
