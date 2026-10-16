const test = require('node:test');
const assert = require('node:assert/strict');
const { answer, isPageAwarenessQuestion } = require('../knowledge/pageAwareness');

const administrator = { role: 'System Administrator' };

test('page awareness recognises natural questions about visible page content', () => {
    assert.equal(isPageAwarenessQuestion('Do you have visuals over what the content of this page is?'), true);
    assert.equal(isPageAwarenessQuestion('Can you see what is displayed on this screen?'), true);
    assert.equal(isPageAwarenessQuestion('Why is the sky blue?'), false);
    assert.equal(isPageAwarenessQuestion('What should I do next on this page?'), false);
});

test('page awareness summarises rendered headings, tables, fields and controls', () => {
    const result = answer('What content can you see on this page?', 'accountMapping', administrator, {
        pageTitle: 'Account Mapping', dialogTitle: '',
        content: [
            { kind: 'heading', title: 'Account Mapping', text: 'Account Mapping' },
            { kind: 'table', title: 'Organisational role accounts', text: 'Columns: Role | Current holder. 4 rendered rows.' }
        ],
        fields: [{ id: 'search', label: 'Search accounts', kind: 'search', value: '', empty: true }],
        controls: [{ id: 'mapAccount', label: 'Map Account', disabled: false }]
    });
    assert.match(result.answer, /governed visible-page context for Account Mapping/);
    assert.match(result.answer, /Organisational role accounts/);
    assert.match(result.answer, /Search accounts/);
    assert.match(result.answer, /Map Account/);
    assert.match(result.answer, /passwords, hidden inputs, files and non-visible content are excluded/);
    assert.equal(result.capturedContentCount, 2);
});

test('page awareness selects relevant visible content for a specific table question', () => {
    const result = answer('What does the role accounts table show on this page?', 'accountMapping', administrator, {
        pageTitle: 'Account Mapping',
        content: [
            { kind: 'summary', title: 'Instructions', text: 'Map a permanent role to the current holder.' },
            { kind: 'table', title: 'Role accounts', text: 'Columns: Role | Current holder. 4 rendered rows.' }
        ], fields: [], controls: []
    });
    assert.match(result.answer, /Relevant visible content/);
    assert.match(result.answer, /Role accounts/);
    assert.equal(result.matchedContentCount, 2);
});

test('page awareness reports an empty governed snapshot honestly', () => {
    const result = answer('Can you see this page?', 'reports', administrator, { pageTitle: 'Reports' });
    assert.match(result.answer, /has not exposed any readable/);
    assert.match(result.answer, /read-only/);
});
