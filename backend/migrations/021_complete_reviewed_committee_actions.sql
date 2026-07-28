UPDATE actions AS a
SET status = 'Completed',
    completed_at = COALESCE(a.completed_at, r.committee_reviewed_at, CURRENT_TIMESTAMP),
    completed_by = COALESCE(a.completed_by, r.committee_reviewed_by),
    updated_at = CURRENT_TIMESTAMP
FROM risks AS r
WHERE a.source_type = 'CommitteeReview'
  AND a.source_id = r.id::text
  AND r.committee_reviewed_at IS NOT NULL
  AND a.status <> 'Completed';
