ALTER TABLE treatment_plans
    ADD COLUMN IF NOT EXISTS plan_origin VARCHAR(80) NOT NULL DEFAULT 'Manual',
    ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(40) NOT NULL DEFAULT 'Active Monitoring',
    ADD COLUMN IF NOT EXISTS system_proposed_strategy VARCHAR(40),
    ADD COLUMN IF NOT EXISTS uploaded_plan TEXT,
    ADD COLUMN IF NOT EXISTS system_improvements TEXT,
    ADD COLUMN IF NOT EXISTS treatment_objective TEXT,
    ADD COLUMN IF NOT EXISTS treatment_actions TEXT,
    ADD COLUMN IF NOT EXISTS evidence_required TEXT,
    ADD COLUMN IF NOT EXISTS monitoring_frequency VARCHAR(60),
    ADD COLUMN IF NOT EXISTS review_date DATE,
    ADD COLUMN IF NOT EXISTS target_residual_likelihood INTEGER,
    ADD COLUMN IF NOT EXISTS target_residual_impact INTEGER,
    ADD COLUMN IF NOT EXISTS target_residual_score INTEGER,
    ADD COLUMN IF NOT EXISTS source_file_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS source_excel_row INTEGER,
    ADD COLUMN IF NOT EXISTS focal_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS focal_reviewed_at TIMESTAMPTZ;

ALTER TABLE treatment_plans
    DROP CONSTRAINT IF EXISTS treatment_plans_target_residual_likelihood_check,
    DROP CONSTRAINT IF EXISTS treatment_plans_target_residual_impact_check,
    DROP CONSTRAINT IF EXISTS treatment_plans_target_residual_score_check,
    DROP CONSTRAINT IF EXISTS treatment_plans_lifecycle_status_check;

ALTER TABLE treatment_plans
    ADD CONSTRAINT treatment_plans_target_residual_likelihood_check
        CHECK (target_residual_likelihood IS NULL OR target_residual_likelihood BETWEEN 1 AND 5),
    ADD CONSTRAINT treatment_plans_target_residual_impact_check
        CHECK (target_residual_impact IS NULL OR target_residual_impact BETWEEN 1 AND 5),
    ADD CONSTRAINT treatment_plans_target_residual_score_check
        CHECK (target_residual_score IS NULL OR target_residual_score BETWEEN 1 AND 25),
    ADD CONSTRAINT treatment_plans_lifecycle_status_check
        CHECK (lifecycle_status IN (
            'System Proposed','Focal Review','Focal Reviewed',
            'Pending Risk Approval','Active Monitoring','Completed','Deferred'
        ));

UPDATE treatment_plans tp
SET system_proposed_strategy = COALESCE(tp.system_proposed_strategy, tp.treatment_strategy),
    treatment_actions = COALESCE(NULLIF(tp.treatment_actions, ''), NULLIF(tp.evidence_notes, ''), r.initial_mitigation_plan),
    treatment_objective = COALESCE(NULLIF(tp.treatment_objective, ''), 'Reduce or monitor the linked risk within the approved ERM appetite.'),
    monitoring_frequency = COALESCE(NULLIF(tp.monitoring_frequency, ''), CASE r.risk_level WHEN 'High' THEN 'Monthly' WHEN 'Medium' THEN 'Quarterly' ELSE 'Six-monthly' END),
    review_date = COALESCE(tp.review_date, tp.due_date),
    plan_origin = CASE WHEN tp.source_workplan_action_id IS NOT NULL THEN 'Work Plan' ELSE tp.plan_origin END,
    lifecycle_status = CASE
        WHEN tp.status = 'Completed' THEN 'Completed'
        WHEN r.workflow_status IN ('Accepted','Treatment In Progress','Monitoring') THEN 'Active Monitoring'
        ELSE 'Pending Risk Approval'
    END
FROM risks r
WHERE r.id = tp.risk_id;

CREATE INDEX IF NOT EXISTS idx_treatment_plans_lifecycle
    ON treatment_plans(lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_treatment_plans_origin
    ON treatment_plans(plan_origin);
