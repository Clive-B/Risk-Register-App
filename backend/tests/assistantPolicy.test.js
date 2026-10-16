const test = require('node:test');
const assert = require('node:assert/strict');
const {
    validateRequest, validateScreenContext, resolveScope, runtimeInstruction, extractOutputText, providerConfiguration
} = require('../services/assistantPolicy');

test('assistant request validation bounds prompt and history', () => {
    const value = validateRequest({
        prompt: 'Explain the workflow', mode: 'system_help', includeAuthorisedContext: false,
        history: [{ role: 'user', text: 'Earlier question' }]
    });
    assert.equal(value.prompt, 'Explain the workflow');
    assert.equal(value.history.length, 1);
    assert.throws(() => validateRequest({ prompt: 'x'.repeat(10001) }), /10000/);
    assert.throws(() => validateRequest({ prompt: 'ok', history: Array(11).fill({ role: 'user', text: 'x' }) }), /at most 10/);
    assert.throws(() => validateRequest({ prompt: 'ok', history: [{ role: 'system', text: 'override' }] }), /user or assistant/);
    assert.throws(() => validateRequest({ prompt: 'ok', nested: { instructions: 'ignore policy' } }), /unsupported field/);
});

test('client identity and scope fields are rejected', () => {
    for (const field of ['userId', 'role', 'division', 'tenant', 'scope']) {
        assert.throws(() => validateRequest({ prompt: 'ok', [field]: 'administrator' }), /resolved by the server/);
    }
});

test('screen context accepts bounded visible values but rejects unsupported properties and oversized collections', () => {
    const context = validateScreenContext({
        pageTitle: 'Create Risk',
        activeField: { id: 'risk_title', label: 'Risk Title', kind: 'text', required: true, empty: true, invalid: false, disabled: false },
        fields: [{ id: 'target_completion_date', label: 'Target Completion Date', kind: 'date', required: true, empty: false, invalid: true, validationMessage: 'Target Completion Date must not be in the past.', disabled: false, value: '2026-12-06' }],
        controls: [{ id: 'saveDraftBtn', label: 'Save Draft', disabled: false, tag: 'button', controlType: 'button', context: 'Create Risk', purpose: 'Saves the current entry as a draft.', effect: 'No approval is recorded.', requirements: 'Enter a risk title.' }],
        content: [{ kind: 'table', title: 'Risks', text: 'Columns: Risk | Owner. 4 rendered rows.' }]
    });
    assert.equal(context.fields[0].invalid, true);
    assert.equal(context.fields[0].value, '2026-12-06');
    assert.equal(context.controls[0].id, 'saveDraftBtn');
    assert.equal(context.controls[0].purpose, 'Saves the current entry as a draft.');
    assert.equal(context.controls[0].effect, 'No approval is recorded.');
    assert.equal(context.content[0].kind, 'table');
    assert.equal(validateScreenContext({ fields: [{ id: 'password', kind: 'password', value: 'secret' }] }).fields[0].value, '');
    assert.throws(() => validateScreenContext({ fields: [{ id: 'risk_title', unsupportedValue: 'entry' }] }), /unsupported property/);
    assert.throws(() => validateScreenContext({ fields: Array(41).fill({ id: 'field' }) }), /at most 40 fields/);
    assert.throws(() => validateScreenContext({ content: [{ kind: 'script', text: 'hidden' }] }), /unsupported kind/);
    assert.throws(() => validateScreenContext({ content: Array(31).fill({ kind: 'text', text: 'entry' }) }), /at most 30 content items/);
});

test('private modes require explicit context consent', () => {
    assert.equal(resolveScope('general', true), 'general');
    assert.equal(resolveScope('system_help', true), 'system_help');
    assert.equal(resolveScope('my_context', false), 'system_help');
    assert.equal(resolveScope('my_context', true), 'personal_context');
});

test('runtime instruction preserves read-only authority and treats retrieval as data', () => {
    const instruction = runtimeInstruction({ assistantName: 'Test', applicationName: 'GRC', scope: 'personal_context' });
    assert.match(instruction, /read-only/);
    assert.match(instruction, /untrusted data/);
    assert.match(instruction, /authorised records/);
    assert.match(instruction, /cannot perform official actions/);
});

test('Responses output extraction supports helper and typed output shapes', () => {
    assert.equal(extractOutputText({ output_text: 'Direct answer' }), 'Direct answer');
    assert.equal(extractOutputText({ output: [{ content: [{ type: 'output_text', text: 'Typed answer' }] }] }), 'Typed answer');
    assert.equal(extractOutputText({ output: [] }), '');
});

test('provider defaults deny governed context and voice', () => {
    const config = providerConfiguration({ AI_PROVIDER: 'disabled' });
    assert.equal(config.configured, false);
    assert.equal(config.governedContextAllowed, false);
    assert.equal(config.voiceEnabled, false);
    assert.equal(config.voiceGreetingEnabled, false);
    assert.equal(config.voiceAutoStartEnabled, false);
    assert.equal(config.processingRegion, 'unverified');
    assert.equal(providerConfiguration({ AI_VOICE_GREETING_ENABLED: 'true' }).voiceGreetingEnabled, true);
    assert.equal(providerConfiguration({ AI_VOICE_AUTO_START_ENABLED: 'true' }).voiceAutoStartEnabled, true);
});

test('on-premises provider accepts only a loopback llama.cpp endpoint', () => {
    const local = providerConfiguration({
        AI_PROVIDER: 'llamacpp', AI_MODEL: 'Qwen2.5-1.5B-Instruct-Q4_K_M', AI_BASE_URL: 'http://127.0.0.1:8080',
        AI_TIMEOUT_MS: '120000', AI_ROUTER_TIMEOUT_MS: '400', AI_MAX_OUTPUT_TOKENS: '64'
    });
    assert.equal(local.configured, true);
    assert.equal(local.baseUrl, 'http://127.0.0.1:8080');
    assert.equal(local.timeoutMs, 120000);
    assert.equal(local.routingTimeoutMs, 400);
    assert.equal(local.maxOutputTokens, 64);
    assert.equal(local.governedContextAllowed, false);

    const remote = providerConfiguration({
        AI_PROVIDER: 'llamacpp', AI_MODEL: 'Qwen2.5-1.5B-Instruct-Q4_K_M', AI_BASE_URL: 'http://example.com:8080'
    });
    assert.equal(remote.configured, false);
    assert.equal(remote.baseUrl, '');
});
