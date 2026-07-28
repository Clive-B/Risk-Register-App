const pool = require('../config/db');

async function logAudit({
    req,
    user = null,
    action,
    entityType = null,
    entityId = null,
    status = 'Success',
    details = {}
}) {
    try {
        const actor = user || req?.user || {};

        await pool.query(
            `
            INSERT INTO audit_logs (
                user_id,
                user_email,
                user_role,
                action,
                entity_type,
                entity_id,
                status,
                ip_address,
                user_agent,
                details
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            `,
            [
                actor.id || null,
                actor.email || null,
                actor.role || null,
                action,
                entityType,
                entityId ? String(entityId) : null,
                status,
                req?.ip || null,
                req?.headers?.['user-agent'] || null,
                details
            ]
        );
    } catch (error) {
        console.error('Audit logging failed:', error.message);
    }
}

module.exports = {
    logAudit
};
