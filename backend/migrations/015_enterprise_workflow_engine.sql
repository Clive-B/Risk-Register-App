CREATE TABLE IF NOT EXISTS workflow_definitions (
 id BIGSERIAL PRIMARY KEY, workflow_key VARCHAR(100) NOT NULL UNIQUE, name VARCHAR(150) NOT NULL,
 subject_type VARCHAR(80) NOT NULL, description TEXT, default_sla_hours INTEGER NOT NULL DEFAULT 72,
 allow_self_approval BOOLEAN NOT NULL DEFAULT FALSE, executive_approval_optional BOOLEAN NOT NULL DEFAULT TRUE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE, version INTEGER NOT NULL DEFAULT 1,
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS workflow_definition_stages (
 id BIGSERIAL PRIMARY KEY, workflow_definition_id BIGINT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
 stage_order INTEGER NOT NULL, name VARCHAR(150) NOT NULL, approver_role VARCHAR(100), approver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 sla_hours INTEGER, is_optional BOOLEAN NOT NULL DEFAULT FALSE, escalation_role VARCHAR(100),
 UNIQUE(workflow_definition_id,stage_order)
);
CREATE TABLE IF NOT EXISTS workflow_instances (
 id BIGSERIAL PRIMARY KEY, workflow_definition_id BIGINT NOT NULL REFERENCES workflow_definitions(id),
 subject_type VARCHAR(80) NOT NULL, subject_id TEXT NOT NULL, item_title TEXT NOT NULL,
 requester_id INTEGER NOT NULL REFERENCES users(id), division VARCHAR(150), priority VARCHAR(20) NOT NULL DEFAULT 'Normal',
 status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK(status IN('Pending','Under Review','Approved','Rejected','Returned','Escalated','Cancelled','Completed')),
 current_stage_order INTEGER NOT NULL DEFAULT 1, submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 due_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ, metadata JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_active_subject_unique ON workflow_instances(subject_type,subject_id) WHERE status IN('Pending','Under Review','Escalated');
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status_due ON workflow_instances(status,due_at);
CREATE TABLE IF NOT EXISTS workflow_stage_instances (
 id BIGSERIAL PRIMARY KEY, workflow_instance_id BIGINT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
 definition_stage_id BIGINT NOT NULL REFERENCES workflow_definition_stages(id), stage_order INTEGER NOT NULL, name VARCHAR(150) NOT NULL,
 approver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, approver_role VARCHAR(100),
 status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK(status IN('Pending','Under Review','Approved','Rejected','Returned','Escalated','Skipped','Cancelled')),
 due_at TIMESTAMPTZ, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, delegated_from INTEGER REFERENCES users(id) ON DELETE SET NULL,
 UNIQUE(workflow_instance_id,stage_order)
);
CREATE INDEX IF NOT EXISTS idx_workflow_stage_assignee ON workflow_stage_instances(approver_user_id,status,due_at);
CREATE TABLE IF NOT EXISTS workflow_actions (
 id BIGSERIAL PRIMARY KEY, workflow_instance_id BIGINT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
 stage_instance_id BIGINT REFERENCES workflow_stage_instances(id) ON DELETE SET NULL,
 action VARCHAR(40) NOT NULL, from_status VARCHAR(30), to_status VARCHAR(30), comments TEXT,
 performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL, delegated_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
 signature_metadata JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_workflow_actions_instance ON workflow_actions(workflow_instance_id,created_at);
CREATE TABLE IF NOT EXISTS workflow_attachments (
 id BIGSERIAL PRIMARY KEY, workflow_instance_id BIGINT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
 action_id BIGINT REFERENCES workflow_actions(id) ON DELETE SET NULL, file_name TEXT NOT NULL, file_type TEXT, file_size INTEGER,
 file_data BYTEA NOT NULL, uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS workflow_escalation_rules (
 id BIGSERIAL PRIMARY KEY, workflow_definition_id BIGINT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
 after_hours INTEGER NOT NULL DEFAULT 0, notify_approver BOOLEAN NOT NULL DEFAULT TRUE, notify_supervisor BOOLEAN NOT NULL DEFAULT TRUE,
 notify_administrator BOOLEAN NOT NULL DEFAULT TRUE, notify_executive BOOLEAN NOT NULL DEFAULT FALSE, escalation_role VARCHAR(100), is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO workflow_definitions(workflow_key,name,subject_type,default_sla_hours) VALUES
('risk_approval','Risk Approval','Risk',72),('risk_review','Risk Review','Risk',72),('risk_closure','Risk Closure','Risk',72),
('treatment_approval','Treatment Plan Approval','TreatmentPlan',120),('compliance_approval','Compliance Approval','Compliance',168),
('audit_approval','Audit Approval','Audit',240),('policy_approval','Policy Approval','Policy',120),('executive_approval','Executive Approval','Executive',72)
ON CONFLICT(workflow_key) DO NOTHING;
INSERT INTO workflow_definition_stages(workflow_definition_id,stage_order,name,approver_role,sla_hours,escalation_role)
SELECT id,1,'Risk Champion Review','Risk Champion',default_sla_hours,'System Administrator' FROM workflow_definitions d
WHERE workflow_key IN('risk_approval','risk_review','risk_closure') AND NOT EXISTS(SELECT 1 FROM workflow_definition_stages s WHERE s.workflow_definition_id=d.id);
INSERT INTO workflow_definition_stages(workflow_definition_id,stage_order,name,approver_role,sla_hours,escalation_role)
SELECT id,1,'Administrator Review','System Administrator',default_sla_hours,'System Administrator' FROM workflow_definitions d
WHERE workflow_key NOT IN('risk_approval','risk_review','risk_closure') AND NOT EXISTS(SELECT 1 FROM workflow_definition_stages s WHERE s.workflow_definition_id=d.id);
INSERT INTO workflow_escalation_rules(workflow_definition_id,after_hours,escalation_role)
SELECT id,0,'System Administrator' FROM workflow_definitions d WHERE NOT EXISTS(SELECT 1 FROM workflow_escalation_rules r WHERE r.workflow_definition_id=d.id);
