CREATE TABLE IF NOT EXISTS compliance_obligations (
    id SERIAL PRIMARY KEY,
    obligation_code VARCHAR(60) UNIQUE NOT NULL,
    title VARCHAR(240) NOT NULL,
    regulatory_source VARCHAR(240) NOT NULL,
    requirement TEXT NOT NULL,
    division VARCHAR(150) NOT NULL,
    owner VARCHAR(180) NOT NULL,
    frequency VARCHAR(40) NOT NULL DEFAULT 'Annual',
    due_date DATE,
    applicability VARCHAR(20) NOT NULL DEFAULT 'Applicable'
        CHECK (applicability IN ('Applicable','Not Applicable')),
    assessment_status VARCHAR(30) NOT NULL DEFAULT 'Not Assessed'
        CHECK (assessment_status IN ('Not Assessed','Compliant','Partially Compliant','Non-Compliant')),
    evidence_reference TEXT,
    evidence_summary TEXT,
    evidence_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_notes TEXT,
    corrective_action TEXT,
    corrective_due_date DATE,
    assessed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assessed_at TIMESTAMP,
    verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMP,
    record_status VARCHAR(20) NOT NULL DEFAULT 'Active'
        CHECK (record_status IN ('Active','Archived')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compliance_assessment_history (
    id SERIAL PRIMARY KEY,
    obligation_id INTEGER NOT NULL REFERENCES compliance_obligations(id) ON DELETE CASCADE,
    action VARCHAR(30) NOT NULL,
    assessment_status VARCHAR(30) NOT NULL,
    evidence_reference TEXT,
    evidence_verified BOOLEAN NOT NULL DEFAULT FALSE,
    comments TEXT,
    performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    performed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_compliance_obligations_division ON compliance_obligations(division);
CREATE INDEX IF NOT EXISTS idx_compliance_obligations_assessment ON compliance_obligations(applicability,assessment_status,evidence_verified);
CREATE INDEX IF NOT EXISTS idx_compliance_obligations_due ON compliance_obligations(due_date);
