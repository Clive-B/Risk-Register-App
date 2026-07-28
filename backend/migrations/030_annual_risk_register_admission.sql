ALTER TABLE risks
    ADD COLUMN IF NOT EXISTS assessment_year INTEGER,
    ADD COLUMN IF NOT EXISTS entry_source VARCHAR(40),
    ADD COLUMN IF NOT EXISTS admission_status VARCHAR(40),
    ADD COLUMN IF NOT EXISTS focal_visibility BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS admitted_by INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS admitted_at TIMESTAMPTZ;

UPDATE risks r
SET assessment_year = COALESCE(r.assessment_year, EXTRACT(YEAR FROM COALESCE(r.date_identified, r.created_at::date))::int),
    entry_source = COALESCE(r.entry_source,
        CASE
            WHEN r.source_workplan_action_id IS NOT NULL THEN 'Work Plan'
            WHEN creator.role = 'Risk Champion' THEN 'Manual - Risk Champion'
            ELSE 'Manual - Risk Focal Person'
        END),
    admission_status = COALESCE(r.admission_status,
        CASE
            WHEN r.workflow_status IN ('Submitted','Under Review') THEN 'Pending Champion Approval'
            WHEN r.workflow_status IN ('Draft','Returned') THEN r.workflow_status
            ELSE 'Admitted'
        END),
    admitted_at = CASE
        WHEN r.workflow_status NOT IN ('Draft','Submitted','Under Review','Returned') THEN COALESCE(r.admitted_at, r.reviewed_at, r.created_at)
        ELSE r.admitted_at
    END
FROM users creator
WHERE creator.id = r.created_by;

UPDATE risks
SET assessment_year = COALESCE(assessment_year, EXTRACT(YEAR FROM CURRENT_DATE)::int),
    entry_source = COALESCE(entry_source, CASE WHEN source_workplan_action_id IS NOT NULL THEN 'Work Plan' ELSE 'Manual - Risk Focal Person' END),
    admission_status = COALESCE(admission_status, CASE WHEN workflow_status IN ('Submitted','Under Review') THEN 'Pending Champion Approval' WHEN workflow_status IN ('Draft','Returned') THEN workflow_status ELSE 'Admitted' END);

ALTER TABLE risks
    ALTER COLUMN assessment_year SET NOT NULL,
    ALTER COLUMN assessment_year SET DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
    ALTER COLUMN entry_source SET NOT NULL,
    ALTER COLUMN entry_source SET DEFAULT 'Imported Workbook',
    ALTER COLUMN admission_status SET NOT NULL,
    ALTER COLUMN admission_status SET DEFAULT 'Admitted';

ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_assessment_year_check;
ALTER TABLE risks ADD CONSTRAINT risks_assessment_year_check CHECK (assessment_year BETWEEN 2020 AND 2100);
ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_entry_source_check;
ALTER TABLE risks ADD CONSTRAINT risks_entry_source_check CHECK (entry_source IN ('Manual - Risk Focal Person','Manual - Risk Champion','Work Plan','Imported Workbook'));
ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_admission_status_check;
ALTER TABLE risks ADD CONSTRAINT risks_admission_status_check CHECK (admission_status IN ('Draft','Pending Champion Approval','Admitted','Returned','Rejected'));

CREATE INDEX IF NOT EXISTS idx_risks_annual_register ON risks(assessment_year, admission_status, division);
CREATE INDEX IF NOT EXISTS idx_risks_entry_source ON risks(entry_source);
