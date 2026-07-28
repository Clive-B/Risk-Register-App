INSERT INTO actions(
    action_key,module,action_type,title,description,priority,status,assigned_to,
    assigned_by,division,due_at,source_type,source_id,action_url,available_actions,metadata
)
SELECT
    'workplan-champion-batch:' || upload.id || ':' || champion.id,
    'Risk',
    'Review Work Plan Batch',
    'Review all ' || COUNT(risk.id) || ' work-plan risks',
    'One Champion decision is required for the ' || upload.plan_year || ' ' || upload.division || ' work plan before sending it to the Chairman.',
    CASE
        WHEN BOOL_OR(risk.risk_level='Critical') THEN 'Critical'
        WHEN BOOL_OR(risk.risk_level='High') THEN 'High'
        ELSE 'Medium'
    END,
    'Pending',
    champion.id,
    upload.uploaded_by,
    upload.division,
    CURRENT_TIMESTAMP + INTERVAL '3 days',
    'WorkPlanChampionBatch',
    upload.id::text,
    'pages/workplans.html',
    '["view","review","approve"]'::jsonb,
    jsonb_build_object('workplan_id',upload.id,'risk_ids',jsonb_agg(risk.id ORDER BY risk.id))
FROM workplan_uploads upload
JOIN workplan_programmes programme ON programme.upload_id=upload.id
JOIN workplan_actions work_action ON work_action.programme_id=programme.id
JOIN risks risk ON risk.source_workplan_action_id=work_action.id
JOIN users champion ON champion.role='Risk Champion'
                   AND champion.status='Active'
                   AND COALESCE(NULLIF(champion.division,''),champion.directorate)=upload.division
WHERE upload.status='Processed'
  AND risk.workflow_status IN('Submitted','Under Review')
GROUP BY upload.id,upload.plan_year,upload.division,upload.uploaded_by,champion.id
ON CONFLICT(action_key) DO NOTHING;

DELETE FROM notifications notification
USING actions legacy_action
WHERE notification.entity_type='Action'
  AND notification.entity_id=legacy_action.id::text
  AND legacy_action.source_type='WorkPlanRisk'
  AND legacy_action.status IN('Pending','Due Today','Overdue','Waiting for Review','Waiting for Approval','Returned','Escalated');

UPDATE actions
SET status='Cancelled',cancelled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
WHERE source_type='WorkPlanRisk'
  AND status IN('Pending','Due Today','Overdue','Waiting for Review','Waiting for Approval','Returned','Escalated');
