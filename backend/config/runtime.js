const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const { isAllowedServiceSender, validateGmailConfiguration } = require('../utils/emailSenderPolicy');

function truthy(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function splitOrigins(value) {
    return String(value || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
}

function validateProductionEnvironment(env = process.env) {
    if (env.NODE_ENV !== 'production') return [];

    const errors = [];
    const required = [
        'DB_HOST',
        'DB_PORT',
        'DB_NAME',
        'DB_USER',
        'DB_PASSWORD',
        'JWT_SECRET',
        'COMMUNICATION_ENCRYPTION_KEY',
        'FRONTEND_URL',
        'CORS_ORIGINS',
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_FROM'
    ];

    for (const key of required) {
        if (!String(env[key] || '').trim()) errors.push(`${key} is required in production.`);
    }

    if (String(env.JWT_SECRET || '').length < 32) errors.push('JWT_SECRET must contain at least 32 characters.');
    if (String(env.COMMUNICATION_ENCRYPTION_KEY || '').length < 32) {
        errors.push('COMMUNICATION_ENCRYPTION_KEY must contain at least 32 characters.');
    }
    if (env.JWT_SECRET && env.JWT_SECRET === env.COMMUNICATION_ENCRYPTION_KEY) {
        errors.push('JWT_SECRET and COMMUNICATION_ENCRYPTION_KEY must be different.');
    }

    let frontendUrl;
    try {
        frontendUrl = new URL(env.FRONTEND_URL);
        if (frontendUrl.protocol !== 'https:') errors.push('FRONTEND_URL must use HTTPS in production.');
    } catch (_) {
        errors.push('FRONTEND_URL must be a valid absolute URL.');
    }

    const origins = splitOrigins(env.CORS_ORIGINS);
    if (!origins.length || origins.some(origin => origin === '*' || !origin.startsWith('https://'))) {
        errors.push('CORS_ORIGINS must contain explicit HTTPS origins only.');
    }
    if (frontendUrl && !origins.includes(frontendUrl.origin)) {
        errors.push('CORS_ORIGINS must include the FRONTEND_URL origin.');
    }

    const databaseHost = String(env.DB_HOST || '').trim().toLowerCase();
    if (!LOOPBACK_HOSTS.has(databaseHost) && !truthy(env.DB_SSL)) {
        errors.push('DB_SSL must be true when PostgreSQL is hosted on another server.');
    }

    const from = String(env.SMTP_FROM || '').trim();
    const fromAddress = (from.match(/<([^>]+)>/) || [null, from])[1];
    if (fromAddress && !isAllowedServiceSender(fromAddress, env)) {
        errors.push('SMTP_FROM must use an official @nca.org.gh address or an exact address in SMTP_ALLOWED_EXTERNAL_SENDERS.');
    }
    const smtpPort = Number(env.SMTP_PORT);
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
        errors.push('SMTP_PORT must be a valid TCP port between 1 and 65535.');
    }
    const smtpUser = String(env.SMTP_USER || '').trim();
    const smtpPassword = String(env.SMTP_PASSWORD || '').trim();
    if (Boolean(smtpUser) !== Boolean(smtpPassword)) {
        errors.push('SMTP_USER and SMTP_PASSWORD must either both be supplied for authenticated SMTP or both be blank for an approved NCA relay.');
    }
    const encryption = String(env.SMTP_SECURE).trim().toLowerCase() === 'true' ? 'TLS' : 'STARTTLS';
    const gmailError = validateGmailConfiguration({
        host: env.SMTP_HOST, port: smtpPort, username: smtpUser, senderEmail: fromAddress, encryption
    });
    if (gmailError) errors.push(gmailError);
    if (env.SMTP_SECURE !== undefined && !['true','false'].includes(String(env.SMTP_SECURE).trim().toLowerCase())) {
        errors.push('SMTP_SECURE must be true or false.');
    }
    if (truthy(env.DISABLE_COMMUNICATION_WORKER)) {
        errors.push('DISABLE_COMMUNICATION_WORKER must be false in production.');
    }
    if (String(env.DEFAULT_TEMP_PASSWORD || '').trim()) {
        errors.push('DEFAULT_TEMP_PASSWORD must not be configured; temporary passwords are generated per user.');
    }

    return errors;
}

function assertRuntimeConfiguration(env = process.env) {
    const errors = validateProductionEnvironment(env);
    if (errors.length) {
        const error = new Error(`Production configuration is invalid:\n- ${errors.join('\n- ')}`);
        error.code = 'INVALID_PRODUCTION_CONFIGURATION';
        throw error;
    }
}

module.exports = { assertRuntimeConfiguration, splitOrigins, truthy, validateProductionEnvironment };
