UPDATE users SET role='Risk Focal Person' WHERE role='Risk Focal';
UPDATE users SET role='Risk Committee Chairman' WHERE role IN (
 'Director General','Deputy Director General','Executive Management Team','Board of Directors',
 'Director','Internal Audit','Enterprise Risk Manager'
);

UPDATE risks SET workflow_status='Accepted' WHERE workflow_status='Approved';
UPDATE risks SET workflow_status='Returned' WHERE workflow_status IN('Returned for Rework','Rejected');
UPDATE risks SET status='Accepted' WHERE status IN('Open','Approved') AND workflow_status='Accepted';
UPDATE risks SET status='Returned' WHERE status IN('Returned for Rework','Rejected');

ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_workflow_status_check;
ALTER TABLE risks ADD CONSTRAINT risks_workflow_status_check CHECK(workflow_status IN(
 'Draft','Submitted','Under Review','Accepted','Returned','Treatment In Progress','Monitoring','Closed'
));
ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_status_check;
ALTER TABLE risks ADD CONSTRAINT risks_status_check CHECK(status IN(
 'Draft','Submitted','Under Review','Accepted','Returned','Treatment In Progress','Monitoring','Closed',
 'Open','In Progress','Mitigated'
));

UPDATE workflow_definition_stages s SET name='Risk Champion Review',approver_role='Risk Champion',escalation_role='Risk Committee Chairman'
FROM workflow_definitions d WHERE s.workflow_definition_id=d.id AND d.workflow_key IN('risk_approval','risk_review');
UPDATE workflow_stage_instances SET approver_role='Risk Champion' WHERE approver_role='Risk Champion';

CREATE INDEX IF NOT EXISTS idx_risks_division_workflow ON risks(division,workflow_status,risk_level);
CREATE INDEX IF NOT EXISTS idx_users_role_division ON users(role,division,status);
ALTER TABLE risks ADD COLUMN IF NOT EXISTS committee_recommendations TEXT;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS executive_comments TEXT;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS committee_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS committee_reviewed_at TIMESTAMPTZ;
