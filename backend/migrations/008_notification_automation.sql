CREATE OR REPLACE FUNCTION create_grc_notification_from_audit() RETURNS TRIGGER AS $$
DECLARE
    event_title TEXT;
    event_type TEXT;
    risk_row RECORD;
BEGIN
    event_type := CASE NEW.action
        WHEN 'RISK_CREATED' THEN 'Risk Created' WHEN 'RISK_SUBMITTED' THEN 'Risk Submitted'
        WHEN 'RISK_APPROVED' THEN 'Risk Approved' WHEN 'RISK_REJECTED' THEN 'Risk Rejected'
        WHEN 'RISK_RETURNED' THEN 'Risk Returned' WHEN 'USER_CREATED' THEN 'User Created'
        WHEN 'PASSWORD_RESET' THEN 'Password Reset' WHEN 'ACCOUNT_LOCK' THEN 'Account Locked'
        WHEN 'ACCOUNT_UNLOCK' THEN 'Account Unlocked' ELSE NULL END;
    IF event_type IS NULL THEN RETURN NEW; END IF;
    event_title := event_type;

    IF NEW.entity_type = 'Risk' AND NEW.entity_id ~ '^[0-9]+$' THEN
        SELECT id,risk_id,risk_title,created_by,directorate,division INTO risk_row FROM risks WHERE id=NEW.entity_id::INTEGER;
        IF risk_row.id IS NOT NULL THEN
            INSERT INTO notifications(recipient_user_id,title,message,notification_type,priority,created_by,reference_module,reference_id,directorate,division)
            SELECT DISTINCT u.id,event_title,event_type || ': ' || risk_row.risk_id || ' - ' || risk_row.risk_title,event_type,
                CASE WHEN event_type IN ('Risk Rejected','Risk Returned') THEN 'High' ELSE 'Normal' END,
                NEW.user_id,'Risk',risk_row.id::TEXT,risk_row.directorate,risk_row.division
            FROM users u WHERE u.status='Active' AND (u.id=risk_row.created_by OR (event_type='Risk Submitted' AND u.role='Risk Champion' AND u.directorate=risk_row.directorate));
        END IF;
    ELSIF NEW.entity_type = 'User' AND NEW.entity_id ~ '^[0-9]+$' THEN
        INSERT INTO notifications(recipient_user_id,title,message,notification_type,priority,created_by,reference_module,reference_id,directorate,division)
        SELECT id,event_title,event_type || ' for your NCA GRC account',event_type,'Normal',NEW.user_id,'User',id::TEXT,directorate,division FROM users WHERE id=NEW.entity_id::INTEGER;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_grc_notification ON audit_logs;
CREATE TRIGGER trg_audit_grc_notification AFTER INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION create_grc_notification_from_audit();
