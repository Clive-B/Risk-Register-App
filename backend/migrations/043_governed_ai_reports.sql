CREATE TABLE IF NOT EXISTS ai_report_snapshots (
    id BIGSERIAL PRIMARY KEY,
    report_type VARCHAR(40) NOT NULL,
    division VARCHAR(120),
    period_start DATE,
    period_end DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    report_data JSONB NOT NULL,
    commentary TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalised_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    finalised_at TIMESTAMPTZ,
    CONSTRAINT ai_report_type_check CHECK (
        report_type IN ('Champion Divisional','Chairman Critical')
    ),
    CONSTRAINT ai_report_status_check CHECK (status IN ('Draft','Finalised'))
);

CREATE INDEX IF NOT EXISTS idx_ai_report_snapshots_scope
    ON ai_report_snapshots(report_type,division,created_at DESC);

CREATE TABLE IF NOT EXISTS ai_report_schedules (
    id BIGSERIAL PRIMARY KEY,
    report_type VARCHAR(40) NOT NULL,
    division VARCHAR(120),
    frequency VARCHAR(20) NOT NULL,
    recipient_email VARCHAR(255),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    next_run_at TIMESTAMPTZ NOT NULL,
    last_run_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_report_schedule_type_check CHECK (
        report_type IN ('Champion Divisional','Chairman Critical')
    ),
    CONSTRAINT ai_report_frequency_check CHECK (
        frequency IN ('Weekly','Monthly','Quarterly')
    )
);

CREATE INDEX IF NOT EXISTS idx_ai_report_schedules_due
    ON ai_report_schedules(enabled,next_run_at);
