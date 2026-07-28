CREATE INDEX IF NOT EXISTS idx_risks_updated_at ON risks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_risks_committee_pending
    ON risks(risk_level, updated_at DESC)
    WHERE workflow_status='Accepted' AND committee_reviewed_at IS NULL;
