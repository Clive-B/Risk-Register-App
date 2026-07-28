require('dotenv').config();
const pool = require('../config/db');

async function verify() {
    const [auditCopies, byKind, trigger] = await Promise.all([
        pool.query("SELECT COUNT(*)::int AS count FROM notifications WHERE type = 'System' AND category = 'Audit'"),
        pool.query('SELECT category, type, COUNT(*)::int AS count FROM notifications GROUP BY category, type ORDER BY category, type'),
        pool.query("SELECT COUNT(*)::int AS count FROM pg_trigger WHERE tgname = 'trg_audit_grc_notification'")
    ]);

    const result = {
        remainingUnmatchedAuditSystemRecords: auditCopies.rows[0].count,
        notificationGroups: byKind.rows,
        retiredTriggerCount: trigger.rows[0].count
    };
    console.log(JSON.stringify(result,null,2));

    if (result.retiredTriggerCount !== 0) {
        throw new Error('The retired audit notification trigger is still installed.');
    }
}

verify()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
