const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../controllers/assistantController');

test('briefing follow-ups recognise references to the item announced at introduction', () => {
    assert.equal(_test.isBriefingQuestion('What is that item?', []), true);
    assert.equal(_test.isBriefingQuestion('Tell me about my pending activity.', []), true);
    assert.equal(_test.isBriefingQuestion('Give me more details.', [
        { role: 'assistant', text: 'You have 0 overdue items and 1 pending item in your authorised work briefing.' }
    ]), true);
    assert.equal(_test.isBriefingQuestion('How do I create a risk?', []), false);
});

test('named Action Centre questions receive system guidance instead of notification briefings', () => {
    assert.equal(_test.isBriefingQuestion('Tell me about Action Center', []), false);
    assert.equal(_test.isBriefingQuestion('What does the Action Centre do?', []), false);
    assert.equal(_test.hasExplicitSystemDomainIntent('Tell me about Action Center'), true);
    assert.equal(_test.normaliseSemanticRoute({ route: 'general' }, 'Tell me about Action Center', []).route, 'system');
    assert.equal(_test.isBriefingQuestion('What is in my Action Centre?', []), true);
    assert.equal(_test.isBriefingQuestion('Tell me about my pending actions.', []), true);
});

test('briefing follow-ups identify authorised work and preserve its source destination', () => {
    const briefing = {
        summary: 'You have 0 overdue items, 1 pending item, and 0 items awaiting someone else.',
        items: [{ title: 'Review staged risk register', status: 'Pending', priority: 'High', dueAt: null, destination: 'pages/action-centre.html' }]
    };
    const answer = _test.localBriefingAnswer(briefing);
    assert.match(answer, /The item requiring your attention is/);
    assert.match(answer, /Review staged risk register — Pending, High priority/);
    assert.match(answer, /perform the authorised action yourself/);
    assert.equal(briefing.items[0].destination, 'pages/action-centre.html');
});

test('assistant echo and briefing navigation intents are distinguished', () => {
    const history = [{ role: 'assistant', text: 'You have 0 overdue items, 1 pending item, and 0 items awaiting someone else.' }];
    assert.equal(_test.isLikelyAssistantEcho('You have zero overdue items, one pending item, and zero items awaiting someone else.', history), true);
    assert.equal(_test.isLikelyAssistantEcho('Open that pending item for me.', history), false);
    assert.equal(_test.isBriefingOpenCommand('Open that pending item for me.'), true);
    assert.equal(_test.safeClientDestination('pages/audit-logs.html'), 'pages/audit-logs.html');
    assert.equal(_test.safeClientDestination('https://unapproved.example/'), null);
});

test('general model history excludes sign-in briefings and governed guidance', () => {
    const filtered = _test.generalProviderHistory([
        { role: 'assistant', text: 'Good morning. You have 0 overdue items, 1 pending item, and 0 items awaiting someone else.' },
        { role: 'assistant', text: 'Guided task: Create a risk. Source: NCA GRC System Manual.' },
        { role: 'user', text: 'Why is the sky blue?' },
        { role: 'assistant', text: 'Blue wavelengths are scattered more strongly.' }
    ]);
    assert.deepEqual(filtered, [
        { role: 'user', text: 'Why is the sky blue?' },
        { role: 'assistant', text: 'Blue wavelengths are scattered more strongly.' }
    ]);
});

test('semantic router accepts meaning-based routes and rejects ungoverned labels', () => {
    assert.deepEqual(_test.parseSemanticRoute('{"route":"current-screen"}'), { route: 'current_screen', answer: '' });
    assert.deepEqual(_test.parseSemanticRoute('```json\n{"route":"general","answer":"A concise answer."}\n```'), {
        route: 'general', answer: 'A concise answer.'
    });
    assert.equal(_test.parseSemanticRoute('{"route":"perform_submission"}'), null);
});

test('semantic embedding router selects the nearest intent centroid', () => {
    const current = [1, 0, 0];
    const system = [0, 1, 0];
    const general = [0, 0, 1];
    const vectors = [[0.9, 0.1, 0], ...Array(4).fill(current), ...Array(4).fill(system), ...Array(4).fill(general)];
    const result = _test.semanticRouteFromEmbeddings(vectors);
    assert.equal(result.route, 'current_screen');
    assert.ok(result.confidence > result.scores[1].score);
});

test('semantic routes require textual evidence before using the visible page or GRC manual', () => {
    const mistakenPageRoute = { route: 'current_screen', confidence: 0.42 };
    const mistakenSystemRoute = { route: 'system', confidence: 0.39 };

    assert.equal(_test.normaliseSemanticRoute(
        mistakenPageRoute, "Let's talk about RPA robotic process automation"
    ).route, 'general');
    assert.equal(_test.normaliseSemanticRoute(
        mistakenSystemRoute, 'Explain quantum computing'
    ).route, 'general');
    assert.equal(_test.normaliseSemanticRoute(
        { route: 'general' }, 'What should I do on this page?'
    ).route, 'current_screen');
    assert.equal(_test.normaliseSemanticRoute(
        { route: 'general' }, 'How does risk treatment approval work?'
    ).route, 'system');
});

test('old role briefings and page guidance cannot reclaim an active general conversation', () => {
    const roleDefaults = [
        'You have 2 pending notifications for your Risk Focal Person role.',
        'Executive Analytics: Provides authority-wide risk and treatment trends. Source: NCA GRC System Manual, Executive Analytics.',
        'Risk Champion approvals are available. Source: NCA GRC System Manual, Approvals.',
        'Board Dashboard guidance is available. Source: NCA GRC System Manual, Board Dashboard.'
    ];
    for (const roleDefault of roleDefaults) {
        const history = [
            { role: 'assistant', text: roleDefault },
            { role: 'user', text: 'Explain photosynthesis.' },
            { role: 'assistant', text: 'Plants convert light energy into chemical energy.' }
        ];
        assert.equal(_test.normaliseSemanticRoute({ route: 'system' }, 'Tell me more about that.', history).route, 'general');
    }
    const activeSystemHistory = [
        { role: 'user', text: 'Explain risk treatment approval.' },
        { role: 'assistant', text: 'A governed explanation. Source: NCA GRC System Manual, Treatment Plans.' }
    ];
    assert.equal(_test.normaliseSemanticRoute({ route: 'general' }, 'Tell me more.', activeSystemHistory).route, 'system');
});
