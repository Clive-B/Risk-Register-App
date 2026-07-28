const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scripts = [
    'seed-test-users.js',
    'seed-rips-test-users.js',
    'seed-audit-test-users.js'
];

test('re-running test-user seed scripts cannot overwrite established credentials', () => {
    scripts.forEach(fileName => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', fileName), 'utf8');
        const conflictUpdates = source.split(/ON CONFLICT\s*(?:\([^)]*\))?\s*DO UPDATE SET/gi).slice(1);
        assert.ok(conflictUpdates.length, `${fileName} must use an idempotent conflict path.`);
        conflictUpdates.forEach(update => {
            const clause = update.split(/RETURNING|`/)[0];
            assert.doesNotMatch(clause, /\bpassword_hash\s*=/i, `${fileName} must preserve password_hash.`);
            assert.doesNotMatch(clause, /\bmust_change_password\s*=/i, `${fileName} must preserve onboarding state.`);
            assert.doesNotMatch(clause, /\bpassword_changed_at\s*=/i, `${fileName} must preserve password metadata.`);
            assert.doesNotMatch(clause, /\btoken_version\s*=/i, `${fileName} must not revoke sessions while seeding.`);
        });
    });
});
