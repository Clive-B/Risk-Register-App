const ROLES = Object.freeze({
    ADMIN: 'System Administrator',
    CHAIRMAN: 'Risk Committee Chairman',
    CHAMPION: 'Risk Champion',
    FOCAL: 'Risk Focal Person'
});

const ROLE_NAVIGATION = Object.freeze({
    [ROLES.ADMIN]: [
        ['Dashboard', 'dashboard'], ['Action Centre', 'actionCentre'], ['User Management', 'users'],
        ['Account Mapping', 'accountMapping'], ['Audit Logs', 'auditLogs'], ['System Settings', 'systemSettings'],
        ['System Manual', 'systemManual'], ['Administration · Communication Centre', 'communication'],
        ['Executive Analytics', 'executiveAnalytics'], ['Board Dashboard', 'boardDashboard'],
        ['Consolidated Risk Register', 'risks'], ['Division Risk Uploads', 'adminDivisionRiskUploads'],
        ['Division Focal Submissions', 'adminFocalSubmissions'], ['Work Plan Risks', 'workplans'],
        ['Create Risk', 'createRisk'], ['Pending Approvals', 'pendingApprovals'], ['My Approvals', 'myApprovals'],
        ['Analytics', 'assessment'], ['Treatment Plans', 'treatment'], ['Compliance Assurance', 'compliance'],
        ['Reports', 'reports']
    ],
    [ROLES.CHAMPION]: [
        ['Dashboard', 'dashboard'], ['Action Centre', 'actionCentre'], ['Consolidated Risk Register', 'risks'],
        ['Work Plan Risks', 'workplans'], ['Create Risk', 'createRisk'], ['Pending Approvals', 'pendingApprovals'],
        ['My Approvals', 'myApprovals'], ['Risk Heat Map', 'assessment'], ['Treatment Plans', 'treatment'],
        ['Compliance Assurance', 'compliance'], ['Reports', 'reports']
    ],
    [ROLES.FOCAL]: [
        ['Dashboard', 'dashboard'], ['Action Centre', 'actionCentre'], ['Consolidated Risk Register', 'risks'],
        ['Risk Register', 'riskRegister'], ['Administrator-Staged Risks', 'focalRiskAdmissions'],
        ['Work Plan Upload', 'workplans'], ['Create Risk', 'createRisk'], ['My Approvals', 'myApprovals'],
        ['Treatment Plans', 'treatment'], ['Compliance Assurance', 'compliance'], ['System Manual', 'systemManual']
    ],
    [ROLES.CHAIRMAN]: [
        ['Enterprise Dashboard', 'executiveAnalytics'], ['Board Dashboard', 'boardDashboard'],
        ['Action Centre', 'actionCentre'], ['Consolidated Risk Register', 'risks'],
        ['Work Plan Risk Escalations', 'workplans'], ['High Risk Reviews', 'pendingApprovals'],
        ['Treatment Plans', 'treatment'], ['Compliance Assurance', 'compliance'],
        ['Enterprise Heat Map', 'assessment'], ['Executive Reports', 'reports'], ['System Manual', 'systemManual']
    ]
});

const DESTINATIONS = Object.freeze({
    dashboard: 'nca-grc-risk-register.html', actionCentre: 'pages/action-centre.html', users: 'pages/users.html',
    accountMapping: 'pages/account-mapping.html', auditLogs: 'pages/audit-logs.html', systemSettings: 'pages/system-settings.html',
    systemManual: 'pages/system-manual.html', communication: 'pages/communication-centre.html',
    executiveAnalytics: 'pages/executive-analytics.html', boardDashboard: 'pages/board-dashboard.html',
    risks: 'pages/risks.html', adminDivisionRiskUploads: 'pages/admin-division-risk-uploads.html',
    adminFocalSubmissions: 'pages/admin-focal-submissions.html', workplans: 'pages/workplans.html',
    createRisk: 'pages/create-risk.html', pendingApprovals: 'pages/pending-approvals.html',
    myApprovals: 'pages/my-approvals.html', assessment: 'pages/assessment.html', treatment: 'pages/treatment.html',
    compliance: 'pages/compliance.html', reports: 'pages/reports.html', riskRegister: 'pages/risk-register.html',
    focalRiskAdmissions: 'pages/focal-risk-admissions.html'
});

const ITEMS = Object.freeze({
    dashboard: {
        title: 'Dashboard', aliases: ['executive dashboard', 'home dashboard', 'home'],
        description: 'Opens the signed-in user’s role-aware landing page with authorised risk indicators, notifications, Action Centre highlights, quick actions and recent operational activity.',
        actions: ['Review the current risk posture and work requiring attention.', 'Open permitted operational shortcuts and recent activity.']
    },
    actionCentre: {
        title: 'Action Centre', aliases: ['action center', 'actions'],
        description: 'Opens the user’s governed work queue, separating actionable assignments from recent activity and presenting priority and status information.',
        actions: ['Filter and inspect assigned actions.', 'Open the source record, add permitted comments and complete or dismiss only actions whose policy allows it.']
    },
    users: {
        title: 'User Management', aliases: ['users management', 'manage users', 'user accounts'],
        description: 'Allows System Administrators to create and maintain NCA GRC accounts, including bulk provisioning, activation state, account status and governed credential administration.',
        actions: ['Create or edit individual and bulk user records.', 'Lock, unlock, deactivate or initiate an administrative password reset where authorised.']
    },
    accountMapping: {
        title: 'Account Mapping', aliases: ['organizational account mapping', 'organisational account mapping', 'map accounts'],
        description: 'Maps permanent organisational role accounts to current employees using effective-dated assignments without rewriting historic ownership or decisions.',
        actions: ['Assign an official NCA email, effective date and reason to a role account.', 'Review current holders and assignment history; replacements revoke former access and transfer unfinished assigned work.']
    },
    auditLogs: {
        title: 'Audit Logs', aliases: ['audit log', 'audit trail'],
        description: 'Provides System Administrators with a read-only, filterable record of governed application events for investigation and accountability.',
        actions: ['Search and filter recorded audit events.', 'Inspect event details and export the permitted audit view.']
    },
    systemSettings: {
        title: 'System Settings', aliases: ['settings', 'platform settings'],
        description: 'Provides the System Administrator’s governed configuration overview for security policy, platform configuration, email delivery and administration.',
        actions: ['Review supported configuration and operational status.', 'Use authorised administration controls without exposing stored secrets.']
    },
    systemManual: {
        title: 'System Manual', aliases: ['user manual', 'manual', 'help guide'],
        description: 'Opens the authoritative in-system guide to accounts, risk intake, assessments, approvals, treatment, assistant use and secure operation.',
        actions: ['Read verified workflow and security guidance.', 'Use the contents links to locate the relevant governed process.']
    },
    communication: {
        title: 'Administration · Communication Centre', aliases: ['communication centre', 'communication center', 'communications'],
        description: 'Allows System Administrators to oversee outbound communication queues, maintain approved email and notification templates, and publish executive announcements.',
        actions: ['Review queue health and delivery records.', 'Maintain approved templates and publish announcements to authorised audiences.']
    },
    executiveAnalytics: {
        title: 'Executive Analytics', aliases: ['enterprise dashboard', 'executive analytics button'],
        description: 'Presents authority-wide, permission-controlled risk and treatment intelligence through trends, an enterprise heat map, division scorecards and executive insights.',
        actions: ['Apply date, division and category filters.', 'Inspect trends and open supporting risks before drawing conclusions.']
    },
    boardDashboard: {
        title: 'Board Dashboard', aliases: ['board governance dashboard', 'board dashboard button'],
        description: 'Opens the Board Governance Dashboard for board-level oversight of the top enterprise risks, risk-appetite position, executive summary, emerging risks and strategic risks.',
        actions: ['Review top-ten and strategic risk exposure.', 'Use the indicators for oversight, then verify the underlying governed records before making a decision.']
    },
    risks: {
        title: 'Consolidated Risk Register', aliases: ['consolidated risks', 'risk list', 'all risks'],
        description: 'Opens the governed register of risks visible to the signed-in role, preserving separate System, Focal, Champion and Chairman assessments and their workflow provenance.',
        actions: ['Filter and inspect risks within the authorised organisational scope.', 'Open evidence, history, treatment and the assessment action currently permitted for the user’s role.']
    },
    adminDivisionRiskUploads: {
        title: 'Division Risk Uploads', aliases: ['division risk workplan uploads', 'multi division uploads'],
        description: 'Allows a System Administrator to stage approved division workbooks received from Focal Persons while retaining the accountable division and Focal attribution.',
        actions: ['Add and validate one workbook per division.', 'Confirm corrections and submit the governed batch for Focal Person review.']
    },
    adminFocalSubmissions: {
        title: 'Division Focal Submissions', aliases: ['focal submissions', 'submission register'],
        description: 'Provides System Administrators with read-only monitoring of staged division registers, Focal Person submissions and their downstream governance progress.',
        actions: ['Track submission status and accountable Focal Person.', 'Monitor progress without replacing the Focal Person’s assessment decision.']
    },
    workplans: {
        title: 'Work Plan Risks', aliases: ['work plan upload', 'work plan risk escalations', 'work plan risk assessment', 'workplans'],
        description: 'Opens work-plan risk assessment and governance. The available controls change by role: Focal Persons upload and confirm work-plan risks, Champions review divisional batches and challenges, and the Chairman reviews escalated batches for final decision.',
        actions: ['Inspect the work-plan archive and its derived risks.', 'Use only the upload, review, escalation or final-decision controls permitted for the signed-in role.']
    },
    createRisk: {
        title: 'Create Risk', aliases: ['add risk', 'new risk', 'create a risk'],
        description: 'Opens a structured risk-entry form covering identification, inherent assessment, existing controls, treatment planning, monitoring and residual assessment.',
        actions: ['Record the risk and its accountable organisational context.', 'Complete the approved 5×5 assessment and treatment information before submission.']
    },
    pendingApprovals: {
        title: 'Pending Approvals', aliases: ['high risk reviews', 'approval deliberation', 'pending reviews'],
        description: 'Opens the governed deliberation queue for risk and treatment decisions awaiting the signed-in approver. Scope and decision stage depend on the user’s role.',
        actions: ['Review evidence and the assessment values available at the current governance stage.', 'Approve, return or record an adjustment reason only where the role and workflow stage permit it.']
    },
    myApprovals: {
        title: 'My Approvals', aliases: ['my approval', 'my decisions'],
        description: 'Shows workflow items assigned to, requested by or previously decided by the signed-in user, with governed details and permitted decision controls.',
        actions: ['Filter and inspect assigned approval work.', 'Open an item to review its stages and make only the decision allowed at the current stage.']
    },
    assessment: {
        title: 'Risk Heat Map and Analytics', aliases: ['analytics', 'risk heat map', 'enterprise heat map', 'heat map'],
        description: 'Displays authorised risk assessments on the approved likelihood-by-impact matrix, with summary counts and escalation indicators appropriate to the role’s scope.',
        actions: ['Filter the assessment population and inspect heat-map cells.', 'Open supporting risks rather than treating an aggregate cell as a final decision.']
    },
    treatment: {
        title: 'Treatment Plans', aliases: ['risk treatment', 'treatments', 'treatment plan'],
        description: 'Tracks risk responses, owners, milestones, progress, evidence, control reassessment and the separate Champion and Committee approval stages.',
        actions: ['View and maintain permitted treatment records.', 'Approve or return eligible plans only at the governance stage assigned to the signed-in role.']
    },
    compliance: {
        title: 'Compliance Assurance', aliases: ['compliance register', 'compliance assurance register', 'obligations'],
        description: 'Opens the compliance obligation register with applicability, owners, due dates, assessment status, evidence, verification and corrective actions.',
        actions: ['Review obligations within the authorised scope.', 'Assess or independently verify evidence only where the signed-in role permits it.']
    },
    reports: {
        title: 'Reports', aliases: ['executive reports', 'ai risk intelligence reports', 'governed reports'],
        description: 'Generates evidence-linked governed risk intelligence reports for the role’s permitted scope, with summaries, comparisons, supporting risks, treatments, data-quality notes and management commentary.',
        actions: ['Choose the permitted report type, scope and reporting period.', 'Generate, review, save commentary and finalise a governed report version where authorised.']
    },
    riskRegister: {
        title: 'Risk Register', aliases: ['risk register admissions', 'official risk register template'],
        description: 'Allows a Risk Focal Person to download the official Template 3 Division Risk Register Tracker, upload a division register, review explainable corrections and admit only confirmed valid rows into governance.',
        actions: ['Download and use only the official Template 3 workbook.', 'Review and confirm every proposed correction before submitting the register.']
    },
    focalRiskAdmissions: {
        title: 'Administrator-Staged Risks', aliases: ['division register admissions', 'staged risks', 'administrator staged risks'],
        description: 'Shows a Risk Focal Person the division registers staged by an Administrator for that Focal Person’s independent review and confirmation.',
        actions: ['Review or edit every staged assessment and its provenance.', 'Submit the complete confirmed division register once to the Risk Champion.']
    },
    logout: {
        title: 'Logout', aliases: ['log out', 'sign out', 'logout button'],
        description: 'Ends the current authenticated browser session, clears locally stored session details and returns the user to sign-in.',
        actions: ['Use it when leaving the system or changing users.', 'Active assistant listening, speech and conversation state are stopped during logout.']
    }
});

function normalise(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function rolesFor(key) {
    if (key === 'logout') return Object.keys(ROLE_NAVIGATION);
    return Object.entries(ROLE_NAVIGATION).filter(([, items]) => items.some(([, itemKey]) => itemKey === key)).map(([role]) => role);
}

function labelsFor(key) {
    if (key === 'logout') return Object.fromEntries(Object.keys(ROLE_NAVIGATION).map(role => [role, 'Logout']));
    return Object.fromEntries(Object.entries(ROLE_NAVIGATION).flatMap(([role, items]) => {
        const item = items.find(([, itemKey]) => itemKey === key);
        return item ? [[role, item[0]]] : [];
    }));
}

function resolveNavigationItem(question) {
    const q = ` ${normalise(question)} `;
    const candidates = Object.entries(ITEMS).flatMap(([key, item]) => [item.title, ...(item.aliases || [])].map(alias => ({ key, alias: normalise(alias) })))
        .sort((a, b) => b.alias.length - a.alias.length);
    const match = candidates.find(candidate => candidate.alias && q.includes(` ${candidate.alias} `));
    return match ? { key: match.key, ...ITEMS[match.key] } : null;
}

function answerNavigationQuestion(question, role) {
    const item = resolveNavigationItem(question);
    if (!item) return null;
    const roles = rolesFor(item.key);
    const labels = labelsFor(item.key);
    const currentLabel = labels[role];
    const access = roles.length === 1 ? roles[0] : `${roles.slice(0, -1).join(', ')} and ${roles.at(-1)}`;
    const roleSentence = currentLabel
        ? `For the ${role}, this navigation item is labelled “${currentLabel}”.`
        : `This item is not included in the ${role} navigation menu.`;
    return {
        key: item.key,
        title: item.title,
        answer: `${item.title}: ${item.description} ${item.actions.join(' ')} ${roleSentence} It is available to: ${access}. Source: NCA GRC System Manual, Role-based navigation — ${item.title}.`
    };
}

function answerCurrentPage(key, role, contextLabel = '') {
    const resolvedKey = key === 'approvals'
        ? (ROLE_NAVIGATION[role]?.some(([, itemKey]) => itemKey === 'myApprovals') ? 'myApprovals' : 'pendingApprovals')
        : key;
    const item = ITEMS[resolvedKey];
    if (!item || resolvedKey === 'logout' || !rolesFor(resolvedKey).includes(role)) return null;
    const label = cleanContextLabel(contextLabel);
    const context = label ? `You opened this page for the pending item “${label}”. ` : '';
    return {
        key: resolvedKey,
        title: item.title,
        answer: `${context}You are on ${item.title}. ${item.description} What to do here: ${item.actions.join(' ')} I can explain the visible controls and help you decide what to inspect next, but you must perform any governed action yourself. Source: NCA GRC System Manual, Role-based navigation — ${item.title}.`
    };
}

function cleanContextLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function resolveNavigationCommand(question, role) {
    const command = /\b(?:open|go to|take me to|navigate to|launch|show me)\b/i.test(String(question || ''));
    if (!command) return null;
    const item = resolveNavigationItem(question);
    if (!item) return null;
    const label = labelsFor(item.key)[role] || item.title;
    const authorised = item.key !== 'logout' && rolesFor(item.key).includes(role) && Boolean(DESTINATIONS[item.key]);
    return {
        key: item.key, title: item.title, label, authorised,
        destination: authorised ? DESTINATIONS[item.key] : null,
        reason: item.key === 'logout'
            ? 'Voice navigation does not end authenticated sessions. Use Logout directly when you intend to sign out.'
            : authorised ? null : `This destination is not available to the ${role} role.`
    };
}

function navigationOverview(role) {
    const items = ROLE_NAVIGATION[role];
    if (!items) return null;
    const descriptions = [...items.map(([label, key]) => `${label} — ${ITEMS[key].description}`), `Logout — ${ITEMS.logout.description}`].join(' ');
    return `The ${role} navigation contains ${items.length} page links plus Logout. ${descriptions} Source: NCA GRC System Manual, ${role} navigation.`;
}

module.exports = { ROLES, ROLE_NAVIGATION, DESTINATIONS, ITEMS, rolesFor, labelsFor, resolveNavigationItem, resolveNavigationCommand, answerNavigationQuestion, answerCurrentPage, navigationOverview };
