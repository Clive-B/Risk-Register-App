const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'frontend/js/assistant.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'frontend/css/assistant.css'), 'utf8');

test('assistant can auto-start continuous voice after its introduction when enabled by policy', () => {
    assert.match(script, /status\.voiceAutoStartEnabled/);
    assert.match(script, /status\.voiceEnabled && window\.isSecureContext/);
    assert.match(script, /quickTalkButton\.addEventListener\('click'/);
    assert.match(script, /utterance\.onend = \(\) => finish\(true\)/);
    assert.match(script, /continueConversation && status\.voiceAutoStartEnabled\) startListening\(\)/);
    assert.match(script, /recognition\.continuous = false/);
});

test('assistant speaks the greeting and authorised work summary once per authenticated session', () => {
    assert.match(script, /const greetedKey = `ncaAssistantGreeted:\$\{sessionIdentifier\(\)\}`/);
    assert.match(script, /const spokenBriefing = `\$\{currentGreeting\} \$\{currentBriefingSummary\}`/);
    assert.match(script, /status\.voiceGreetingEnabled\) speakWelcome\(spokenBriefing\)/);
    assert.match(script, /className = 'nca-hear-greeting'/);
    assert.match(script, /utterance\.onerror = \(\) => \{ finish\(true\); showGreetingPlayback\(text\); \}/);
});

test('assistant exposes reachable Stop, Close, composer and consent controls', () => {
    assert.match(script, /class="nca-assistant-stop"/);
    assert.match(script, /class="nca-assistant-close"/);
    assert.match(script, /class="nca-assistant-minimize"/);
    assert.match(script, /function minimizePanel\(\)/);
    assert.match(script, /function togglePanel\(\)/);
    assert.match(script, /panel\.classList\.contains\('is-open'\)/);
    assert.match(script, /#ncaAssistantToggle'\)\.addEventListener\('click', togglePanel\)/);
    assert.match(script, /\.nca-assistant-minimize'\)\.addEventListener\('click', minimizePanel\)/);
    assert.match(script, /id="ncaAssistantPrivate"/);
    assert.match(script, /privateContext\.disabled = false/);
    assert.match(script, /mode\.value = 'my_context'/);
    assert.match(script, /stopButton\.addEventListener\('click', \(\) => voiceConversation \? teardownVoice\(\) : stopCurrent\(\)\)/);
    assert.match(styles, /\.nca-assistant-stop,[^\{]*\.nca-assistant-close\{[^}]*min-width:44px[^}]*min-height:44px/);
    assert.match(styles, /#ncaAssistantForm\{[^}]*grid-template-columns/);
    assert.match(styles, /\.nca-assistant-scroll\{[^}]*overflow-y:scroll[^}]*scrollbar-gutter:stable/);
    assert.match(styles, /\.nca-assistant-toolbar button\{[^}]*width:auto!important/);
    assert.match(styles, /@media\(max-width:390px\)/);
});

test('assistant state machine cancels stale requests and supports spoken interruption while speaking', () => {
    assert.match(script, /let isSpeaking = false/);
    assert.match(script, /let awaitingResponse = false/);
    assert.match(script, /requestGeneration \+= 1/);
    assert.match(script, /requestController\.abort\(\)/);
    assert.match(script, /recognition\.abort\(\)/);
    assert.match(script, /setPhase\('thinking'\)/);
    assert.match(script, /setPhase\('speaking'\)/);
    assert.match(script, /generation !== requestGeneration/);
    assert.match(script, /function handleVoiceControl\(\)/);
    assert.match(script, /function armVoiceBargeIn\(\)/);
    assert.match(script, /function interruptSpeechFromVoice\(transcript, isFinal\)/);
    assert.match(script, /function resemblesAssistantEcho\(value\)/);
    assert.match(script, /function fuzzyWordOverlap\(heardWords, sourceWords\)/);
    assert.match(script, /function trigramContainment\(heard, source\)/);
    assert.match(script, /function resemblesRecentAssistantEcho\(value\)/);
    assert.match(script, /POST_SPEECH_ECHO_MS/);
    assert.match(script, /bargeInCandidateHits/);
    assert.match(script, /const deliberateInterrupt = shortInterrupt/);
    assert.match(script, /return null;\s*\} else if \(!deliberateInterrupt/);
    assert.match(script, /spokenCharIndex/);
    assert.match(script, /utterance\.onboundary/);
    assert.match(script, /recognition\.onresult = event =>/);
    assert.match(script, /const interruption = interruptSpeechFromVoice\(heard, interruptionIsFinal\)/);
    assert.match(script, /if \(interruption === null\) return/);
    assert.match(script, /Speak naturally to interrupt/);
    assert.match(script, /speechSynthesis\.cancel\(\)/);
    assert.match(script, /beginRecognitionCycle\(\)/);
    assert.match(script, /if \(!voiceConversation\) \{[\s\S]{0,120}startListening\(\);\s*\} else \{\s*teardownVoice\(\);/);
    assert.doesNotMatch(script, /\['thinking', 'speaking'\]\.includes\(phase\)/);
    assert.match(script, /input\.addEventListener\('input'/);
});

test('long spoken guidance is retained and delivered as a guarded sequence of short utterances', () => {
    assert.match(script, /const MAX_SPEECH_CHUNK_LENGTH = 240/);
    assert.match(script, /let activeUtterance = null/);
    assert.match(script, /function splitSpeechText\(value\)/);
    assert.match(script, /const speakChunk = \(index, offset\) =>/);
    assert.match(script, /utterance\.onend = \(\) => speakChunk\(index \+ 1/);
    assert.match(script, /activeUtterance = utterance/);
});

test('voice navigation is bounded, preserves opt-in across page loads and resumes guidance', () => {
    assert.match(script, /function executeClientAction\(action\)/);
    assert.match(script, /action\?\.type !== 'navigate'/);
    assert.match(script, /speakText\(response\.answer, \(\) => executeClientAction\(response\.clientAction\)\)/);
    assert.match(script, /teardownVoice\(\{ preservePreference: Boolean\(app\.getToken\(\)\) \}\)/);
    assert.match(script, /localStorage\.getItem\('ncaAssistantVoiceOptIn'\) === 'true'/);
    assert.match(script, /Voice conversation is still on/);
    assert.match(script, /const NAVIGATION_SETTLE_MS = 1800/);
    assert.match(script, /resumeDelay = NAVIGATION_SETTLE_MS/);
});

test('unrequested duplicate mission guidance is discarded while explicit repeats remain available', () => {
    assert.match(script, /function repeatedUnrequestedGuidance\(answer, prompt, fromVoice\)/);
    assert.match(script, /function explicitlyRequestedFullGuide\(prompt\)/);
    assert.match(script, /sessionStorage\.getItem\(guidanceDeliveryKey\)/);
    assert.match(script, /discardLastVoicePrompt\(prompt, userMessage\)/);
    assert.match(script, /sendQuestion\(finalText\.trim\(\), \{ fromVoice: true \}\)/);
    assert.match(script, /function canonicalVoicePrompt\(value\)/);
    assert.match(script, /function isRecentVoicePrompt\(value\)/);
    assert.match(script, /Date\.now\(\) - lastVoicePromptAt < 12000/);
});

test('recoverable recognition endings preserve conversation mode and retry listening', () => {
    assert.match(script, /function scheduleListeningRetry\(delay = 300\)/);
    assert.match(script, /Conversation mode remains on and listening will resume automatically/);
    assert.match(script, /if \(!recognitionRetryTimer\) scheduleListeningRetry\(300\)/);
    assert.match(script, /if \(voiceConversation && !isSpeaking && !recognitionActive\) scheduleListeningRetry\(120\)/);
    assert.doesNotMatch(script, /Voice recognition could not continue, so voice conversation was turned off/);
});

test('ignored playback audio is removed before display and starts a fresh recognition cycle', () => {
    assert.match(script, /function resetRecognitionAfterIgnoredAudio\(\)/);
    assert.match(script, /if \(response\.suppressSpeech && fromVoice\)/);
    assert.match(script, /discardLastVoicePrompt\(prompt, userMessage\)/);
    assert.match(script, /staleRecognition\.onresult = null/);
    assert.match(script, /scheduleListeningRetry\(120\)/);
});

test('assistant shares bounded visible form values while excluding secret field kinds', () => {
    assert.match(script, /const SCREEN_VALUE_LIMIT = 500/);
    assert.match(script, /\['password', 'hidden', 'file'\]\.includes\(kind\)/);
    assert.match(script, /field\.selectedOptions\?\.\[0\]\?\.textContent/);
    assert.match(script, /value: visibleValue\.replace\(/);
    assert.match(script, /'treatment\.html': new Set\(/);
});

test('voice capture never remains indefinitely in a failed listening state', () => {
    assert.match(script, /const MAX_RECOGNITION_RETRIES = 3/);
    assert.match(script, /if \(voiceConversation && !awaitingResponse && !isSpeaking\) setPhase\('ready'\)/);
    assert.match(script, /recognitionRetryCount >= MAX_RECOGNITION_RETRIES/);
    assert.match(script, /Voice conversation was stopped instead of remaining in Listening mode/);
    assert.match(script, /speech recognition supplied by browser/);
});

test('blocked or missing microphone pauses retries until the user explicitly tries again', () => {
    assert.match(script, /let recognitionRecoveryRequired = false/);
    assert.match(script, /recognitionRecoveryRequired = true;\s*setPhase\('ready'\)/);
    assert.match(script, /if \(recognitionRecoveryRequired \|\| !voiceConversation/);
    assert.match(script, /if \(!voiceConversation\) \{\s*recognitionRecoveryRequired = false;\s*startListening\(\)/);
});

test('assistant memory is tab-scoped, bounded and cleared explicitly', () => {
    assert.match(script, /const MEMORY_LIMIT = 12/);
    assert.match(script, /const MESSAGE_LIMIT = 2000/);
    assert.match(script, /const SERIALISED_LIMIT = 24000/);
    assert.match(script, /sessionStorage\.setItem\(memoryKey/);
    assert.match(script, /sessionStorage\.removeItem\(memoryKey\)/);
    assert.doesNotMatch(script, /localStorage\.setItem\(memoryKey/);
});

test('assistant renders model answers and sources as text, never model HTML', () => {
    assert.match(script, /body\.textContent = text/);
    assert.match(script, /item\.textContent =/);
    assert.doesNotMatch(script, /response\.answer[^\n]*innerHTML/);
});
