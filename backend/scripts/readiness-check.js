require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { assertRuntimeConfiguration } = require('../config/runtime');

async function main() {
    assertRuntimeConfiguration();

    const pool = require('../config/db');
    const migrationsDirectory = path.join(__dirname, '..', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDirectory).filter(file => file.endsWith('.sql')).sort();

    try {
        const database = await pool.query('SELECT current_database() AS name, CURRENT_TIMESTAMP AS checked_at');
        const applied = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
        const appliedNames = new Set(applied.rows.map(row => row.filename));
        const missing = migrationFiles.filter(file => !appliedNames.has(file));
        if (missing.length) throw new Error(`Pending database migrations: ${missing.join(', ')}`);

        let smtp = 'skipped';
        if (!process.argv.includes('--skip-email')) {
            const { verifyEmailTransport } = require('../services/emailService');
            const verification = await verifyEmailTransport();
            if (verification.configured && verification.verified) {
                smtp = 'verified';
            } else if (process.env.NODE_ENV === 'production') {
                throw new Error('NCA SMTP is not configured or could not be verified.');
            } else {
                smtp = 'not configured (development)';
            }
        }

        console.log(JSON.stringify({
            ready: true,
            environment: process.env.NODE_ENV || 'development',
            database: database.rows[0].name,
            migrations: `${migrationFiles.length}/${migrationFiles.length}`,
            smtp
        }, null, 2));
    } finally {
        await pool.end();
    }
}

main().catch(error => {
    console.error(`READINESS CHECK FAILED\n${error.message}`);
    process.exitCode = 1;
});
