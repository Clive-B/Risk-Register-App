ALTER TABLE risks
ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(40) NOT NULL DEFAULT 'Draft',
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS review_comments TEXT;

ALTER TABLE risks
DROP CONSTRAINT IF EXISTS risks_workflow_status_check;

ALTER TABLE risks
ADD CONSTRAINT risks_workflow_status_check CHECK (workflow_status IN (
    'Draft',
    'Submitted',
    'Approved',
    'Rejected',
    'Returned for Rework'
));

CREATE INDEX IF NOT EXISTS idx_risks_workflow_status ON risks(workflow_status);
CREATE INDEX IF NOT EXISTS idx_risks_reviewed_by ON risks(reviewed_by);
