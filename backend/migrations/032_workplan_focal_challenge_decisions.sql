ALTER TABLE workplan_risk_assessments
    ADD COLUMN IF NOT EXISTS champion_focal_decision VARCHAR(20),
    ADD COLUMN IF NOT EXISTS champion_decision_reason TEXT;

ALTER TABLE workplan_risk_assessments
    DROP CONSTRAINT IF EXISTS workplan_assessment_champion_focal_decision_check;
ALTER TABLE workplan_risk_assessments
    ADD CONSTRAINT workplan_assessment_champion_focal_decision_check
    CHECK (champion_focal_decision IS NULL OR champion_focal_decision IN ('Approved','Rejected'));

COMMENT ON COLUMN workplan_risk_assessments.champion_focal_decision IS
    'Explicit Risk Champion decision on a Focal Person likelihood/impact challenge.';
COMMENT ON COLUMN workplan_risk_assessments.champion_decision_reason IS
    'Champion reason for approving or rejecting the Focal Person proposal; mandatory on rejection.';

CREATE INDEX IF NOT EXISTS idx_workplan_unresolved_focal_challenges
    ON workplan_risk_assessments (id)
    WHERE focal_score IS NOT NULL AND champion_focal_decision IS NULL;
