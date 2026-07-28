ALTER TABLE risks
    ADD COLUMN IF NOT EXISTS control_type VARCHAR(30) NOT NULL DEFAULT 'Not Assessed',
    ADD COLUMN IF NOT EXISTS control_owner VARCHAR(255),
    ADD COLUMN IF NOT EXISTS control_design_adequacy VARCHAR(30) NOT NULL DEFAULT 'Not Assessed',
    ADD COLUMN IF NOT EXISTS control_evidence TEXT,
    ADD COLUMN IF NOT EXISTS control_last_tested_date DATE,
    ADD COLUMN IF NOT EXISTS control_exceptions TEXT,
    ADD COLUMN IF NOT EXISTS control_next_review_date DATE,
    ADD COLUMN IF NOT EXISTS control_assessment_basis TEXT,
    ADD COLUMN IF NOT EXISTS control_assessment_confidence VARCHAR(20) NOT NULL DEFAULT 'Low',
    ADD COLUMN IF NOT EXISTS control_assessed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS control_assessed_at TIMESTAMPTZ;

ALTER TABLE risks
    DROP CONSTRAINT IF EXISTS risks_control_effectiveness_check,
    DROP CONSTRAINT IF EXISTS risks_control_type_check,
    DROP CONSTRAINT IF EXISTS risks_control_design_adequacy_check,
    DROP CONSTRAINT IF EXISTS risks_control_assessment_confidence_check;

UPDATE risks
SET control_effectiveness='Not Assessed'
WHERE control_effectiveness IS NULL OR BTRIM(control_effectiveness)='';

ALTER TABLE risks
    ALTER COLUMN control_effectiveness SET DEFAULT 'Not Assessed',
    ALTER COLUMN control_effectiveness SET NOT NULL,
    ADD CONSTRAINT risks_control_effectiveness_check
        CHECK (control_effectiveness IN ('Effective','Partially Effective','Ineffective','Not Assessed')),
    ADD CONSTRAINT risks_control_type_check
        CHECK (control_type IN ('Preventive','Detective','Corrective','Mixed','Not Assessed')),
    ADD CONSTRAINT risks_control_design_adequacy_check
        CHECK (control_design_adequacy IN ('Adequate','Partially Adequate','Inadequate','Not Assessed')),
    ADD CONSTRAINT risks_control_assessment_confidence_check
        CHECK (control_assessment_confidence IN ('High','Medium','Low'));

CREATE INDEX IF NOT EXISTS idx_risks_control_assurance
    ON risks(control_effectiveness,control_next_review_date);
