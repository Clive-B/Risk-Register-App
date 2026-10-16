(function () {
    if (!window.NCAGRC || !window.NCAGRC.getToken() || document.getElementById('ncaAssistantRoot')) return;

    const app = window.NCAGRC;
    const user = app.getUser() || {};
    const prefix = app.getPathPrefix();
    const MEMORY_LIMIT = 12;
    const MESSAGE_LIMIT = 2000;
    const SERIALISED_LIMIT = 24000;
    const SCREEN_FIELD_LIMIT = 40;
    const SCREEN_CONTROL_LIMIT = 40;
    const SCREEN_VALUE_LIMIT = 500;
    const POST_SPEECH_ECHO_MS = 2200;
    const MAX_SPEECH_CHUNK_LENGTH = 240;
    const MAX_RECOGNITION_RETRIES = 3;
    const NAVIGATION_SETTLE_MS = 1800;
    const REQUIRED_FIELDS = Object.freeze({
        'create-risk.html': new Set([
            'risk_title', 'risk_description', 'directorate', 'risk_category', 'risk_owner',
            'impact', 'likelihood', 'existing_controls', 'control_effectiveness', 'risk_treatment',
            'initial_mitigation_plan', 'responsible_officer', 'target_completion_date', 'assessment_year'
        ]),
        'treatment.html': new Set([
            'risk_id', 'plan_title', 'treatment_strategy', 'action_owner', 'due_date',
            'treatment_actions', 'monitoring_frequency', 'review_date',
            'target_residual_likelihood', 'target_residual_impact'
        ])
    });
    const memoryKey = `ncaAssistantConversation:${user.id || user.email || 'session'}`;
    const greetedKey = `ncaAssistantGreeted:${sessionIdentifier()}`;
    const pendingGuideKey = `ncaAssistantPendingGuide:${sessionIdentifier()}`;
    const guidanceDeliveryKey = `ncaAssistantGuidanceDelivery:${sessionIdentifier()}`;
    const routes = {
        manual: 'pages/system-manual.html', action: 'pages/action-centre.html', risks: 'pages/risks.html',
        riskRegister: 'pages/risk-register.html', workplan: 'pages/workplans.html', treatment: 'pages/treatment.html',
        compliance: 'pages/compliance.html', approvals: 'pages/my-approvals.html'
    };

    const root = document.createElement('div');
    root.id = 'ncaAssistantRoot';
    root.innerHTML = `
        <section id="ncaAssistantPanel" role="dialog" aria-modal="false" aria-labelledby="ncaAssistantTitle">
            <header class="nca-assistant-head">
                <div><strong id="ncaAssistantTitle">NCA GRC Assistant</strong><small>Read-only guidance · Human decisions remain authoritative</small></div>
                <div class="nca-assistant-head-actions">
                    <button class="nca-assistant-stop" type="button" disabled>Stop</button>
                    <button class="nca-assistant-minimize" type="button" aria-label="Minimize assistant">&minus;</button>
                    <button class="nca-assistant-close" type="button" aria-label="Close assistant">&times;</button>
                </div>
            </header>
            <div class="nca-assistant-statusbar">
                <span id="ncaAssistantPhase" class="nca-phase" data-phase="ready">Ready</span>
                <span id="ncaAssistantConnection">Loading assistant status…</span>
            </div>
            <div class="nca-assistant-scroll">
                <div id="ncaAssistantBriefing" class="nca-assistant-briefing" aria-live="polite"></div>
                <div class="nca-assistant-controls">
                    <label>Mode
                        <select id="ncaAssistantMode">
                            <option value="general">General</option>
                            <option value="system_help">System Help</option>
                            <option value="my_context">My Work</option>
                            <option value="planning">Planning</option>
                            <option value="evidence">Evidence / Sources</option>
                        </select>
                    </label>
                    <label class="nca-private-control"><input id="ncaAssistantPrivate" type="checkbox"> <span>Use my authorised work</span></label>
                </div>
                <div id="ncaAssistantMessages" class="nca-assistant-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
                <div class="nca-assistant-toolbar">
                    <button type="button" data-command="briefing">Refresh my briefing</button>
                    <button type="button" data-command="manual">System manual</button>
                    <button type="button" data-command="clear">Clear conversation</button>
                </div>
            </div>
            <form id="ncaAssistantForm">
                <label class="nca-sr-only" for="ncaAssistantInput">Ask the NCA GRC Assistant</label>
                <textarea id="ncaAssistantInput" maxlength="10000" rows="2" placeholder="Ask a question…"></textarea>
                <button class="nca-assistant-mic" type="button" aria-label="Start voice conversation"><span>Talk</span></button>
                <button class="nca-assistant-send" type="submit">Send</button>
            </form>
            <p class="nca-assistant-disclaimer">The assistant can make mistakes. It can explain, summarise and recommend, but cannot approve, submit or change official records.</p>
        </section>
        <div class="nca-assistant-launchers">
            <button id="ncaAssistantToggle" type="button" aria-label="Open NCA GRC Assistant" aria-expanded="false">&#10022;</button>
            <button id="ncaAssistantQuickTalk" type="button" aria-label="Start voice conversation"><span>Talk</span></button>
        </div>`;
    document.body.appendChild(root);

    const panel = root.querySelector('#ncaAssistantPanel');
    const scrollRegion = root.querySelector('.nca-assistant-scroll');
    const messages = root.querySelector('#ncaAssistantMessages');
    const briefing = root.querySelector('#ncaAssistantBriefing');
    const input = root.querySelector('#ncaAssistantInput');
    const mode = root.querySelector('#ncaAssistantMode');
    const privateContext = root.querySelector('#ncaAssistantPrivate');
    const phaseLabel = root.querySelector('#ncaAssistantPhase');
    const connection = root.querySelector('#ncaAssistantConnection');
    const stopButton = root.querySelector('.nca-assistant-stop');
    const mic = root.querySelector('.nca-assistant-mic');
    const quickTalkButton = root.querySelector('#ncaAssistantQuickTalk');
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    let status = { voiceEnabled: false, voiceGreetingEnabled: false, voiceAutoStartEnabled: false, providerStatus: 'local-fallback', governedContextExternalProcessing: 'blocked' };
    let memory = restoreMemory();
    let phase = 'ready';
    let recognition = null;
    let recognitionActive = false;
    let voiceConversation = false;
    let isSpeaking = false;
    let awaitingResponse = false;
    let requestController = null;
    let requestGeneration = 0;
    let speechGeneration = 0;
    let activeUtterance = null;
    let recognitionRetryTimer = null;
    let recognitionRetryCount = 0;
    let recognitionRecoveryRequired = false;
    let interimMessage = null;
    let spokenText = '';
    let spokenCharIndex = 0;
    let bargeInCandidate = '';
    let bargeInCandidateHits = 0;
    let lastSpokenText = '';
    let speechEndedAt = 0;
    let lastVoicePrompt = '';
    let lastVoicePromptAt = 0;
    let currentGreeting = 'Welcome. What would you like to work on today?';
    let currentBriefingSummary = 'Your authorised work briefing is loading.';

    function sessionIdentifier() {
        try {
            const segment = app.getToken().split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const payload = segment.padEnd(Math.ceil(segment.length / 4) * 4, '=');
            return JSON.parse(window.atob(payload)).sid || user.id || user.email || 'session';
        } catch (_) {
            return user.id || user.email || 'session';
        }
    }

    function setPhase(next) {
        phase = next;
        phaseLabel.dataset.phase = next;
        phaseLabel.textContent = next.charAt(0).toUpperCase() + next.slice(1);
        stopButton.disabled = !voiceConversation && !['listening', 'thinking', 'speaking'].includes(next);
        mic.classList.toggle('is-listening', next === 'listening');
        quickTalkButton.classList.toggle('is-listening', next === 'listening');
        const voiceLabel = !voiceConversation ? 'Talk' : next === 'listening' ? 'Listening…' : next === 'speaking' ? 'Speak to interrupt' : 'Voice on';
        mic.querySelector('span').textContent = voiceLabel;
        quickTalkButton.querySelector('span').textContent = voiceLabel;
        const voiceAction = !voiceConversation ? 'Start voice conversation' : 'Turn off voice conversation. Speak naturally to interrupt while the assistant is speaking.';
        mic.setAttribute('aria-label', voiceAction);
        quickTalkButton.setAttribute('aria-label', voiceAction);
    }

    function restoreMemory() {
        try {
            const raw = sessionStorage.getItem(memoryKey);
            if (!raw || raw.length > SERIALISED_LIMIT) throw new Error('Invalid memory');
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) throw new Error('Invalid memory');
            return parsed.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.text === 'string' && item.text.length <= MESSAGE_LIMIT).slice(-MEMORY_LIMIT);
        } catch (_) {
            sessionStorage.removeItem(memoryKey);
            return [];
        }
    }

    function persistMemory() {
        memory = memory.slice(-MEMORY_LIMIT).map(item => ({ role: item.role, text: item.text.slice(0, MESSAGE_LIMIT) }));
        while (memory.length && JSON.stringify(memory).length > SERIALISED_LIMIT) memory.shift();
        sessionStorage.setItem(memoryKey, JSON.stringify(memory));
    }

    function remember(role, text) {
        memory.push({ role, text: String(text).slice(0, MESSAGE_LIMIT) });
        persistMemory();
    }

    function appendMessage(role, text, meta = {}) {
        const article = document.createElement('article');
        article.className = `nca-message ${role}`;
        const body = document.createElement('div');
        body.className = 'nca-message-body';
        body.textContent = text;
        article.appendChild(body);
        if (meta.provenance || meta.deliveryMode) {
            const badges = document.createElement('div');
            badges.className = 'nca-message-badges';
            [meta.provenance, meta.deliveryMode].filter(Boolean).forEach(value => {
                const badge = document.createElement('span');
                badge.textContent = String(value).replaceAll('-', ' ');
                badges.appendChild(badge);
            });
            article.appendChild(badges);
        }
        if (meta.factsAsOf) {
            const time = document.createElement('small');
            time.textContent = `Facts as of ${new Date(meta.factsAsOf).toLocaleString('en-GB')}`;
            article.appendChild(time);
        }
        if (Array.isArray(meta.sources) && meta.sources.length) {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = `Sources (${meta.sources.length})`;
            details.appendChild(summary);
            const list = document.createElement('ul');
            meta.sources.forEach(source => {
                const item = document.createElement('li');
                item.textContent = `${source.title}${source.section ? ` — ${source.section}` : ''}`;
                list.appendChild(item);
            });
            details.appendChild(list);
            article.appendChild(details);
        }
        if (Array.isArray(meta.suggestedActions) && meta.suggestedActions.length) {
            const actions = document.createElement('div');
            actions.className = 'nca-message-actions';
            meta.suggestedActions.slice(0, 3).forEach(action => {
                const destination = String(action?.destination || '');
                if (!/^(?:pages\/[a-z0-9-]+|nca-grc-risk-register)\.html(?:\?.*)?$/i.test(destination)) return;
                const link = document.createElement('a');
                link.href = `${prefix}${destination}`;
                link.textContent = String(action.label || 'Open page').slice(0, 80);
                actions.appendChild(link);
            });
            if (actions.childElementCount) article.appendChild(actions);
        }
        messages.appendChild(article);
        scrollRegion.scrollTop = scrollRegion.scrollHeight;
        return article;
    }

    function renderMemory() {
        messages.replaceChildren();
        memory.forEach(item => appendMessage(item.role, item.text));
    }

    function openPanel() {
        panel.classList.add('is-open');
        const toggle = root.querySelector('#ncaAssistantToggle');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Minimize NCA GRC Assistant');
    }

    function minimizePanel() {
        panel.classList.remove('is-open');
        const toggle = root.querySelector('#ncaAssistantToggle');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open NCA GRC Assistant');
    }

    function togglePanel() {
        if (panel.classList.contains('is-open')) {
            minimizePanel();
            return;
        }
        openPanel();
        input.focus();
    }

    function closePanel() {
        panel.classList.remove('is-open');
        root.querySelector('#ncaAssistantToggle').setAttribute('aria-expanded', 'false');
        teardownVoice();
    }

    function updateConsentControl() {
        const permittedMode = ['my_context', 'planning', 'evidence'].includes(mode.value);
        if (!permittedMode) privateContext.checked = false;
        privateContext.disabled = false;
    }

    function hasHigherPriorityOverlay() {
        return Boolean(document.querySelector('dialog[open]:not(#ncaAssistantPanel), .modal[aria-hidden="false"], [data-mandatory-dialog="true"]'));
    }

    function announceGreetingWhenAvailable(attempt = 0) {
        if (sessionStorage.getItem(greetedKey)) return;
        if (hasHigherPriorityOverlay() && attempt < 120) {
            window.setTimeout(() => announceGreetingWhenAvailable(attempt + 1), 500);
            return;
        }
        sessionStorage.setItem(greetedKey, '1');
        openPanel();
        const spokenBriefing = `${currentGreeting} ${currentBriefingSummary}`;
        appendMessage('system', `${spokenBriefing} Voice conversation will remain on until you turn it off. Speak naturally whenever you need to interrupt or clarify.`);
        remember('assistant', spokenBriefing);
        if (status.voiceGreetingEnabled) speakWelcome(spokenBriefing);
    }

    async function loadStatus() {
        try {
            status = await app.apiRequest('/assistant/status');
            const provider = status.providerStatus === 'configured'
                ? `${['ollama', 'llamacpp'].includes(status.provider) ? 'On-premises AI' : 'Connected AI'} · ${status.model}`
                : 'Local fallback';
            connection.textContent = `${provider} · governed work external AI ${status.governedContextExternalProcessing} · speech recognition supplied by browser`;
            connection.title = 'The assistant model is on-premises. Browser speech recognition availability and audio processing depend on the approved browser configuration.';
            const voiceAvailable = status.voiceEnabled && window.isSecureContext && Boolean(Recognition);
            mic.disabled = !voiceAvailable;
            quickTalkButton.disabled = !voiceAvailable;
            if (!voiceAvailable) {
                const reason = !status.voiceEnabled ? 'Voice is disabled by policy.' : !window.isSecureContext ? 'Voice requires HTTPS.' : 'Voice is unsupported in this browser.';
                mic.title = reason;
                quickTalkButton.title = reason;
            }
        } catch (_) {
            connection.textContent = 'Local fallback · status unavailable';
            mic.disabled = true;
            quickTalkButton.disabled = true;
        }
    }

    async function loadBriefing(speak = false) {
        try {
            const data = await app.apiRequest('/assistant/briefing');
            currentGreeting = data.greeting;
            currentBriefingSummary = data.summary;
            briefing.replaceChildren();
            const strong = document.createElement('strong');
            strong.textContent = data.greeting;
            const summary = document.createElement('p');
            summary.textContent = data.summary;
            const link = document.createElement('a');
            link.href = `${prefix}${routes.action}`;
            link.textContent = 'Open Action Centre';
            briefing.append(strong, summary, link);
            if (speak) {
                const text = `${data.greeting} ${data.summary}`;
                appendMessage('assistant', text, { provenance: 'live-user-data', deliveryMode: 'local-context', factsAsOf: data.factsAsOf, sources: [data.source] });
                remember('assistant', text);
                speakWelcome(text, true);
            }
        } catch (_) {
            briefing.textContent = 'Your authorised work briefing is temporarily unavailable.';
        }
    }

    function isVisible(element) {
        if (!element || element.closest('#ncaAssistantRoot,[hidden],[aria-hidden="true"]')) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    }

    function fieldLabel(field) {
        if (!field) return '';
        const explicit = field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`) : null;
        const wrapped = field.closest('label');
        const group = field.closest('.form-group,.field,.form-field');
        return String(
            field.getAttribute('aria-label') || explicit?.textContent || wrapped?.textContent ||
            group?.querySelector('label')?.textContent || field.placeholder || field.id || ''
        ).replace(/\s+/g, ' ').trim().slice(0, 160);
    }

    function screenField(field, requiredIds) {
        if (!field || !field.id || typeof field.checkValidity !== 'function' || !isVisible(field)) return null;
        const kind = String(field.type || field.tagName || '').toLowerCase();
        if (['password', 'hidden', 'file'].includes(kind)) return null;
        let localValidationMessage = '';
        if (field.value && ['date_identified', 'target_completion_date'].includes(field.id)) {
            const selectedDate = new Date(`${field.value}T00:00:00`);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (field.id === 'date_identified' && selectedDate > today) localValidationMessage = 'Date Identified cannot be in the future.';
            if (field.id === 'target_completion_date' && selectedDate < today) localValidationMessage = 'Target Completion Date must not be in the past.';
        }
        const invalid = field.getAttribute('aria-invalid') === 'true' || !field.checkValidity() || Boolean(localValidationMessage);
        const visibleValue = field.tagName === 'SELECT'
            ? String(field.selectedOptions?.[0]?.textContent || field.value || '')
            : ['checkbox', 'radio'].includes(kind)
                ? (field.checked ? 'Selected' : 'Not selected')
                : String(field.value || '');
        return {
            id: field.id.slice(0, 160), label: fieldLabel(field), kind: kind.slice(0, 40),
            required: field.required || requiredIds.has(field.id),
            empty: !String(field.value || '').trim(), invalid,
            validationMessage: invalid ? String(localValidationMessage || field.validationMessage || '').slice(0, 240) : '',
            disabled: field.disabled === true,
            value: visibleValue.replace(/\s+/g, ' ').trim().slice(0, SCREEN_VALUE_LIMIT)
        };
    }

    function collectScreenContext() {
        const file = window.location.pathname.split('/').pop() || '';
        const requiredIds = REQUIRED_FIELDS[file] || new Set();
        const overlay = [...document.querySelectorAll('dialog[open],.modal[aria-hidden="false"],[role="dialog"][aria-hidden="false"]')]
            .find(element => element.id !== 'ncaAssistantPanel' && isVisible(element));
        const scope = overlay || document;
        const fields = [...scope.querySelectorAll('input,select,textarea')]
            .map(field => screenField(field, requiredIds)).filter(Boolean).slice(0, SCREEN_FIELD_LIMIT);
        const controls = [...scope.querySelectorAll('button,a[href]')]
            .filter(control => isVisible(control))
            .map(control => ({
                id: String(control.id || '').slice(0, 160),
                label: String(control.textContent || control.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 160),
                disabled: control.disabled === true
            }))
            .filter(control => control.id || control.label)
            .slice(0, SCREEN_CONTROL_LIMIT);
        return {
            pageTitle: String(document.querySelector('main h1,h1')?.textContent || document.title || '').replace(/\s+/g, ' ').trim().slice(0, 160),
            dialogTitle: String(overlay?.querySelector('h1,h2,h3')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
            activeField: screenField(document.activeElement, requiredIds),
            fields,
            controls
        };
    }

    function applyUiGuidance(guidance) {
        const id = String(guidance?.fieldId || guidance?.controlId || '');
        if (!id) return;
        const target = document.getElementById(id);
        if (!target || target.closest('#ncaAssistantRoot') || !isVisible(target)) return;
        document.querySelectorAll('.nca-assistant-guidance-target').forEach(element => element.classList.remove('nca-assistant-guidance-target'));
        target.classList.add('nca-assistant-guidance-target');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => target.classList.remove('nca-assistant-guidance-target'), 7000);
    }

    function executeClientAction(action) {
        if (action?.type !== 'navigate') return false;
        const destination = String(action.destination || '');
        if (!/^(?:pages\/[a-z0-9-]+|nca-grc-risk-register)\.html(?:\?[a-z0-9_=&%.-]*)?$/i.test(destination)) return false;
        sessionStorage.setItem(pendingGuideKey, JSON.stringify({ label: String(action.label || 'the selected page').slice(0, 100), at: Date.now() }));
        window.location.assign(`${prefix}${destination}`);
        return true;
    }

    function guidanceTopic(answer) {
        return String(answer || '').match(/^Guided task:\s*([^\n.]+)/i)?.[1]?.trim().toLowerCase() || '';
    }

    function explicitlyRequestedFullGuide(prompt) {
        const value = String(prompt || '');
        return /\b(?:repeat|restart|start over|from the beginning|all (?:the )?steps|full (?:guide|instructions))\b/i.test(value)
            || /\b(?:guide|walk)\b.*\b(?:through|how to)\b/i.test(value);
    }

    function repeatedUnrequestedGuidance(answer, prompt, fromVoice) {
        const topic = guidanceTopic(answer);
        if (!fromVoice || !topic || explicitlyRequestedFullGuide(prompt)) return false;
        try {
            const previous = JSON.parse(sessionStorage.getItem(guidanceDeliveryKey) || 'null');
            return previous?.topic === topic && Date.now() - Number(previous.at || 0) < 60000;
        } catch (_) {
            return false;
        }
    }

    function rememberGuidanceDelivery(answer) {
        const topic = guidanceTopic(answer);
        if (topic) sessionStorage.setItem(guidanceDeliveryKey, JSON.stringify({ topic, at: Date.now() }));
    }

    function discardLastVoicePrompt(prompt, element) {
        element?.remove();
        const last = memory.at(-1);
        if (last?.role === 'user' && last.text === prompt) {
            memory.pop();
            persistMemory();
        }
    }

    async function sendQuestion(question, { fromVoice = false } = {}) {
        const prompt = String(question || '').trim();
        if (!prompt) return;
        if (fromVoice && isRecentVoicePrompt(prompt)) {
            if (voiceConversation && !awaitingResponse && !isSpeaking) startListening(false);
            return;
        }
        if (awaitingResponse) return;
        if (fromVoice) rememberVoicePrompt(prompt);
        awaitingResponse = true;
        if (recognition && recognitionActive) { try { recognition.abort(); } catch (_) {} }
        const userMessage = appendMessage('user', prompt);
        remember('user', prompt);
        const history = memory.slice(0, -1).slice(-8);
        const generation = ++requestGeneration;
        requestController = new AbortController();
        setPhase('thinking');
        const progressMessage = appendMessage('system', 'Preparing an on-premises answer…');
        try {
            const response = await app.apiRequest('/assistant/query', {
                method: 'POST', signal: requestController.signal,
                body: JSON.stringify({
                    prompt, mode: mode.value, includeAuthorisedContext: privateContext.checked,
                    history, page: window.location.pathname, screenContext: collectScreenContext()
                })
            });
            if (generation !== requestGeneration) return;
            progressMessage.remove();
            if (repeatedUnrequestedGuidance(response.answer, prompt, fromVoice)) {
                discardLastVoicePrompt(prompt, userMessage);
                return;
            }
            if (response.suppressSpeech && fromVoice) {
                discardLastVoicePrompt(prompt, userMessage);
                resetRecognitionAfterIgnoredAudio();
                return;
            }
            appendMessage('assistant', response.answer, response);
            remember('assistant', response.answer);
            rememberGuidanceDelivery(response.answer);
            applyUiGuidance(response.uiGuidance);
            if (response.suppressSpeech) {
                setPhase('ready');
            } else if (response.clientAction) {
                if (voiceConversation) speakText(response.answer, () => executeClientAction(response.clientAction));
                else executeClientAction(response.clientAction);
            } else if (voiceConversation) speakText(response.answer);
            else setPhase('ready');
        } catch (error) {
            if (generation !== requestGeneration || error.name === 'AbortError') return;
            progressMessage.remove();
            appendMessage('warning', error.message || 'The assistant could not complete that request.');
            setPhase('ready');
        } finally {
            progressMessage.remove();
            if (generation === requestGeneration) {
                awaitingResponse = false;
                requestController = null;
                if (voiceConversation && !isSpeaking && !recognitionActive) scheduleListeningRetry(120);
            }
        }
    }

    function stopCurrent({ resumeListening = false } = {}) {
        requestGeneration += 1;
        speechGeneration += 1;
        awaitingResponse = false;
        if (requestController) requestController.abort();
        requestController = null;
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        activeUtterance = null;
        if (spokenText) lastSpokenText = spokenText;
        speechEndedAt = Date.now();
        isSpeaking = false;
        spokenText = '';
        spokenCharIndex = 0;
        bargeInCandidate = '';
        bargeInCandidateHits = 0;
        if (recognition && recognitionActive) { try { recognition.abort(); } catch (_) {} }
        recognitionActive = false;
        if (resumeListening && voiceConversation) window.setTimeout(() => startListening(false), 40);
        else setPhase('ready');
    }

    function splitSpeechText(value) {
        const sentences = String(value || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
        const chunks = [];
        sentences.forEach(sentenceValue => {
            let sentence = sentenceValue.trim();
            while (sentence.length > MAX_SPEECH_CHUNK_LENGTH) {
                let splitAt = sentence.lastIndexOf(' ', MAX_SPEECH_CHUNK_LENGTH);
                if (splitAt < 80) splitAt = MAX_SPEECH_CHUNK_LENGTH;
                chunks.push(sentence.slice(0, splitAt).trim());
                sentence = sentence.slice(splitAt).trim();
            }
            if (!sentence) return;
            const previous = chunks.at(-1);
            if (previous && previous.length + sentence.length + 1 <= MAX_SPEECH_CHUNK_LENGTH) chunks[chunks.length - 1] = `${previous} ${sentence}`;
            else chunks.push(sentence);
        });
        return chunks.length ? chunks : [String(value || '')];
    }

    function speakText(text, onComplete = null) {
        if (!voiceConversation || !('speechSynthesis' in window)) {
            if (voiceConversation) startListening(false);
            else setPhase('ready');
            return;
        }
        const generation = ++speechGeneration;
        isSpeaking = true;
        spokenText = String(text || '');
        lastSpokenText = spokenText;
        speechEndedAt = 0;
        spokenCharIndex = 0;
        bargeInCandidate = '';
        bargeInCandidateHits = 0;
        setPhase('speaking');
        window.speechSynthesis.cancel();
        const chunks = splitSpeechText(spokenText);
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(item => item.lang === 'en-GB') || voices.find(item => item.lang.startsWith('en')) || null;
        const finish = () => {
            if (generation !== speechGeneration) return;
            activeUtterance = null;
            lastSpokenText = spokenText || lastSpokenText;
            speechEndedAt = Date.now();
            isSpeaking = false;
            spokenText = '';
            spokenCharIndex = 0;
            bargeInCandidate = '';
            bargeInCandidateHits = 0;
            if (typeof onComplete === 'function') onComplete();
            else if (voiceConversation) startListening(false);
            else setPhase('ready');
        };
        const speakChunk = (index, offset) => {
            if (generation !== speechGeneration) return;
            if (index >= chunks.length) {
                finish();
                return;
            }
            const chunk = chunks[index];
            const utterance = new SpeechSynthesisUtterance(chunk);
            activeUtterance = utterance;
            utterance.lang = 'en-GB';
            utterance.rate = 0.96;
            utterance.voice = voice;
            utterance.onboundary = event => {
                if (Number.isFinite(event.charIndex)) spokenCharIndex = Math.min(spokenText.length, offset + event.charIndex);
            };
            utterance.onend = () => speakChunk(index + 1, offset + chunk.length + 1);
            utterance.onerror = finish;
            window.speechSynthesis.speak(utterance);
        };
        speakChunk(0, 0);
        armVoiceBargeIn();
    }

    function showGreetingPlayback(text) {
        if (briefing.querySelector('.nca-hear-greeting')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'nca-hear-greeting';
        button.textContent = 'Hear welcome';
        button.addEventListener('click', () => speakWelcome(text, true));
        briefing.appendChild(button);
    }

    function speakWelcome(text, userInitiated = false) {
        if (!window.isSecureContext || !('speechSynthesis' in window)) {
            showGreetingPlayback(text);
            if (status.voiceAutoStartEnabled) startListening(false);
            return;
        }
        const generation = ++speechGeneration;
        let started = false;
        if (status.voiceAutoStartEnabled) voiceConversation = true;
        isSpeaking = true;
        spokenText = String(text || '');
        lastSpokenText = spokenText;
        speechEndedAt = 0;
        spokenCharIndex = 0;
        bargeInCandidate = '';
        bargeInCandidateHits = 0;
        setPhase('speaking');
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        activeUtterance = utterance;
        utterance.lang = 'en-GB';
        utterance.rate = 0.96;
        const voices = window.speechSynthesis.getVoices();
        utterance.voice = voices.find(voice => voice.lang === 'en-GB') || voices.find(voice => voice.lang.startsWith('en')) || null;
        utterance.onboundary = event => { if (Number.isFinite(event.charIndex)) spokenCharIndex = event.charIndex; };
        utterance.onstart = () => { started = true; briefing.querySelector('.nca-hear-greeting')?.remove(); };
        const finish = (continueConversation = false) => {
            if (generation !== speechGeneration) return;
            activeUtterance = null;
            lastSpokenText = spokenText || lastSpokenText;
            speechEndedAt = Date.now();
            isSpeaking = false;
            spokenText = '';
            spokenCharIndex = 0;
            bargeInCandidate = '';
            bargeInCandidateHits = 0;
            if (continueConversation && status.voiceAutoStartEnabled) startListening();
            else setPhase('ready');
        };
        utterance.onend = () => finish(true);
        utterance.onerror = () => { finish(true); showGreetingPlayback(text); };
        window.speechSynthesis.speak(utterance);
        armVoiceBargeIn();
        if (!userInitiated) window.setTimeout(() => {
            if (generation === speechGeneration && !started && !window.speechSynthesis.speaking) {
                finish(true);
                showGreetingPlayback(text);
            }
        }, 1500);
    }

    function normaliseSpeech(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\bzero\b/g, '0').replace(/\bone\b/g, '1').replace(/\btwo\b/g, '2')
            .replace(/\bthree\b/g, '3').replace(/\bfour\b/g, '4').replace(/\bfive\b/g, '5')
            .replace(/\s+/g, ' ').trim();
    }

    function canonicalVoicePrompt(value) {
        return normaliseSpeech(value).replace(/^(?:(?:okay|ok|alright)(?: now)?\s+)+/, '').trim();
    }

    function isRecentVoicePrompt(value) {
        const prompt = canonicalVoicePrompt(value);
        return Boolean(prompt && prompt === lastVoicePrompt && Date.now() - lastVoicePromptAt < 12000);
    }

    function rememberVoicePrompt(value) {
        lastVoicePrompt = canonicalVoicePrompt(value);
        lastVoicePromptAt = Date.now();
    }

    function wordDistance(left, right) {
        if (left === right) return 0;
        if (!left || !right) return Math.max(left.length, right.length);
        const row = Array.from({ length: right.length + 1 }, (_, index) => index);
        for (let i = 1; i <= left.length; i += 1) {
            let diagonal = row[0];
            row[0] = i;
            for (let j = 1; j <= right.length; j += 1) {
                const above = row[j];
                row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
                diagonal = above;
            }
        }
        return row[right.length];
    }

    function fuzzyWordOverlap(heardWords, sourceWords) {
        if (!heardWords.length || !sourceWords.length) return 0;
        return heardWords.filter(heard => sourceWords.some(source => {
            if (heard === source) return true;
            return heard.length >= 5 && source.length >= 5 && wordDistance(heard, source) <= 1;
        })).length / heardWords.length;
    }

    function trigramContainment(heard, source) {
        if (heard.length < 6 || source.length < 6) return 0;
        const grams = [];
        for (let index = 0; index <= heard.length - 3; index += 1) grams.push(heard.slice(index, index + 3));
        return grams.filter(gram => source.includes(gram)).length / grams.length;
    }

    function resemblesSpeech(value, sourceText, sourceCharIndex) {
        const heard = normaliseSpeech(value);
        const spoken = normaliseSpeech(sourceText);
        if (!heard || !spoken) return false;
        const cursor = Number.isFinite(sourceCharIndex) ? sourceCharIndex : String(sourceText || '').length;
        const windowStart = Math.max(0, cursor - 220);
        const nearby = normaliseSpeech(String(sourceText || '').slice(windowStart, cursor + 360));
        if (heard.length >= 4 && nearby.includes(heard)) return true;
        const heardWords = [...new Set(heard.split(' ').filter(word => word.length > 2))];
        if (!heardWords.length) return false;
        const nearbyWords = nearby.split(' ').filter(Boolean);
        const spokenWords = spoken.split(' ').filter(Boolean);
        const nearbyOverlap = fuzzyWordOverlap(heardWords, nearbyWords);
        const fullOverlap = fuzzyWordOverlap(heardWords, spokenWords);
        if (heardWords.length <= 2) return nearbyOverlap === 1 || fullOverlap === 1;
        return nearbyOverlap >= 0.5 || fullOverlap >= 0.72
            || trigramContainment(heard, nearby) >= 0.62
            || trigramContainment(heard, spoken) >= 0.78;
    }

    function resemblesAssistantEcho(value) {
        return resemblesSpeech(value, spokenText, spokenCharIndex);
    }

    function resemblesRecentAssistantEcho(value) {
        return speechEndedAt > 0 && Date.now() - speechEndedAt <= POST_SPEECH_ECHO_MS
            && resemblesSpeech(value, lastSpokenText, String(lastSpokenText || '').length);
    }

    function resetRecognitionAfterIgnoredAudio() {
        if (interimMessage) interimMessage.remove();
        interimMessage = null;
        bargeInCandidate = '';
        bargeInCandidateHits = 0;
        const staleRecognition = recognition;
        recognition = null;
        recognitionActive = false;
        if (staleRecognition) {
            staleRecognition.onend = null;
            staleRecognition.onerror = null;
            staleRecognition.onresult = null;
            try { staleRecognition.abort(); } catch (_) {}
        }
        setPhase('ready');
        scheduleListeningRetry(120);
    }

    function beginRecognitionCycle() {
        if (recognitionRecoveryRequired || !voiceConversation || !status.voiceEnabled || !window.isSecureContext || !Recognition) return;
        prepareRecognition();
        if (recognitionActive || (awaitingResponse && !isSpeaking)) return;
        try { recognition.start(); } catch (_) {}
    }

    function armVoiceBargeIn() {
        if (!voiceConversation) return;
        window.setTimeout(beginRecognitionCycle, 80);
    }

    function interruptSpeechFromVoice(transcript, isFinal) {
        if (!isSpeaking || resemblesAssistantEcho(transcript)) {
            bargeInCandidate = '';
            bargeInCandidateHits = 0;
            return null;
        }
        const heard = normaliseSpeech(transcript);
        const words = heard.split(' ').filter(Boolean);
        const shortInterrupt = /^(?:no|wait|stop|pause|sorry|actually|hold on|excuse me)$/.test(heard);
        const deliberateInterrupt = shortInterrupt || /^(?:what|why|how|when|where|who|which|can|could|would|will|do|does|is|are|please|open|go|take|show|tell|explain|clarify|repeat|continue|skip|next|back|i|that)\b/.test(heard);
        if (!isFinal && !shortInterrupt) {
            const continuesCandidate = bargeInCandidate && (heard.startsWith(bargeInCandidate) || bargeInCandidate.startsWith(heard));
            bargeInCandidateHits = continuesCandidate ? bargeInCandidateHits + 1 : 1;
            bargeInCandidate = heard;
            return null;
        } else if (!deliberateInterrupt || (isFinal && words.length < 2 && !shortInterrupt)) {
            return null;
        }
        speechGeneration += 1;
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        activeUtterance = null;
        lastSpokenText = spokenText || lastSpokenText;
        speechEndedAt = Date.now();
        isSpeaking = false;
        spokenText = '';
        spokenCharIndex = 0;
        bargeInCandidate = '';
        bargeInCandidateHits = 0;
        setPhase('listening');
        return String(transcript || '').trim();
    }

    function prepareRecognition() {
        if (recognition || !Recognition) return;
        recognition = new Recognition();
        recognition.lang = 'en-GB';
        // Conversation remains continuous through short browser-managed capture cycles.
        // One indefinite recognition session is unreliable in Chromium and can appear
        // to listen forever after its speech service disconnects.
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.onstart = () => {
            recognitionActive = true;
            setPhase(isSpeaking ? 'speaking' : 'listening');
        };
        recognition.onend = () => {
            recognitionActive = false;
            if (voiceConversation && !awaitingResponse && !isSpeaking) setPhase('ready');
            if (!recognitionRetryTimer) scheduleListeningRetry(300);
        };
        recognition.onerror = event => {
            recognitionActive = false;
            if (event.error === 'aborted') return;
            if (event.error === 'no-speech') {
                setPhase('ready');
                scheduleListeningRetry(150);
                return;
            }
            if (['not-allowed', 'service-not-allowed'].includes(event.error)) {
                recognitionRecoveryRequired = true;
                setPhase('ready');
                appendMessage('warning', 'Microphone access is blocked. Allow microphone access, then turn voice conversation off and on again.');
            } else if (event.error === 'audio-capture') {
                recognitionRecoveryRequired = true;
                setPhase('ready');
                appendMessage('warning', 'No working microphone was found. Connect a microphone, then turn voice conversation off and on again.');
            } else {
                recognitionRetryCount += 1;
                setPhase('ready');
                if (recognitionRetryCount >= MAX_RECOGNITION_RETRIES) {
                    teardownVoice();
                    appendMessage('warning', 'Speech recognition could not connect reliably. Voice conversation was stopped instead of remaining in Listening mode. Check the browser microphone and network permissions, then select Talk to retry. Typed chat remains available.');
                    return;
                }
                if (recognitionRetryCount === 1) appendMessage('warning', 'Voice recognition was interrupted. Conversation mode remains on and listening will resume automatically.');
                scheduleListeningRetry(Math.min(5000, 500 * (2 ** Math.min(recognitionRetryCount, 3))));
            }
        };
        recognition.onresult = event => {
            recognitionRetryCount = 0;
            let interim = '';
            let finalText = '';
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const text = event.results[i][0].transcript.trim();
                if (event.results[i].isFinal) finalText += `${text} `;
                else interim += `${text} `;
            }
            const heard = (finalText || interim).trim();
            if (heard && isRecentVoicePrompt(heard)) {
                if (finalText.trim()) resetRecognitionAfterIgnoredAudio();
                else if (interimMessage) {
                    interimMessage.remove();
                    interimMessage = null;
                }
                return;
            }
            if (!isSpeaking && heard && resemblesRecentAssistantEcho(heard)) {
                if (finalText.trim()) resetRecognitionAfterIgnoredAudio();
                else if (interimMessage) {
                    interimMessage.remove();
                    interimMessage = null;
                }
                return;
            }
            if (isSpeaking && heard) {
                const interruptionIsFinal = Boolean(finalText.trim());
                const interruption = interruptSpeechFromVoice(heard, interruptionIsFinal);
                if (interruption === null) return;
                interim = interruptionIsFinal ? '' : interruption;
                finalText = interruptionIsFinal ? interruption : '';
                if (!interruption) {
                    if (interimMessage) interimMessage.remove();
                    interimMessage = appendMessage('system', 'Listening for your clarification…');
                    return;
                }
            }
            if (interim) {
                if (!interimMessage) interimMessage = appendMessage('system', interim.trim());
                else interimMessage.querySelector('.nca-message-body').textContent = interim.trim();
            }
            if (finalText.trim()) {
                if (interimMessage) interimMessage.remove();
                interimMessage = null;
                try { recognition.stop(); } catch (_) {}
                sendQuestion(finalText.trim(), { fromVoice: true });
            }
        };
    }

    function scheduleListeningRetry(delay = 300) {
        if (recognitionRecoveryRequired || !voiceConversation || (awaitingResponse && !isSpeaking)) return;
        if (recognitionRetryTimer) window.clearTimeout(recognitionRetryTimer);
        recognitionRetryTimer = window.setTimeout(() => {
            recognitionRetryTimer = null;
            if (!voiceConversation || recognitionActive) return;
            if (isSpeaking) beginRecognitionCycle();
            else if (!awaitingResponse) startListening(false);
        }, delay);
    }

    function startListening(startNewWindow = true) {
        void startNewWindow;
        if (!status.voiceEnabled || !window.isSecureContext || !Recognition) {
            appendMessage('warning', !window.isSecureContext ? 'Voice requires HTTPS. Typed chat remains available.' : 'Voice is unavailable. Typed chat remains available.');
            input.focus();
            return;
        }
        voiceConversation = true;
        localStorage.setItem('ncaAssistantVoiceOptIn', 'true');
        setPhase('listening');
        prepareRecognition();
        if (isSpeaking || awaitingResponse || recognitionActive) return;
        beginRecognitionCycle();
    }

    function teardownVoice({ preservePreference = false } = {}) {
        voiceConversation = false;
        if (!preservePreference) localStorage.removeItem('ncaAssistantVoiceOptIn');
        if (recognitionRetryTimer) window.clearTimeout(recognitionRetryTimer);
        recognitionRetryTimer = null;
        stopCurrent();
        if (recognition) {
            recognition.onend = null;
            try { recognition.abort(); } catch (_) {}
            recognition = null;
        }
        setPhase('ready');
    }

    function handleVoiceControl() {
        if (!voiceConversation) {
            recognitionRecoveryRequired = false;
            startListening();
        } else {
            teardownVoice();
        }
    }

    function clearConversation() {
        stopCurrent();
        memory = [];
        sessionStorage.removeItem(memoryKey);
        messages.replaceChildren();
        appendMessage('system', currentGreeting);
        input.value = '';
        input.focus();
    }

    function navigateTo(route) {
        stopCurrent();
        window.location.href = `${prefix}${routes[route] || routes.manual}`;
    }

    root.querySelector('#ncaAssistantToggle').addEventListener('click', togglePanel);
    root.querySelector('.nca-assistant-minimize').addEventListener('click', minimizePanel);
    root.querySelector('.nca-assistant-close').addEventListener('click', closePanel);
    stopButton.addEventListener('click', () => voiceConversation ? teardownVoice() : stopCurrent());
    mode.addEventListener('change', updateConsentControl);
    privateContext.addEventListener('change', () => {
        if (privateContext.checked && !['my_context', 'planning', 'evidence'].includes(mode.value)) {
            mode.value = 'my_context';
        }
        updateConsentControl();
    });
    root.querySelector('[data-command="briefing"]').addEventListener('click', () => loadBriefing(true));
    root.querySelector('[data-command="manual"]').addEventListener('click', () => navigateTo('manual'));
    root.querySelector('[data-command="clear"]').addEventListener('click', clearConversation);
    root.querySelector('#ncaAssistantForm').addEventListener('submit', event => {
        event.preventDefault();
        const question = input.value.trim();
        if (!question) return;
        input.value = '';
        sendQuestion(question);
    });
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            root.querySelector('#ncaAssistantForm').requestSubmit();
        }
    });
    input.addEventListener('input', () => {
        if (isSpeaking && voiceConversation) stopCurrent();
    });
    mic.addEventListener('click', handleVoiceControl);
    quickTalkButton.addEventListener('click', () => { openPanel(); handleVoiceControl(); });
    window.addEventListener('pagehide', () => teardownVoice({ preservePreference: Boolean(app.getToken()) }));
    window.addEventListener('storage', event => { if (event.key === 'token' && !event.newValue) teardownVoice(); });

    renderMemory();
    updateConsentControl();
    Promise.all([loadStatus(), loadBriefing(false)]).finally(() => {
        const alreadyGreeted = sessionStorage.getItem(greetedKey) === '1';
        announceGreetingWhenAvailable();
        if (alreadyGreeted && localStorage.getItem('ncaAssistantVoiceOptIn') === 'true') {
            openPanel();
            let resumeDelay = 0;
            try {
                const pendingGuide = JSON.parse(sessionStorage.getItem(pendingGuideKey) || 'null');
                if (pendingGuide && Date.now() - Number(pendingGuide.at || 0) < 30000) {
                    appendMessage('system', `Opened ${String(pendingGuide.label || 'the selected page')}. Voice conversation is still on; ask what to do next when you are ready.`);
                    resumeDelay = NAVIGATION_SETTLE_MS;
                }
            } catch (_) {}
            sessionStorage.removeItem(pendingGuideKey);
            window.setTimeout(() => {
                if (localStorage.getItem('ncaAssistantVoiceOptIn') === 'true') startListening(false);
            }, resumeDelay);
        }
    });
})();
