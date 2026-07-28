ALTER TABLE treatment_plans
    ADD COLUMN IF NOT EXISTS champion_approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS champion_approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS champion_approval_comments TEXT,
    ADD COLUMN IF NOT EXISTS committee_returned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS committee_returned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS committee_return_comments TEXT;

ALTER TABLE treatment_plans
    DROP CONSTRAINT IF EXISTS treatment_plans_approval_status_check;

UPDATE treatment_plans
SET champion_approved_by=COALESCE(champion_approved_by,approved_by),
    champion_approved_at=COALESCE(champion_approved_at,approved_at),
    champion_approval_comments=COALESCE(champion_approval_comments,approval_comments),
    approval_status=CASE
        WHEN approval_status='Approved' THEN 'Pending Committee Approval'
        WHEN approval_status='Pending Approval' THEN 'Pending Champion Approval'
        ELSE approval_status
    END,
    approved_by=NULL,
    approved_at=NULL,
    approval_comments=NULL;

ALTER TABLE treatment_plans
    ADD CONSTRAINT treatment_plans_approval_status_check
    CHECK (approval_status IN (
        'Pending Champion Approval',
        'Pending Committee Approval',
        'Approved',
        'Returned'
    ));

ALTER TABLE treatment_plans
    ALTER COLUMN approval_status SET DEFAULT 'Pending Champion Approval';

CREATE INDEX IF NOT EXISTS idx_treatment_plans_committee_queue
    ON treatment_plans(approval_status,risk_id)
    WHERE approval_status='Pending Committee Approval';
