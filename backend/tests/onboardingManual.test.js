const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('first-login password guidance comes from the server policy and supports reveal controls', () => {
    const route = read('backend/routes/authRoutes.js');
    const controller = read('backend/controllers/authController.js');
    const page = read('frontend/change-password.html');
    const script = read('frontend/js/change-password.js');
    const resetPage = read('frontend/reset-password.html');
    const resetScript = read('frontend/js/reset-password.js');

    assert.match(route, /get\('\/password-policy', authController\.passwordPolicy\)/);
    assert.match(controller, /minLength: PASSWORD_POLICY\.minLength/);
    assert.match(script, /\/auth\/password-policy/);
    assert.match(script, /password\.minLength = policy\.minLength/);
    assert.doesNotMatch(script, /length\s*>=\s*8/);
    assert.match(resetScript, /\/auth\/password-policy/);
    assert.match(resetScript, /password\.minLength = policy\.minLength/);
    assert.doesNotMatch(resetScript, /length\s*>=\s*8/);
    assert.equal((page.match(/data-password-toggle=/g) || []).length, 3);
    assert.equal((resetPage.match(/data-password-toggle=/g) || []).length, 2);
    assert.match(page, /data-rule="length"/);
    assert.match(page, /data-rule="special"/);
    assert.doesNotMatch(page + resetPage, /8\+ characters|at least 8 characters/i);
});

test('successful sign-in presents a one-time route to the current user manual', () => {
    const login = read('frontend/js/login.js');
    const changePassword = read('frontend/js/change-password.js');
    const sidebar = read('frontend/js/sidebar.js');

    assert.match(login, /ncaGrcManualReminderPending/);
    assert.match(changePassword, /ncaGrcManualReminderPending/);
    assert.match(sidebar, /User guide available/);
    assert.match(sidebar, /Open User Manual/);
    assert.match(sidebar, /pages\/system-manual\.html/);
});

test('password change cannot be reported as failed by post-commit activation work', () => {
    const controller = read('backend/controllers/authController.js');
    const actions = read('backend/services/actionService.js');

    assert.match(controller, /systemGenerated:true/);
    assert.match(controller, /try\s*{\s*await completeBySource\('UserActivation'/);
    assert.match(controller, /User activation action completion failed/);
    assert.match(actions, /sourceVerified=false/);
    assert.match(actions, /const allowed=sourceVerified\|\|actor\.role/);
    assert.match(actions, /sourceVerified:true/);
});

test('welcome delivery includes only the fixed packaged manual attachment and current guide link', () => {
    const email = read('backend/services/emailService.js');
    const queue = read('backend/services/communicationService.js');
    const pdf = fs.readFileSync(path.join(root, 'backend/docs/NCA_GRC_SYSTEM_USER_MANUAL.pdf'));

    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(pdf.length > 10_000 && pdf.length < 5 * 1024 * 1024);
    assert.match(email, /USER_MANUAL_PATH = path\.join\(__dirname, '\.\.', 'docs', 'NCA_GRC_SYSTEM_USER_MANUAL\.pdf'\)/);
    assert.match(email, /includeUserManual:true/);
    assert.match(email, /pages\/system-manual\.html/);
    assert.match(email, /contentType: 'application\/pdf'/);
    assert.match(queue, /includeUserManual:Boolean\(includeUserManual\)/);
    assert.doesNotMatch(queue, /attachmentPath|attachmentsPath/);
});

test('canonical, in-system and printable manuals share the current release and new features', () => {
    const manual = read('docs/NCA_GRC_SYSTEM_USER_MANUAL.md');
    const page = read('frontend/pages/system-manual.html');
    const printable = read('backend/docs/NCA_GRC_SYSTEM_USER_MANUAL.html');
    const sources = [manual, page, printable];

    for (const source of sources) {
        assert.match(source, /2026\.10\.09/);
        assert.match(source, /Create Administrator/);
        assert.match(source, /Clear Holder/);
        assert.match(source, /Send Group Onboarding/);
        assert.match(source, /Communication Centre/);
        assert.match(source, /12 characters/);
        assert.match(source, /multiple risk|Multiple risk/i);
        assert.match(source, /quarterly|Quarter 1/i);
    }
});
