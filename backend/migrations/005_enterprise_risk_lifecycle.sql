ALTER TABLE risks
DROP CONSTRAINT IF EXISTS risks_status_check;

ALTER TABLE risks
DROP CONSTRAINT IF EXISTS risks_treatment_check;

ALTER TABLE risks
DROP CONSTRAINT IF EXISTS risks_workflow_status_check;

ALTER TABLE risks
DROP CONSTRAINT IF EXISTS risks_level_check;

ALTER TABLE risks
ADD COLUMN IF NOT EXISTS business_unit VARCHAR(150),
ADD COLUMN IF NOT EXISTS programme_project VARCHAR(200),
ADD COLUMN IF NOT EXISTS date_identified DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS control_effectiveness VARCHAR(40),
ADD COLUMN IF NOT EXISTS initial_mitigation_plan TEXT,
ADD COLUMN IF NOT EXISTS responsible_officer VARCHAR(150),
ADD COLUMN IF NOT EXISTS target_completion_date DATE,
ADD COLUMN IF NOT EXISTS current_impact INTEGER CHECK (current_impact BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS current_likelihood INTEGER CHECK (current_likelihood BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS current_risk_score INTEGER CHECK (current_risk_score BETWEEN 1 AND 25),
ADD COLUMN IF NOT EXISTS treatment_status VARCHAR(60),
ADD COLUMN IF NOT EXISTS progress_notes TEXT,
ADD COLUMN IF NOT EXISTS next_review_date DATE,
ADD COLUMN IF NOT EXISTS residual_impact INTEGER CHECK (residual_impact BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS residual_likelihood INTEGER CHECK (residual_likelihood BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS residual_score INTEGER CHECK (residual_score BETWEEN 1 AND 25),
ADD COLUMN IF NOT EXISTS closure_date DATE,
ADD COLUMN IF NOT EXISTS closure_comments TEXT,
ADD COLUMN IF NOT EXISTS closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE risks
ALTER COLUMN residual_risk_score DROP NOT NULL;

ALTER TABLE risks
ALTER COLUMN risk_treatment DROP NOT NULL;

ALTER TABLE risks
ADD CONSTRAINT risks_level_check CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
ADD CONSTRAINT risks_status_check CHECK (status IN (
    'Draft',
    'Submitted',
    'Open',
    'In Progress',
    'Mitigated',
    'Accepted',
    'Closed',
    'Rejected',
    'Returned for Rework'
)),
ADD CONSTRAINT risks_treatment_check CHECK (risk_treatment IS NULL OR risk_treatment IN (
    'Avoid',
    'Reduce',
    'Transfer',
    'Share',
    'Accept',
    'Fallback'
)),
ADD CONSTRAINT risks_workflow_status_check CHECK (workflow_status IN (
    'Draft',
    'Submitted',
    'Approved',
    'Rejected',
    'Returned for Rework',
    'Closed'
)),
ADD CONSTRAINT risks_control_effectiveness_check CHECK (
    control_effectiveness IS NULL OR control_effectiveness IN ('Effective', 'Partially Effective', 'Ineffective')
),
ADD CONSTRAINT risks_treatment_status_check CHECK (
    treatment_status IS NULL OR treatment_status IN ('Not Started', 'In Progress', 'Completed', 'Deferred')
);

CREATE TABLE IF NOT EXISTS risk_reviews (
    id SERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    decision VARCHAR(40) NOT NULL CHECK (decision IN ('Approved', 'Rejected', 'Returned for Rework')),
    review_comment TEXT,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risk_attachments (
    id SERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(120),
    file_size INTEGER,
    file_data BYTEA,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risk_history (
    id SERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    action VARCHAR(80) NOT NULL,
    from_status VARCHAR(40),
    to_status VARCHAR(40),
    comment TEXT,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS risk_treatment_updates (
    id SERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    current_impact INTEGER CHECK (current_impact BETWEEN 1 AND 5),
    current_likelihood INTEGER CHECK (current_likelihood BETWEEN 1 AND 5),
    current_risk_score INTEGER CHECK (current_risk_score BETWEEN 1 AND 25),
    progress_notes TEXT,
    treatment_status VARCHAR(60) NOT NULL CHECK (treatment_status IN ('Not Started', 'In Progress', 'Completed', 'Deferred')),
    review_date DATE,
    residual_impact INTEGER CHECK (residual_impact BETWEEN 1 AND 5),
    residual_likelihood INTEGER CHECK (residual_likelihood BETWEEN 1 AND 5),
    residual_score INTEGER CHECK (residual_score BETWEEN 1 AND 25),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_risk_reviews_risk_id ON risk_reviews(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_attachments_risk_id ON risk_attachments(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_history_risk_id ON risk_history(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_treatment_updates_risk_id ON risk_treatment_updates(risk_id);
CREATE INDEX IF NOT EXISTS idx_risks_treatment_status ON risks(treatment_status);
CREATE INDEX IF NOT EXISTS idx_risks_date_identified ON risks(date_identified);
