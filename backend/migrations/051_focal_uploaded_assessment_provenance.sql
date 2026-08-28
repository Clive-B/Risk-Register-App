ALTER TABLE risk_assessment_governance
    ADD COLUMN IF NOT EXISTS focal_assessment_status VARCHAR(30) NOT NULL DEFAULT 'Not Supplied',
    ADD COLUMN IF NOT EXISTS focal_source VARCHAR(80),
    ADD COLUMN IF NOT EXISTS focal_source_file VARCHAR(255);

ALTER TABLE risk_assessment_governance
    DROP CONSTRAINT IF EXISTS risk_assessment_focal_status_check;
ALTER TABLE risk_assessment_governance
    ADD CONSTRAINT risk_assessment_focal_status_check CHECK (
        focal_assessment_status IN ('Not Supplied','Pending Confirmation','Confirmed','Returned')
    );

UPDATE risk_assessment_governance
SET focal_assessment_status=CASE
    WHEN focal_score IS NULL THEN 'Not Supplied'
    ELSE 'Confirmed'
END
WHERE focal_assessment_status='Not Supplied';

COMMENT ON COLUMN risk_assessment_governance.focal_assessment_status IS
    'Distinguishes a Focal assessment supplied in an Admin-assisted workbook from a Focal-confirmed submission.';
