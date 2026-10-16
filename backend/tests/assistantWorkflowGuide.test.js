const test = require('node:test');
const assert = require('node:assert/strict');
const { guide } = require('../knowledge/workflowGuide');

const administrator = { role: 'System Administrator' };

test('workflow guide gives role-aware steps and a route for creating a risk', () => {
    const result = guide('Guide me through how to create a risk', 'dashboard', [], administrator, {});
    assert.equal(result.title, 'Create a risk');
    assert.equal(result.destination, 'pages/create-risk.html');
    assert.match(result.answer, /1\. Open Create Risk/);
    assert.match(result.answer, /Save Draft/);
    assert.match(result.answer, /perform every save, submission or approval yourself/);
});

test('create-risk guidance identifies visible omissions without receiving field values', () => {
    const result = guide('What should I do next?', 'createRisk', [
        { role: 'assistant', text: 'Guided task: Create a risk' }
    ], administrator, {
        pageTitle: 'Create Risk',
        fields: [
            { id: 'risk_title', label: 'Risk Title', required: true, empty: false, invalid: false, disabled: false },
            { id: 'risk_description', label: 'Risk Description', required: true, empty: true, invalid: false, disabled: false }
        ]
    });
    assert.match(result.answer, /Required information still missing: Risk Description/);
    assert.match(result.answer, /^Next guidance for Create a risk:/);
    assert.doesNotMatch(result.answer, /1\. Open Create Risk/);
    assert.equal(result.uiGuidance.fieldId, 'risk_description');
});

test('full mission steps repeat only when the user explicitly asks', () => {
    const history = [{ role: 'assistant', text: 'Guided task: Create a risk' }];
    const continued = guide('What do I do here?', 'createRisk', history, administrator, { pageTitle: 'Create Risk', fields: [] });
    assert.match(continued.answer, /^Next guidance for Create a risk:/);
    assert.doesNotMatch(continued.answer, /1\. Open Create Risk/);

    const repeated = guide('Repeat all the steps for creating a risk', 'createRisk', history, administrator, { pageTitle: 'Create Risk', fields: [] });
    assert.match(repeated.answer, /1\. Open Create Risk/);
    assert.match(repeated.answer, /6\. Use Save Draft/);
});

test('create-risk guidance reports local validation errors and highlights the control when complete', () => {
    const invalid = guide('Check this form', 'createRisk', [], administrator, {
        pageTitle: 'Create Risk',
        fields: [{ id: 'target_completion_date', label: 'Target Completion Date', required: true, empty: false, invalid: true, validationMessage: 'Target Completion Date must not be in the past.', disabled: false }]
    });
    assert.match(invalid.answer, /must not be in the past/);
    assert.equal(invalid.uiGuidance.fieldId, 'target_completion_date');

    const complete = guide('Check this form', 'createRisk', [], administrator, { pageTitle: 'Create Risk', fields: [] });
    assert.equal(complete.uiGuidance.controlId, 'saveDraftBtn');
});

test('treatment guidance can identify an authorised visible field and its current value', () => {
    const result = guide('Can you see the field where they have written Action Owner?', 'treatment', [], administrator, {
        pageTitle: 'Risk Treatment', dialogTitle: 'Edit Treatment Plan',
        fields: [
            { id: 'action_owner', label: 'Action Owner', kind: 'text', required: true, empty: false, invalid: false, disabled: false, value: 'Unit Head, Research and Innovation' },
            { id: 'treatment_actions', label: 'Treatment Actions', kind: 'textarea', required: true, empty: true, invalid: false, disabled: false, value: '' }
        ]
    });
    assert.match(result.answer, /Action Owner field is visible in Edit Treatment Plan/);
    assert.match(result.answer, /Unit Head, Research and Innovation/);
    assert.equal(result.uiGuidance.fieldId, 'action_owner');
});

test('treatment guidance identifies the next required visible omission', () => {
    const result = guide('What should I do next?', 'treatment', [], administrator, {
        pageTitle: 'Risk Treatment', dialogTitle: 'Edit Treatment Plan',
        fields: [{ id: 'treatment_actions', label: 'Treatment Actions', kind: 'textarea', required: true, empty: true, invalid: false, disabled: false, value: '' }]
    });
    assert.match(result.answer, /Required information still missing: Treatment Actions/);
    assert.equal(result.uiGuidance.fieldId, 'treatment_actions');
});

test('an unrelated open-ended question on Create Risk is not captured as workflow guidance', () => {
    const result = guide('Why is the sky blue?', 'createRisk', [
        { role: 'assistant', text: 'Opening Create Risk. I will continue guiding you there.' },
        { role: 'assistant', text: 'You have 0 overdue items, 1 pending item, and 0 items awaiting someone else.' }
    ], administrator, { pageTitle: 'Create Risk', fields: [] });
    assert.equal(result, null);
});

test('semantic intent can request current-screen guidance without a hard-coded sentence', () => {
    const result = guide('I am uncertain about the appropriate way forward.', 'createRisk', [], administrator, {
        pageTitle: 'Create Risk',
        fields: [{ id: 'risk_title', label: 'Risk Title', required: true, empty: true, invalid: false, disabled: false }]
    }, { forceCurrentScreen: true });
    assert.match(result.answer, /Complete Risk Title next/);
});

test('workflow guide respects role restrictions and can explain the platform generally', () => {
    const restricted = guide('Guide me through creating a user', 'dashboard', [], { role: 'Risk Committee Chairman' }, {});
    assert.match(restricted.answer, /not authorised/);
    assert.equal(restricted.destination, null);

    const tour = guide('Guide me through the general use of the platform', 'dashboard', [], administrator, {});
    assert.match(tour.answer, /Platform guide for System Administrator/);
    assert.match(tour.answer, /Action Centre/);
});
