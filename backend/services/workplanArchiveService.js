const pool = require('../config/db');

async function purgeExpiredOriginals() {
    try {
        const result = await pool.query(`
            UPDATE workplan_uploads
               SET file_data = NULL,
                   original_purged_at = NOW(),
                   updated_at = NOW()
             WHERE file_data IS NOT NULL
               AND original_expires_at IS NOT NULL
               AND original_expires_at <= NOW()
            RETURNING id
        `);
        if (result.rowCount) console.log(`Purged ${result.rowCount} expired work-plan source workbook(s).`);
    } catch (error) {
        console.error('Work-plan archive retention check failed:', error.message);
    }
}

function start() {
    const initial = setTimeout(purgeExpiredOriginals, 15_000);
    initial.unref?.();
    const timer = setInterval(purgeExpiredOriginals, 24 * 60 * 60 * 1000);
    timer.unref?.();
}

module.exports = { start, purgeExpiredOriginals };
