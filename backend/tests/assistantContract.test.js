const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('all assistant status, briefing and query routes require authentication', () => {
    const routes = read('backend/routes/assistantRoutes.js');
    assert.match(routes, /router\.get\('\/status',auth,controller\.status\)/);
    assert.match(routes, /router\.get\('\/briefing',auth,controller\.briefing\)/);
    assert.match(routes, /router\.post\('\/query',auth,controller\.query\)/);
    assert.match(routes, /router\.post\('\/',auth,controller\.query\)/);
});

test('assistant requests use a narrow JSON parser before the bulk application parser', () => {
    const server = read('backend/server.js');
    const assistantParser = server.indexOf("app.use('/api/assistant', express.json({ limit: process.env.ASSISTANT_JSON_BODY_LIMIT || '64kb' }))");
    const applicationParser = server.indexOf("app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '12mb' }))");
    assert.ok(assistantParser >= 0);
    assert.ok(applicationParser > assistantParser);
});

test('provider request is stateless, bounded and has no mutation tools', () => {
    const controller = read('backend/controllers/assistantController.js');
    assert.match(controller, /https:\/\/api\.openai\.com\/v1\/responses/);
    assert.match(controller, /store: false/);
    assert.match(controller, /max_output_tokens: config\.maxOutputTokens/);
    assert.doesNotMatch(controller, /tools\s*:/);
    assert.match(controller, /AI_GOVERNED_CONTEXT_EXTERNAL_ALLOWED|governedContextAllowed/);
});

test('llama.cpp provider uses the internal chat API without an API key or mutation tools', async () => {
    const { callProvider } = require('../controllers/assistantController')._test;
    const originalFetch = global.fetch;
    let captured;
    global.fetch = async (url, options) => {
        captured = { url, options, body: JSON.parse(options.body) };
        return { ok: true, json: async () => ({ model: 'Qwen2.5-1.5B-Instruct-Q4_K_M', choices: [{ message: { content: 'A local answer.' } }], usage: { prompt_tokens: 12, completion_tokens: 4 } }) };
    };
    try {
        const result = await callProvider({
            config: { provider: 'llamacpp', baseUrl: 'http://127.0.0.1:8080', model: 'Qwen2.5-1.5B-Instruct-Q4_K_M', maxOutputTokens: 600 },
            scope: 'general', prompt: 'Explain photosynthesis.', history: [], helpContext: null, authorisedContext: null,
            signal: new AbortController().signal
        });
        assert.equal(result.answer, 'A local answer.');
        assert.equal(captured.url, 'http://127.0.0.1:8080/v1/chat/completions');
        assert.equal(captured.options.headers.Authorization, undefined);
        assert.equal(captured.body.stream, false);
        assert.equal(captured.body.chat_template_kwargs.enable_thinking, false);
        assert.equal(captured.body.max_tokens, 600);
        assert.equal(Object.hasOwn(captured.body, 'tools'), false);
    } finally {
        global.fetch = originalFetch;
    }
});

test('llama.cpp semantic router is schema-constrained and returns only an intent', async () => {
    const { callSemanticRouter } = require('../controllers/assistantController')._test;
    const originalFetch = global.fetch;
    let captured;
    global.fetch = async (url, options) => {
        captured = { url, body: JSON.parse(options.body) };
        return { ok: true, json: async () => ({
            model: 'Qwen2.5-0.5B-Instruct-Q4_K_M',
            choices: [{ message: { content: '{"route":"current_screen"}' } }],
            usage: { prompt_tokens: 100, completion_tokens: 5 }
        }) };
    };
    try {
        const result = await callSemanticRouter({
            config: { provider: 'llamacpp', baseUrl: 'http://127.0.0.1:8080', model: 'Qwen2.5-0.5B-Instruct-Q4_K_M' },
            prompt: 'I am not sure how to begin.', page: 'Create Risk', history: [], signal: new AbortController().signal
        });
        assert.equal(result.route, 'current_screen');
        assert.equal(captured.url, 'http://127.0.0.1:8080/v1/chat/completions');
        assert.equal(captured.body.max_tokens, 16);
        assert.deepEqual(captured.body.response_format.json_schema.schema.properties.route.enum, ['current_screen', 'system', 'general']);
        assert.equal(Object.hasOwn(captured.body, 'tools'), false);
    } finally {
        global.fetch = originalFetch;
    }
});

test('assistant audit stores metadata, not raw question or full answer', () => {
    const controller = read('backend/controllers/assistantController.js');
    const auditStart = controller.indexOf("action: 'ASSISTANT_QUERY'");
    const auditEnd = controller.indexOf('} });', auditStart);
    const auditBlock = controller.slice(auditStart, auditEnd);
    assert.match(auditBlock, /question_length/);
    assert.match(auditBlock, /source_references/);
    assert.doesNotMatch(auditBlock, /prompt\s*:/);
    assert.doesNotMatch(auditBlock, /answer\s*:/);
});

test('assistant captures bounded visible page structure and routes it locally', () => {
    const client = read('frontend/js/assistant.js');
    const controller = read('backend/controllers/assistantController.js');
    assert.match(client, /collectVisibleContent\(contentScope\)/);
    assert.match(client, /\['password', 'hidden', 'file'\]\.includes\(kind\)/);
    assert.match(client, /#ncaAssistantRoot,\[data-assistant-exclude\],\[data-sensitive\]/);
    assert.match(controller, /pageAwareness\.answer\(request\.prompt, key, user, request\.screenContext\)/);
    assert.match(controller, /provenance = pageInsight \? 'visible-page-context'/);
    assert.match(controller, /source: 'rendered-role-authorised-dom'/);
});

test('briefing calls an item overdue only when an explicit due date is in the past', () => {
    const controller = read('backend/controllers/assistantController.js');
    assert.match(controller, /item\.due_at && new Date\(item\.due_at\)\.getTime\(\) < Date\.now\(\)/);
    assert.match(controller, /\.slice\(0, 5\)/);
});

test('briefing reconciles dashboard tasks with Action Centre work', () => {
    const controller = read('backend/controllers/assistantController.js');
    assert.match(controller, /dashboardRepository\.tasks\(req\)/);
    assert.match(controller, /NCA GRC Action Centre and Dashboard/);
    assert.match(controller, /dashboardPending/);
    assert.match(controller, /dashboardOverdue/);
});

test('briefing follow-up queries reload the same authorised live work context locally', () => {
    const controller = read('backend/controllers/assistantController.js');
    assert.match(controller, /let workflowGuidance = repeatedAssistantSpeech \|\| navigationCommand \|\| pageInsight \? null/);
    assert.match(controller, /const briefingQuestion = !repeatedAssistantSpeech && !navigationCommand && !pageInsight && !workflowGuidance/);
    assert.match(controller, /&& isBriefingQuestion\(request\.prompt, request\.history\)/);
    assert.match(controller, /briefingContext = await loadBriefing\(user, req\)/);
    assert.match(controller, /const mayCallProvider = !providerResult && !repeatedAssistantSpeech/);
    assert.match(controller, /&& !navigationCommand && !briefingQuestion && !guidedNavigation/);
    assert.match(controller, /localBriefingAnswer\(briefingContext\)/);
    assert.match(controller, /provenance = 'live-user-data'/);
});

test('General mode routes NCA GRC questions to approved local system guidance', () => {
    const controller = read('backend/controllers/assistantController.js');
    const manual = require('../knowledge/systemManual');
    assert.equal(manual.isSystemQuestion('So tell me about the system.'), true);
    assert.equal(manual.isSystemQuestion('What is the weather in Kumasi?'), false);
    assert.match(manual.findManualAnswer('Tell me about the NCA GRC system', 'dashboard'), /secure, role-aware workspace/);
    assert.match(controller, /const systemQuestion = !explicitGeneralRequest && !repeatedAssistantSpeech && request\.mode === 'general'/);
    assert.match(controller, /Boolean\(workflowGuidance\)/);
    assert.match(controller, /!workflowGuidance\s*&& isBriefingQuestion/);
    assert.match(controller, /hasSystemDomainIntent\(request\.prompt, request\.history\)/);
    assert.match(controller, /scope === 'general' \|\| \(scope === 'personal_context' && config\.governedContextAllowed\)/);
    assert.match(controller, /else if \(help\)/);
    assert.doesNotMatch(controller, /Connected AI is not configured/);
});

test('an explicit general conversation topic cannot be replaced with current-page guidance', () => {
    const { _test } = require('../controllers/assistantController');
    const controller = read('backend/controllers/assistantController.js');
    assert.equal(_test.isExplicitGeneralKnowledgeRequest('Can we have a general talk on epistemology?'), true);
    assert.equal(_test.isExplicitGeneralKnowledgeRequest('Let us have an open discussion about ethics.'), true);
    assert.equal(_test.isExplicitGeneralKnowledgeRequest('Can we have a general talk on the NCA GRC system?'), false);
    assert.equal(_test.isExplicitGeneralKnowledgeRequest('What should I do on this page?'), false);
    assert.match(controller, /!explicitGeneralRequest && !repeatedAssistantSpeech/);
    assert.match(controller, /const systemQuestion = !explicitGeneralRequest/);
});

test('a clearly named general topic bypasses semantic model routing', () => {
    const { _test } = require('../controllers/assistantController');
    assert.equal(_test.isClearGeneralTopicRequest("Let's talk about automation studio"), true);
    assert.equal(_test.isClearGeneralTopicRequest("Let's have a discussion on RPA"), true);
    assert.equal(_test.isClearGeneralTopicRequest('Explain photosynthesis'), true);
    assert.equal(_test.isClearGeneralTopicRequest('Explain risk treatment in this system'), false);
    assert.equal(_test.isClearGeneralTopicRequest('Can you see this field?'), false);
});

test('General mode preserves system topic for contextual follow-up questions', () => {
    const manual = require('../knowledge/systemManual');
    const history = [
        { role: 'user', text: 'Tell me about the NCA GRC system.' },
        { role: 'assistant', text: manual.findManualAnswer('Tell me about the NCA GRC system.', 'dashboard') }
    ];
    assert.equal(manual.isSystemFollowUp('So go into details.', history), true);
    assert.match(manual.findManualAnswer('So go into details.', 'executiveAnalytics', history), /five connected governance layers/);
    const automaticHistory = [
        { role: 'assistant', text: 'Opening Create Risk. I will continue guiding you there.' },
        { role: 'assistant', text: 'You have 0 overdue items, 1 pending item, and 0 items awaiting someone else.' }
    ];
    assert.equal(manual.isSystemFollowUp('Why is the sky blue?', automaticHistory), false);
});

test('General mode uses the on-premises model as a semantic router before phrase fallback', () => {
    const controller = read('backend/controllers/assistantController.js');
    assert.match(controller, /semanticResult = await callSemanticRouter/);
    assert.match(controller, /semanticResult\?\.route === 'current_screen'/);
    assert.match(controller, /semanticResult = normaliseSemanticRoute\(semanticResult, request\.prompt, request\.history\)/);
    assert.match(controller, /\{ forceCurrentScreen: true \}/);
    assert.match(controller, /!semanticResult && \(hasCurrentScreenIntent\(request\.prompt\) \|\| hasSystemDomainIntent/);
});

test('destination-page follow-ups explain the pending item and current authorised page', () => {
    const manual = require('../knowledge/systemManual');
    const navigation = require('../knowledge/navigationCatalog');
    const history = [
        { role: 'user', text: 'Open that pending item for me.' },
        { role: 'assistant', text: 'Opening Review Audit Logs. It is currently Pending. I will continue guiding you on the destination page.' }
    ];
    assert.equal(manual.isSystemQuestion('What do I do here?'), true);
    assert.equal(manual.isSystemQuestion('What do I do with this?'), true);
    const answer = manual.findManualAnswer('What do I do here?', 'auditLogs', history, { role: 'System Administrator' });
    assert.match(answer, /pending item “Review Audit Logs”/);
    assert.match(answer, /Search and filter recorded audit events/);
    assert.match(answer, /perform any governed action yourself/);
    assert.equal(navigation.answerCurrentPage('auditLogs', 'Risk Focal Person'), null);
    assert.match(read('backend/controllers/assistantController.js'), /'audit-logs\.html': 'auditLogs'/);
});

test('navigation questions resolve the named button instead of the current page', () => {
    const manual = require('../knowledge/systemManual');
    const answer = manual.findNavigationAnswer('Board Dashboard Button. What does it entail?', { role: 'System Administrator' });
    assert.equal(answer.title, 'Board Dashboard');
    assert.match(answer.answer, /top enterprise risks, risk-appetite position/);
    assert.match(answer.answer, /System Administrator/);
    assert.doesNotMatch(answer.answer, /^Executive Analytics:/);
});

test('assistant navigation catalogue covers every role-specific sidebar item exactly', () => {
    const { ROLE_NAVIGATION, ITEMS, resolveNavigationCommand } = require('../knowledge/navigationCatalog');
    const app = read('frontend/js/app.js');
    const blocks = {
        'System Administrator': app.match(/\[roles\.ADMIN\]: \[([\s\S]*?)\],\s*\[roles\.CHAMPION\]/)[1],
        'Risk Champion': app.match(/\[roles\.CHAMPION\]: \[([\s\S]*?)\],\s*\[roles\.FOCAL\]/)[1],
        'Risk Focal Person': app.match(/\[roles\.FOCAL\]: \[([\s\S]*?)\],\s*\[roles\.CHAIRMAN\]/)[1],
        'Risk Committee Chairman': app.match(/\[roles\.CHAIRMAN\]: \[([\s\S]*?)\]\s*\n\s*\};/)[1]
    };
    for (const [role, block] of Object.entries(blocks)) {
        const actual = [...block.matchAll(/\["([^"]+)",\s*"[^"]+",\s*"([^"]+)"\]/g)].map(match => [match[1], match[2]]);
        assert.deepEqual(actual, ROLE_NAVIGATION[role], `${role} catalogue must match the rendered sidebar`);
    }
    const usedKeys = new Set(Object.values(ROLE_NAVIGATION).flat().map(([, key]) => key));
    assert.deepEqual([...usedKeys].filter(key => !ITEMS[key]), []);
    assert.match(require('../knowledge/navigationCatalog').navigationOverview('System Administrator'), /21 page links plus Logout/);
    assert.match(require('../knowledge/navigationCatalog').answerNavigationQuestion('What does Logout do?', 'Risk Focal Person').answer, /Ends the current authenticated browser session/);
    assert.deepEqual(resolveNavigationCommand('Open Audit Logs', 'System Administrator'), {
        key: 'auditLogs', title: 'Audit Logs', label: 'Audit Logs', authorised: true,
        destination: 'pages/audit-logs.html', reason: null
    });
    assert.equal(resolveNavigationCommand('Open Audit Logs', 'Risk Focal Person').authorised, false);
    assert.equal(resolveNavigationCommand('What does Audit Logs do?', 'System Administrator'), null);
});

test('explicit navigation returns a bounded client action and repeated assistant speech is silenced', () => {
    const controller = read('backend/controllers/assistantController.js');
    assert.match(controller, /navigationCatalog\.resolveNavigationCommand\(request\.prompt, user\.role\)/);
    assert.match(controller, /clientAction = \{\s*type: 'navigate'/);
    assert.match(controller, /suppressSpeech: repeatedAssistantSpeech/);
    assert.match(controller, /outcome: repeatedAssistantSpeech \? 'IgnoredEcho'/);
});
