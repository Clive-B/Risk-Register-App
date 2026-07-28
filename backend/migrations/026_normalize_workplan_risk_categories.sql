UPDATE workplan_risk_assessments
SET risk_category = CASE
    WHEN risk_category = 'Regulatory' THEN 'Compliance'
    WHEN risk_category = 'People' THEN 'Operational'
    ELSE risk_category
END
WHERE risk_category IN ('Regulatory','People');

UPDATE risks
SET risk_category = CASE
    WHEN risk_category = 'Regulatory' THEN 'Compliance'
    WHEN risk_category = 'People' THEN 'Operational'
    ELSE risk_category
END,
updated_at = CURRENT_TIMESTAMP
WHERE source_workplan_action_id IS NOT NULL
  AND risk_category IN ('Regulatory','People');
