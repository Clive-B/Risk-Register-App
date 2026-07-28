require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const apiBase = process.env.API_URL || 'http://127.0.0.1:3000/api';
const email = 'test.admin@nca.org.gh';

async function request(path, options = {}, token = '') {
    const response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
            ...(options.body ? {'Content-Type': 'application/json'} : {}),
            ...(token ? {Authorization: `Bearer ${token}`} : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json();
    if (!response.ok || payload.success !== true) {
        throw new Error(`${path} failed (${response.status}): ${payload.message || 'Unknown error'}`);
    }
    return payload.data === undefined ? payload : payload.data;
}

async function run() {
    const password = String(process.env.TEST_USER_PASSWORD || '');
    if (!password) throw new Error('TEST_USER_PASSWORD is not configured.');

    const accountResult = await pool.query(
        'SELECT password_hash FROM users WHERE LOWER(email)=LOWER($1) AND role=$2',
        [email, 'System Administrator']
    );
    const account = accountResult.rows[0];
    if (!account || !(await bcrypt.compare(password, account.password_hash))) {
        throw new Error('Configured test administrator credential does not match the stored account; login was not attempted.');
    }

    const login = await request('/auth/login', {method: 'POST', body: {email, password}});
    const audit = await request('/audit-logs', {}, login.token);
    const settings = await request('/system-settings/overview', {}, login.token);

    if (!Array.isArray(audit.auditLogs)) throw new Error('Audit Logs did not return a governed event list.');
    if (!settings.passwordPolicy || !settings.users || !settings.migrations) {
        throw new Error('System Settings did not return the expected safe configuration overview.');
    }

    await request('/auth/logout', {method: 'POST'}, login.token);
    console.log(JSON.stringify({
        verified: true,
        auditEventsAvailable: audit.auditLogs.length,
        settingsSections: ['security', 'platform', 'email', 'administration']
    }, null, 2));
}

run()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
