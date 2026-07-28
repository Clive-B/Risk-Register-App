UPDATE treatment_plans AS tp
SET progress_percent = 100,
    status = 'Completed',
    updated_at = CURRENT_TIMESTAMP
FROM risks AS r
WHERE r.id = tp.risk_id
  AND (r.treatment_status = 'Completed' OR r.workflow_status IN ('Monitoring','Closed'))
  AND (tp.progress_percent <> 100 OR tp.status <> 'Completed');
