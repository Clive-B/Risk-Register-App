const pool = require('../config/db');
const { logAudit } = require('../utils/auditLogger');

exports.createClientAuditLog = async (req, res) => {
    try {
        await logAudit({
            req,
            action: String(req.body.action || 'CLIENT_EVENT').trim(),
            entityType: String(req.body.entity_type || 'Frontend').trim(),
            entityId: String(req.body.entity_id || req.body.path || '').trim(),
            status: String(req.body.status || 'Info').trim(),
            details: req.body.details || {}
        });

        res.status(201).json({
            success: true,
            message: 'Audit event recorded.'
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Unable to record audit event.'
        });
    }
};

exports.getAuditLogs = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                user_id,
                user_email,
                user_role,
                action,
                entity_type,
                entity_id,
                status,
                ip_address,
                user_agent,
                details,
                created_at
            FROM audit_logs
            ORDER BY created_at DESC
            LIMIT 500
        `);

        res.json({
            success: true,
            auditLogs: result.rows
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Unable to load audit logs.'
        });
    }
};
