ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_priority_check;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_priority_check1;

UPDATE notifications
SET priority = CASE
    WHEN priority = 'Medium' THEN 'Normal'
    WHEN priority = 'Information' THEN 'Low'
    ELSE priority
END
WHERE priority IN ('Medium','Information');

ALTER TABLE notifications
    ADD CONSTRAINT notifications_priority_check
    CHECK (priority IN ('Low','Normal','High','Critical'));
