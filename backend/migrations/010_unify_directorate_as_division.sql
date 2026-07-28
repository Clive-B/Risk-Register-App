UPDATE users
SET division = directorate,
    updated_at = CURRENT_TIMESTAMP
WHERE directorate IS NOT NULL
  AND division IS DISTINCT FROM directorate;

UPDATE risks
SET division = directorate,
    updated_at = CURRENT_TIMESTAMP
WHERE directorate IS NOT NULL
  AND division IS DISTINCT FROM directorate;
