-- Audit records are evidence, not end-user notifications. The former trigger
-- turned every audit event (including notification reads) into another
-- notification, causing an ever-growing feedback loop.
DROP TRIGGER IF EXISTS trg_audit_grc_notification ON audit_logs;
DROP FUNCTION IF EXISTS create_grc_notification_from_audit();

-- Remove only notifications that can be proven to be copies produced by the
-- retired trigger. Legitimate operational notifications are deliberately left
-- untouched.
DELETE FROM notifications AS notification
USING audit_logs AS audit
WHERE notification.type = 'System'
  AND notification.category = 'Audit'
  AND notification.user_id IS NOT DISTINCT FROM audit.user_id
  AND notification.title = audit.action
  AND notification.message = COALESCE(audit.details::text, 'An audit event was recorded.')
  AND notification.entity_type IS NOT DISTINCT FROM audit.entity_type
  AND notification.entity_id IS NOT DISTINCT FROM audit.entity_id
  AND ABS(EXTRACT(EPOCH FROM (notification.created_at - audit.created_at))) < 2;
