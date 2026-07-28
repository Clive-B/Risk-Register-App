const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecipient, validateHeader } = require('../services/emailService');

test('mail delivery accepts official NCA addresses', () => {
    assert.equal(validateRecipient('Risk.Champion@nca.org.gh'), 'risk.champion@nca.org.gh');
});

test('mail delivery rejects recipients outside the NCA domain', () => {
    assert.throws(
        () => validateRecipient('risk.champion@example.com'),
        /official @nca\.org\.gh/
    );
});

test('mail headers reject CRLF injection', () => {
    assert.throws(
        () => validateHeader('Approved\r\nBcc: outside@example.com', 'Email subject'),
        /invalid characters/
    );
});
