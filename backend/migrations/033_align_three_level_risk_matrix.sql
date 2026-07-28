-- Authoritative NCA matrix:
-- Green / Low: 1-9, Amber / Medium: 10-16, Red / High: 20-25.

ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_level_check;

UPDATE risks
SET risk_level = CASE
    WHEN COALESCE(likelihood, 0) * COALESCE(impact, 0) >= 20 THEN 'High'
    WHEN COALESCE(likelihood, 0) * COALESCE(impact, 0) >= 10 THEN 'Medium'
    ELSE 'Low'
END;

ALTER TABLE risks
    ADD CONSTRAINT risks_level_check
    CHECK (risk_level IN ('Low', 'Medium', 'High'));

ALTER TABLE workplan_risk_assessments
    DROP CONSTRAINT IF EXISTS workplan_risk_assessments_risk_level_check,
    DROP CONSTRAINT IF EXISTS workplan_risk_assessments_system_level_check,
    DROP CONSTRAINT IF EXISTS workplan_risk_assessments_champion_level_check,
    DROP CONSTRAINT IF EXISTS workplan_risk_assessments_chairman_level_check;

UPDATE workplan_risk_assessments
SET risk_level = CASE WHEN risk_score >= 20 THEN 'High' WHEN risk_score >= 10 THEN 'Medium' ELSE 'Low' END,
    system_level = CASE WHEN system_score IS NULL THEN NULL WHEN system_score >= 20 THEN 'High' WHEN system_score >= 10 THEN 'Medium' ELSE 'Low' END,
    champion_level = CASE WHEN champion_score IS NULL THEN NULL WHEN champion_score >= 20 THEN 'High' WHEN champion_score >= 10 THEN 'Medium' ELSE 'Low' END,
    chairman_level = CASE WHEN chairman_score IS NULL THEN NULL WHEN chairman_score >= 20 THEN 'High' WHEN chairman_score >= 10 THEN 'Medium' ELSE 'Low' END;

ALTER TABLE workplan_risk_assessments
    ADD CONSTRAINT workplan_risk_assessments_risk_level_check CHECK (risk_level IN ('Low', 'Medium', 'High')),
    ADD CONSTRAINT workplan_risk_assessments_system_level_check CHECK (system_level IS NULL OR system_level IN ('Low', 'Medium', 'High')),
    ADD CONSTRAINT workplan_risk_assessments_champion_level_check CHECK (champion_level IS NULL OR champion_level IN ('Low', 'Medium', 'High')),
    ADD CONSTRAINT workplan_risk_assessments_chairman_level_check CHECK (chairman_level IS NULL OR chairman_level IN ('Low', 'Medium', 'High'));

UPDATE workplan_uploads upload
SET high_critical_count = (
    SELECT COUNT(*)::int
    FROM workplan_programmes programme
    JOIN workplan_actions action ON action.programme_id = programme.id
    JOIN workplan_risk_assessments assessment ON assessment.action_id = action.id
    WHERE programme.upload_id = upload.id
      AND assessment.risk_level = 'High'
);

UPDATE workflow_instances
SET priority = 'High',
    updated_at = NOW()
WHERE subject_type = 'Risk'
  AND priority = 'Critical';

UPDATE actions
SET priority = 'High',
    updated_at = NOW()
WHERE priority = 'Critical'
  AND source_type IN ('Risk', 'RiskReview', 'WorkPlanRisk', 'CommitteeReview', 'RiskCorrection');
