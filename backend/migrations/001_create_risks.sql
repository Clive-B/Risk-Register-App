CREATE TABLE IF NOT EXISTS risks (
    id SERIAL PRIMARY KEY,
    risk_id VARCHAR(30) UNIQUE NOT NULL,
    risk_title VARCHAR(200) NOT NULL,
    risk_description TEXT NOT NULL,
    risk_category VARCHAR(80) NOT NULL,
    directorate VARCHAR(120) NOT NULL,
    risk_owner VARCHAR(150) NOT NULL,
    likelihood INTEGER NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
    impact INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
    inherent_risk_score INTEGER NOT NULL CHECK (inherent_risk_score BETWEEN 1 AND 25),
    residual_risk_score INTEGER NOT NULL CHECK (residual_risk_score BETWEEN 1 AND 25),
    risk_level VARCHAR(20) NOT NULL,
    existing_controls TEXT,
    risk_treatment VARCHAR(80) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Open',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT risks_directorate_check CHECK (directorate IN (
        'RIPS',
        'Legal',
        'Regulatory Administration',
        'Consumer Affairs',
        'Corporate Affairs',
        'Finance',
        'Engineering',
        'Information Technology',
        'Procurement and Protocol',
        'Internal Audit',
        'Human Resource',
        'ROD',
        'Administration',
        'Cybersecurity',
        'International Affairs'
    )),
    CONSTRAINT risks_level_check CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
    CONSTRAINT risks_status_check CHECK (status IN ('Open', 'In Progress', 'Mitigated', 'Accepted', 'Closed')),
    CONSTRAINT risks_treatment_check CHECK (risk_treatment IN ('Avoid', 'Reduce', 'Transfer', 'Accept'))
);

CREATE INDEX IF NOT EXISTS idx_risks_directorate ON risks(directorate);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks(status);
CREATE INDEX IF NOT EXISTS idx_risks_risk_level ON risks(risk_level);
CREATE INDEX IF NOT EXISTS idx_risks_created_by ON risks(created_by);
