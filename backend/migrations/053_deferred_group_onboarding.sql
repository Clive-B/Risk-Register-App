ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_status_check;
ALTER TABLE users ADD CONSTRAINT users_email_status_check
CHECK (email_status IN ('Deferred', 'Queued', 'Sent', 'Delivered', 'Failed'));
