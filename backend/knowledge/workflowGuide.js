const FIELD_GUIDANCE = Object.freeze({
    risk_title: 'Use a short, specific event statement that distinguishes this risk from others.',
    risk_description: 'Describe the uncertain event, its underlying cause and the consequence for NCA objectives.',
    risk_source: 'Record where the risk originated, such as an assessment, incident, obligation, project or approved register.',
    risk_cause: 'State the underlying condition that could cause the risk event, rather than repeating the consequence.',
    risk_category: 'Select the category that best represents the principal exposure.',
    directorate: 'Select the accountable NCA division. A Focal Person is restricted to their assigned division.',
    business_unit: 'Identify the unit closest to the activity or process exposed to the risk.',
    programme_project: 'Name the relevant programme or project when the risk is connected to planned work.',
    risk_owner: 'Enter the accountable officer or organisational unit responsible for managing the risk.',
    date_identified: 'Use the date on which the risk was formally identified.',
    assessment_year: 'Enter the year for the governed assessment cycle.',
    likelihood: 'Choose 1–5 using the approved likelihood definitions; do not select a score merely to reach a preferred rating.',
    impact: 'Choose 1–5 using the approved impact definitions and the most credible material consequence.',
    residual_risk_score: 'Record the expected exposure after considering existing controls. It must be between 1 and 25.',
    risk_treatment: 'Choose Terminate, Treat, Transfer or Tolerate according to the authorised response.',
    existing_controls: 'Describe controls that already operate. Do not list proposed future treatments here.',
    control_effectiveness: 'Select the conclusion supported by current control evidence.',
    control_type: 'Classify the control as Preventive, Detective, Corrective, Mixed or Not Assessed.',
    control_design_adequacy: 'Record whether the control design adequately addresses the stated risk.',
    initial_mitigation_plan: 'Describe the proposed treatment or improvement, not an existing control.',
    responsible_officer: 'Identify who is accountable for delivering the proposed treatment.',
    target_completion_date: 'Enter a realistic future completion date agreed with the responsible officer.',
    risk_id: 'Confirm that the treatment is linked to the correct governed risk before editing the plan.',
    plan_title: 'Use a concise title that identifies the treatment and the risk it addresses.',
    treatment_strategy: 'Choose Terminate, Treat, Transfer or Tolerate based on the approved response to the linked risk.',
    action_owner: 'Identify the officer or organisational unit accountable for completing the treatment actions.',
    due_date: 'Enter the agreed date by which the treatment actions should be completed.',
    treatment_objective: 'State the measurable risk-reduction outcome the treatment is intended to achieve.',
    treatment_actions: 'Describe specific, accountable actions rather than a broad intention.',
    monitoring_frequency: 'Select how often progress and effectiveness will be reviewed.',
    review_date: 'Enter the next date on which progress and supporting evidence will be reviewed.',
    target_residual_likelihood: 'Select the expected likelihood after the treatment is implemented.',
    target_residual_impact: 'Select the expected impact after the treatment is implemented.',
    progress_value: 'Record evidence-based progress between 0 and 100 percent.',
    evidence_required: 'Describe the evidence needed to demonstrate that the treatment was completed and effective.',
    evidence_file_name: 'Identify the supporting evidence file when one is available.',
    evidence_url: 'Enter the approved document reference, shared-drive path or URL for the evidence.',
    evidence_notes: 'Summarise what the evidence demonstrates and any remaining gap.',
    status: 'Use Draft while preparing the record. Submission starts the governed review workflow.'
});

const WORKFLOWS = Object.freeze({
    createRisk: {
        title: 'Create a risk', pageKey: 'createRisk', destination: 'pages/create-risk.html', controlId: null,
        roles: ['System Administrator', 'Risk Focal Person', 'Risk Champion'],
        patterns: [/(?:create|add|record|capture|enter|register)\s+(?:a\s+|new\s+)?risk/i, /how\s+(?:do|can)\s+i\s+.*risk/i],
        steps: [
            'Open Create Risk from the navigation.',
            'Describe the risk event, cause and consequence; then select its category, accountable division, owner and assessment year.',
            'Assess likelihood and impact using the approved 5×5 definitions. The inherent score is calculated automatically.',
            'Record existing controls and their evidence-based effectiveness, type and design adequacy.',
            'Choose the treatment response, document the initial mitigation, responsible officer and target date.',
            'Use Save Draft to continue later, or Submit Risk when the record is complete and ready for governed review.'
        ]
    },
    uploadRiskRegister: {
        title: 'Upload a risk register', pageKey: 'riskRegister', destination: 'pages/risk-register.html',
        roles: ['System Administrator', 'Risk Focal Person'],
        patterns: [/upload.*risk.*register/i, /import.*(?:risk|workbook)/i, /risk.*(?:workbook|spreadsheet)/i],
        steps: [
            'Open Risk Register and download the approved workbook template.',
            'Complete the workbook without changing protected headings or scoring rules.',
            'Choose the workbook and review the validation preview.',
            'Resolve or explicitly confirm every proposed correction.',
            'Import the valid records. Focal-supplied assessments remain attributed and continue through Champion and Chairman governance.'
        ]
    },
    reviewStagedRisks: {
        title: 'Review Administrator-staged risks', pageKey: 'focalRiskAdmissions', destination: 'pages/focal-risk-admissions.html',
        roles: ['Risk Focal Person'], patterns: [/staged.*risk/i, /submit all.*champion/i, /focal.*review.*register/i],
        steps: [
            'Open Administrator-Staged Risks and select the assigned upload batch.',
            'Review every row and compare the supplied assessment with the supporting description and controls.',
            'Correct inaccurate fields and explain every material assessment change.',
            'Confirm that no row remains incomplete, then use Submit All to Risk Champion once.'
        ]
    },
    treatmentPlan: {
        title: 'Create or update a treatment plan', pageKey: 'treatment', destination: 'pages/treatment.html',
        roles: ['System Administrator', 'Risk Focal Person', 'Risk Champion'], patterns: [/treatment plan/i, /mitigat(?:e|ion).*risk/i],
        steps: [
            'Open Treatment Plans and select the relevant governed risk.',
            'State the treatment objective and the specific actions required.',
            'Assign accountable owners, due dates, resources and measurable milestones.',
            'Attach or reference supporting evidence and update progress honestly.',
            'Submit for the required approval; completion must not be recorded without the required evidence.'
        ]
    },
    approval: {
        title: 'Complete a governed approval', pageKey: 'approvals', destination: 'pages/my-approvals.html',
        roles: ['System Administrator', 'Risk Focal Person', 'Risk Champion', 'Risk Committee Chairman'], patterns: [/how.*approv/i, /review.*approval/i, /complete.*approval/i],
        steps: [
            'Open My Approvals and select the pending item.',
            'Review the source record, assessment provenance, evidence and earlier decisions.',
            'Choose the decision permitted to your role. Enter a reason whenever adjusting, returning or rejecting an item.',
            'Confirm the decision only after checking the recorded outcome and destination stage.'
        ]
    },
    createUser: {
        title: 'Create a user account', pageKey: 'users', destination: 'pages/users.html',
        roles: ['System Administrator'], patterns: [/(?:create|creating|add|adding).*user/i, /onboard.*user/i, /new.*account/i],
        steps: [
            'Open User Management and select Add User.',
            'Enter the official NCA identity details and assign the correct role and division.',
            'Review the activation and email information, then create the account.',
            'The user must receive a generated temporary password and change it at first login.'
        ]
    },
    mapAccount: {
        title: 'Map an organisational account', pageKey: 'accountMapping', destination: 'pages/account-mapping.html',
        roles: ['System Administrator'], patterns: [/map.*account/i, /replace.*(?:holder|employee|person)/i, /promotion|retirement|transfer/i],
        steps: [
            'Open Account Mapping and select the permanent organisational role account.',
            'Enter the incoming holder’s official NCA details, effective date and reason.',
            'Review the access-transfer summary and confirm the mapping.',
            'Verify onboarding delivery; prior sessions are revoked while historic actions retain their attribution.'
        ]
    },
    workplan: {
        title: 'Upload a work plan', pageKey: 'workplans', destination: 'pages/workplans.html',
        roles: ['System Administrator', 'Risk Focal Person'], patterns: [/upload.*work.?plan/i, /work.?plan.*upload/i],
        steps: [
            'Open Work Plan Risks and choose the approved work-plan workbook.',
            'Review detected programmes, actions, warnings and proposed corrections.',
            'Resolve validation issues and confirm the correct division and plan year.',
            'Submit the upload and complete the resulting governed risk assessments before forwarding them.'
        ]
    },
    compliance: {
        title: 'Record a compliance obligation', pageKey: 'compliance', destination: 'pages/compliance.html',
        roles: ['System Administrator', 'Risk Focal Person', 'Risk Champion'], patterns: [/(?:create|record|add).*compliance/i, /compliance.*obligation/i],
        steps: [
            'Open Compliance Assurance and select the applicable obligation or create the permitted record.',
            'Identify the requirement, accountable owner, due date and applicable evidence.',
            'Record the assessment outcome and attach verifiable support.',
            'Route the record for independent verification rather than relying only on self-attestation.'
        ]
    },
    reports: {
        title: 'Generate a governed report', pageKey: 'reports', destination: 'pages/reports.html',
        roles: ['System Administrator', 'Risk Champion', 'Risk Committee Chairman'], patterns: [/(?:create|generate|produce|export).*report/i, /how.*report/i],
        steps: [
            'Open Reports and select the required report type.',
            'Set the reporting period, division and other authorised filters.',
            'Preview the results and verify material figures against their source records.',
            'Export or finalise only after confirming scope, provenance and reporting date.'
        ]
    }
});

function clean(value, limit = 160) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function resolveWorkflow(question, pageKey, history = [], screenContext = {}, options = {}) {
    const prompt = clean(question, 10000);
    if (options.forceCurrentScreen) {
        const current = Object.entries(WORKFLOWS).find(([, workflow]) => workflow.pageKey === pageKey);
        if (current) return { id: current[0], ...current[1] };
    }
    for (const [id, workflow] of Object.entries(WORKFLOWS)) {
        if (workflow.patterns.some(pattern => pattern.test(prompt))) return { id, ...workflow };
    }
    const followUp = /\b(next|now|here|this field|missing|mistake|wrong|omission|continue|guide me|help me)\b/i.test(prompt);
    const currentScreenIntent = followUp
        || /\b(?:check|review|inspect)\b.*\b(?:form|screen|page|fields?)\b/i.test(prompt)
        || /\b(?:see|view|read|find|locate|identify|show)\b.*\b(?:screen|form|fields?|values?)\b/i.test(prompt)
        || /\b(?:where|what)\b.*\b(?:written|entered|selected|shown|displayed)\b.*\b(?:field|form|screen)?\b/i.test(prompt)
        || /\b(?:repeat|restart|start over|from the beginning|all (?:the )?steps|full (?:guide|instructions))\b/i.test(prompt);
    const prior = history.slice(-6).map(item => clean(item?.text, 2000)).join(' ');
    if (followUp) {
        for (const [id, workflow] of Object.entries(WORKFLOWS)) {
            if (prior.includes(`Guided task: ${workflow.title}`)) return { id, ...workflow };
        }
    }
    if (currentScreenIntent) {
        const current = Object.entries(WORKFLOWS).find(([, workflow]) => workflow.pageKey === pageKey);
        if (current) return { id: current[0], ...current[1] };
    }
    return null;
}

function platformTour(user) {
    const role = clean(user.role) || 'NCA colleague';
    const roleStarts = {
        'System Administrator': 'Start with Dashboard and Action Centre, then use User Management and Account Mapping for identity work, Division Risk Uploads for centrally supplied registers, and the consolidated register, reports and audit logs for oversight.',
        'Risk Focal Person': 'Start with Dashboard and Action Centre, then use Risk Register or Work Plan Risks for intake, Administrator-Staged Risks for assigned batches, and Treatment Plans for owned responses.',
        'Risk Champion': 'Start with Dashboard and Action Centre, then review division risks and approvals, record independent assessments, monitor treatments and use reports for divisional oversight.',
        'Risk Committee Chairman': 'Start with Dashboard and Action Centre, then review enterprise and high-risk approvals, use Executive Analytics and Board Dashboard, and verify source records before final decisions.'
    };
    return `Platform guide for ${role}. ${roleStarts[role] || 'Start with Dashboard and Action Centre, then use the navigation available to your authorised role.'} Ask me to guide you through a specific task—for example, “Guide me through creating a risk”—and I will give role-appropriate steps and use the visible screen state to identify the next incomplete field. I remain read-only and will not submit or approve anything for you. Source: NCA GRC System Manual, Role-based operating guide.`;
}

function screenAdvice(workflow, question, pageKey, screenContext = {}) {
    if (pageKey !== workflow.pageKey) {
        return { text: `You are not on the required page yet. Open ${workflow.title}, then continue with step 1.`, destination: workflow.destination };
    }
    if (!['createRisk', 'treatmentPlan'].includes(workflow.id)) return { text: `You are on the relevant page. Follow the steps in order and ask “What next?” whenever you want me to check the visible screen state.` };

    const fields = Array.isArray(screenContext.fields) ? screenContext.fields : [];
    const active = screenContext.activeField;
    const prompt = clean(question, 10000).toLowerCase();
    const mentioned = fields.find(field => {
        const label = clean(field.label || field.id).toLowerCase();
        const id = clean(field.id).toLowerCase().replace(/[_-]+/g, ' ');
        return (label.length > 2 && prompt.includes(label)) || (id.length > 2 && prompt.includes(id));
    });
    if (mentioned && /\b(?:see|view|read|find|locate|where|written|entered|selected|shown|displayed|value|currently)\b/i.test(question)) {
        const label = clean(mentioned.label) || mentioned.id;
        const value = clean(mentioned.value, 500);
        const dialog = clean(screenContext.dialogTitle) || clean(screenContext.pageTitle) || workflow.title;
        return {
            text: value
                ? `Yes. The ${label} field is visible in ${dialog} and currently shows "${value}". I have highlighted that field. ${FIELD_GUIDANCE[mentioned.id] || ''}`.trim()
                : `Yes. The ${label} field is visible in ${dialog}, but it is currently empty. I have highlighted that field. ${FIELD_GUIDANCE[mentioned.id] || ''}`.trim(),
            fieldId: mentioned.id
        };
    }
    if (active?.id && /\b(here|this field|what should|what do i enter|explain this)\b/i.test(question)) {
        const guidance = FIELD_GUIDANCE[active.id];
        if (guidance) {
            const current = clean(active.value, 500);
            return { text: `You are in ${clean(active.label) || active.id}.${current ? ` It currently shows "${current}".` : ''} ${guidance}`, fieldId: active.id };
        }
    }
    const invalid = fields.filter(field => field.invalid);
    if (invalid.length) {
        const field = invalid[0];
        const message = clean(field.validationMessage) || `${clean(field.label) || field.id} is invalid.`;
        return { text: `I found a value that needs correction: ${message} ${FIELD_GUIDANCE[field.id] || ''}`.trim(), fieldId: field.id };
    }
    const missing = fields.filter(field => field.required && field.empty && !field.disabled);
    if (missing.length) {
        const labels = missing.slice(0, 6).map(field => clean(field.label) || field.id).join(', ');
        const field = missing[0];
        return { text: `The ${clean(screenContext.dialogTitle) || workflow.title} form is open. Required information still missing: ${labels}${missing.length > 6 ? ', and additional fields' : ''}. Complete ${clean(field.label) || field.id} next. ${FIELD_GUIDANCE[field.id] || ''}`.trim(), fieldId: field.id };
    }
    if (workflow.id === 'treatmentPlan') {
        return { text: 'The visible treatment-plan form has no required omissions or browser validation errors. Review the treatment strategy, action owner, due date, actions, monitoring, residual ratings and evidence, then choose Update Plan when you are satisfied.', controlId: 'saveTreatment' };
    }
    return { text: 'The visible form has no required omissions or browser validation errors. Review the risk description, assessment basis, controls and treatment for accuracy. Then choose Save Draft, or Submit Risk when it is ready for governed review.', controlId: 'saveDraftBtn' };
}

function guide(question, pageKey, history, user, screenContext, options = {}) {
    if (/\b(?:guide|walk|take|show)\b.*\b(?:platform|system|application|general use|how to use)\b/i.test(question)) {
        return { title: 'Role-based platform guide', answer: platformTour(user), destination: null, uiGuidance: null };
    }
    const workflow = resolveWorkflow(question, pageKey, history, screenContext, options);
    if (!workflow) return null;
    if (!workflow.roles.includes(user.role)) {
        return {
            title: workflow.title,
            answer: `Guided task: ${workflow.title}. Your current role (${clean(user.role)}) is not authorised to perform this task. I can explain the workflow, but I will not direct you around the role restriction. Contact the responsible role or a System Administrator. Source: NCA GRC System Manual, Role-based access.`,
            destination: null, uiGuidance: null
        };
    }
    const situational = screenAdvice(workflow, question, pageKey, screenContext);
    const explicitFullGuide = workflow.patterns.some(pattern => pattern.test(String(question || '')))
        || /\b(?:repeat|restart|start over|from the beginning|all (?:the )?steps|full (?:guide|instructions))\b/i.test(String(question || ''));
    if (pageKey === workflow.pageKey && !explicitFullGuide) {
        return {
            title: workflow.title,
            answer: `Next guidance for ${workflow.title}: ${situational.text} Complete that step, then ask “What next?” when you want me to inspect the visible screen again. I will not repeat the full guide unless you ask me to repeat or restart it. I provide guidance only; you must perform every save, submission or approval yourself. Source: NCA GRC System Manual, ${workflow.title}.`,
            destination: null,
            uiGuidance: { fieldId: situational.fieldId || null, controlId: situational.controlId || null }
        };
    }
    const numbered = workflow.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
    return {
        title: workflow.title,
        answer: `Guided task: ${workflow.title}.\n${numbered}\n\nCurrent-screen guidance: ${situational.text}\n\nI provide guidance only; review the information and perform every save, submission or approval yourself. Source: NCA GRC System Manual, ${workflow.title}.`,
        destination: situational.destination || null,
        uiGuidance: { fieldId: situational.fieldId || null, controlId: situational.controlId || null }
    };
}

module.exports = { FIELD_GUIDANCE, WORKFLOWS, guide, platformTour, resolveWorkflow };
