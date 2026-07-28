UPDATE users
SET division = directorate,
    updated_at = CURRENT_TIMESTAMP
WHERE role = 'Risk Focal'
  AND (division IS NULL OR BTRIM(division) = '')
  AND directorate IS NOT NULL
  AND BTRIM(directorate) <> '';

UPDATE risks
SET division = directorate,
    updated_at = CURRENT_TIMESTAMP
WHERE (division IS NULL OR BTRIM(division) = '')
  AND directorate IS NOT NULL
  AND BTRIM(directorate) <> '';
