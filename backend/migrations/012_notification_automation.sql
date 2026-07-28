CREATE OR REPLACE FUNCTION create_grc_notification_from_audit() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.entity_type IS NOT NULL THEN
        INSERT INTO notifications (
            user_id,
            title,
            message,
            type,
            category,
            priority,
            entity_type,
            entity_id,
            created_by,
            updated_at
        )
        VALUES (
            NEW.user_id,
            COALESCE(NEW.action, 'System activity logged'),
            COALESCE(NEW.details::text, 'An audit event was recorded.'),
            'System',
            'Audit',
            'Normal',
            NEW.entity_type,
            NEW.entity_id,
            NEW.user_id,
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_grc_notification ON audit_logs;
CREATE TRIGGER trg_audit_grc_notification
AFTER INSERT ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION create_grc_notification_from_audit();
