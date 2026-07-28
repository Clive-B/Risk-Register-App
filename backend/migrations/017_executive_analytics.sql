CREATE TABLE IF NOT EXISTS executive_dashboard_preferences (
 id BIGSERIAL PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 layout JSONB NOT NULL DEFAULT '[]', hidden_widgets TEXT[] NOT NULL DEFAULT '{}',
 default_dashboard VARCHAR(30) NOT NULL DEFAULT 'Executive' CHECK(default_dashboard IN('Executive','Board','Operational')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_risks_created_month ON risks(created_at,workflow_status,risk_level);
CREATE INDEX IF NOT EXISTS idx_risks_closed_month ON risks(closure_date) WHERE closure_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_risks_heatmap ON risks(likelihood,impact);
CREATE INDEX IF NOT EXISTS idx_treatment_due_status ON treatment_plans(due_date,status);
CREATE INDEX IF NOT EXISTS idx_workflow_analytics ON workflow_instances(submitted_at,completed_at,status);
