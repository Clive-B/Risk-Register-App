const { isValidNcaEmail } = require('./contactValidation');

function extractAddress(value) {
    const sender = String(value || '').trim();
    if (!sender || /[\r\n]/.test(sender)) return '';
    return String((sender.match(/<([^>]+)>/) || [null, sender])[1] || '').trim().toLowerCase();
}

function allowedExternalSenders(env = process.env) {
    return new Set(String(env.SMTP_ALLOWED_EXTERNAL_SENDERS || '')
        .split(',')
        .map(value => extractAddress(value))
        .filter(Boolean));
}

function isAllowedServiceSender(value, env = process.env) {
    const address = extractAddress(value);
    return Boolean(address && (isValidNcaEmail(address) || allowedExternalSenders(env).has(address)));
}

function validateGmailConfiguration({ host, port, username, senderEmail, encryption }) {
    if (String(host || '').trim().toLowerCase() !== 'smtp.gmail.com') return null;
    const user = extractAddress(username);
    const sender = extractAddress(senderEmail);
    if (!user || user !== sender) return 'Gmail SMTP requires the authenticated username to match the approved sender email.';
    const validTransport = (Number(port) === 465 && encryption === 'TLS')
        || (Number(port) === 587 && encryption === 'STARTTLS');
    return validTransport ? null : 'Gmail SMTP must use port 465 with TLS or port 587 with STARTTLS.';
}

module.exports = { extractAddress, allowedExternalSenders, isAllowedServiceSender, validateGmailConfiguration };
