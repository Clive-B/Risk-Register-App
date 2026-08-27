const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('assistant waits for an explicit Talk action after sign-in', () => {
    const script = fs.readFileSync(path.join(root, 'frontend/js/assistant.js'), 'utf8');
    const briefingStart = script.indexOf('async function loadBriefing');
    const eventBindings = script.indexOf('root.querySelector("#ncaAssistantToggle")', briefingStart);
    const signInBriefing = script.slice(briefingStart, eventBindings);

    assert.ok(briefingStart >= 0 && eventBindings > briefingStart);
    assert.doesNotMatch(signInBriefing, /startListening/);
    assert.match(signInBriefing, /Press Talk when you want me to listen\./);
    assert.match(script, /quickTalkButton\.addEventListener\("click"/);
});

test('assistant launchers and close control resist page-wide button sizing', () => {
    const script = fs.readFileSync(path.join(root, 'frontend/js/assistant.js'), 'utf8');
    const styles = fs.readFileSync(path.join(root, 'frontend/css/assistant.css'), 'utf8');

    assert.match(script, /class="nca-assistant-launchers"/);
    assert.match(styles, /\.nca-assistant-launchers\{[^}]*display:flex[^}]*justify-content:flex-end/);
    assert.match(styles, /#ncaAssistantQuickTalk\{[^}]*width:132px/);
    assert.match(styles, /#ncaAssistantToggle\{[^}]*width:58px[^}]*height:58px/);
    assert.match(styles, /\.nca-assistant-close\{[^}]*flex:0 0 36px[^}]*width:36px[^}]*height:36px/);
});
