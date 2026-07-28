const { Pool } = require('pg');
const { truthy } = require('./runtime');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 5432),
    max: Number(process.env.DB_POOL_MAX || 20),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000),
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 30000),
    application_name: process.env.DB_APPLICATION_NAME || 'nca-grc-api',
    ssl: truthy(process.env.DB_SSL)
        ? {
            rejectUnauthorized: !truthy(process.env.DB_SSL_ALLOW_SELF_SIGNED),
            ca: process.env.DB_SSL_CA || undefined
        }
        : false
});

module.exports = pool;
