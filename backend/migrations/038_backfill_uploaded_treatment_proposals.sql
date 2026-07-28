WITH candidates AS (
    SELECT
        r.*,
        COALESCE(r.target_completion_date,r.next_review_date,CURRENT_DATE + CASE r.risk_level WHEN 'High' THEN 30 WHEN 'Medium' THEN 60 ELSE 90 END) AS proposed_due_date,
        CASE
            WHEN r.risk_treatment='Terminate' THEN 1
            WHEN r.risk_treatment='Treat' THEN GREATEST(1,r.likelihood-1)
            ELSE r.likelihood
        END AS target_likelihood,
        CASE
            WHEN r.risk_treatment='Terminate' THEN 1
            WHEN r.risk_treatment IN('Treat','Transfer') THEN GREATEST(1,r.impact-1)
            ELSE r.impact
        END AS target_impact,
        CASE r.risk_category
            WHEN 'Strategic' THEN 'Assign an executive sponsor, define delivery milestones, review dependencies and report exceptions against corporate objectives.'
            WHEN 'Financial' THEN 'Introduce budget controls, reconciliations, variance thresholds and documented financial review evidence.'
            WHEN 'Operational' THEN 'Document the operating procedure, assign control owners, test continuity arrangements and track corrective actions.'
            WHEN 'Reputational' THEN 'Approve stakeholder communications, monitor public sentiment and maintain an incident escalation and response protocol.'
            WHEN 'Human Capital' THEN 'Confirm workforce capacity, competency, succession, safety and training controls with accountable owners.'
            WHEN 'Regulatory Compliance' THEN 'Map the applicable obligation, assign compliance ownership, test adherence and retain review evidence.'
            WHEN 'Supervision' THEN 'Set supervisory milestones, validate service-provider evidence, track enforcement exceptions and escalate overdue responses.'
            ELSE 'Assign accountable control owners, implementation milestones and monitoring evidence.'
        END AS category_improvement,
        (
            SELECT rh.details->>'file_name'
            FROM risk_history rh
            WHERE rh.risk_id=r.id AND NULLIF(rh.details->>'file_name','') IS NOT NULL
            ORDER BY rh.changed_at
            LIMIT 1
        ) AS source_file
    FROM risks r
    WHERE r.entry_source IN ('Risk Register Tracking Template','Imported Workbook','Work Plan')
      AND NOT EXISTS (SELECT 1 FROM treatment_plans tp WHERE tp.risk_id=r.id)
)
INSERT INTO treatment_plans(
    risk_id,plan_title,treatment_strategy,action_owner,due_date,progress_percent,status,
    evidence_notes,created_by,source_workplan_action_id,plan_origin,lifecycle_status,
    system_proposed_strategy,uploaded_plan,system_improvements,treatment_objective,
    treatment_actions,evidence_required,monitoring_frequency,review_date,
    target_residual_likelihood,target_residual_impact,target_residual_score,source_file_name
)
SELECT
    c.id,
    LEFT('Treatment for ' || c.risk_title,200),
    c.risk_treatment,
    COALESCE(NULLIF(c.responsible_officer,''),NULLIF(c.risk_owner,''),'Risk owner'),
    c.proposed_due_date,
    0,
    'Not Started',
    'Approved action record; owner confirmation; implementation evidence; control test or monitoring result; residual assessment.',
    c.created_by,
    c.source_workplan_action_id,
    c.entry_source,
    CASE
        WHEN c.workflow_status IN('Accepted','Treatment In Progress','Monitoring') THEN 'Active Monitoring'
        WHEN c.entry_source='Work Plan' THEN 'Pending Risk Approval'
        ELSE 'Focal Review'
    END,
    c.risk_treatment,
    CASE WHEN c.entry_source IN('Risk Register Tracking Template','Imported Workbook') THEN c.initial_mitigation_plan END,
    c.category_improvement || ' Target residual score ' || (c.target_likelihood*c.target_impact) || '.',
    'Manage ' || c.risk_title || ' within the approved ' || c.risk_category || ' risk appetite.',
    COALESCE(NULLIF(c.initial_mitigation_plan,''),c.category_improvement),
    'Approved action record; owner confirmation; implementation evidence; control test or monitoring result; residual assessment confirming the target score.',
    CASE
        WHEN c.risk_category IN('Reputational','Regulatory Compliance') OR c.risk_level='High' THEN 'Monthly'
        WHEN c.risk_level='Medium' THEN 'Quarterly'
        ELSE 'Six-monthly'
    END,
    c.proposed_due_date,
    c.target_likelihood,
    c.target_impact,
    c.target_likelihood*c.target_impact,
    c.source_file
FROM candidates c;
