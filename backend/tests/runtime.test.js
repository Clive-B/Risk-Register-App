const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionEnvironment } = require('../config/runtime');

function productionEnvironment(overrides = {}) {
    return {
        NODE_ENV: 'production',
        DB_HOST: 'postgres.nca.org.gh',
        DB_PORT: '5432',
        DB_NAME: 'nca_grc',
        DB_USER: 'nca_grc_app',
        DB_PASSWORD: 'not-a-real-test-password',
        DB_SSL: 'true',
        JWT_SECRET: 'a'.repeat(48),
        COMMUNICATION_ENCRYPTION_KEY: 'b'.repeat(48),
        FRONTEND_URL: 'https://grc.nca.org.gh',
        CORS_ORIGINS: 'https://grc.nca.org.gh',
        SMTP_HOST: 'smtp.nca.org.gh',
        SMTP_PORT: '587',
        SMTP_FROM: 'NCA GRC <no-reply@nca.org.gh>',
        DISABLE_COMMUNICATION_WORKER: 'false',
        DEFAULT_TEMP_PASSWORD: '',
        ...overrides
    };
}

test('complete production environment passes validation', () => {
    assert.deepEqual(validateProductionEnvironment(productionEnvironment()), []);
});

test('production rejects HTTP, shared secrets and non-NCA senders', () => {
    const errors = validateProductionEnvironment(productionEnvironment({
        FRONTEND_URL: 'http://grc.nca.org.gh',
        CORS_ORIGINS: 'http://grc.nca.org.gh',
        COMMUNICATION_ENCRYPTION_KEY: 'a'.repeat(48),
        SMTP_FROM: 'no-reply@example.com',
        DEFAULT_TEMP_PASSWORD: 'SharedPassword1!'
    }));

    assert.ok(errors.some(error => error.includes('HTTPS')));
    assert.ok(errors.some(error => error.includes('must be different')));
    assert.ok(errors.some(error => error.includes('@nca.org.gh')));
    assert.ok(errors.some(error => error.includes('DEFAULT_TEMP_PASSWORD')));
});

test('remote PostgreSQL requires TLS', () => {
    const errors = validateProductionEnvironment(productionEnvironment({ DB_SSL: 'false' }));
    assert.ok(errors.some(error => error.includes('DB_SSL')));
});

test('production permits an approved SMTP relay and rejects incomplete authenticated SMTP', () => {
    assert.deepEqual(validateProductionEnvironment(productionEnvironment({
        SMTP_USER: '',
        SMTP_PASSWORD: ''
    })), []);
    const missingPassword = validateProductionEnvironment(productionEnvironment({
        SMTP_USER: 'nca-grc@nca.org.gh',
        SMTP_PASSWORD: ''
    }));
    assert.ok(missingPassword.some(error => error.includes('SMTP_USER and SMTP_PASSWORD')));
});

test('production rejects invalid SMTP ports and secure-mode values', () => {
    const errors = validateProductionEnvironment(productionEnvironment({
        SMTP_PORT: '70000',
        SMTP_SECURE: 'sometimes'
    }));
    assert.ok(errors.some(error => error.includes('SMTP_PORT')));
    assert.ok(errors.some(error => error.includes('SMTP_SECURE')));
});
