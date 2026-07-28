require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function ensureMigrationsTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) UNIQUE NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function runMigrations() {
    const client = await pool.connect();
    const migrationsDir = path.join(__dirname, '..', 'migrations');

    try {
        await ensureMigrationsTable(client);

        const files = fs
            .readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        for (const file of files) {
            const applied = await client.query(
                'SELECT id FROM schema_migrations WHERE filename = $1',
                [file]
            );

            if (applied.rows.length > 0) {
                console.log(`Skipping ${file}`);
                continue;
            }

            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

            await client.query('BEGIN');
            await client.query(sql);
            await client.query(
                'INSERT INTO schema_migrations (filename) VALUES ($1)',
                [file]
            );
            await client.query('COMMIT');

            console.log(`Applied ${file}`);
        }
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations();
