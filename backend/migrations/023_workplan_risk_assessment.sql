CREATE TABLE IF NOT EXISTS workplan_uploads (
    id BIGSERIAL PRIMARY KEY,
    plan_year INTEGER NOT NULL CHECK (plan_year BETWEEN 2020 AND 2100),
    division VARCHAR(150) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    file_data BYTEA NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Submitted','Processed','Rejected')),
    programme_count INTEGER NOT NULL DEFAULT 0,
    action_count INTEGER NOT NULL DEFAULT 0,
    high_critical_count INTEGER NOT NULL DEFAULT 0,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (division, plan_year, file_hash)
);

CREATE TABLE IF NOT EXISTS workplan_programmes (
    id BIGSERIAL PRIMARY KEY,
    upload_id BIGINT NOT NULL REFERENCES workplan_uploads(id) ON DELETE CASCADE,
    programme_number VARCHAR(30),
    strategic_pillar TEXT,
    programme TEXT NOT NULL,
    goal TEXT,
    kpi TEXT,
    target TEXT,
    baseline TEXT,
    budget NUMERIC(16,2),
    source_row INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workplan_actions (
    id BIGSERIAL PRIMARY KEY,
    programme_id BIGINT NOT NULL REFERENCES workplan_programmes(id) ON DELETE CASCADE,
    action_number VARCHAR(30),
    action_point TEXT NOT NULL,
    weight NUMERIC(7,2),
    start_label VARCHAR(80),
    end_label VARCHAR(80),
    due_date DATE,
    source_row INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workplan_risk_assessments (
    id BIGSERIAL PRIMARY KEY,
    action_id BIGINT NOT NULL REFERENCES workplan_actions(id) ON DELETE CASCADE,
    risk_title VARCHAR(200) NOT NULL,
    risk_description TEXT NOT NULL,
    risk_category VARCHAR(80) NOT NULL,
    likelihood INTEGER NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
    impact INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
    risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 1 AND 25),
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('Low','Medium','High','Critical')),
    risk_response VARCHAR(30) NOT NULL,
    treatment_recommendation TEXT NOT NULL,
    assessment_rationale TEXT NOT NULL,
    confidence VARCHAR(20) NOT NULL CHECK (confidence IN ('Low','Medium','High')),
    generated_risk_id INTEGER REFERENCES risks(id) ON DELETE SET NULL,
    generated_treatment_id INTEGER REFERENCES treatment_plans(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE risks ADD COLUMN IF NOT EXISTS source_workplan_action_id BIGINT REFERENCES workplan_actions(id) ON DELETE SET NULL;
ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS source_workplan_action_id BIGINT REFERENCES workplan_actions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS treatment_alerts (
    id BIGSERIAL PRIMARY KEY,
    treatment_plan_id INTEGER NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
    alert_code VARCHAR(60) NOT NULL,
    alert_date DATE NOT NULL DEFAULT CURRENT_DATE,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('Normal','High','Critical')),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (treatment_plan_id, alert_code, alert_date)
);

CREATE INDEX IF NOT EXISTS idx_workplan_uploads_scope ON workplan_uploads(division,plan_year,status);
CREATE INDEX IF NOT EXISTS idx_workplan_programmes_upload ON workplan_programmes(upload_id);
CREATE INDEX IF NOT EXISTS idx_workplan_actions_programme ON workplan_actions(programme_id);
CREATE INDEX IF NOT EXISTS idx_workplan_assessments_action ON workplan_risk_assessments(action_id);
CREATE INDEX IF NOT EXISTS idx_workplan_assessments_level ON workplan_risk_assessments(risk_level);
CREATE INDEX IF NOT EXISTS idx_treatment_alerts_plan_date ON treatment_alerts(treatment_plan_id,alert_date DESC);
