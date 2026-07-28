CREATE TABLE IF NOT EXISTS treatment_plans (
    id SERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    plan_title VARCHAR(200) NOT NULL,
    treatment_strategy VARCHAR(80) NOT NULL,
    action_owner VARCHAR(150) NOT NULL,
    due_date DATE NOT NULL,
    progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
    status VARCHAR(40) NOT NULL DEFAULT 'Not Started',
    evidence_file_name VARCHAR(255),
    evidence_url TEXT,
    evidence_notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT treatment_strategy_check CHECK (treatment_strategy IN ('Avoid', 'Reduce', 'Transfer', 'Accept')),
    CONSTRAINT treatment_status_check CHECK (status IN ('Not Started', 'In Progress', 'Completed', 'Overdue'))
);

CREATE INDEX IF NOT EXISTS idx_treatment_plans_risk_id ON treatment_plans(risk_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_status ON treatment_plans(status);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_due_date ON treatment_plans(due_date);
