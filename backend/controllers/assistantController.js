const crypto = require('node:crypto');
const pool = require('../config/db');
const manual = require('../knowledge/systemManual');
const workflowGuide = require('../knowledge/workflowGuide');
const pageAwareness = require('../knowledge/pageAwareness');
const navigationCatalog = require('../knowledge/navigationCatalog');
const dashboardRepository = require('../repositories/dashboardRepository');
const { logAudit } = require('../utils/auditLogger');
const { validateRequest, resolveScope, runtimeInstruction, extractOutputText, providerConfiguration } = require('../services/assistantPolicy');

const APPLICATION_NAME = 'NCA Enterprise GRC Platform';
const ASSISTANT_NAME = 'NCA GRC Assistant';
const SEMANTIC_ROUTE_EXAMPLES = Object.freeze({
    current_screen: [
        'I need guidance for the page I am looking at.',
        'Help me begin the task on this screen.',
        'I am unsure about the way forward from here.',
        'Tell me the next step for the current form.'
    ],
    system: [
        'Explain a feature or workflow in the NCA GRC platform.',
        'What does this navigation item do in the application?',
        'How does risk scoring work in this system?',
        'Tell me about roles, approvals, and governed records.'
    ],
    general: [
        'Answer a general knowledge question unrelated to this application.',
        'Why is the sky blue?',
        'Explain photosynthesis.',
        'What is the capital of a country?',
        'Can we have a general talk on epistemology?',
        'Let us discuss philosophy and the theory of knowledge.',
        'I want a general conversation about a subject outside this system.'
    ]
});

function pageKey(value) {
    const file = String(value || '').split('?')[0].split('/').pop();
    return ({
        'nca-grc-risk-register.html': 'dashboard', 'risks.html': 'risks', 'risk-register.html': 'riskRegister',
        'create-risk.html': 'createRisk',
        'admin-division-risk-uploads.html': 'adminDivisionRiskUploads', 'admin-focal-submissions.html': 'adminFocalSubmissions',
        'focal-risk-admissions.html': 'focalRiskAdmissions', 'account-mapping.html': 'accountMapping',
        'system-manual.html': 'systemManual', 'users.html': 'users', 'workplans.html': 'workplans',
        'audit-logs.html': 'auditLogs', 'system-settings.html': 'systemSettings',
        'communication-centre.html': 'communication', 'assessment.html': 'assessment',
        'my-approvals.html': 'approvals', 'pending-approvals.html': 'approvals', 'treatment.html': 'treatment',
        'compliance.html': 'compliance', 'executive-analytics.html': 'executiveAnalytics',
        'board-dashboard.html': 'boardDashboard', 'reports.html': 'reports', 'action-centre.html': 'actionCentre'
    })[file] || 'dashboard';
}

async function identity(user) {
    const row = (await pool.query('SELECT identity_type,role_email FROM users WHERE id=$1', [user.id])).rows[0] || {};
    return { ...user, ...row };
}

function safeSource(sourceType, sourceId, title, section = null, recordedAt = null, excerpt = null) {
    return { sourceType, sourceId: String(sourceId), title, section, recordedAt, excerpt };
}

function statusPayload() {
    const config = providerConfiguration();
    return {
        assistantName: ASSISTANT_NAME, readOnly: true,
        providerStatus: config.configured ? 'configured' : 'local-fallback',
        provider: config.configured ? config.provider : null,
        model: config.configured ? config.model : null,
        voiceEnabled: config.voiceEnabled,
        voiceGreetingEnabled: config.voiceGreetingEnabled,
        voiceAutoStartEnabled: config.voiceAutoStartEnabled,
        governedContextExternalProcessing: config.governedContextAllowed ? 'allowed' : 'blocked',
        processingRegion: config.processingRegion, hostingRegion: config.hostingRegion,
        retentionPolicy: config.retentionPolicy, knowledgeVersion: manual.MANUAL_VERSION,
        lastSuccessfulIndexingTime: null,
        runtimeControls: {
            authentication: 'enforced', authorisation: 'server-resolved', mutationTools: 'none',
            providerStorageRequested: false,
            providerResidencyVerified: config.processingRegion === 'unverified' ? false : null
        }
    };
}

exports.status = async (_req, res) => res.json({ success: true, data: statusPayload() });

exports.context = async (req, res) => {
    try {
        const user = await identity(req.user);
        const key = pageKey(req.query.page);
        res.json({ success: true, context: {
            manual_version: manual.MANUAL_VERSION, greeting: manual.greeting(user), role_label: manual.roleLabel(user),
            page_key: key, page: manual.pages[key],
            human_authority_notice: 'Assistant guidance is advisory. Authorised NCA officers remain responsible for decisions and approvals.'
        } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Unable to load assistant context.' });
    }
};

async function loadBriefing(user, req = { user }) {
    const params = [user.id, user.role, user.division || user.directorate || null];
    const actionScope = `(assigned_to=$1 OR (assigned_to IS NULL AND assigned_role=$2 AND (division IS NULL OR division=$3)))`;
    let rows = [];
    let awaitingRows = [];
    let dashboardTasks = [];
    try {
        const [actionResult, awaitingResult] = await Promise.all([
            pool.query(`SELECT id,title,description,priority,status,due_at,action_url,source_type,source_id,created_at
                FROM actions WHERE ${actionScope} AND status NOT IN ('Completed','Cancelled')
                ORDER BY CASE WHEN due_at IS NOT NULL AND due_at<NOW() THEN 0 WHEN status='Returned' THEN 1 WHEN priority='Critical' THEN 2 WHEN priority='High' THEN 3 ELSE 4 END,
                due_at NULLS LAST,created_at ASC LIMIT 50`, params),
            pool.query(`SELECT id,item_title,status,due_at,priority,created_at FROM workflow_instances
                WHERE requester_id=$1 AND status IN ('Pending','Under Review','Escalated')
                ORDER BY due_at NULLS LAST,created_at ASC LIMIT 50`, [user.id])
        ]);
        rows = actionResult.rows;
        awaitingRows = awaitingResult.rows;
    } catch (error) {
        console.error('[assistant] Action briefing unavailable:', error.message);
    }
    try {
        dashboardTasks = await dashboardRepository.tasks(req);
    } catch (error) {
        console.error('[assistant] Dashboard task briefing unavailable:', error.message);
    }
    const actionOverdue = rows.filter(item => item.due_at && new Date(item.due_at).getTime() < Date.now());
    const actionPending = rows.filter(item => !actionOverdue.includes(item));
    const today = new Date().toISOString().slice(0, 10);
    const dashboardOverdue = dashboardTasks.filter(item => item.due_date && String(item.due_date).slice(0, 10) < today);
    const dashboardPending = dashboardTasks.filter(item => !dashboardOverdue.includes(item));
    const displayName = String(user.full_name || 'colleague').trim();
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Accra' }).format(new Date()));
    const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const actionItems = [...actionOverdue, ...actionPending].map(item => ({
        id: String(item.id), title: item.title, priority: item.priority, status: item.status,
        dueAt: item.due_at, destination: item.action_url || 'pages/action-centre.html',
        bucket: actionOverdue.includes(item) ? 'overdue' : 'pending'
    }));
    const dashboardItems = [...dashboardOverdue, ...dashboardPending].map((item, index) => ({
        id: `dashboard-${item.module || 'task'}-${item.reference_id || index}`,
        title: item.title, priority: item.status === 'Overdue' ? 'High' : 'Medium', status: item.status || 'Pending',
        dueAt: item.due_date || null,
        destination: item.module === 'Audit' ? 'pages/audit-logs.html' : item.module === 'User' ? 'pages/users.html' : 'pages/action-centre.html',
        bucket: dashboardOverdue.includes(item) ? 'overdue' : 'pending'
    }));
    const awaitingItems = awaitingRows.map(item => ({
        id: `workflow-${item.id}`, title: item.item_title, priority: item.priority, status: `Awaiting others · ${item.status}`,
        dueAt: item.due_at, destination: 'pages/my-approvals.html'
    }));
    const actionableItems = [...actionItems, ...dashboardItems]
        .filter((item, index, all) => all.findIndex(candidate => `${candidate.title}|${candidate.destination}` === `${item.title}|${item.destination}`) === index);
    const items = [...actionableItems, ...awaitingItems].slice(0, 5).map(({ bucket, ...item }) => item);
    const overdueCount = actionableItems.filter(item => item.bucket === 'overdue').length;
    const pendingCount = actionableItems.filter(item => item.bucket === 'pending').length;
    return {
        greeting: `${salutation}, ${displayName}. What would you like to work on today?`,
        summary: `You have ${overdueCount} overdue item${overdueCount === 1 ? '' : 's'}, ${pendingCount} pending item${pendingCount === 1 ? '' : 's'}, and ${awaitingRows.length} item${awaitingRows.length === 1 ? '' : 's'} awaiting someone else.`,
        counts: { overdue: overdueCount, pending: pendingCount, awaitingOthers: awaitingRows.length },
        items, factsAsOf: new Date().toISOString(),
        source: safeSource('application-record', 'work-briefing', 'NCA GRC Action Centre and Dashboard', 'Authorised open work')
    };
}

exports.briefing = async (req, res) => {
    try {
        const user = await identity(req.user);
        res.json({ success: true, data: await loadBriefing(user, req) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Unable to load your authorised work briefing.' });
    }
};

async function riskAnalysis(user) {
    const params = [];
    let scope = '';
    if (['Risk Focal Person', 'Risk Champion'].includes(user.role)) {
        params.push(user.division || user.directorate);
        scope = ` AND COALESCE(NULLIF(BTRIM(r.division),''),r.directorate)=$1`;
    }
    const summary = (await pool.query(`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER(WHERE COALESCE(g.chairman_score,g.champion_score,g.focal_score,g.system_score,r.inherent_risk_score)>=17)::int AS high,
        COUNT(*) FILTER(WHERE r.target_completion_date IS NOT NULL AND r.target_completion_date<CURRENT_DATE AND r.status NOT IN('Closed','Accepted'))::int AS overdue
        FROM risks r LEFT JOIN risk_assessment_governance g ON g.risk_id=r.id WHERE TRUE${scope}`, params)).rows[0];
    const top = (await pool.query(`SELECT r.risk_id,r.risk_title,COALESCE(NULLIF(BTRIM(r.division),''),r.directorate) AS division,
        COALESCE(g.chairman_score,g.champion_score,g.focal_score,g.system_score,r.inherent_risk_score) AS governed_score,
        COALESCE(g.review_stage,r.workflow_status) AS stage,r.updated_at
        FROM risks r LEFT JOIN risk_assessment_governance g ON g.risk_id=r.id WHERE TRUE${scope}
        ORDER BY COALESCE(g.chairman_score,g.champion_score,g.focal_score,g.system_score,r.inherent_risk_score) DESC NULLS LAST,r.updated_at DESC LIMIT 5`, params)).rows;
    return { summary, top };
}

function localRiskAnswer(evidence) {
    const top = evidence.top.length
        ? ` The supporting risk IDs are: ${evidence.top.map(r => `${r.risk_id} (${r.governed_score || 'unscored'}, ${r.stage || 'stage not recorded'})`).join('; ')}.`
        : ' No risks are currently recorded in your authorised scope.';
    return `In your authorised scope there are ${evidence.summary.total} risks, ${evidence.summary.high} high-rated and ${evidence.summary.overdue} overdue open risks.${top} Verify the source records and apply authorised human judgement before deciding or acting.`;
}

function isBriefingQuestion(prompt, history = []) {
    const question = String(prompt || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const namedNavigationItem = navigationCatalog.resolveNavigationItem(prompt);
    const explicitPersonalWork = /\b(?:my|that|those|pending|overdue|outstanding|assigned|awaiting)\s+(?:item|items|task|tasks|action|actions|work|activity|activities)\b/.test(question)
        || /\b(?:my|pending|overdue|outstanding)\s+action\s+cent(?:re|er)\b/.test(question);
    // A named feature question such as "Tell me about Action Centre" asks for
    // system guidance. Do not expose or repeat the user's work briefing unless
    // the wording also establishes an explicit personal-work intent.
    if (namedNavigationItem && !explicitPersonalWork) return false;
    if (/\b(?:my|the|that|those|pending|overdue|outstanding)\s+(?:item|items|task|tasks|action|actions|work|activity|activities)\b/.test(question)) return true;
    if (/\b(?:what|which)\s+(?:is|are)\s+(?:it|they|that|those|pending)\b/.test(question)) return true;
    if (/\b(?:tell|show|explain)\b.*\b(?:item|items|task|tasks|action|actions|pending|overdue|briefing)\b/.test(question)) return true;
    if (/\b(?:briefing|things? to (?:do|handle)|take care of)\b/.test(question)) return true;
    const recent = history.slice(-4).map(item => String(item?.text || '').toLowerCase()).join(' ');
    return /\b(?:what about|more about|details|open it|go to it)\b/.test(question)
        && /\b(?:pending|overdue|awaiting|authorised work briefing|action centre)\b/.test(recent);
}

function localBriefingAnswer(briefing) {
    const items = Array.isArray(briefing?.items) ? briefing.items : [];
    if (!items.length) {
        return `${briefing?.summary || 'You have no current authorised work items.'} There is no individual pending item for me to identify at this time.`;
    }
    const details = items.map((item, index) => {
        const due = item.dueAt ? `, due ${new Date(item.dueAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Accra' })}` : '';
        return `${index + 1}. ${item.title} — ${item.status || 'Pending'}${item.priority ? `, ${item.priority} priority` : ''}${due}.`;
    }).join('\n');
    return `${briefing.summary}\n\nThe item${items.length === 1 ? '' : 's'} requiring your attention ${items.length === 1 ? 'is' : 'are'}:\n${details}\n\nOpen the linked source record to review its evidence and perform the authorised action yourself.`;
}

function normaliseConversationText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\bzero\b/g, '0').replace(/\bone\b/g, '1').replace(/\btwo\b/g, '2')
        .replace(/\bthree\b/g, '3').replace(/\bfour\b/g, '4').replace(/\bfive\b/g, '5')
        .replace(/\s+/g, ' ').trim();
}

function isLikelyAssistantEcho(prompt, history = []) {
    const heard = normaliseConversationText(prompt);
    if (heard.length < 18) return false;
    const previous = history.slice().reverse().find(item => item?.role === 'assistant');
    const spoken = normaliseConversationText(previous?.text);
    if (!spoken) return false;
    if (spoken.includes(heard) || heard.includes(spoken)) return true;
    const words = [...new Set(heard.split(' ').filter(word => word.length > 2))];
    const spokenWords = new Set(spoken.split(' '));
    return words.length >= 4 && words.filter(word => spokenWords.has(word)).length / words.length >= 0.86;
}

function isBriefingOpenCommand(prompt) {
    return /\b(?:open|go to|take me to|navigate to|show me)\b.*\b(?:pending|overdue|outstanding|that|the|my)\s+(?:item|task|action|activity|work)\b/i.test(String(prompt || ''));
}

function selectBriefingItem(briefing, prompt) {
    const items = Array.isArray(briefing?.items) ? briefing.items : [];
    if (!items.length) return null;
    if (/\boverdue\b/i.test(String(prompt || ''))) {
        const now = Date.now();
        return items.find(item => item.dueAt && new Date(item.dueAt).getTime() < now) || null;
    }
    return items[0];
}

function safeClientDestination(value) {
    const destination = String(value || '').replace(/^\/+/, '');
    return /^(?:pages\/[a-z0-9-]+|nca-grc-risk-register)\.html(?:\?[a-z0-9_=&%.-]*)?$/i.test(destination) ? destination : null;
}

function isGuidedNavigationCommand(prompt) {
    return /\b(?:guide|walk|take|show)\b.*\b(?:through|how to|how do i)\b/i.test(String(prompt || ''));
}

function isExplicitGeneralKnowledgeRequest(prompt) {
    const question = String(prompt || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const explicitlyGeneral = /\b(?:general|open|broad)\s+(?:talk|conversation|discussion|question|topic)\b/.test(question)
        || /\b(?:talk|chat|converse|have a conversation|have a discussion)\b.*\b(?:outside|unrelated to)\b.*\b(?:system|platform|application|app|grc)\b/.test(question);
    return explicitlyGeneral && !hasExplicitSystemDomainIntent(question);
}

function isClearGeneralTopicRequest(prompt) {
    const question = String(prompt || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (hasExplicitSystemDomainIntent(question) || hasCurrentScreenIntent(question)) return false;
    return /\b(?:talk|chat|discuss|discussion|conversation)\b.*\b(?:about|on|regarding)\b/.test(question)
        || /\b(?:explain|define|compare|describe|what is|who is|why is|how does|how do)\b/.test(question);
}

function hasCurrentScreenIntent(prompt) {
    const question = String(prompt || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return manual.isPageContextQuestion(question)
        || /\b(?:this|current|visible)\s+(?:page|screen|form|field|dialog|window)\b/.test(question)
        || /\b(?:on|from)\s+(?:this|the current|the visible)\s+(?:page|screen|form)\b/.test(question)
        || /\b(?:begin|start|get started|proceed|continue|next step|way forward)\b.*\b(?:here|this|page|screen|form)\b/.test(question)
        || /\b(?:here|this page|this screen|this form)\b.*\b(?:begin|start|proceed|continue|next|do)\b/.test(question);
}

function hasExplicitSystemDomainIntent(prompt) {
    const question = String(prompt || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const namedApplication = /\b(?:nca\s+grc|grc\s+(?:system|platform|application|app)|this\s+(?:system|platform|application|app))\b/.test(question);
    const governedFeature = /\b(?:risk\s+(?:register|score|scoring|assessment|treatment|owner|champion|focal)|treatment\s+plans?|compliance\s+assurance|action\s+centre|board\s+dashboard|executive\s+analytics|account\s+mapping|system\s+manual|work\s*plans?|workbooks?|audit\s+logs?|approvals?|governed\s+records?|focal\s+persons?|risk\s+champions?|committee\s+chairm(?:an|en)|group\s+onboarding|user\s+management)\b/.test(question);
    const navigationItem = navigationCatalog.resolveNavigationItem(prompt);
    const namedNavigationFeature = Boolean(navigationItem)
        && (navigationItem.key !== 'actionCentre' || /\baction\s+cent(?:re|er)\b/.test(question));
    return namedApplication || governedFeature || namedNavigationFeature;
}

function isActiveSystemFollowUp(prompt, history = []) {
    const question = String(prompt || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const followUp = /\b(?:more|detail|details|continue|clarify|explain further|expand|elaborate|how so|what about that|go on)\b/.test(question)
        || /^why(?:\?|$|\s+(?:is|does|would|should)\s+(?:that|it|this)\b)/.test(question);
    if (!followUp) return false;
    // Only the immediately preceding exchange may establish a system topic.
    // Older briefings and page guidance must not reclaim a later general chat.
    return history.slice(-2).some(item => {
        const role = String(item?.role || '').toLowerCase();
        const text = String(item?.text || '');
        return role === 'user' ? hasExplicitSystemDomainIntent(text)
            : role === 'assistant' && /Source: NCA GRC System Manual/i.test(text);
    });
}

function hasSystemDomainIntent(prompt, history = []) {
    return hasExplicitSystemDomainIntent(prompt) || isActiveSystemFollowUp(prompt, history);
}

function normaliseSemanticRoute(result, prompt, history = []) {
    if (!result) return null;
    if (hasCurrentScreenIntent(prompt)) return { ...result, route: 'current_screen' };
    if (hasSystemDomainIntent(prompt, history)) return { ...result, route: 'system' };
    // A nearest-centroid result is not itself evidence that an unrelated named
    // subject belongs to the visible page. General mode therefore defaults to
    // general knowledge unless the words establish page or GRC system intent.
    return { ...result, route: 'general' };
}

function knowledgeContext(question, key, history = [], user = {}, screenContext = {}, guidedResult = undefined) {
    const guided = guidedResult === undefined
        ? workflowGuide.guide(question, key, history, user, screenContext)
        : guidedResult;
    if (guided) return {
        text: guided.answer,
        source: safeSource('system-help', `manual:${manual.MANUAL_VERSION}`, 'NCA GRC System Manual', guided.title),
        suggestedActions: guided.destination ? [{ label: `Open ${guided.title}`, destination: guided.destination }] : [],
        uiGuidance: guided.uiGuidance
    };
    const navigationAnswer = manual.findNavigationAnswer(question, user);
    return {
        text: navigationAnswer?.answer || manual.findManualAnswer(question, key, history, user),
        source: safeSource('system-help', `manual:${manual.MANUAL_VERSION}`, 'NCA GRC System Manual', navigationAnswer?.title || manual.pages[key]?.title || 'Governed workflow'),
        suggestedActions: [], uiGuidance: null
    };
}

function generalProviderHistory(history = []) {
    // The sign-in briefing and governed workflow messages are application context,
    // not general-knowledge conversation. Keep them out of model history so a
    // generic follow-up cannot cause the model to repeat private notifications.
    const applicationMessage = /(?:\byou have \d+ overdue items?\b|\bitems? awaiting someone else\b|^opening .+\. i will keep the conversation|^opened .+\. voice conversation|^guided task:|^next guidance for |source: nca grc system manual|^in your authorised scope there are )/i;
    return history.filter(item => item?.role === 'user' || !applicationMessage.test(String(item?.text || '').trim()));
}

function parseSemanticRoute(value) {
    const text = String(value || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?|```/gi, '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const payload = JSON.parse(match[0]);
        const route = String(payload.route || '').toLowerCase().replace(/[\s-]+/g, '_');
        if (!['current_screen', 'system', 'general'].includes(route)) return null;
        return { route, answer: route === 'general' ? String(payload.answer || '').trim() : '' };
    } catch (_error) {
        return null;
    }
}

function cosineSimilarity(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return -1;
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index += 1) {
        dot += left[index] * right[index];
        leftNorm += left[index] * left[index];
        rightNorm += right[index] * right[index];
    }
    return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : -1;
}

function meanVector(vectors) {
    if (!vectors.length) return [];
    return vectors[0].map((_, index) => vectors.reduce((sum, vector) => sum + Number(vector[index] || 0), 0) / vectors.length);
}

function semanticRouteFromEmbeddings(vectors) {
    const routeNames = Object.keys(SEMANTIC_ROUTE_EXAMPLES);
    const query = vectors[0];
    let offset = 1;
    const scores = routeNames.map(route => {
        const count = SEMANTIC_ROUTE_EXAMPLES[route].length;
        const centroid = meanVector(vectors.slice(offset, offset + count));
        offset += count;
        return { route, score: cosineSimilarity(query, centroid) };
    }).sort((left, right) => right.score - left.score);
    return scores[0]?.score > -1 ? { route: scores[0].route, confidence: scores[0].score, scores } : null;
}

async function callEmbeddingRouter({ prompt, signal }) {
    const baseUrl = String(process.env.AI_EMBEDDING_BASE_URL || '').replace(/\/$/, '');
    if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(baseUrl)) return null;
    const model = String(process.env.AI_EMBEDDING_MODEL || 'all-MiniLM-L6-v2-Q4_K_M');
    const examples = Object.values(SEMANTIC_ROUTE_EXAMPLES).flat();
    const response = await fetch(`${baseUrl}/v1/embeddings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ model, input: [prompt, ...examples], encoding_format: 'float' })
    });
    if (!response.ok) throw new Error(`Local semantic embeddings returned HTTP ${response.status}.`);
    const payload = await response.json();
    const vectors = (payload.data || []).slice().sort((left, right) => left.index - right.index).map(item => item.embedding);
    if (vectors.length !== examples.length + 1) throw new Error('Local semantic embeddings returned an incomplete result.');
    const result = semanticRouteFromEmbeddings(vectors);
    return result ? { ...result, model, usage: { input_tokens: payload.usage?.prompt_tokens || null, output_tokens: 0 } } : null;
}

async function callSemanticRouter({ config, prompt, page, history = [], signal }) {
    if (!['ollama', 'llamacpp'].includes(config.provider)) return null;
    try {
        const embedded = await callEmbeddingRouter({ prompt, signal });
        if (embedded) return embedded;
    } catch (_error) {
        // Fall through to the local generative classifier if embeddings are unavailable.
    }
    const instruction = `You are the private on-premises intent router and general assistant for the NCA GRC application.
Classify the user's meaning, not exact wording. The currently visible page is supplied only as context.
Return JSON only: {"route":"current_screen"}, {"route":"system"}, or {"route":"general"}.
Use current_screen when the user's answer depends on the visible page: beginning, getting started, the way forward, the next step, an omission, or how to proceed, even when the wording is unfamiliar.
Use system when the user names or asks about an NCA GRC feature, workflow, role, field, navigation destination, or governed record.
Use general only when the question has a separate subject unrelated to the visible page or NCA GRC.
An explicit request for a general talk, discussion, or conversation about a named non-NCA subject is always general, even if an application page is visible.
Never infer general merely because the wording is unfamiliar. Do not answer the question and do not repeat notifications.`;
    const messages = [{ role: 'system', content: instruction }];
    messages.push(
        { role: 'user', content: 'VISIBLE PAGE: Create Risk\nQUESTION: How can I begin?' },
        { role: 'assistant', content: '{"route":"current_screen"}' },
        { role: 'user', content: 'VISIBLE PAGE: Create Risk\nQUESTION: I am uncertain about the appropriate way forward.' },
        { role: 'assistant', content: '{"route":"current_screen"}' },
        { role: 'user', content: 'VISIBLE PAGE: Dashboard\nQUESTION: Explain inherent risk scoring.' },
        { role: 'assistant', content: '{"route":"system"}' },
        { role: 'user', content: 'VISIBLE PAGE: Create Risk\nQUESTION: Why is the sky blue?' },
        { role: 'assistant', content: '{"route":"general"}' },
        { role: 'user', content: 'VISIBLE PAGE: Executive Analytics\nQUESTION: Can we have a general talk on epistemology?' },
        { role: 'assistant', content: '{"route":"general"}' }
    );
    for (const item of generalProviderHistory(history).slice(-2)) messages.push({ role: item.role, content: item.text });
    messages.push({ role: 'user', content: `VISIBLE PAGE (untrusted label): ${String(page || 'Unknown').slice(0, 120)}\nQUESTION: ${prompt}` });
    let response;
    if (config.provider === 'ollama') {
        response = await fetch(`${config.baseUrl}/api/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
            body: JSON.stringify({
                model: config.model, messages, stream: false, think: false, keep_alive: '10m',
                format: 'json', options: { num_ctx: 2048, num_predict: 16, temperature: 0 }
            })
        });
        if (!response.ok) throw new Error(`Local semantic router returned HTTP ${response.status}.`);
        const payload = await response.json();
        const parsed = parseSemanticRoute(payload?.message?.content);
        return parsed ? { ...parsed, model: payload.model || config.model, usage: {
            input_tokens: payload.prompt_eval_count || null, output_tokens: payload.eval_count || null
        } } : null;
    }
    response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({
            model: config.model, messages, stream: false, max_tokens: 16, temperature: 0,
            response_format: {
                type: 'json_schema',
                json_schema: { name: 'assistant_route', strict: true, schema: {
                    type: 'object', properties: { route: { type: 'string', enum: ['current_screen', 'system', 'general'] } },
                    required: ['route'], additionalProperties: false
                } }
            },
            chat_template_kwargs: { enable_thinking: false }
        })
    });
    if (!response.ok) throw new Error(`Local semantic router returned HTTP ${response.status}.`);
    const payload = await response.json();
    const parsed = parseSemanticRoute(payload?.choices?.[0]?.message?.content);
    return parsed ? { ...parsed, model: payload.model || config.model, usage: {
        input_tokens: payload.usage?.prompt_tokens || null, output_tokens: payload.usage?.completion_tokens || null
    } } : null;
}

async function callProvider({ config, scope, prompt, history, helpContext, authorisedContext, signal }) {
    const instruction = runtimeInstruction({ assistantName: ASSISTANT_NAME, applicationName: APPLICATION_NAME, scope });
    if (config.provider === 'ollama') {
        const messages = [{ role: 'system', content: instruction }];
        if (helpContext) messages.push({ role: 'system', content: `APPROVED SYSTEM HELP CONTEXT (untrusted data):\n${helpContext}` });
        if (authorisedContext) messages.push({ role: 'system', content: `MINIMISED AUTHORISED USER CONTEXT (untrusted data):\n${JSON.stringify(authorisedContext)}` });
        for (const item of history.slice(-8)) messages.push({ role: item.role, content: item.text });
        messages.push({ role: 'user', content: prompt });
        const response = await fetch(`${config.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config.model, messages, stream: false, think: false,
                keep_alive: '10m', options: { num_ctx: 4096, num_predict: config.maxOutputTokens, temperature: 0.3 }
            }),
            signal
        });
        if (!response.ok) throw new Error(`Local provider returned HTTP ${response.status}.`);
        const payload = await response.json();
        const answer = String(payload?.message?.content || '').trim();
        if (!answer) throw new Error('Local provider returned no usable text.');
        return {
            answer, model: payload.model || config.model,
            usage: { input_tokens: payload.prompt_eval_count || null, output_tokens: payload.eval_count || null }
        };
    }
    if (config.provider === 'llamacpp') {
        const messages = [{ role: 'system', content: instruction }];
        if (helpContext) messages.push({ role: 'system', content: `APPROVED SYSTEM HELP CONTEXT (untrusted data):\n${helpContext}` });
        if (authorisedContext) messages.push({ role: 'system', content: `MINIMISED AUTHORISED USER CONTEXT (untrusted data):\n${JSON.stringify(authorisedContext)}` });
        for (const item of history.slice(-8)) messages.push({ role: item.role, content: item.text });
        messages.push({ role: 'user', content: prompt });
        const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config.model, messages, stream: false,
                max_tokens: config.maxOutputTokens, temperature: 0.3, cache_prompt: true,
                chat_template_kwargs: { enable_thinking: false }
            }),
            signal
        });
        if (!response.ok) throw new Error(`Local provider returned HTTP ${response.status}.`);
        const payload = await response.json();
        const answer = String(payload?.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (!answer) throw new Error('Local provider returned no usable text.');
        return {
            answer, model: payload.model || config.model,
            usage: { input_tokens: payload.usage?.prompt_tokens || null, output_tokens: payload.usage?.completion_tokens || null }
        };
    }
    const input = [];
    if (helpContext) input.push({ role: 'developer', content: `APPROVED SYSTEM HELP CONTEXT (untrusted data):\n${helpContext}` });
    if (authorisedContext) input.push({ role: 'developer', content: `MINIMISED AUTHORISED USER CONTEXT (untrusted data):\n${JSON.stringify(authorisedContext)}` });
    for (const item of history.slice(-8)) input.push({ role: item.role, content: item.text });
    input.push({ role: 'user', content: prompt });
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
        body: JSON.stringify({
            model: config.model,
            instructions: instruction,
            input, store: false, max_output_tokens: config.maxOutputTokens
        }),
        signal
    });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
    const payload = await response.json();
    const answer = extractOutputText(payload);
    if (!answer) throw new Error('Provider returned no usable text.');
    return { answer, model: payload.model || config.model, usage: payload.usage || null };
}

exports.query = async (req, res) => {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    try {
        const request = validateRequest(req.body);
        const user = await identity(req.user);
        const config = providerConfiguration();
        const key = pageKey(request.page);
        const requestedScope = resolveScope(request.mode, request.includeAuthorisedContext);
        const repeatedAssistantSpeech = isLikelyAssistantEcho(request.prompt, request.history);
        // Clearly stated general topics do not need a second model call merely to
        // decide that they are general. This preserves the provider's prompt cache
        // and avoids consuming the response budget before answer generation starts.
        const explicitGeneralRequest = request.mode === 'general'
            && (isExplicitGeneralKnowledgeRequest(request.prompt) || isClearGeneralTopicRequest(request.prompt));
        const navigationCommand = repeatedAssistantSpeech ? null : navigationCatalog.resolveNavigationCommand(request.prompt, user.role);
        const pageInsight = repeatedAssistantSpeech || navigationCommand ? null
            : pageAwareness.answer(request.prompt, key, user, request.screenContext);
        let workflowGuidance = repeatedAssistantSpeech || navigationCommand || pageInsight ? null
            : workflowGuide.guide(request.prompt, key, request.history, user, request.screenContext);
        const briefingQuestion = !repeatedAssistantSpeech && !navigationCommand && !pageInsight && !workflowGuidance
            && isBriefingQuestion(request.prompt, request.history);
        const briefingOpenCommand = briefingQuestion && isBriefingOpenCommand(request.prompt);
        let semanticResult = null;
        let semanticError = null;
        if (!explicitGeneralRequest && !repeatedAssistantSpeech && !navigationCommand && !pageInsight && !workflowGuidance && !briefingQuestion
            && request.mode === 'general' && config.configured && ['ollama', 'llamacpp'].includes(config.provider)) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), config.routingTimeoutMs);
            req.once('aborted', () => controller.abort());
            try {
                semanticResult = await callSemanticRouter({
                    config, prompt: request.prompt,
                    page: request.screenContext.pageTitle || manual.pages[key]?.title || key,
                    history: request.history, signal: controller.signal
                });
                semanticResult = normaliseSemanticRoute(semanticResult, request.prompt, request.history);
            } catch (error) {
                semanticError = error;
            } finally {
                clearTimeout(timeout);
            }
            if (semanticResult?.route === 'current_screen') {
                workflowGuidance = workflowGuide.guide(
                    request.prompt, key, request.history, user, request.screenContext, { forceCurrentScreen: true }
                );
            }
        }
        const systemQuestion = !explicitGeneralRequest && !repeatedAssistantSpeech && request.mode === 'general'
            && (Boolean(navigationCommand) || Boolean(pageInsight) || Boolean(workflowGuidance) || ['system', 'current_screen'].includes(semanticResult?.route)
                || (!semanticResult && (hasCurrentScreenIntent(request.prompt) || hasSystemDomainIntent(request.prompt, request.history))));
        const scope = repeatedAssistantSpeech ? 'system_help' : briefingQuestion ? 'personal_context' : systemQuestion ? 'system_help' : requestedScope;
        const help = pageInsight ? {
            text: pageInsight.answer,
            source: safeSource('visible-page-context', `page:${key}`, pageInsight.pageTitle, pageInsight.dialogTitle || 'Rendered page snapshot'),
            suggestedActions: [], uiGuidance: null
        } : request.mode !== 'general' || systemQuestion
            ? knowledgeContext(request.prompt, key, request.history, user, request.screenContext, workflowGuidance)
            : null;
        const guidedNavigation = !repeatedAssistantSpeech && !navigationCommand && isGuidedNavigationCommand(request.prompt)
            ? help?.suggestedActions?.[0] || null : null;
        let briefingContext = null;
        let evidence = null;
        let sources = help ? [help.source] : [];
        let factsAsOf = null;
        let workContextSharedExternally = false;
        let providerResult = null;
        let providerError = semanticError;

        if (briefingQuestion) {
            briefingContext = await loadBriefing(user, req);
            factsAsOf = briefingContext.factsAsOf;
            sources = [briefingContext.source];
        } else if (scope === 'personal_context') {
            evidence = await riskAnalysis(user);
            factsAsOf = new Date().toISOString();
            sources = evidence.top.map(row => safeSource('application-record', row.risk_id, row.risk_title, row.stage, row.updated_at));
        }

        // Approved platform guidance must return immediately from the local manual and
        // workflow catalogue. Never queue it behind CPU-bound general inference.
        const mayCallProvider = !providerResult && !repeatedAssistantSpeech && !navigationCommand && !briefingQuestion && !guidedNavigation
            && config.configured
            && (scope === 'general' || (scope === 'personal_context' && config.governedContextAllowed));
        if (mayCallProvider) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
            req.once('aborted', () => controller.abort());
            workContextSharedExternally = scope === 'personal_context';
            try {
                providerResult = await callProvider({
                    config, scope, prompt: request.prompt,
                    // Preserve conversational continuity for general questions. Personal
                    // history is only eligible here when governed-context processing has
                    // explicitly been allowed by policy (enforced by mayCallProvider).
                    history: scope === 'general' ? generalProviderHistory(request.history)
                        : scope === 'personal_context' ? request.history : [],
                    helpContext: help?.text || null,
                    authorisedContext: scope === 'personal_context' ? evidence : null,
                    signal: controller.signal
                });
                providerError = null;
            } catch (error) {
                providerError = error;
            } finally {
                clearTimeout(timeout);
            }
        }

        let answer;
        let deliveryMode;
        let provenance;
        let clientAction = null;
        if (repeatedAssistantSpeech) {
            answer = 'Audio matching my previous spoken response was ignored.';
            deliveryMode = 'local-fallback';
            provenance = 'voice-safety';
            sources = [];
        } else if (briefingContext) {
            const selectedItem = briefingOpenCommand ? selectBriefingItem(briefingContext, request.prompt) : null;
            if (selectedItem) {
                const destination = safeClientDestination(selectedItem.destination);
                answer = destination
                    ? `Opening ${selectedItem.title}. It is currently ${selectedItem.status || 'Pending'}. I will continue guiding you on the destination page.`
                    : `${selectedItem.title} is the relevant item, but its destination is not safe to open automatically. Use Action Centre to inspect it.`;
                if (destination) clientAction = { type: 'navigate', destination, label: selectedItem.title };
            } else {
                answer = briefingOpenCommand && /\boverdue\b/i.test(request.prompt) && briefingContext.counts.overdue === 0
                    ? 'You currently have no overdue authorised work item to open.'
                    : localBriefingAnswer(briefingContext);
            }
            deliveryMode = 'local-context';
            provenance = 'live-user-data';
        } else if (navigationCommand) {
            answer = navigationCommand.authorised
                ? `Opening ${navigationCommand.label}. I will keep the conversation available and continue guiding you there.`
                : navigationCommand.reason;
            deliveryMode = 'local-fallback';
            provenance = 'system-guidance';
            if (navigationCommand.authorised) clientAction = {
                type: 'navigate', destination: navigationCommand.destination, label: navigationCommand.label
            };
        } else if (providerResult) {
            answer = providerResult.answer;
            deliveryMode = 'connected-ai';
            provenance = scope === 'general' ? 'general' : scope === 'system_help' ? 'system-guidance' : (help ? 'mixed-context' : 'live-user-data');
            if (scope === 'personal_context' && help) sources = [help.source, ...sources];
        } else if (scope === 'personal_context') {
            answer = localRiskAnswer(evidence);
            deliveryMode = 'local-context';
            provenance = 'live-user-data';
        } else if (help) {
            answer = help.text;
            deliveryMode = pageInsight ? 'local-context' : 'local-fallback';
            provenance = pageInsight ? 'visible-page-context' : 'system-guidance';
            const destination = safeClientDestination(guidedNavigation?.destination);
            if (destination) clientAction = { type: 'navigate', destination, label: guidedNavigation.label || 'guided page' };
        } else {
            answer = config.configured && providerError
                ? `${['ollama', 'llamacpp'].includes(config.provider) ? 'On-premises' : 'Connected'} AI is temporarily unavailable. System Help and authorised My Work summaries remain available.`
                : 'I can answer NCA GRC system questions and authorised-work questions locally. An approved general-knowledge provider is not available in this environment, so I will not invent an answer to an unrelated open-ended question. Ask about the platform or select My Work for an authorised summary.';
            deliveryMode = 'local-fallback';
            provenance = 'none';
            sources = [];
        }

        const response = {
            deliveryMode, scope, provenance, answer, sources, factsAsOf,
            suggestedActions: clientAction
                ? [{ label: `Open ${clientAction.label}`, destination: clientAction.destination }]
                : briefingContext?.items?.length
                ? briefingContext.items.slice(0, 3).map(item => ({ label: `Open ${item.title}`, destination: item.destination }))
                : help?.suggestedActions?.length ? help.suggestedActions : help ? [{ label: 'Open System Manual', destination: 'pages/system-manual.html' }] : [],
            uiGuidance: help?.uiGuidance || null,
            pageContext: pageInsight ? {
                used: true, source: 'rendered-role-authorised-dom', page: key,
                contentItems: pageInsight.capturedContentCount, matchedItems: pageInsight.matchedContentCount
            } : { used: false },
            clientAction,
            suppressSpeech: repeatedAssistantSpeech,
            workContextSharedExternally, requestId
        };
        const auditWrite = logAudit({ req, action: 'ASSISTANT_QUERY', entityType: 'AI Assistant', entityId: requestId, details: {
            mode: request.mode, scope, private_context_consent: request.includeAuthorisedContext,
            work_context_shared_externally: workContextSharedExternally, provider: config.provider,
            model: providerResult?.model || semanticResult?.model || null, delivery_mode: deliveryMode, provenance,
            source_references: sources.map(source => source.sourceId), outcome: repeatedAssistantSpeech ? 'IgnoredEcho' : providerError ? 'Fallback' : 'Success',
            client_action: clientAction?.type || null,
            screen_context: {
                page: key, dialog_present: Boolean(request.screenContext.dialogTitle),
                field_count: request.screenContext.fields.length, content_count: request.screenContext.content.length,
                page_awareness_used: Boolean(pageInsight)
            },
            latency_ms: Date.now() - startedAt, input_tokens: providerResult?.usage?.input_tokens || semanticResult?.usage?.input_tokens || null,
            output_tokens: providerResult?.usage?.output_tokens || semanticResult?.usage?.output_tokens || null, question_length: request.prompt.length
        } });
        res.json({ success: true, ...response });
        await auditWrite;
    } catch (error) {
        const status = error.status || 500;
        if (status >= 500) console.error(error);
        res.status(status).json({ success: false, code: error.code, message: status === 400 ? error.message : 'The assistant could not complete this governed query.', requestId });
    }
};

exports._test = {
    pageKey, loadBriefing, statusPayload, localRiskAnswer, isBriefingQuestion, localBriefingAnswer,
    isLikelyAssistantEcho, isBriefingOpenCommand, selectBriefingItem, safeClientDestination, isGuidedNavigationCommand,
    isExplicitGeneralKnowledgeRequest,
    isClearGeneralTopicRequest,
    hasCurrentScreenIntent, hasExplicitSystemDomainIntent, isActiveSystemFollowUp, hasSystemDomainIntent, normaliseSemanticRoute,
    generalProviderHistory, parseSemanticRoute, cosineSimilarity, semanticRouteFromEmbeddings,
    callEmbeddingRouter, callSemanticRouter, callProvider
};
