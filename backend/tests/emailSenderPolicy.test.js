const test = require('node:test');
const assert = require('node:assert/strict');
const { extractAddress, isAllowedServiceSender, validateGmailConfiguration } = require('../utils/emailSenderPolicy');

test('service sender policy allows NCA mail and only exact configured external addresses', () => {
    const env = { SMTP_ALLOWED_EXTERNAL_SENDERS: 'ncariskmanagementsystem@gmail.com' };
    assert.equal(extractAddress('Risk Management System <NCARiskManagementSystem@gmail.com>'), 'ncariskmanagementsystem@gmail.com');
    assert.equal(isAllowedServiceSender('no-reply@nca.org.gh', env), true);
    assert.equal(isAllowedServiceSender('ncariskmanagementsystem@gmail.com', env), true);
    assert.equal(isAllowedServiceSender('another@gmail.com', env), false);
});

test('Gmail service account requires matching identity and approved encrypted ports', () => {
    const base = {
        host: 'smtp.gmail.com', port: 465, username: 'ncariskmanagementsystem@gmail.com',
        senderEmail: 'ncariskmanagementsystem@gmail.com', encryption: 'TLS'
    };
    assert.equal(validateGmailConfiguration(base), null);
    assert.equal(validateGmailConfiguration({ ...base, port: 587, encryption: 'STARTTLS' }), null);
    assert.match(validateGmailConfiguration({ ...base, username: 'another@gmail.com' }), /match/);
    assert.match(validateGmailConfiguration({ ...base, port: 25 }), /465/);
});
