const test = require('node:test');
const assert = require('node:assert/strict');
const controlGuidance = require('../knowledge/controlGuidance');
const pageAwareness = require('../knowledge/pageAwareness');

const administrator = { role: 'System Administrator' };

function context(controls) {
    return { pageTitle: 'Account Mapping', dialogTitle: '', content: [], fields: [], controls };
}

test('named visible button questions resolve before generic page workflow guidance', () => {
    const result = pageAwareness.answer('This page there is a button for replace what does it do?', 'accountMapping', administrator, context([{
        id: '', label: 'Replace', disabled: false, tag: 'button', controlType: 'button', context: 'Current role holders',
        purpose: 'Opens the personnel-assignment form for this permanent organisational role account.',
        effect: 'Submitting preserves history and ends the former holder access.',
        requirements: 'Provide the official NCA email and replacement reason.'
    }]));
    assert.equal(result.kind, 'control-guidance');
    assert.match(result.answer, /visible Replace button/i);
    assert.match(result.answer, /Opens the personnel-assignment form/);
    assert.match(result.answer, /preserves history/);
    assert.match(result.answer, /official NCA email/);
    assert.match(result.answer, /cannot press it/);
});

test('control matching selects the exact named visible control', () => {
    const controls = [
        { id: 'sendDeferred', label: 'Send Deferred Onboarding (3)' },
        { id: '', label: 'Replace' },
        { id: '', label: 'History' }
    ];
    assert.equal(controlGuidance.matchControl('What does the Replace button do?', controls).label, 'Replace');
    assert.equal(controlGuidance.matchControl('Explain the Send Deferred Onboarding button', controls).id, 'sendDeferred');
    assert.equal(controlGuidance.answer('What does Replace do?', 'accountMapping', administrator, context(controls)).control.label, 'Replace');
});

test('structural fallbacks explain navigation and submit controls without inventing effects', () => {
    const navigation = controlGuidance.answer('What does the system manual link do?', 'dashboard', administrator, context([{
        id: '', label: 'Open System Manual', disabled: false, tag: 'a', controlType: 'link',
        destination: '/pages/system-manual.html', context: 'Assistant guidance'
    }]));
    assert.match(navigation.answer, /Opens Open System Manual within the application/);

    const unknown = controlGuidance.answer('What is the Reconcile button for?', 'reports', administrator, context([{
        id: 'reconcile', label: 'Reconcile', disabled: false, tag: 'button', controlType: 'button', context: 'Reports'
    }]));
    assert.match(unknown.answer, /has not supplied a verified purpose description/);
    assert.match(unknown.answer, /will not guess/);
});

test('disabled controls are reported as unavailable', () => {
    const result = controlGuidance.answer('What does the Send Deferred Onboarding button do?', 'accountMapping', administrator, context([{
        id: 'sendDeferredOnboarding', label: 'Send Deferred Onboarding (0)', disabled: true, tag: 'button', controlType: 'button',
        purpose: 'Sends onboarding messages to deferred holders.'
    }]));
    assert.match(result.answer, /currently disabled/);
});
