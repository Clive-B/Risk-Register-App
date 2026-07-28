CREATE TABLE IF NOT EXISTS actions (
 id BIGSERIAL PRIMARY KEY, action_key VARCHAR(180) NOT NULL UNIQUE, module VARCHAR(80) NOT NULL,
 action_type VARCHAR(100) NOT NULL, title VARCHAR(220) NOT NULL, description TEXT,
 priority VARCHAR(20) NOT NULL DEFAULT 'Medium' CHECK(priority IN('Critical','High','Medium','Low','Information')),
 status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK(status IN('Pending','Due Today','Overdue','Completed','Cancelled','Waiting for Review','Waiting for Approval','Returned','Escalated')),
 assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL, assigned_role VARCHAR(100), division VARCHAR(150),
 assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL, due_at TIMESTAMPTZ,
 source_type VARCHAR(80), source_id TEXT, workflow_instance_id BIGINT REFERENCES workflow_instances(id) ON DELETE SET NULL,
 action_url TEXT, available_actions JSONB NOT NULL DEFAULT '[]', metadata JSONB NOT NULL DEFAULT '{}',
 notification_enabled BOOLEAN NOT NULL DEFAULT TRUE, email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 completed_at TIMESTAMPTZ, completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 cancelled_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_actions_assignee_status ON actions(assigned_to,status,due_at);
CREATE INDEX IF NOT EXISTS idx_actions_role_division ON actions(assigned_role,division,status,due_at);
CREATE INDEX IF NOT EXISTS idx_actions_source ON actions(source_type,source_id);
CREATE TABLE IF NOT EXISTS action_history(
 id BIGSERIAL PRIMARY KEY,action_id BIGINT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
 event VARCHAR(50) NOT NULL,from_status VARCHAR(30),to_status VARCHAR(30),comments TEXT,
 performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,metadata JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_action_history_action ON action_history(action_id,created_at DESC);
CREATE TABLE IF NOT EXISTS action_comments(id BIGSERIAL PRIMARY KEY,action_id BIGINT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,comment TEXT NOT NULL,created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
