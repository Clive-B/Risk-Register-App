const pool = require('../config/db');
const crypto = require('crypto');
const { logAudit } = require('../utils/auditLogger');
const { parseRiskWorkbook } = require('../utils/riskWorkbook');
const { startWorkflow } = require('../services/workflowService');
const { act: performApprovalAction } = require('../services/approvalService');
const { createNotification } = require('../services/notificationService');
const { sendEmail } = require('../services/emailService');
const { createAction, completeBySource } = require('../services/actionService');
const { assessRiskText, responseFor } = require('../utils/riskAssessmentEngine');
const { generateTreatmentProposal } = require('../utils/treatmentProposalEngine');
const {
    buildWorkbookCorrectionProposal,
    ruleRecord
} = require('../utils/workbookCorrectionEngine');
const { isChampionReviewComplete, canApproveImportBatch } = require('../utils/riskImportBatch');
const { deriveInitialFocalAssessment } = require('../utils/initialFocalAssessment');
const {
    CONTROL_EFFECTIVENESS,
    CONTROL_TYPES,
    DESIGN_ADEQUACY,
    assessControlAssurance,
    controlScoreConsistency
} = require('../utils/controlAssurance');
const {
    redactFocalAssessments,
    redactRiskHistory
} = require('../utils/assessmentVisibility');

const ALLOWED_DIRECTORATES = [
    'RIPS',
    'Legal',
    'Regulatory Administration',
    'Consumer Affairs',
    'Corporate Affairs',
    'Finance',
    'Engineering',
    'Information Technology',
    'Procurement and Protocol',
    'Internal Audit',
    'Human Resource',
    'ROD',
    'Administration',
    'Cybersecurity',
    'International Affairs'
];

const { calculateRiskLevel, RISK_CATEGORIES } = require('../utils/riskMatrix');
const ALLOWED_CATEGORIES = RISK_CATEGORIES;

const ALLOWED_TREATMENTS = ['Terminate', 'Treat', 'Transfer', 'Tolerate'];
const ALLOWED_CONTROL_EFFECTIVENESS = [...CONTROL_EFFECTIVENESS];
const ALLOWED_WORKFLOW_STATUSES = ['Draft','Submitted','Under Review','Accepted','Returned','Treatment In Progress','Monitoring','Closed'];
const ALLOWED_TREATMENT_STATUSES = ['Not Started', 'In Progress', 'Completed', 'Deferred'];
const ALLOWED_RISK_STATUSES = ['Draft','Submitted','Under Review','Accepted','Returned','Treatment In Progress','Monitoring','Closed','Open','In Progress','Mitigated'];

function optionalString(value) {
    const text = String(value || '').trim();
    return text || null;
}

function normalizeRiskCategory(value) {
    const category = optionalString(value);
    const aliases = {
        Compliance: 'Regulatory Compliance',
        Legal: 'Regulatory Compliance',
        ICT: 'Operational',
        Technology: 'Operational',
        Cybersecurity: 'Operational',
        Procurement: 'Operational',
        'Health & Safety': 'Human Capital',
        'Human Resource': 'Human Capital'
    };
    return aliases[category] || category;
}

function optionalDate(value) {
    return value ? String(value).slice(0, 10) : null;
}

function numberOrNull(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isInteger(number) ? number : null;
}

function determineRiskResponse(impact, likelihood) {
    return responseFor(impact, likelihood);
}

function determineControlEffectiveness(description, controls) {
    return assessControlAssurance({
        existing_controls: controls,
        risk_description: description
    }).rating;
}

function normalizeRiskInput(body, user) {
    const impact = Number(body.impact);
    const likelihood = Number(body.likelihood);
    const riskDescription = optionalString(body.risk_description);
    const existingControls = optionalString(body.existing_controls);
    const proposedControl = assessControlAssurance({
        existing_controls: existingControls,
        control_design_adequacy: body.control_design_adequacy,
        control_evidence: body.control_evidence,
        control_last_tested_date: body.control_last_tested_date,
        control_exceptions: body.control_exceptions
    });
    const requestedControlEffectiveness = optionalString(body.control_effectiveness);

    return {
        risk_title: optionalString(body.risk_title),
        risk_description: riskDescription,
        directorate: optionalString(body.directorate) || user.directorate,
        business_unit: optionalString(body.business_unit),
        programme_project: optionalString(body.programme_project),
        risk_category: normalizeRiskCategory(body.risk_category),
        risk_owner: optionalString(body.risk_owner) || user.full_name || user.email,
        date_identified: optionalDate(body.date_identified) || new Date().toISOString().slice(0, 10),
        impact,
        likelihood,
        existing_controls: existingControls,
        control_effectiveness: ALLOWED_CONTROL_EFFECTIVENESS.includes(requestedControlEffectiveness)
            ? requestedControlEffectiveness
            : proposedControl.rating,
        control_type: CONTROL_TYPES.includes(optionalString(body.control_type))
            ? optionalString(body.control_type)
            : 'Not Assessed',
        control_owner: optionalString(body.control_owner),
        control_design_adequacy: DESIGN_ADEQUACY.includes(optionalString(body.control_design_adequacy))
            ? optionalString(body.control_design_adequacy)
            : 'Not Assessed',
        control_evidence: optionalString(body.control_evidence),
        control_last_tested_date: optionalDate(body.control_last_tested_date),
        control_exceptions: optionalString(body.control_exceptions),
        control_next_review_date: optionalDate(body.control_next_review_date),
        control_assessment_basis: optionalString(body.control_assessment_basis) || proposedControl.basis,
        control_assessment_confidence: ['High','Medium','Low'].includes(optionalString(body.control_assessment_confidence))
            ? optionalString(body.control_assessment_confidence)
            : proposedControl.confidence,
        risk_treatment: responseFor(impact, likelihood, normalizeRiskCategory(body.risk_category)),
        initial_mitigation_plan: optionalString(body.initial_mitigation_plan),
        responsible_officer: optionalString(body.responsible_officer),
        target_completion_date: optionalDate(body.target_completion_date),
        status: optionalString(body.status),
        workflow_status: optionalString(body.workflow_status) || 'Draft',
        assessment_year: Number(body.assessment_year) || new Date().getFullYear(),
        focal_visibility: body.focal_visibility !== false && String(body.focal_visibility).toLowerCase() !== 'false'
    };
}

function validateScore(value, label, errors) {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
        errors.push(`${label} must be between 1 and 5.`);
    }
}

function validateRiskInput(risk) {
    const errors = [];

    if (!risk.risk_title) errors.push('Risk title is required.');
    if (!risk.risk_description) errors.push('Risk description is required.');
    if (!ALLOWED_DIRECTORATES.includes(risk.directorate)) errors.push('Select a valid division.');
    if (!ALLOWED_CATEGORIES.includes(risk.risk_category)) errors.push('Select a valid risk category.');
    if (!risk.risk_owner) errors.push('Risk owner is required.');
    validateScore(risk.impact, 'Impact', errors);
    validateScore(risk.likelihood, 'Likelihood', errors);
    if (!risk.existing_controls) errors.push('Existing controls are required.');
    if (!ALLOWED_CONTROL_EFFECTIVENESS.includes(risk.control_effectiveness)) errors.push('Select a valid control effectiveness.');
    if (!CONTROL_TYPES.includes(risk.control_type)) errors.push('Select a valid control type.');
    if (!DESIGN_ADEQUACY.includes(risk.control_design_adequacy)) errors.push('Select a valid control design adequacy.');
    if (risk.control_last_tested_date && !validIsoDate(risk.control_last_tested_date)) errors.push('Control last tested date must be valid.');
    if (risk.control_next_review_date && !validIsoDate(risk.control_next_review_date)) errors.push('Control next review date must be valid.');
    if (!ALLOWED_TREATMENTS.includes(risk.risk_treatment)) errors.push('Select a valid risk response.');
    if (!risk.initial_mitigation_plan) errors.push('Initial mitigation plan is required.');
    if (!risk.responsible_officer) errors.push('Responsible officer is required.');
    if (!risk.target_completion_date) errors.push('Target completion date is required.');
    if (!ALLOWED_WORKFLOW_STATUSES.includes(risk.workflow_status)) errors.push('Select a valid workflow status.');
    if (!Number.isInteger(risk.assessment_year) || risk.assessment_year < 2020 || risk.assessment_year > 2100) errors.push('Assessment year must be between 2020 and 2100.');

    return errors;
}

function validIsoDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function canonicalTreatmentStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();
    const match = ALLOWED_TREATMENT_STATUSES.find(status => status.toLowerCase() === normalized);
    return match || (normalized ? String(value).trim() : 'Not Started');
}

function recommendImportedRiskCategory(body) {
    const text = [
        body.risk_title,
        body.risk_description,
        body.programme_project,
        body.business_unit
    ].filter(Boolean).join(' ').toLowerCase();
    const categoryRules = [
        ['Operational', ['cyber', 'malware', 'phishing', 'ransomware', 'information security', 'technology', 'system', 'software', 'hardware', 'network', 'database', 'digital', 'telecom', 'procurement', 'tender', 'supplier', 'vendor']],
        ['Regulatory Compliance', ['legal', 'litigation', 'lawsuit', 'court', 'contract dispute', 'compliance', 'regulatory', 'regulation', 'guideline', 'enforcement']],
        ['Supervision', ['supervision', 'licence', 'license', 'service provider', 'consumer protection']],
        ['Financial', ['financial', 'finance', 'budget', 'revenue', 'fee', 'funding']],
        ['Human Capital', ['human resource', 'staff', 'employee', 'training', 'competency', 'health', 'safety']],
        ['Reputational', ['reputation', 'public confidence', 'media', 'stakeholder trust']],
        ['Strategic', ['strategic', 'strategy', 'policy', 'research', 'performance target']]
    ];
    return categoryRules.find(([, keywords]) => keywords.some(keyword => text.includes(keyword)))?.[0] || 'Operational';
}

function normalizeImportedRisk(body, user, templateType = 'Generic Risk Register') {
    const isTrackingTemplate = templateType === 'Risk Register Tracking Template';
    const isLegalTemplate = templateType === 'Legal Legacy Risk Register';
    const isDivisionTracker = templateType === 'Division Risk Register Tracker';
    const isGovernedFocalWorkbook = isTrackingTemplate || isLegalTemplate || isDivisionTracker;
    const importBody = isGovernedFocalWorkbook ? {
        ...body,
        directorate: user.division || user.directorate,
        risk_category: normalizeRiskCategory(body.risk_category) || recommendImportedRiskCategory(body),
        existing_controls: optionalString(body.existing_controls) || (isLegalTemplate
            ? 'No existing controls were documented in the Legal risk register.'
            : isDivisionTracker
                ? 'No existing controls were documented in the division tracker.'
                : 'No existing controls were documented in the tracking template.'),
        responsible_officer: optionalString(body.responsible_officer) || optionalString(body.risk_owner),
        workflow_status: 'Submitted',
        status: null
    } : body;
    const risk = normalizeRiskInput(importBody, user);
    const optionalNumberFields = [
        'inherent_risk_score',
        'current_impact',
        'current_likelihood',
        'current_risk_score',
        'residual_impact',
        'residual_likelihood',
        'residual_score'
    ];

    risk.risk_id = optionalString(importBody.risk_id);
    risk.risk_source = optionalString(importBody.risk_source);
    risk.risk_cause = optionalString(importBody.risk_cause);
    risk.directorate = optionalString(importBody.directorate);
    risk.risk_owner = optionalString(importBody.risk_owner);
    risk.inherent_risk_score = isTrackingTemplate ? null : numberOrNull(importBody.inherent_risk_score);
    risk.risk_level = isTrackingTemplate ? null : optionalString(importBody.risk_level);
    risk.business_unit = optionalString(importBody.business_unit) || user.division || user.directorate;
    risk.programme_project = optionalString(importBody.programme_project);
    risk.current_impact = numberOrNull(importBody.current_impact);
    risk.current_likelihood = numberOrNull(importBody.current_likelihood);
    risk.current_risk_score = isTrackingTemplate ? null : numberOrNull(importBody.current_risk_score);
    risk.treatment_status = canonicalTreatmentStatus(importBody.treatment_status);
    risk.progress_notes = optionalString(importBody.progress_notes);
    risk.next_review_date = optionalDate(importBody.next_review_date);
    risk.residual_impact = numberOrNull(importBody.residual_impact);
    risk.residual_likelihood = numberOrNull(importBody.residual_likelihood);
    risk.residual_score = isTrackingTemplate ? null : numberOrNull(importBody.residual_score);
    risk.closure_date = optionalDate(importBody.closure_date);
    risk.closure_comments = optionalString(importBody.closure_comments);
    risk.source_status = optionalString(importBody.status);
    risk.workflow_status = optionalString(importBody.workflow_status) || 'Draft';
    if (isGovernedFocalWorkbook && ALLOWED_TREATMENTS.includes(optionalString(importBody.risk_treatment))) {
        risk.risk_treatment = optionalString(importBody.risk_treatment);
    }
    if (isGovernedFocalWorkbook && validIsoDate(risk.date_identified)) {
        risk.assessment_year = Number(risk.date_identified.slice(0, 4));
    }
    risk._provided_numbers = new Set(optionalNumberFields.filter(field =>
        (!isTrackingTemplate || !['inherent_risk_score', 'current_risk_score', 'residual_score'].includes(field))
        && importBody[field] !== null
        && importBody[field] !== undefined
        && String(importBody[field]).trim() !== ''
    ));
    return risk;
}

async function createGovernanceAssessment(client, risk, options = {}) {
    const system = options.system || assessRiskText(risk);
    const source = risk.entry_source || options.entrySource;
    const forceFocalReview = options.forceFocalReview === true;
    const isFocalSource = !forceFocalReview && ['Risk Register Tracking Template', 'Legal Legacy Risk Register', 'Division Risk Register Tracker', 'Manual - Risk Focal Person', 'Work Plan'].includes(source);
    const isChampionSource = source === 'Manual - Risk Champion';
    const hasProvisionalFocalAssessment = forceFocalReview
        && Number.isInteger(Number(options.focalLikelihood))
        && Number.isInteger(Number(options.focalImpact));
    const focal = (isFocalSource || hasProvisionalFocalAssessment)
        ? deriveInitialFocalAssessment(risk, source, {
            likelihood: options.focalLikelihood,
            impact: options.focalImpact
        })
        : { likelihood: null, impact: null, score: null };
    const focalLikelihood = focal.likelihood;
    const focalImpact = focal.impact;
    const focalScore = focal.score;
    const championLikelihood = isChampionSource ? Number(risk.likelihood) : null;
    const championImpact = isChampionSource ? Number(risk.impact) : null;
    const championScore = championLikelihood && championImpact ? championLikelihood * championImpact : null;
    const reviewStage = forceFocalReview
        ? 'Awaiting Focal Review'
        : isChampionSource
        ? 'Awaiting Chairman Review'
        : (risk.workflow_status === 'Submitted' || source === 'Risk Register Tracking Template' || source === 'Legal Legacy Risk Register' || source === 'Work Plan')
            ? 'Awaiting Champion Review'
            : 'Awaiting Focal Review';

    await client.query(
        `INSERT INTO risk_assessment_governance(
            risk_id,review_stage,system_likelihood,system_impact,system_score,system_level,system_response,
            system_explanation,matched_keywords,rules_version,
            focal_likelihood,focal_impact,focal_score,focal_reason,focal_by,focal_at,
            focal_assessment_status,focal_source,focal_source_file,
            champion_likelihood,champion_impact,champion_score,champion_decision,champion_reason,champion_by,champion_at
        ) VALUES(
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,CASE WHEN $13::int IS NULL OR $16::text='Pending Confirmation' THEN NULL ELSE NOW() END,
            $16,$17,$18,
            $19,$20,$21,$22,$23,$24,CASE WHEN $21::int IS NULL THEN NULL ELSE NOW() END
        ) ON CONFLICT(risk_id) DO NOTHING`,
        [
            risk.id,reviewStage,system.likelihood,system.impact,system.score,system.level,system.response,
            system.explanation,JSON.stringify(system.matched_keywords || []),system.rules_version,
            focalLikelihood,focalImpact,focalScore,
            options.focalReason || (source === 'Risk Register Tracking Template' || source === 'Legal Legacy Risk Register' || source === 'Division Risk Register Tracker'
                ? `Assessment imported from the ${source}.`
                : source === 'Work Plan' ? 'Assessment submitted from the approved work-plan upload.' : 'Assessment submitted during manual risk creation.'),
            hasProvisionalFocalAssessment ? options.accountableFocalId : (isFocalSource ? risk.created_by : null),
            hasProvisionalFocalAssessment ? 'Pending Confirmation' : (focalScore ? 'Confirmed' : 'Not Supplied'),
            hasProvisionalFocalAssessment ? 'Focal-supplied Admin upload' : (focalScore ? source : null),
            options.sourceFileName || null,
            championLikelihood,championImpact,championScore,isChampionSource ? 'Adjusted' : null,
            isChampionSource ? 'Assessment entered directly by the Risk Champion.' : null,
            isChampionSource ? risk.created_by : null
        ]
    );
}

function validateImportedRisk(risk, user) {
    const errors = validateRiskInput(risk);
    const calculatedScore = risk.impact * risk.likelihood;
    const calculatedLevel = calculateRiskLevel(calculatedScore);

    if (risk.directorate !== (user.division || user.directorate)) {
        errors.push('Division must match the Risk Focal Person assigned to this import.');
    }
    if (risk.risk_id && risk.risk_id.length > 30) errors.push('Risk ID cannot exceed 30 characters.');
    if (!validIsoDate(risk.date_identified)) errors.push('Date identified must be a valid date.');
    if (!validIsoDate(risk.target_completion_date)) errors.push('Target completion date must be a valid date.');
    if (risk.next_review_date && !validIsoDate(risk.next_review_date)) errors.push('Next review date must be a valid date.');
    if (!['Draft', 'Submitted'].includes(risk.workflow_status)) {
        errors.push('Workflow status must be Draft or Submitted; imports cannot bypass risk approval.');
    }
    if (risk.source_status && !ALLOWED_RISK_STATUSES.includes(risk.source_status)) errors.push('Select a valid risk status.');
    if (risk.closure_date && !validIsoDate(risk.closure_date)) errors.push('Closure date must be a valid date.');
    if (risk._provided_numbers.has('current_impact')) validateScore(risk.current_impact, 'Current impact', errors);
    if (risk._provided_numbers.has('current_likelihood')) validateScore(risk.current_likelihood, 'Current likelihood', errors);
    if (risk._provided_numbers.has('residual_impact')) validateScore(risk.residual_impact, 'Residual impact', errors);
    if (risk._provided_numbers.has('residual_likelihood')) validateScore(risk.residual_likelihood, 'Residual likelihood', errors);
    if (risk._provided_numbers.has('inherent_risk_score') && (!Number.isInteger(risk.inherent_risk_score) || risk.inherent_risk_score < 1 || risk.inherent_risk_score > 25)) {
        errors.push('Inherent risk score must be between 1 and 25.');
    }
    if (risk._provided_numbers.has('current_risk_score') && (!Number.isInteger(risk.current_risk_score) || risk.current_risk_score < 1 || risk.current_risk_score > 25)) {
        errors.push('Current risk score must be between 1 and 25.');
    }
    if (risk._provided_numbers.has('residual_score') && (!Number.isInteger(risk.residual_score) || risk.residual_score < 1 || risk.residual_score > 25)) {
        errors.push('Residual score must be between 1 and 25.');
    }
    if (risk.current_impact && risk.current_likelihood) {
        const score = risk.current_impact * risk.current_likelihood;
        if (risk._provided_numbers.has('current_risk_score') && risk.current_risk_score !== score) {
            errors.push(`Current risk score must equal current impact x current likelihood (${score}).`);
        }
        risk.current_risk_score = score;
    }
    if (risk.residual_impact && risk.residual_likelihood) {
        const score = risk.residual_impact * risk.residual_likelihood;
        if (risk._provided_numbers.has('residual_score') && risk.residual_score !== score) {
            errors.push(`Residual score must equal residual impact x residual likelihood (${score}).`);
        }
        risk.residual_score = score;
    }
    if (risk.inherent_risk_score !== undefined && risk.inherent_risk_score !== null && Number(risk.inherent_risk_score) !== calculatedScore) {
        errors.push(`Inherent risk score must equal impact x likelihood (${calculatedScore}).`);
    }
    if (risk.risk_level && risk.risk_level !== calculatedLevel) {
        errors.push(`Risk level must match the calculated level (${calculatedLevel}).`);
    }
    if (!ALLOWED_TREATMENT_STATUSES.includes(risk.treatment_status)) errors.push('Select a valid treatment status.');

    return [...new Set(errors)];
}

function canAccessDirectorate(user, directorate) {
    if (['System Administrator','Risk Committee Chairman'].includes(user.role)) return true;
    return (user.division || user.directorate) === directorate;
}

function canViewRisk(user, risk) {
    if (!canAccessDirectorate(user, risk.directorate)) return false;
    if (user.role !== 'Risk Focal Person') return true;
    return Number(risk.accountable_focal_id) === Number(user.id)
        || Number(risk.created_by) === Number(user.id)
        || risk.entry_source !== 'Manual - Risk Champion'
        || risk.focal_visibility === true;
}

function canCreateRisk(user) {
    return ['System Administrator', 'Risk Focal Person', 'Risk Champion'].includes(user.role);
}

function canModifyIdentification(user, risk) {
    if (user.role === 'System Administrator') return true;
    return ['Risk Focal Person','Risk Champion'].includes(user.role)
        && Number(risk.created_by) === Number(user.id)
        && ['Draft', 'Returned'].includes(risk.workflow_status);
}

function canReviewRisk(user, risk) {
    if (user.role === 'System Administrator') return true;
    return user.role === 'Risk Champion' && user.division === (risk.division || risk.directorate);
}

function canUpdateTreatment(user, risk) {
    if (user.role === 'System Administrator') return true;
    if (user.role === 'Risk Champion') return user.division === (risk.division || risk.directorate) && ['Accepted','Treatment In Progress','Monitoring'].includes(risk.workflow_status);
    return user.role === 'Risk Focal Person'
        && Number(risk.created_by) === Number(user.id)
        && ['Accepted','Treatment In Progress','Monitoring'].includes(risk.workflow_status);
}

function canCloseRisk(user, risk) {
    if (user.role === 'System Administrator') return true;
    if (user.role === 'Risk Committee Chairman') return risk.workflow_status === 'Monitoring' && risk.treatment_status === 'Completed';
    return user.role === 'Risk Champion'
        && user.division === (risk.division || risk.directorate)
        && risk.workflow_status === 'Monitoring' && risk.treatment_status === 'Completed';
}

async function addRiskHistory(client, riskId, action, userId, options = {}) {
    await client.query(
        `
        INSERT INTO risk_history (risk_id, action, from_status, to_status, comment, changed_by, details)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
            riskId,
            action,
            options.fromStatus || null,
            options.toStatus || null,
            options.comment || null,
            userId || null,
            options.details || {}
        ]
    );
}

async function notifyRiskUsers({req,users,title,message,risk,actionUrl='pages/risks.html'}) {
    await Promise.allSettled(users.map(user => Promise.all([
        createNotification({actor:req.user,req,userId:user.id,title,message,type:'Risk',category:'Risk Governance',priority:risk.risk_level==='High'?'High':'Normal',entityType:'Risk',entityId:risk.id,createdBy:req.user.id,systemGenerated:true}),
        sendEmail({to:user.email,subject:title,text:message,html:`<p>${message}</p><p><a href="${process.env.FRONTEND_URL||'http://localhost:5500'}/${actionUrl}">Open NCA GRC Platform</a></p>`,emailType:'Risk Governance',userId:user.id,role:user.role,directorate:user.division||user.directorate,sentBy:req.user.id})
    ])));
}

async function notifyRiskSubmitted(req,risk){const users=(await pool.query(`SELECT id,email,role,directorate,division FROM users WHERE role='Risk Champion' AND status='Active' AND COALESCE(NULLIF(division,''),directorate)=$1`,[risk.division||risk.directorate])).rows;await notifyRiskUsers({req,users,title:'Risk Submitted for Review',message:`${risk.risk_id} - ${risk.risk_title} requires division review.`,risk,actionUrl:'pages/pending-approvals.html'});for(const user of users)await createAction({actionKey:`risk-review:${risk.id}:${user.id}`,module:'Risk',actionType:'Review Risk',title:`Review ${risk.risk_id}`,description:risk.risk_title,priority:risk.risk_level==='High'?'High':'Medium',status:'Waiting for Review',assignedTo:user.id,assignedRole:'Risk Champion',division:risk.division||risk.directorate,assignedBy:req.user.id,dueAt:new Date(Date.now()+72*3600000),sourceType:'RiskReview',sourceId:risk.id,actionUrl:`pages/pending-approvals.html`,availableActions:['review','approve','return','view'],metadata:{riskId:risk.risk_id}},{req})}

async function generateRiskId(client, directorate) {
    const year = new Date().getFullYear();
    const rawCode = String(directorate || 'NCA').split(/\s+/).map(word => word[0]).join('').toUpperCase();
    const code = rawCode.replace(/[^A-Z]/g, '').slice(0, 6) || 'NCA';
    const prefix = `${code}-RSK-${year}-`;
    const result = await client.query(
        `
        SELECT risk_id
        FROM risks
        WHERE risk_id LIKE $1
        ORDER BY risk_id DESC
        LIMIT 1
        `,
        [`${prefix}%`]
    );
    const lastNumber = result.rows.length ? Number(result.rows[0].risk_id.replace(prefix, '')) : 0;
    return `${prefix}${String(lastNumber + 1).padStart(4, '0')}`;
}

async function getRiskById(id) {
    const result = await pool.query('SELECT * FROM risks WHERE id = $1', [id]);
    return result.rows[0] || null;
}

function scopeConditions(req, conditions, params, alias = 'r') {
    if (['System Administrator','Risk Committee Chairman'].includes(req.user.role)) return;
    if (req.user.role === 'Risk Focal Person') {
        params.push(req.user.division || req.user.directorate);
        const scopeIndex=params.length;
        params.push(req.user.id);
        conditions.push(`${alias}.division = $${scopeIndex} AND (${alias}.accountable_focal_id = $${params.length} OR ${alias}.created_by = $${params.length} OR ${alias}.entry_source <> 'Manual - Risk Champion' OR ${alias}.focal_visibility = TRUE)`);
        return;
    }
    params.push(req.user.directorate); conditions.push(`${alias}.directorate = $${params.length}`);
}

exports.getRisks = async (req, res) => {
    try {
        const filters = {
            search: optionalString(req.query.search),
            directorate: optionalString(req.query.directorate),
            risk_level: optionalString(req.query.risk_level),
            status: optionalString(req.query.status),
            workflow_status: optionalString(req.query.workflow_status),
            entry_source: optionalString(req.query.entry_source),
            review_stage: optionalString(req.query.review_stage),
            import_batch_id: numberOrNull(req.query.import_batch_id)
        };
        const conditions = [];
        const params = [];

        scopeConditions(req, conditions, params);

        if (['System Administrator','Risk Committee Chairman'].includes(req.user.role) && filters.directorate) {
            params.push(filters.directorate);
            conditions.push(`COALESCE(NULLIF(r.division,''),r.directorate) = $${params.length}`);
        }
        if (filters.risk_level) {
            params.push(filters.risk_level);
            conditions.push(`r.risk_level = $${params.length}`);
        }
        if (filters.status) {
            params.push(filters.status);
            conditions.push(`r.status = $${params.length}`);
        }
        if (filters.workflow_status) {
            params.push(filters.workflow_status);
            conditions.push(`r.workflow_status = $${params.length}`);
        }
        if (filters.entry_source) {
            params.push(filters.entry_source);
            conditions.push(`r.entry_source = $${params.length}`);
        }
        if (filters.review_stage) {
            params.push(filters.review_stage);
            conditions.push(`g.review_stage = $${params.length}`);
        }
        if (filters.import_batch_id) {
            params.push(filters.import_batch_id);
            conditions.push(`r.import_batch_id = $${params.length}`);
        }
        if (String(req.query.committee_pending || '').toLowerCase() === 'true') {
            conditions.push(`r.committee_reviewed_at IS NULL`);
            conditions.push(`EXISTS(SELECT 1 FROM actions committee_action WHERE committee_action.source_type='CommitteeReview' AND committee_action.source_id=r.id::text AND committee_action.status NOT IN('Completed','Cancelled'))`);
        }
        if (filters.search) {
            params.push(`%${filters.search.toLowerCase()}%`);
            conditions.push(`(
                LOWER(r.risk_id) LIKE $${params.length}
                OR LOWER(r.risk_title) LIKE $${params.length}
                OR LOWER(r.risk_description) LIKE $${params.length}
                OR LOWER(r.risk_owner) LIKE $${params.length}
            )`);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await pool.query(
            `
            SELECT r.*, u.full_name AS created_by_name,
                   g.review_stage,g.system_explanation AS assessment_explanation,g.matched_keywords,g.rules_version,
                   g.system_likelihood,g.system_impact,g.system_score,g.system_level,g.system_response,
                   g.focal_likelihood,g.focal_impact,g.focal_score,g.focal_reason,g.focal_at,
                   g.focal_assessment_status,g.focal_source,g.focal_source_file,
                   g.champion_likelihood,g.champion_impact,g.champion_score,g.champion_decision,g.champion_reason,g.champion_at,
                   g.chairman_likelihood,g.chairman_impact,g.chairman_score,g.chairman_decision,g.chairman_reason,g.chairman_at,
                   treatment.plan_count AS treatment_plan_count,treatment.plan_status AS treatment_plan_status,
                   workplan_source.assessment_id AS source_workplan_assessment_id,
                   workplan_source.action_point AS source_action_point,
                   workplan_source.upload_id AS workplan_upload_id,
                   workplan_source.file_name AS workplan_file_name,
                   workplan_source.plan_year AS workplan_plan_year
            FROM risks r
            LEFT JOIN users u ON u.id = r.created_by
            LEFT JOIN risk_assessment_governance g ON g.risk_id=r.id
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS plan_count,
                       CASE
                           WHEN COUNT(*)=0 AND NULLIF(BTRIM(r.initial_mitigation_plan),'') IS NOT NULL THEN 'Proposed'
                           WHEN COUNT(*)=0 THEN 'Missing'
                           WHEN r.admission_status<>'Admitted' THEN 'Proposed'
                           WHEN BOOL_AND(tp.status='Completed') THEN 'Completed'
                           WHEN BOOL_OR(tp.status IN ('In Progress','Overdue')) THEN 'Active'
                           ELSE 'Not Started'
                       END AS plan_status
                FROM treatment_plans tp WHERE tp.risk_id=r.id
            ) treatment ON TRUE
            LEFT JOIN LATERAL (
                SELECT assessment.id AS assessment_id,action.action_point,
                       programme.upload_id,upload.file_name,upload.plan_year
                FROM workplan_risk_assessments assessment
                JOIN workplan_actions action ON action.id=assessment.action_id
                JOIN workplan_programmes programme ON programme.id=action.programme_id
                JOIN workplan_uploads upload ON upload.id=programme.upload_id
                WHERE assessment.generated_risk_id=r.id
                   OR assessment.action_id=r.source_workplan_action_id
                ORDER BY (assessment.generated_risk_id=r.id) DESC,assessment.id DESC
                LIMIT 1
            ) workplan_source ON TRUE
            ${whereClause}
            ORDER BY r.updated_at DESC, r.created_at DESC
            `,
            params
        );

        res.json({ success: true, risks: redactFocalAssessments(result.rows, req.user.role) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Unable to load risks.' });
    }
};

exports.submitAllWorkplanFocalAssessments = async (req, res) => {
    const client = await pool.connect();
    const submitted = [];
    try {
        const uploadId = numberOrNull(req.body.workplan_upload_id);
        const comments = optionalString(req.body.comments);
        if (!uploadId) {
            return res.status(400).json({success:false,message:'Select a valid work-plan upload.'});
        }
        if (!['Risk Focal Person','System Administrator'].includes(req.user.role)) {
            return res.status(403).json({success:false,message:'Only the assigned Focal Person may submit work-plan assessments together.'});
        }
        await client.query('BEGIN');
        const upload = (await client.query(
            'SELECT * FROM workplan_uploads WHERE id=$1 FOR UPDATE',
            [uploadId]
        )).rows[0];
        if (!upload) {
            await client.query('ROLLBACK');
            return res.status(404).json({success:false,message:'Work-plan upload not found.'});
        }
        if (req.user.role !== 'System Administrator'
            && (req.user.division || req.user.directorate) !== upload.division) {
            await client.query('ROLLBACK');
            return res.status(403).json({success:false,message:'This work plan is outside your assigned division.'});
        }
        const rows = (await client.query(
            `SELECT risk.*,governance.review_stage,
                    governance.system_likelihood,governance.system_impact,
                    governance.system_score,governance.system_level,governance.system_response,
                    assessment.id AS assessment_id
             FROM workplan_programmes programme
             JOIN workplan_actions action ON action.programme_id=programme.id
             JOIN workplan_risk_assessments assessment ON assessment.action_id=action.id
             JOIN risks risk ON risk.id=assessment.generated_risk_id
             JOIN risk_assessment_governance governance ON governance.risk_id=risk.id
             WHERE programme.upload_id=$1
               AND governance.review_stage IN('Awaiting Focal Review','Returned')
             ORDER BY risk.id
             FOR UPDATE OF risk,governance,assessment`,
            [upload.id]
        )).rows;
        if (!rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({success:false,message:'No work-plan risks are awaiting Focal Person assessment in this upload.'});
        }
        for (const risk of rows) {
            await client.query(
                `UPDATE risk_assessment_governance SET
                    focal_likelihood=system_likelihood,focal_impact=system_impact,focal_score=system_score,
                    focal_reason=$1,focal_by=$2,focal_at=NOW(),
                    champion_likelihood=NULL,champion_impact=NULL,champion_score=NULL,
                    champion_decision=NULL,champion_reason=NULL,champion_by=NULL,champion_at=NULL,
                    chairman_likelihood=NULL,chairman_impact=NULL,chairman_score=NULL,
                    chairman_decision=NULL,chairman_reason=NULL,chairman_by=NULL,chairman_at=NULL,
                    review_stage='Awaiting Champion Review',updated_at=NOW()
                 WHERE risk_id=$3`,
                [comments || 'Focal Person accepted the system assessment through work-plan Submit All.',req.user.id,risk.id]
            );
            await client.query(
                `UPDATE risks SET
                    likelihood=$1,impact=$2,inherent_risk_score=$3,risk_level=$4,risk_treatment=$5,
                    workflow_status='Submitted',status='Submitted',
                    admission_status='Pending Champion Approval',
                    submitted_at=COALESCE(submitted_at,NOW()),updated_at=NOW()
                 WHERE id=$6`,
                [
                    risk.system_likelihood,risk.system_impact,risk.system_score,
                    risk.system_level,risk.system_response,risk.id
                ]
            );
            await client.query(
                `UPDATE workplan_risk_assessments SET
                    focal_category=risk_category,
                    focal_likelihood=$1,focal_impact=$2,focal_score=$3,
                    focal_reason=$4,focal_by=$5,focal_at=NOW(),
                    champion_focal_decision=NULL,champion_decision_reason=NULL,
                    champion_likelihood=NULL,champion_impact=NULL,champion_score=NULL,
                    champion_level=NULL,champion_response=NULL,champion_reason=NULL,
                    champion_by=NULL,champion_at=NULL,updated_by=$5,updated_at=NOW()
                 WHERE id=$6`,
                [
                    risk.system_likelihood,risk.system_impact,risk.system_score,
                    comments || 'Accepted the system assessment through Submit All.',
                    req.user.id,risk.assessment_id
                ]
            );
            await addRiskHistory(client,risk.id,'Focal Work-plan Assessment Bulk Submitted',req.user.id,{
                fromStatus:risk.review_stage || 'Awaiting Focal Review',
                toStatus:'Awaiting Champion Review',
                comment:comments,
                details:{workplan_upload_id:upload.id,bulk_submission:true,selection:'System'}
            });
            submitted.push(risk);
        }
        await client.query('COMMIT');
        const champions = (await pool.query(
            `SELECT id,email,role,directorate,division FROM users
             WHERE role='Risk Champion' AND status='Active'
               AND COALESCE(NULLIF(division,''),directorate)=$1`,
            [upload.division]
        )).rows;
        await notifyRiskUsers({
            req,users:champions,
            title:'Work-plan Assessments Awaiting Champion Review',
            message:`${submitted.length} risks from ${upload.file_name} were submitted together by the Focal Person.`,
            risk:submitted[0],
            actionUrl:'pages/risks.html?entry_source=Work%20Plan'
        }).catch(() => {});
        await logAudit({
            req,action:'WORKPLAN_FOCAL_ASSESSMENTS_BULK_SUBMITTED',
            entityType:'WorkPlan',entityId:upload.id,
            details:{count:submitted.length,riskIds:submitted.map(risk=>risk.risk_id),comments}
        });
        res.json({
            success:true,
            message:`${submitted.length} work-plan assessment${submitted.length === 1 ? '' : 's'} submitted together for Champion review.`,
            submittedCount:submitted.length
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);
        res.status(500).json({success:false,message:'Unable to submit the work-plan assessments together.'});
    } finally {
        client.release();
    }
};

exports.submitChampionReviewsBulk = async (req, res) => {
    const client = await pool.connect();
    const reviewed = [];
    let completedImportBatchIds = [];
    try {
        const requestedIds = Array.isArray(req.body.risk_ids)
            ? [...new Set(req.body.risk_ids.map(numberOrNull).filter(Boolean))]
            : [];
        const comments = optionalString(req.body.comments);
        if (!requestedIds.length) {
            return res.status(400).json({success:false,message:'Select at least one risk awaiting Champion review.'});
        }
        if (requestedIds.length > 5000) {
            return res.status(400).json({success:false,message:'A maximum of 5,000 risks may be reviewed together.'});
        }
        if (!['Risk Champion','System Administrator'].includes(req.user.role)) {
            return res.status(403).json({success:false,message:'Only a Risk Champion may submit Champion reviews in bulk.'});
        }

        const params = [requestedIds];
        const conditions = [
            `risk.id=ANY($1::bigint[])`,
            `governance.review_stage='Awaiting Champion Review'`
        ];
        if (req.user.role === 'Risk Champion') {
            params.push(req.user.division || req.user.directorate);
            conditions.push(`COALESCE(NULLIF(risk.division,''),risk.directorate)=$${params.length}`);
        }

        await client.query('BEGIN');
        const risks = (await client.query(
            `SELECT risk.*,governance.review_stage,
                    governance.system_likelihood,governance.system_impact,governance.system_score,
                    governance.focal_likelihood,governance.focal_impact,governance.focal_score,
                    governance.champion_likelihood,governance.champion_impact,governance.champion_score,
                    governance.champion_decision,governance.champion_reason,governance.champion_by,
                    workplan_assessment.id AS workplan_assessment_id
             FROM risks risk
             JOIN risk_assessment_governance governance ON governance.risk_id=risk.id
             LEFT JOIN LATERAL(
                 SELECT assessment.id
                 FROM workplan_risk_assessments assessment
                 WHERE assessment.generated_risk_id=risk.id
                    OR assessment.action_id=risk.source_workplan_action_id
                 ORDER BY (assessment.generated_risk_id=risk.id) DESC,assessment.id DESC
                 LIMIT 1
             ) workplan_assessment ON TRUE
             WHERE ${conditions.join(' AND ')}
             ORDER BY risk.risk_id
             FOR UPDATE OF risk,governance`,
            params
        )).rows;
        if (!risks.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({success:false,message:'None of the selected risks is awaiting Champion review in your division.'});
        }

        for (const risk of risks) {
            const savedChampion = [risk.champion_likelihood,risk.champion_impact]
                .every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5);
            const hasFocal = [risk.focal_likelihood,risk.focal_impact]
                .every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5);
            const likelihood = Number(savedChampion
                ? risk.champion_likelihood
                : hasFocal ? risk.focal_likelihood : risk.system_likelihood);
            const impact = Number(savedChampion
                ? risk.champion_impact
                : hasFocal ? risk.focal_impact : risk.system_impact);
            if (![likelihood,impact].every(value => Number.isInteger(value) && value >= 1 && value <= 5)) {
                throw Object.assign(new Error(`${risk.risk_id} has no complete assessment available for Champion review.`),{statusCode:409});
            }
            const score = likelihood * impact;
            const level = calculateRiskLevel(score);
            const response = responseFor(impact,likelihood,risk.risk_category);
            const selection = savedChampion
                ? (risk.champion_decision || 'Adjusted')
                : hasFocal ? 'Focal' : 'System';
            const reviewReason = risk.champion_reason || comments
                || `Risk Champion accepted the ${selection === 'Focal' ? 'Focal Person' : selection} assessment through bulk review.`;

            await client.query(
                `UPDATE risk_assessment_governance SET
                    champion_likelihood=$1,champion_impact=$2,champion_score=$3,
                    champion_decision=$4,champion_reason=$5,
                    champion_by=COALESCE(champion_by,$6),champion_at=COALESCE(champion_at,NOW()),
                    chairman_likelihood=NULL,chairman_impact=NULL,chairman_score=NULL,
                    chairman_decision=NULL,chairman_reason=NULL,chairman_by=NULL,chairman_at=NULL,
                    review_stage='Awaiting Chairman Review',updated_at=NOW()
                 WHERE risk_id=$7`,
                [likelihood,impact,score,selection,reviewReason,req.user.id,risk.id]
            );
            const updated = (await client.query(
                `UPDATE risks SET
                    likelihood=$1,impact=$2,inherent_risk_score=$3,risk_level=$4,risk_treatment=$5,
                    workflow_status='Under Review',status='Under Review',
                    admission_status='Pending Chairman Approval',
                    reviewed_at=NOW(),reviewed_by=$6,review_comments=$7,updated_at=NOW()
                 WHERE id=$8 RETURNING *`,
                [likelihood,impact,score,level,response,req.user.id,reviewReason,risk.id]
            )).rows[0];
            if (risk.workplan_assessment_id) {
                await client.query(
                    `UPDATE workplan_risk_assessments SET
                        likelihood=$1,impact=$2,risk_score=$3,risk_level=$4,risk_response=$5,
                        champion_likelihood=$1,champion_impact=$2,champion_score=$3,
                        champion_level=$4,champion_response=$5,champion_reason=$6,
                        champion_focal_decision=$7,champion_decision_reason=$6,
                        champion_by=$8,champion_at=NOW(),updated_by=$8,updated_at=NOW(),
                        edit_count=edit_count+1
                     WHERE id=$9`,
                    [
                        likelihood,impact,score,level,response,reviewReason,
                        hasFocal ? (selection === 'Focal' ? 'Approved' : 'Rejected') : null,
                        req.user.id,risk.workplan_assessment_id
                    ]
                );
            }
            await addRiskHistory(client,risk.id,'Champion Bulk Review Submitted',req.user.id,{
                fromStatus:'Awaiting Champion Review',
                toStatus:'Awaiting Chairman Review',
                comment:comments,
                details:{selection,likelihood,impact,score,level,champion_bulk:true,preserved_saved_review:savedChampion}
            });
            reviewed.push(updated);
        }

        const importBatchIds = [...new Set(reviewed.map(risk => Number(risk.import_batch_id)).filter(Number.isInteger))];
        if (importBatchIds.length) {
            completedImportBatchIds = (await client.query(
                `UPDATE risk_register_import_batches batch SET
                    status='Awaiting Chairman',champion_reviewed_by=$1,
                    champion_reviewed_at=NOW(),champion_comments=$2,updated_at=NOW()
                 WHERE batch.id=ANY($3::bigint[])
                   AND NOT EXISTS(
                       SELECT 1 FROM risks batch_risk
                       JOIN risk_assessment_governance batch_governance ON batch_governance.risk_id=batch_risk.id
                       WHERE batch_risk.import_batch_id=batch.id
                         AND batch_governance.review_stage NOT IN('Awaiting Chairman Review','Finalised')
                   )
                 RETURNING id`,
                [req.user.id,comments,importBatchIds]
            )).rows.map(row => row.id);
        }
        await client.query('COMMIT');

        try {
            const chairmen = (await pool.query(
                `SELECT id,email,role,directorate,division
                 FROM users WHERE role='Risk Committee Chairman' AND status='Active'`
            )).rows;
            for (const risk of reviewed) {
                await completeBySource('ConsolidatedRiskAssessment',risk.id,{
                    actor:req.user,req,comments:'Champion bulk review submitted.'
                }).catch(() => {});
                for (const chairman of chairmen) {
                    await createAction({
                        actionKey:`consolidated-chairman:${risk.id}:${chairman.id}`,
                        module:'Risk',actionType:'Chairman Final Assessment',
                        title:`Final review: ${risk.risk_id}`,description:risk.risk_title,
                        priority:risk.risk_level,status:'Escalated',
                        assignedTo:chairman.id,assignedBy:req.user.id,
                        sourceType:'ConsolidatedRiskAssessment',sourceId:risk.id,
                        actionUrl:'pages/risks.html',availableActions:['review','approve','view']
                    },{req});
                }
            }
            await notifyRiskUsers({
                req,users:chairmen,
                title:'Champion Bulk Reviews Awaiting Final Decision',
                message:`${reviewed.length} Champion-reviewed risk${reviewed.length === 1 ? '' : 's'} are ready for final Committee consideration.`,
                risk:reviewed[0]
            });
            for (const batchId of completedImportBatchIds) {
                await completeBySource('RiskRegisterImportBatch',batchId,{
                    actor:req.user,req,comments:'All Champion reviews were submitted in bulk.'
                }).catch(() => {});
            }
        } catch (sideEffectError) {
            console.error('Champion bulk review follow-up failed after commit:', sideEffectError.message);
        }
        await logAudit({
            req,action:'CHAMPION_REVIEWS_BULK_SUBMITTED',entityType:'Risk',
            entityId:req.user.division || req.user.directorate || 'Selected Scope',
            details:{count:reviewed.length,riskIds:reviewed.map(risk => risk.risk_id),comments}
        });
        res.json({
            success:true,
            message:`${reviewed.length} Champion review${reviewed.length === 1 ? '' : 's'} submitted for final Chairman review.`,
            reviewedCount:reviewed.length
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);
        res.status(error.statusCode || 500).json({
            success:false,
            message:error.statusCode ? error.message : 'Unable to submit the Champion reviews in bulk.'
        });
    } finally {
        client.release();
    }
};

exports.getCommitteeBulkSummary = async (req, res) => {
    try {
        const division = optionalString(req.query.division);
        const params = [];
        const conditions = [`g.review_stage='Awaiting Chairman Review'`,`g.champion_score IS NOT NULL`];
        if (division) {
            params.push(division);
            conditions.push(`COALESCE(NULLIF(r.division,''),r.directorate)=$${params.length}`);
        }
        const result = await pool.query(
            `SELECT COALESCE(NULLIF(r.division,''),r.directorate) AS division,
                    COUNT(*)::int AS eligible_count,
                    COUNT(*) FILTER(WHERE r.risk_level='High')::int AS high_count
             FROM risks r
             JOIN risk_assessment_governance g ON g.risk_id=r.id
             WHERE ${conditions.join(' AND ')}
             GROUP BY COALESCE(NULLIF(r.division,''),r.directorate)
             ORDER BY division`,
            params
        );
        res.json({
            success:true,
            divisions:result.rows,
            eligibleCount:result.rows.reduce((sum,row)=>sum+Number(row.eligible_count),0),
            highCount:result.rows.reduce((sum,row)=>sum+Number(row.high_count),0)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({success:false,message:'Unable to summarize Committee-ready risks.'});
    }
};

exports.committeeBulkApprove = async (req, res) => {
    const client = await pool.connect();
    const approved = [];
    let finalizedImportBatchIds = [];
    try {
        const division = optionalString(req.body.division);
        const comments = optionalString(req.body.comments);
        const params = [];
        const conditions = [`g.review_stage='Awaiting Chairman Review'`,`g.champion_score IS NOT NULL`];
        if (division) {
            params.push(division);
            conditions.push(`COALESCE(NULLIF(r.division,''),r.directorate)=$${params.length}`);
        }
        await client.query('BEGIN');
        const risks = (await client.query(
            `SELECT r.*,g.champion_likelihood,g.champion_impact,g.champion_score
             FROM risks r JOIN risk_assessment_governance g ON g.risk_id=r.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY COALESCE(NULLIF(r.division,''),r.directorate),r.risk_id
             FOR UPDATE OF r,g`,
            params
        )).rows;
        if (!risks.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({success:false,message:'No risks are awaiting final Committee approval in this scope.'});
        }
        for (const risk of risks) {
            const likelihood=Number(risk.champion_likelihood);
            const impact=Number(risk.champion_impact);
            const score=likelihood*impact;
            const level=calculateRiskLevel(score);
            const response=responseFor(impact,likelihood,risk.risk_category);
            await client.query(
                `UPDATE risk_assessment_governance SET
                    chairman_likelihood=$1,chairman_impact=$2,chairman_score=$3,
                    chairman_decision='Champion',chairman_reason=$4,chairman_by=$5,chairman_at=NOW(),
                    review_stage='Finalised',updated_at=NOW()
                 WHERE risk_id=$6`,
                [likelihood,impact,score,comments||'Risk Committee accepted the Champion assessment.',req.user.id,risk.id]
            );
            const finalRisk=(await client.query(
                `UPDATE risks SET likelihood=$1,impact=$2,inherent_risk_score=$3,risk_level=$4,risk_treatment=$5,
                    workflow_status='Accepted',status='Accepted',admission_status='Admitted',
                    admitted_by=$6,admitted_at=NOW(),committee_reviewed_by=$6,committee_reviewed_at=NOW(),
                    executive_comments=$7,updated_at=NOW()
                 WHERE id=$8 RETURNING *`,
                [likelihood,impact,score,level,response,req.user.id,comments||'Approved through the Risk Committee bulk decision.',risk.id]
            )).rows[0];
            await createApprovedTreatmentPlan(client,finalRisk,req.user.id);
            await addRiskHistory(client,risk.id,'Committee Bulk Final Approval',req.user.id,{
                fromStatus:'Awaiting Chairman Review',toStatus:'Finalised',comment:comments,
                details:{division:risk.division||risk.directorate,selection:'Champion',score,committee_bulk:true}
            });
            approved.push(finalRisk);
        }
        const candidateImportBatchIds=[...new Set(approved.map(risk=>Number(risk.import_batch_id)).filter(Number.isInteger))];
        if(candidateImportBatchIds.length){
            finalizedImportBatchIds=(await client.query(
                `UPDATE risk_register_import_batches batch SET status='Finalised',updated_at=NOW()
                 WHERE batch.id=ANY($1::bigint[])
                   AND NOT EXISTS(
                       SELECT 1 FROM risks batch_risk
                       JOIN risk_assessment_governance batch_governance ON batch_governance.risk_id=batch_risk.id
                       WHERE batch_risk.import_batch_id=batch.id AND batch_governance.review_stage<>'Finalised'
                   )
                 RETURNING id`,
                [candidateImportBatchIds]
            )).rows.map(row=>row.id);
        }
        await client.query('COMMIT');
        for (const risk of approved) {
            await completeBySource('ConsolidatedRiskAssessment',risk.id,{
                actor:req.user,req,comments:'Final Committee bulk approval recorded.'
            }).catch(()=>{});
            const stakeholders=(await pool.query(
                `SELECT DISTINCT user_account.id,user_account.email,user_account.role,user_account.directorate,user_account.division
                 FROM users user_account
                 WHERE user_account.status='Active'
                   AND (user_account.id=$1 OR (
                       user_account.role='Risk Champion'
                       AND COALESCE(NULLIF(user_account.division,''),user_account.directorate)=$2
                   ))`,
                [risk.created_by,risk.division||risk.directorate]
            )).rows;
            await notifyRiskUsers({
                req,users:stakeholders,title:'Risk Committee Final Decision',
                message:`${risk.risk_id} - ${risk.risk_title} received final Committee approval.`,
                risk
            }).catch(()=>{});
        }
        for(const batchId of finalizedImportBatchIds){
            await completeBySource('RiskRegisterImportBatch',batchId,{
                actor:req.user,req,comments:'All imported risks received final Committee approval.'
            }).catch(()=>{});
        }
        await logAudit({
            req,action:'COMMITTEE_RISKS_BULK_APPROVED',entityType:'Risk',
            entityId:division||'Enterprise',
            details:{division:division||'All Divisions',count:approved.length,riskIds:approved.map(risk=>risk.risk_id),comments}
        });
        res.json({
            success:true,
            message:`Final Committee approval recorded for ${approved.length} risk${approved.length===1?'':'s'}${division?` in ${division}`:' across all divisions'}.`,
            approvedCount:approved.length
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(()=>{});
        console.error(error);
        res.status(500).json({success:false,message:'Unable to record the Committee bulk risk decision.'});
    } finally {
        client.release();
    }
};

exports.committeeEditRisk = async (req, res) => {
    const client=await pool.connect();
    try {
        await client.query('BEGIN');
        const risk=(await client.query(
            `SELECT r.*,g.review_stage FROM risks r
             JOIN risk_assessment_governance g ON g.risk_id=r.id
             WHERE r.id=$1 FOR UPDATE OF r,g`,
            [req.params.id]
        )).rows[0];
        if(!risk){
            await client.query('ROLLBACK');
            return res.status(404).json({success:false,message:'Risk not found.'});
        }
        if(risk.review_stage!=='Awaiting Chairman Review'){
            await client.query('ROLLBACK');
            return res.status(409).json({success:false,message:'Only risks awaiting final Committee review may be edited by the Chairman.'});
        }
        const title=optionalString(req.body.risk_title);
        const description=optionalString(req.body.risk_description);
        const category=normalizeRiskCategory(req.body.risk_category);
        const owner=optionalString(req.body.risk_owner);
        const controls=optionalString(req.body.existing_controls);
        const treatment=optionalString(req.body.risk_treatment);
        if(!title||!description||!ALLOWED_CATEGORIES.includes(category)||!owner||!ALLOWED_TREATMENTS.includes(treatment)){
            await client.query('ROLLBACK');
            return res.status(400).json({success:false,message:'Complete the risk title, description, category, owner and treatment response.'});
        }
        const updated=(await client.query(
            `UPDATE risks SET risk_title=$1,risk_description=$2,risk_category=$3,risk_owner=$4,
                existing_controls=$5,risk_treatment=$6,updated_at=NOW()
             WHERE id=$7 RETURNING *`,
            [title,description,category,owner,controls,treatment,risk.id]
        )).rows[0];
        await addRiskHistory(client,risk.id,'Committee Risk Details Edited',req.user.id,{
            fromStatus:risk.review_stage,toStatus:risk.review_stage,
            details:{before:{title:risk.risk_title,category:risk.risk_category,owner:risk.risk_owner,treatment:risk.risk_treatment},
                after:{title,category,owner,treatment}}
        });
        await client.query('COMMIT');
        await logAudit({req,action:'COMMITTEE_RISK_EDITED',entityType:'Risk',entityId:risk.id,details:{riskId:risk.risk_id}});
        res.json({success:true,message:'Committee amendments saved. Use Final Review to confirm the final score and decision.',risk:updated});
    } catch(error) {
        await client.query('ROLLBACK').catch(()=>{});
        console.error(error);
        res.status(500).json({success:false,message:'Unable to save the Committee risk amendments.'});
    } finally { client.release(); }
};

function canEditConsolidatedRisk(user, risk, governance) {
    if (user.role === 'System Administrator') return true;
    const division = risk.division || risk.directorate;
    const userDivision = user.division || user.directorate;
    if (user.role === 'Risk Focal Person') {
        return userDivision === division
            && ['Awaiting Focal Review','Returned'].includes(governance.review_stage)
            && canViewRisk(user, risk);
    }
    if (user.role === 'Risk Champion') {
        return userDivision === division && governance.review_stage === 'Awaiting Champion Review';
    }
    return user.role === 'Risk Committee Chairman'
        && governance.review_stage === 'Awaiting Chairman Review';
}

exports.editConsolidatedRisk = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const risk = (await client.query(
            `SELECT risk.*,governance.review_stage
             FROM risks risk
             JOIN risk_assessment_governance governance ON governance.risk_id=risk.id
             WHERE risk.id=$1
             FOR UPDATE OF risk,governance`,
            [req.params.id]
        )).rows[0];
        if (!risk) {
            await client.query('ROLLBACK');
            return res.status(404).json({success:false,message:'Risk not found.'});
        }
        if (!canEditConsolidatedRisk(req.user, risk, risk)) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success:false,
                message:'This risk can only be edited from the Consolidated Risk Register by the role assigned to its current review stage.'
            });
        }

        const requestedDivision = optionalString(req.body.directorate);
        const division = req.user.role === 'System Administrator'
            ? requestedDivision
            : risk.division || risk.directorate;
        const input = {
            risk_title: optionalString(req.body.risk_title),
            risk_description: optionalString(req.body.risk_description),
            risk_category: normalizeRiskCategory(req.body.risk_category),
            division,
            business_unit: optionalString(req.body.business_unit),
            programme_project: optionalString(req.body.programme_project),
            source_action_point: optionalString(req.body.source_action_point),
            risk_owner: optionalString(req.body.risk_owner),
            date_identified: optionalDate(req.body.date_identified),
            existing_controls: optionalString(req.body.existing_controls),
            control_effectiveness: optionalString(req.body.control_effectiveness),
            control_type: optionalString(req.body.control_type),
            control_owner: optionalString(req.body.control_owner),
            control_design_adequacy: optionalString(req.body.control_design_adequacy),
            control_evidence: optionalString(req.body.control_evidence),
            control_last_tested_date: optionalDate(req.body.control_last_tested_date),
            control_exceptions: optionalString(req.body.control_exceptions),
            control_next_review_date: optionalDate(req.body.control_next_review_date),
            control_assessment_basis: optionalString(req.body.control_assessment_basis),
            risk_treatment: optionalString(req.body.risk_treatment),
            initial_mitigation_plan: optionalString(req.body.initial_mitigation_plan),
            responsible_officer: optionalString(req.body.responsible_officer),
            target_completion_date: optionalDate(req.body.target_completion_date),
            assessment_year: Number(req.body.assessment_year)
        };
        const errors = [];
        if (!input.risk_title) errors.push('Risk title is required.');
        if (!input.risk_description) errors.push('Risk description is required.');
        if (!ALLOWED_CATEGORIES.includes(input.risk_category)) errors.push('Select a valid risk category.');
        if (!ALLOWED_DIRECTORATES.includes(input.division)) errors.push('Select a valid division.');
        if (!input.risk_owner) errors.push('Risk owner is required.');
        if (!ALLOWED_CONTROL_EFFECTIVENESS.includes(input.control_effectiveness)) errors.push('Select a valid control effectiveness.');
        if (!CONTROL_TYPES.includes(input.control_type)) errors.push('Select a valid control type.');
        if (!DESIGN_ADEQUACY.includes(input.control_design_adequacy)) errors.push('Select a valid control design adequacy.');
        if (input.control_last_tested_date && !validIsoDate(input.control_last_tested_date)) errors.push('Control last tested date must be valid.');
        if (input.control_next_review_date && !validIsoDate(input.control_next_review_date)) errors.push('Control next review date must be valid.');
        if (!ALLOWED_TREATMENTS.includes(input.risk_treatment)) errors.push('Select a valid risk treatment.');
        if (input.date_identified && !validIsoDate(input.date_identified)) errors.push('Date identified must be valid.');
        if (input.target_completion_date && !validIsoDate(input.target_completion_date)) errors.push('Target completion date must be valid.');
        if (!Number.isInteger(input.assessment_year) || input.assessment_year < 2020 || input.assessment_year > 2100) {
            errors.push('Enter a valid assessment year.');
        }
        if (errors.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({success:false,message:errors[0],errors});
        }

        const updated = (await client.query(
            `UPDATE risks SET
                risk_title=$1,risk_description=$2,risk_category=$3,
                directorate=$4,division=$4,business_unit=$5,programme_project=$6,
                risk_owner=$7,date_identified=COALESCE($8,date_identified),
                existing_controls=$9,control_effectiveness=$10,risk_treatment=$11,
                initial_mitigation_plan=$12,responsible_officer=$13,
                target_completion_date=$14,assessment_year=$15,
                control_type=$16,control_owner=$17,control_design_adequacy=$18,
                control_evidence=$19,control_last_tested_date=$20,control_exceptions=$21,
                control_next_review_date=$22,control_assessment_basis=$23,
                control_assessment_confidence=$24,control_assessed_by=$25,
                control_assessed_at=NOW(),updated_at=NOW()
             WHERE id=$26 RETURNING *`,
            [
                input.risk_title,input.risk_description,input.risk_category,input.division,
                input.business_unit,input.programme_project,input.risk_owner,input.date_identified,
                input.existing_controls,input.control_effectiveness,input.risk_treatment,
                input.initial_mitigation_plan,input.responsible_officer,input.target_completion_date,
                input.assessment_year,input.control_type,input.control_owner,input.control_design_adequacy,
                input.control_evidence,input.control_last_tested_date,input.control_exceptions,
                input.control_next_review_date,input.control_assessment_basis,
                assessControlAssurance(input).confidence,req.user.id,risk.id
            ]
        )).rows[0];

        const workplanAssessment = (await client.query(
            `SELECT assessment.id,assessment.action_id
             FROM workplan_risk_assessments assessment
             WHERE assessment.generated_risk_id=$1
                OR assessment.action_id=$2
             ORDER BY (assessment.generated_risk_id=$1) DESC,assessment.id DESC
             LIMIT 1 FOR UPDATE`,
            [risk.id,risk.source_workplan_action_id]
        )).rows[0];
        if (workplanAssessment) {
            await client.query(
                `UPDATE workplan_risk_assessments SET
                    risk_title=$1,risk_description=$2,risk_category=$3,
                    reviewed_programme=$4,treatment_recommendation=$5,
                    updated_by=$6,updated_at=NOW(),edit_count=edit_count+1
                 WHERE id=$7`,
                [
                    input.risk_title,input.risk_description,input.risk_category,
                    input.programme_project,input.initial_mitigation_plan,
                    req.user.id,workplanAssessment.id
                ]
            );
            if (input.source_action_point) {
                await client.query(
                    'UPDATE workplan_actions SET action_point=$1 WHERE id=$2',
                    [input.source_action_point,workplanAssessment.action_id]
                );
            }
        }

        await addRiskHistory(client,risk.id,'Consolidated Risk Details Edited',req.user.id,{
            fromStatus:risk.review_stage,toStatus:risk.review_stage,
            details:{
                source:risk.entry_source,
                before:{
                    title:risk.risk_title,category:risk.risk_category,division:risk.division || risk.directorate,
                    programme:risk.programme_project,owner:risk.risk_owner,treatment:risk.risk_treatment
                },
                after:{
                    title:input.risk_title,category:input.risk_category,division:input.division,
                    programme:input.programme_project,owner:input.risk_owner,treatment:input.risk_treatment
                }
            }
        });
        await client.query('COMMIT');
        await logAudit({
            req,action:'CONSOLIDATED_RISK_EDITED',entityType:'Risk',entityId:risk.id,
            details:{riskId:risk.risk_id,source:risk.entry_source,reviewStage:risk.review_stage}
        });
        res.json({
            success:true,
            message:'Consolidated risk amendments saved and synchronized to the source view.',
            risk:updated
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);
        res.status(500).json({success:false,message:'Unable to save the consolidated risk amendments.'});
    } finally {
        client.release();
    }
};

exports.createRisk = async (req, res) => {
    const client = await pool.connect();

    try {
        if (!canCreateRisk(req.user)) {
            await logAudit({ req, action: 'RISK_CREATE_DENIED', entityType: 'Risk', status: 'Denied', details: { role: req.user.role } });
            return res.status(403).json({ success: false, message: 'You do not have permission to create risks.' });
        }

        const risk = normalizeRiskInput(req.body, req.user);

        if (['Risk Focal Person','Risk Champion'].includes(req.user.role)) {
            risk.directorate = req.user.division || req.user.directorate;
            risk.business_unit = req.user.division || req.user.directorate;
            risk.risk_owner = req.user.full_name || risk.risk_owner;
        }

        if (!canViewRisk(req.user, risk)) {
            return res.status(403).json({ success: false, message: 'You can only create risks for your assigned division.' });
        }

        const errors = validateRiskInput(risk);
        if (errors.length) {
            return res.status(400).json({ success: false, message: errors[0], errors });
        }

        const inherentRiskScore = risk.impact * risk.likelihood;
        const requestedSubmission = risk.workflow_status === 'Submitted';
        const championSubmission = req.user.role === 'Risk Champion' && requestedSubmission;
        const workflowStatus = championSubmission ? 'Under Review' : requestedSubmission ? 'Submitted' : 'Draft';
        const status = workflowStatus;
        const entrySource = req.user.role === 'Risk Champion' ? 'Manual - Risk Champion' : 'Manual - Risk Focal Person';
        const admissionStatus = championSubmission ? 'Pending Chairman Approval' : requestedSubmission ? 'Pending Champion Approval' : 'Draft';
        const focalVisibility = req.user.role === 'Risk Champion' ? risk.focal_visibility : true;

        await client.query('BEGIN');
        const riskId = await generateRiskId(client, risk.directorate);
        const result = await client.query(
            `
            INSERT INTO risks (
                risk_id, risk_title, risk_description, risk_category, directorate, division, business_unit,
                programme_project, risk_owner, date_identified, likelihood, impact, inherent_risk_score,
                residual_risk_score, risk_level, existing_controls, control_effectiveness, risk_treatment,
                initial_mitigation_plan, responsible_officer, target_completion_date, status, workflow_status,
                submitted_at, treatment_status, created_by, assessment_year, entry_source, admission_status,
                focal_visibility, admitted_by, admitted_at,
                control_type,control_owner,control_design_adequacy,control_evidence,
                control_last_tested_date,control_exceptions,control_next_review_date,
                control_assessment_basis,control_assessment_confidence,control_assessed_by,control_assessed_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
                    $33,$34,$35,$36,$37,$38,$39,$40,$41,$42,NOW())
            RETURNING *
            `,
            [
                riskId,
                risk.risk_title,
                risk.risk_description,
                risk.risk_category,
                risk.directorate,
                risk.directorate,
                risk.business_unit,
                risk.programme_project,
                risk.risk_owner,
                risk.date_identified,
                risk.likelihood,
                risk.impact,
                inherentRiskScore,
                null,
                calculateRiskLevel(inherentRiskScore),
                risk.existing_controls,
                risk.control_effectiveness,
                risk.risk_treatment,
                risk.initial_mitigation_plan,
                risk.responsible_officer,
                risk.target_completion_date,
                status,
                workflowStatus,
                requestedSubmission ? new Date() : null,
                'Not Started',
                req.user.id,
                risk.assessment_year,
                entrySource,
                admissionStatus,
                focalVisibility,
                null,
                null,
                risk.control_type,
                risk.control_owner,
                risk.control_design_adequacy,
                risk.control_evidence,
                risk.control_last_tested_date,
                risk.control_exceptions,
                risk.control_next_review_date,
                risk.control_assessment_basis,
                risk.control_assessment_confidence,
                req.user.id
            ]
        );

        await createGovernanceAssessment(client, result.rows[0], { entrySource });
        await addRiskHistory(client, result.rows[0].id, workflowStatus === 'Submitted' ? 'Submitted' : 'Risk Created', req.user.id, {
            toStatus: workflowStatus,
            details: { risk_id: riskId }
        });
        await client.query('COMMIT');

        if (workflowStatus === 'Submitted') {
            await startWorkflow({ workflowKey:'risk_approval', subjectType:'Risk', subjectId:result.rows[0].id, itemTitle:`${riskId} - ${risk.risk_title}`, requesterId:req.user.id, division:risk.directorate, priority:calculateRiskLevel(inherentRiskScore), metadata:{risk_id:riskId} });
            await notifyRiskSubmitted(req,result.rows[0]);
        }
        if (championSubmission) {
            const chairmen=(await pool.query(`SELECT id,email,role,directorate,division FROM users WHERE role='Risk Committee Chairman' AND status='Active'`)).rows;
            await notifyRiskUsers({req,users:chairmen,title:'Champion Risk Awaiting Final Review',message:`${riskId} - ${risk.risk_title} was submitted by the Risk Champion for the Chairman’s final decision.`,risk:result.rows[0]});
            if (focalVisibility) {
                const focalPeople=(await pool.query(`SELECT id,email,role,directorate,division FROM users WHERE role='Risk Focal Person' AND status='Active' AND COALESCE(NULLIF(division,''),directorate)=$1`,[risk.directorate])).rows;
                await notifyRiskUsers({req,users:focalPeople,title:'New Division Risk',message:`${riskId} - ${risk.risk_title} was added by the Risk Champion.`,risk:result.rows[0]});
            }
        }

        await logAudit({
            req,
            action: championSubmission ? 'RISK_SUBMITTED_BY_CHAMPION' : workflowStatus === 'Submitted' ? 'RISK_SUBMITTED' : 'RISK_CREATED',
            entityType: 'Risk',
            entityId: result.rows[0].id,
            details: { risk_id: riskId }
        });
        res.status(201).json({ success: true, message: championSubmission ? 'Risk submitted to the Chairman for final review.' : workflowStatus === 'Submitted' ? 'Risk submitted to the Risk Champion for approval.' : 'Risk draft saved.', risk: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);
        res.status(500).json({ success: false, message: 'Unable to create risk.' });
    } finally {
        client.release();
    }
};

async function prepareImportedRows(parsed, user) {
    const rows = parsed.rows.map(row => {
        const risk = normalizeImportedRisk(row.data, user, parsed.template_type);
        return {
            ...row,
            risk,
            errors: [...row.errors, ...validateImportedRisk(risk, user)]
        };
    });
    const suppliedIds = rows.filter(row => row.risk.risk_id).map(row => row.risk.risk_id.toLowerCase());

    if (suppliedIds.length) {
        const existing = await pool.query('SELECT LOWER(risk_id) AS risk_id FROM risks WHERE LOWER(risk_id) = ANY($1::text[])', [suppliedIds]);
        const existingIds = new Set(existing.rows.map(row => row.risk_id));
        rows.forEach(row => {
            if (row.risk.risk_id && existingIds.has(row.risk.risk_id.toLowerCase())) {
                row.errors.push(`Risk ID ${row.risk.risk_id} already exists.`);
            }
        });
    }

    rows.forEach(row => { row.errors = [...new Set(row.errors)]; });
    return rows;
}

async function resolveAdminImportSubject(req, input = req.body) {
    if (req.user.role !== 'System Administrator') return req.user;
    const focalId = numberOrNull(input?.focal_user_id);
    const division = optionalString(input?.division);
    if (!focalId || !division || !ALLOWED_DIRECTORATES.includes(division)) {
        throw Object.assign(new Error('Select a valid division and its active Risk Focal Person.'), {statusCode:400});
    }
    const focal = (await pool.query(
        `SELECT id,email,full_name,role,directorate,division,status
         FROM users WHERE id=$1 AND role='Risk Focal Person' AND status='Active'`,
        [focalId]
    )).rows[0];
    if (!focal || (focal.division || focal.directorate) !== division) {
        throw Object.assign(new Error('The selected Focal Person is not active in the selected division.'), {statusCode:400});
    }
    return {...focal,directorate:division,division};
}

const CORRECTION_EDITABLE_FIELDS = [
    'risk_id','programme_project','risk_title','risk_description','risk_source','risk_cause','risk_category',
    'date_identified','risk_owner','likelihood','impact','risk_treatment',
    'current_likelihood','current_impact','residual_likelihood','residual_impact',
    'existing_controls','control_type','control_owner','control_design_adequacy',
    'control_evidence','control_last_tested_date','control_exceptions','control_next_review_date',
    'control_effectiveness','control_assessment_basis',
    'initial_mitigation_plan','responsible_officer','target_completion_date'
];

function correctionProposal(row, risk) {
    const engine = buildWorkbookCorrectionProposal({
        row,risk,baseCorrections:row.corrections || []
    });
    const corrections = [...engine.corrections];
    if (!row.original_data.date_identified) {
        corrections.push(ruleRecord({
            ruleId:'REQUIRED-DATE-IDENTIFIED',mistakeType:'Missing required value',
            field:'date_identified',original:null,proposed:risk.date_identified,
            detection:'The workbook does not contain a Date Identified value.',
            explanation:'The upload date is proposed as the identification date and remains editable before admission.',
            confidence:'Low',
            validation:'Confirm a valid Date Identified between 2020 and 2100.'
        }));
    }
    if (!row.original_data.risk_category) {
        corrections.push(ruleRecord({
            ruleId:'REQUIRED-RISK-CATEGORY',mistakeType:'Missing required value',
            field:'risk_category',original:null,proposed:risk.risk_category,
            detection:'The workbook row has no mapped Risk Category.',
            explanation:'The system proposed a category from the risk text for Focal Person review.',
            confidence:'Medium',
            validation:'Select an ERM-approved risk category.'
        }));
    }
    if (!row.original_data.existing_controls) {
        corrections.push(ruleRecord({
            ruleId:'REQUIRED-EXISTING-CONTROLS',mistakeType:'Missing required value',
            field:'existing_controls',original:null,proposed:risk.existing_controls,
            detection:'No Existing Controls value was supplied.',
            explanation:'A transparent placeholder is proposed and remains editable by the Focal Person.',
            confidence:'Low',
            validation:'Record the existing controls or explicitly confirm that none were documented.'
        }));
    }
    const controlProposal = assessControlAssurance(risk);
    if (!ALLOWED_CONTROL_EFFECTIVENESS.includes(optionalString(row.original_data.control_effectiveness))) {
        corrections.push(ruleRecord({
            ruleId:'CONTROL-EFFECTIVENESS-ASSESSMENT',
            mistakeType:'Missing or invalid governed value',
            field:'control_effectiveness',
            original:row.original_data.control_effectiveness || null,
            proposed:controlProposal.rating,
            detection:'The workbook did not provide an ERM-governed control-effectiveness value.',
            explanation:controlProposal.basis,
            confidence:controlProposal.confidence,
            validation:'Choose Effective, Partially Effective, Ineffective, or Not Assessed. Effective requires adequate design, evidence, and a dated control test.'
        }));
    }
    const consistency = controlScoreConsistency({
        effectiveness:risk.control_effectiveness,
        inherentScore:Number(risk.likelihood) * Number(risk.impact),
        currentScore:risk.current_likelihood && risk.current_impact
            ? Number(risk.current_likelihood) * Number(risk.current_impact)
            : null
    });
    if (consistency) corrections.push(ruleRecord({
        ruleId:'CONTROL-SCORE-CONSISTENCY',
        mistakeType:'Control and score consistency warning',
        field:'control_effectiveness',
        original:risk.control_effectiveness,
        proposed:risk.control_effectiveness,
        detection:consistency,
        explanation:'The system flags the inconsistency for review but does not change any risk score.',
        confidence:'High',
        validation:'Confirm the control evidence and the independently assessed risk scores.'
    }));
    if (!row.original_data.responsible_officer) {
        corrections.push(ruleRecord({
            ruleId:'REQUIRED-RESPONSIBLE-OFFICER',mistakeType:'Missing required value',
            field:'responsible_officer',original:null,proposed:risk.responsible_officer,
            detection:'No separate Responsible Officer value was supplied.',
            explanation:'The Risk Owner is proposed as the Responsible Officer for Focal Person confirmation.',
            confidence:'Medium',
            validation:'Every treatment action requires a responsible officer.'
        }));
    }
    return {
        values:Object.fromEntries(CORRECTION_EDITABLE_FIELDS.map(field => [
            field,Object.prototype.hasOwnProperty.call(engine.values,field)
                ? engine.values[field]
                : (risk[field] ?? null)
        ])),
        parent_risk_id:row.data.parent_risk_id || null,
        corrections,
        rules_version:engine.rules_version,
        system_assessment:engine.system_assessment,
        approved_responses:engine.approved_responses
    };
}

function applyConfirmedCorrections(parsed, correctedRows) {
    if (!Array.isArray(correctedRows) || correctedRows.length !== parsed.rows.length) {
        throw Object.assign(new Error('Review and confirm the proposed correction for every risk before uploading.'),{statusCode:400});
    }
    const submitted = new Map(correctedRows.map(row => [Number(row.excel_row),row]));
    parsed.rows.forEach(row => {
        const correction = submitted.get(Number(row.excel_row));
        if (!correction || correction.confirmed !== true || !correction.values || typeof correction.values !== 'object') {
            throw Object.assign(new Error(`Confirm the correction for Excel row ${row.excel_row} before uploading.`),{statusCode:400});
        }
        const originalProposal = {...row.data};
        CORRECTION_EDITABLE_FIELDS.forEach(field => {
            if (Object.prototype.hasOwnProperty.call(correction.values,field)) {
                row.data[field] = correction.values[field];
            }
        });
        const likelihood = Number(row.data.likelihood);
        const impact = Number(row.data.impact);
        const currentLikelihood = Number(row.data.current_likelihood);
        const currentImpact = Number(row.data.current_impact);
        const residualLikelihood = Number(row.data.residual_likelihood);
        const residualImpact = Number(row.data.residual_impact);
        if ([likelihood,impact].every(Number.isInteger)) {
            row.data.inherent_risk_score = likelihood * impact;
            row.data.risk_level = calculateRiskLevel(row.data.inherent_risk_score);
        }
        if ([currentLikelihood,currentImpact].every(Number.isInteger)) {
            row.data.current_risk_score = currentLikelihood * currentImpact;
        }
        if ([residualLikelihood,residualImpact].every(Number.isInteger)) {
            row.data.residual_score = residualLikelihood * residualImpact;
        }
        row.user_confirmation = {
            confirmed:true,
            original_workbook:row.original_data,
            system_proposal:originalProposal,
            confirmed_values:Object.fromEntries(CORRECTION_EDITABLE_FIELDS.map(field => [field,row.data[field] ?? null])),
            explanations:row.corrections || []
        };
    });
    return parsed;
}

async function insertImportedRisk(client, risk, req, excelRow, fileName, entrySource = 'Imported Workbook', importBatchId = null, correctionAudit = null, options = {}) {
    const inherentRiskScore = risk.impact * risk.likelihood;
    const workflowStatus = options.forceFocalReview
        ? 'Draft'
        : (risk.workflow_status === 'Submitted' ? 'Submitted' : 'Draft');
    const admissionStatus = options.forceFocalReview
        ? 'Draft'
        : (workflowStatus === 'Submitted' ? 'Pending Champion Approval' : 'Draft');

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`risk-import:${risk.directorate}`]);
    const riskId = risk.risk_id || await generateRiskId(client, risk.directorate);
    const result = await client.query(
        `
        INSERT INTO risks (
            risk_id, risk_title, risk_description, risk_source, risk_cause, risk_category, directorate, division, business_unit,
            programme_project, risk_owner, date_identified, likelihood, impact, inherent_risk_score,
            residual_risk_score, risk_level, existing_controls, control_effectiveness, risk_treatment,
            initial_mitigation_plan, responsible_officer, target_completion_date, status, workflow_status,
            submitted_at, treatment_status, created_by, current_impact, current_likelihood,
            current_risk_score, progress_notes, next_review_date, residual_impact, residual_likelihood,
            residual_score, closure_date, closure_comments, assessment_year, entry_source, admission_status,
            focal_visibility, import_batch_id,accountable_focal_id,
            control_type,control_owner,control_design_adequacy,control_evidence,
            control_last_tested_date,control_exceptions,control_next_review_date,
            control_assessment_basis,control_assessment_confidence,control_assessed_by,control_assessed_at
        )
        VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,
            $44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,NOW()
        )
        RETURNING *
        `,
        [
            riskId,
            risk.risk_title,
            risk.risk_description,
            risk.risk_source,
            risk.risk_cause,
            risk.risk_category,
            risk.directorate,
            risk.directorate,
            risk.business_unit,
            risk.programme_project,
            risk.risk_owner,
            risk.date_identified,
            risk.likelihood,
            risk.impact,
            inherentRiskScore,
            risk.residual_score,
            calculateRiskLevel(inherentRiskScore),
            risk.existing_controls,
            risk.control_effectiveness,
            risk.risk_treatment,
            risk.initial_mitigation_plan,
            risk.responsible_officer,
            risk.target_completion_date,
            risk.source_status || workflowStatus,
            workflowStatus,
            workflowStatus === 'Submitted' ? new Date() : null,
            risk.treatment_status,
            req.user.id,
            risk.current_impact,
            risk.current_likelihood,
            risk.current_risk_score,
            risk.progress_notes,
            risk.next_review_date,
            risk.residual_impact,
            risk.residual_likelihood,
            risk.residual_score,
            risk.closure_date,
            risk.closure_comments,
            risk.assessment_year,
            entrySource,
            admissionStatus,
            true,
            importBatchId,
            options.accountableFocalId || (req.user.role === 'Risk Focal Person' ? req.user.id : null),
            risk.control_type,
            risk.control_owner,
            risk.control_design_adequacy,
            risk.control_evidence,
            risk.control_last_tested_date,
            risk.control_exceptions,
            risk.control_next_review_date,
            risk.control_assessment_basis,
            risk.control_assessment_confidence,
            req.user.id
        ]
    );

    const importedRisk = result.rows[0];
    await createGovernanceAssessment(client, importedRisk, {
        entrySource,
        forceFocalReview:options.forceFocalReview === true,
        focalLikelihood:risk.likelihood,
        focalImpact:risk.impact,
        accountableFocalId:options.accountableFocalId,
        sourceFileName:fileName,
        focalReason:options.forceFocalReview
            ? 'Assessment supplied by the assigned Focal Person in the workbook and awaiting their confirmation.'
            : undefined
    });
    const proposal = generateTreatmentProposal(importedRisk);
    const treatment = (await client.query(
        `INSERT INTO treatment_plans(
            risk_id,plan_title,treatment_strategy,action_owner,due_date,progress_percent,status,
            evidence_notes,created_by,plan_origin,lifecycle_status,system_proposed_strategy,
            uploaded_plan,system_improvements,treatment_objective,treatment_actions,evidence_required,
            monitoring_frequency,review_date,target_residual_likelihood,target_residual_impact,
            target_residual_score,source_file_name,source_excel_row
        ) VALUES(
            $1,$2,$3,$4,$5,0,'Not Started',$6,$7,$8,'Focal Review',$3,
            $9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
        ) RETURNING *`,
        [
            importedRisk.id,
            `Treatment for ${importedRisk.risk_title}`.slice(0, 200),
            proposal.strategy,
            proposal.owner,
            proposal.due_date,
            proposal.evidence_required,
            req.user.id,
            entrySource,
            proposal.original_plan,
            proposal.system_improvements,
            proposal.objective,
            proposal.actions,
            proposal.evidence_required,
            proposal.monitoring_frequency,
            proposal.review_date,
            proposal.target_residual_likelihood,
            proposal.target_residual_impact,
            proposal.target_residual_score,
            fileName,
            excelRow
        ]
    )).rows[0];
    await addRiskHistory(client, importedRisk.id, workflowStatus === 'Submitted' ? 'Submitted' : 'Risk Imported', req.user.id, {
        toStatus: workflowStatus,
        details: {
            risk_id:riskId,source:entrySource,excel_row:excelRow,file_name:fileName,
            treatment_plan_id:treatment.id,
            correction_confirmation:correctionAudit
        }
    });
    await client.query(
        `
        INSERT INTO audit_logs (
            user_id, user_email, user_role, action, entity_type, entity_id, status,
            ip_address, user_agent, details
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `,
        [
            req.user.id,
            req.user.email,
            req.user.role,
            'RISK_IMPORTED',
            'Risk',
            String(importedRisk.id),
            'Success',
            req.ip || null,
            req.headers['user-agent'] || null,
            {
                risk_id:riskId,excel_row:excelRow,file_name:fileName,source:entrySource,
                correction_confirmation:correctionAudit
            }
        ]
    );
    return importedRisk;
}

function workbookErrorResponse(res, error) {
    const isInfrastructureError = Boolean(error?.code);
    const message = isInfrastructureError
        ? 'The risk register service is temporarily unable to validate the workbook.'
        : (error && error.message ? error.message : 'Unable to read the Excel workbook.');
    return res.status(isInfrastructureError ? 500 : 400).json({ success: false, message });
}

exports.previewRiskImport = async (req, res) => {
    try {
        const importSubject = await resolveAdminImportSubject(req);
        const parsed = parseRiskWorkbook(req.body.file_name, req.body.file_data);
        const rows = await prepareImportedRows(parsed, importSubject);
        const scoreDetails = (impact, likelihood) => {
            if (![impact, likelihood].every(value => Number.isInteger(value) && value >= 1 && value <= 5)) return null;
            const score = impact * likelihood;
            return { impact, likelihood, score, level: calculateRiskLevel(score) };
        };
        const previewRows = rows.map(row => {
            const proposal = correctionProposal(row,row.risk);
            const proposedRisk = {...row.risk,...proposal.values};
            proposedRisk.inherent_risk_score = Number(proposal.values.impact) * Number(proposal.values.likelihood);
            proposedRisk.current_risk_score = Number(proposal.values.current_impact) * Number(proposal.values.current_likelihood);
            proposedRisk.residual_score = Number(proposal.values.residual_impact) * Number(proposal.values.residual_likelihood);
            proposedRisk.risk_level = calculateRiskLevel(proposedRisk.inherent_risk_score);
            proposedRisk._provided_numbers = new Set([
                ...(row.risk._provided_numbers || [])
            ].filter(field => !['inherent_risk_score','current_risk_score','residual_score'].includes(field)));
            const proposalErrors = validateImportedRisk(proposedRisk,importSubject)
                .filter(error => !(proposal.values.risk_treatment === null && error === 'Select a valid risk response.'));
            const nonCorrectableErrors = row.errors.filter(error => /already exists/i.test(error));
            const errors = [...new Set([...proposalErrors,...nonCorrectableErrors])];
            return {
                excel_row:row.excel_row,
                values:row.values,
                original:row.original_data || row.data,
                proposed_correction:proposal,
                treatment_proposal:generateTreatmentProposal(proposedRisk),
                calculated_scores:{
                    inherent:scoreDetails(proposal.values.impact,proposal.values.likelihood),
                    current:scoreDetails(proposal.values.current_impact,proposal.values.current_likelihood),
                    residual:scoreDetails(proposal.values.residual_impact,proposal.values.residual_likelihood)
                },
                valid:errors.length === 0 && proposal.values.risk_treatment !== null,
                errors:proposal.values.risk_treatment === null
                    ? [...errors,'Select an ERM-approved risk response.']
                    : errors
            };
        });
        const validRows = previewRows.filter(row => row.valid).length;

        res.json({
            success: true,
            message: 'Workbook validated. Review the preview before importing.',
            preview: {
                file_name: parsed.file_name,
                sheet_name: parsed.sheet_name,
                template_type: parsed.template_type,
                header_row: parsed.header_row,
                ignored_headers: parsed.ignored_headers,
                headers: parsed.headers,
                rows: previewRows,
                correction_mode:'guided',
                requires_confirmation:true,
                education:{
                    title:'How guided correction works',
                    steps:[
                        'The system preserves the original workbook values and proposes a separate, upload-ready record for every risk event.',
                        'The versioned rules detect structural, terminology, required-value and assessment issues. Merged parent values are carried into each event and unique child Risk IDs are proposed where required.',
                        'Missing Pre-, Current- and Post-Mitigation Likelihood and Impact values are generated from the ERM assessment and treatment rules, then left editable for Focal Person confirmation.',
                        'Accept is translated to the approved response Tolerate. Any blank or unrecognised response must be selected by the user from Terminate, Treat, Transfer or Tolerate.',
                        'Every proposed change shows the detection rule, proposed correction, explanation, confidence, validation rule and audit record.',
                        'Nothing is uploaded until all proposed risks are valid and explicitly confirmed by the Focal Person.'
                    ]
                },
                summary: {
                    total_rows: previewRows.length,
                    valid_rows: validRows,
                    failed_rows: previewRows.length - validRows,
                    validation_errors: previewRows.flatMap(row => row.errors.map(message => ({ excel_row: row.excel_row, message })))
                }
            }
        });
    } catch (error) {
        console.error('Risk import preview failed:', error.message);
        await logAudit({ req, action: 'RISK_IMPORT_PREVIEW_FAILED', entityType: 'Risk Import', status: 'Failed', details: { file_name: req.body?.file_name, error: error.message } });
        if (error.statusCode) return res.status(error.statusCode).json({success:false,message:error.message});
        workbookErrorResponse(res, error);
    }
};

exports.importRisks = async (req, res) => {
    let importBatchId = null;
    try {
        const parsed = applyConfirmedCorrections(
            parseRiskWorkbook(req.body.file_name, req.body.file_data),
            req.body.corrected_rows
        );
        const rows = await prepareImportedRows(parsed, req.user);
        if (Array.isArray(req.body.corrected_rows)) {
            rows.forEach(row => {
                if (!row.user_confirmation) return;
                const systemRisk = normalizeImportedRisk(
                    row.user_confirmation.system_proposal,
                    req.user,
                    parsed.template_type
                );
                const proposal = correctionProposal(row,systemRisk);
                row.user_confirmation.system_proposal = proposal.values;
                row.user_confirmation.explanations = proposal.corrections;
            });
            const invalidRows = rows.filter(row => row.errors.length);
            if (invalidRows.length) {
                return res.status(422).json({
                    success:false,
                    message:'Some confirmed corrections are still invalid. Review them before uploading.',
                    summary:{
                        total_rows:rows.length,
                        imported_rows:0,
                        failed_rows:invalidRows.length,
                        validation_errors:invalidRows.flatMap(row => row.errors.map(message => ({excel_row:row.excel_row,message})))
                    }
                });
            }
        }
        const validationErrors = [];
        let importedRows = 0;
        const entrySource = ['Risk Register Tracking Template','Legal Legacy Risk Register','Division Risk Register Tracker'].includes(parsed.template_type)
            ? parsed.template_type
            : 'Imported Workbook';
        const division = req.user.division || req.user.directorate;
        importBatchId = (await pool.query(
            `INSERT INTO risk_register_import_batches(
                division,file_name,sheet_name,template_type,total_rows,uploaded_by
             ) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
            [division,parsed.file_name,parsed.sheet_name,parsed.template_type,rows.length,req.user.id]
        )).rows[0].id;

        for (const row of rows) {
            if (row.errors.length) {
                row.errors.forEach(message => validationErrors.push({ excel_row: row.excel_row, message }));
                continue;
            }

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const importedRisk = await insertImportedRisk(
                    client,row.risk,req,row.excel_row,parsed.file_name,
                    entrySource,importBatchId,row.user_confirmation || null
                );
                await client.query('COMMIT');
                importedRows += 1;
                if (importedRisk.workflow_status === 'Submitted') {
                    try {
                        await startWorkflow({workflowKey:'risk_approval',subjectType:'Risk',subjectId:importedRisk.id,itemTitle:`${importedRisk.risk_id} - ${importedRisk.risk_title}`,requesterId:req.user.id,division:importedRisk.division||importedRisk.directorate,priority:importedRisk.risk_level,metadata:{risk_id:importedRisk.risk_id,source:entrySource}});
                        await notifyRiskSubmitted(req,importedRisk);
                    } catch (followUpError) {
                        console.error(`Imported risk ${importedRisk.risk_id} was saved, but approval routing failed:`,followUpError.message);
                    }
                }
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                const message = error.code === '23505'
                    ? 'Risk ID already exists.'
                    : 'The row could not be saved to the risk register.';
                validationErrors.push({ excel_row: row.excel_row, message });
                console.error(`Risk import row ${row.excel_row} failed:`, error.message);
            } finally {
                client.release();
            }
        }

        const summary = {
            total_rows: rows.length,
            imported_rows: importedRows,
            failed_rows: rows.length - importedRows,
            validation_errors: validationErrors
        };
        if (importedRows) {
            await pool.query(
                `UPDATE risk_register_import_batches
                 SET imported_rows=$1,failed_rows=$2,updated_at=NOW() WHERE id=$3`,
                [summary.imported_rows,summary.failed_rows,importBatchId]
            );
        } else {
            await pool.query('DELETE FROM risk_register_import_batches WHERE id=$1', [importBatchId]);
            importBatchId = null;
        }
        await logAudit({
            req,
            action: 'RISK_IMPORT_COMPLETED',
            entityType: 'Risk Import',
            status: summary.failed_rows ? 'Partial' : 'Success',
            details: {
                file_name: parsed.file_name,
                sheet_name: parsed.sheet_name,
                template_type: parsed.template_type,
                ignored_headers: parsed.ignored_headers,
                total_rows: summary.total_rows,
                imported_rows: summary.imported_rows,
                failed_rows: summary.failed_rows,
                validation_error_count: summary.validation_errors.length
            }
        });

        res.status(importedRows ? 201 : 422).json({
            success: importedRows > 0,
            message: importedRows
                ? `${importedRows} risk${importedRows === 1 ? '' : 's'} imported successfully.`
                : 'No risks were imported. Correct the validation errors and try again.',
            summary: { ...summary, import_batch_id: importBatchId }
        });
    } catch (error) {
        console.error('Risk import failed:', error.message);
        await logAudit({ req, action: 'RISK_IMPORT_FAILED', entityType: 'Risk Import', status: 'Failed', details: { file_name: req.body?.file_name, error: error.message } });
        if (importBatchId) {
            await pool.query('DELETE FROM risk_register_import_batches WHERE id=$1', [importBatchId]).catch(() => {});
        }
        workbookErrorResponse(res, error);
    }
};

exports.getAdminImportOptions = async (req, res) => {
    try {
        const focals = (await pool.query(
            `SELECT id,email,full_name,COALESCE(NULLIF(division,''),directorate) AS division
             FROM users
             WHERE role='Risk Focal Person' AND status='Active'
             ORDER BY COALESCE(NULLIF(division,''),directorate),full_name,email`
        )).rows.filter(row => ALLOWED_DIRECTORATES.includes(row.division));
        res.json({success:true,divisions:ALLOWED_DIRECTORATES,focals});
    } catch (error) {
        console.error(error);
        res.status(500).json({success:false,message:'Unable to load division upload options.'});
    }
};

exports.createAdminImportGroup = async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({success:false,message:'Add at least one division workbook.'});
    const client = await pool.connect();
    const prepared = [];
    try {
        const divisions = new Set();
        for (const item of items) {
            const subject = await resolveAdminImportSubject(req,item);
            if (divisions.has(subject.division)) {
                throw Object.assign(new Error(`Only one workbook may be submitted for ${subject.division} in this group.`),{statusCode:400});
            }
            divisions.add(subject.division);
            const parsed = applyConfirmedCorrections(
                parseRiskWorkbook(item.file_name,item.file_data),item.corrected_rows
            );
            const rows = await prepareImportedRows(parsed,subject);
            rows.forEach(row => {
                if (!row.user_confirmation) return;
                const systemRisk = normalizeImportedRisk(row.user_confirmation.system_proposal,subject,parsed.template_type);
                const proposal = correctionProposal(row,systemRisk);
                row.user_confirmation.system_proposal = proposal.values;
                row.user_confirmation.explanations = proposal.corrections;
            });
            const invalid = rows.filter(row => row.errors.length);
            if (invalid.length) {
                throw Object.assign(new Error(`${subject.division}: ${invalid.length} risk row(s) still require correction.`),{
                    statusCode:422,
                    validationErrors:invalid.flatMap(row => row.errors.map(message => ({division:subject.division,excel_row:row.excel_row,message})))
                });
            }
            prepared.push({item,subject,parsed,rows});
        }
        const ids = prepared.flatMap(entry => entry.rows.map(row => row.risk.risk_id).filter(Boolean).map(id => id.toLowerCase()));
        if (new Set(ids).size !== ids.length) {
            throw Object.assign(new Error('A Risk ID is duplicated across the selected division workbooks.'),{statusCode:422});
        }

        const groupId = crypto.randomUUID();
        const batches = [];
        const stagedRisks = [];
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO risk_register_admin_upload_groups(id,status,division_count,total_risks,created_by)
             VALUES($1,'Awaiting Focal Review',$2,$3,$4)`,
            [groupId,prepared.length,prepared.reduce((total,entry) => total + entry.rows.length,0),req.user.id]
        );
        for (const entry of prepared) {
            const batch = (await client.query(
                `INSERT INTO risk_register_import_batches(
                    division,file_name,sheet_name,template_type,total_rows,imported_rows,failed_rows,
                    uploaded_by,status,upload_group_id,accountable_focal_id
                 ) VALUES($1,$2,$3,$4,$5,$5,0,$6,'Awaiting Focal Review',$7,$8) RETURNING *`,
                [entry.subject.division,entry.parsed.file_name,entry.parsed.sheet_name,entry.parsed.template_type,
                    entry.rows.length,req.user.id,groupId,entry.subject.id]
            )).rows[0];
            batches.push({...batch,focal_name:entry.subject.full_name,focal_email:entry.subject.email});
            const entrySource = ['Risk Register Tracking Template','Legal Legacy Risk Register','Division Risk Register Tracker'].includes(entry.parsed.template_type)
                ? entry.parsed.template_type : 'Imported Workbook';
            for (const row of entry.rows) {
                const risk = await insertImportedRisk(
                    client,row.risk,req,row.excel_row,entry.parsed.file_name,entrySource,batch.id,
                    row.user_confirmation || null,{forceFocalReview:true,accountableFocalId:entry.subject.id}
                );
                stagedRisks.push(risk);
            }
        }
        await client.query('COMMIT');

        for (const batch of batches) {
            try {
                await createNotification({actor:req.user,req,userId:batch.accountable_focal_id,
                    title:'Division Risk Register Awaiting Your Review',
                    message:`The Administrator staged ${batch.imported_rows} risks for ${batch.division}. Review, correct and submit the full register to your Risk Champion.`,
                    type:'Risk',category:'Risk Governance',priority:'High',entityType:'Risk Register Import',entityId:batch.id,
                    createdBy:req.user.id,systemGenerated:true});
                await createAction({actionKey:`focal-register-review:${batch.id}:${batch.accountable_focal_id}`,module:'Risk',
                    actionType:'Review Division Risk Register',title:`Review ${batch.division} risk register`,
                    description:`Review and submit all ${batch.imported_rows} staged risks.`,priority:'High',status:'Pending',
                    assignedTo:batch.accountable_focal_id,assignedRole:'Risk Focal Person',division:batch.division,assignedBy:req.user.id,
                    dueAt:new Date(Date.now()+3*86400000),sourceType:'RiskRegisterFocalReview',sourceId:batch.id,
                    actionUrl:'pages/focal-risk-admissions.html',availableActions:['review','submit','view']},{req});
            } catch (sideEffectError) {
                console.error('Admin risk group saved, but Focal notification failed:',sideEffectError.message);
            }
        }
        await logAudit({req,action:'ADMIN_DIVISION_RISK_GROUP_STAGED',entityType:'Risk Register Import Group',entityId:groupId,
            details:{division_count:batches.length,total_risks:stagedRisks.length,batch_ids:batches.map(batch => batch.id)}});
        res.status(201).json({success:true,message:`${stagedRisks.length} risks across ${batches.length} division register${batches.length===1?'':'s'} were sent for Focal review.`,group_id:groupId,batches});
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Admin division risk upload failed:',error.message);
        res.status(error.statusCode || 500).json({success:false,message:error.statusCode?error.message:'Unable to stage the division workbooks.',validation_errors:error.validationErrors || []});
    } finally {
        client.release();
    }
};

exports.getFocalAdmissionBatches = async (req, res) => {
    try {
        const params = [];
        const where = req.user.role === 'System Administrator'
            ? ''
            : (params.push(req.user.id),'WHERE batch.accountable_focal_id=$1');
        const batches = (await pool.query(
            `SELECT batch.*,u.full_name AS focal_name,u.email AS focal_email,admin.full_name AS uploaded_by_name,
                    COALESCE(json_agg(json_build_object(
                        'id',risk.id,'risk_id',risk.risk_id,'risk_title',risk.risk_title,'risk_description',risk.risk_description,
                        'risk_category',risk.risk_category,'likelihood',risk.likelihood,'impact',risk.impact,
                        'system_likelihood',gov.system_likelihood,'system_impact',gov.system_impact,'system_score',gov.system_score,
                        'focal_likelihood',gov.focal_likelihood,'focal_impact',gov.focal_impact,'focal_reason',gov.focal_reason,
                        'review_stage',gov.review_stage,'updated_at',risk.updated_at
                    ) ORDER BY risk.id) FILTER(WHERE risk.id IS NOT NULL),'[]') AS risks
             FROM risk_register_import_batches batch
             LEFT JOIN users u ON u.id=batch.accountable_focal_id
             LEFT JOIN users admin ON admin.id=batch.uploaded_by
             LEFT JOIN risks risk ON risk.import_batch_id=batch.id
             LEFT JOIN risk_assessment_governance gov ON gov.risk_id=risk.id
             ${where}
             GROUP BY batch.id,u.full_name,u.email,admin.full_name
             ORDER BY batch.created_at DESC`,params
        )).rows;
        res.json({success:true,batches});
    } catch (error) {
        console.error(error);
        res.status(500).json({success:false,message:'Unable to load Focal admission registers.'});
    }
};

exports.submitFocalAdmissionBatch = async (req, res) => {
    const client = await pool.connect();
    const submitted = [];
    try {
        await client.query('BEGIN');
        const batch = (await client.query('SELECT * FROM risk_register_import_batches WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
        if (!batch) { await client.query('ROLLBACK'); return res.status(404).json({success:false,message:'Division risk register not found.'}); }
        if (Number(batch.accountable_focal_id) !== Number(req.user.id)) { await client.query('ROLLBACK'); return res.status(403).json({success:false,message:'Only the assigned Focal Person may submit this division register.'}); }
        if (!['Awaiting Focal Review','Returned'].includes(batch.status)) { await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'This register is no longer awaiting Focal review.'}); }
        const risks = (await client.query(
            `SELECT risk.*,gov.system_score,gov.review_stage FROM risks risk
             JOIN risk_assessment_governance gov ON gov.risk_id=risk.id
             WHERE risk.import_batch_id=$1 ORDER BY risk.id FOR UPDATE OF risk,gov`,[batch.id]
        )).rows;
        const decisions = new Map((Array.isArray(req.body?.assessments)?req.body.assessments:[]).map(item => [Number(item.risk_id),item]));
        if (!risks.length || decisions.size !== risks.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({success:false,message:'Review and confirm an assessment for every risk in this register.'});
        }
        for (const risk of risks) {
            const decision = decisions.get(Number(risk.id));
            const likelihood = numberOrNull(decision?.likelihood);
            const impact = numberOrNull(decision?.impact);
            if (![likelihood,impact].every(value => Number.isInteger(value) && value>=1 && value<=5)) throw Object.assign(new Error(`Select valid likelihood and impact values for ${risk.risk_id}.`),{statusCode:400});
            const score = likelihood*impact;
            const reason = optionalString(decision.reason);
            if (score !== Number(risk.system_score) && !reason) throw Object.assign(new Error(`Explain the assessment change for ${risk.risk_id}.`),{statusCode:400});
            const level = calculateRiskLevel(score);
            const response = responseFor(impact,likelihood,risk.risk_category);
            await client.query(
                `UPDATE risk_assessment_governance SET focal_likelihood=$1,focal_impact=$2,focal_score=$3,
                    focal_reason=$4,focal_by=$5,focal_at=NOW(),focal_assessment_status='Confirmed',
                    review_stage='Awaiting Champion Review',updated_at=NOW()
                 WHERE risk_id=$6`,[likelihood,impact,score,reason || 'Focal Person accepted the system assessment.',req.user.id,risk.id]
            );
            await client.query(
                `UPDATE risks SET likelihood=$1,impact=$2,inherent_risk_score=$3,risk_level=$4,risk_treatment=$5,
                    workflow_status='Submitted',status='Submitted',admission_status='Pending Champion Approval',
                    submitted_at=COALESCE(submitted_at,NOW()),updated_at=NOW() WHERE id=$6`,
                [likelihood,impact,score,level,response,risk.id]
            );
            await addRiskHistory(client,risk.id,'Focal Register Submitted',req.user.id,{fromStatus:risk.review_stage,toStatus:'Awaiting Champion Review',comment:reason,details:{import_batch_id:batch.id,score}});
            submitted.push({...risk,likelihood,impact,inherent_risk_score:score,risk_level:level,risk_treatment:response});
        }
        await client.query(`UPDATE risk_register_import_batches SET status='Champion Review',focal_submitted_by=$1,focal_submitted_at=NOW(),updated_at=NOW() WHERE id=$2`,[req.user.id,batch.id]);
        if (batch.upload_group_id) {
            await client.query(
                `UPDATE risk_register_admin_upload_groups group_row SET status=CASE
                    WHEN NOT EXISTS(SELECT 1 FROM risk_register_import_batches b WHERE b.upload_group_id=group_row.id AND b.status IN('Awaiting Focal Review','Returned')) THEN 'Submitted to Champion'
                    ELSE 'Partially Submitted' END,updated_at=NOW() WHERE id=$1`,[batch.upload_group_id]
            );
        }
        await client.query('COMMIT');
        await completeBySource('RiskRegisterFocalReview',batch.id,{actor:req.user,req,comments:'The complete division register was submitted to the Risk Champion.'}).catch(()=>{});
        for (const risk of submitted) await notifyRiskSubmitted(req,risk).catch(error => console.error('Champion notification failed:',error.message));
        await logAudit({req,action:'FOCAL_DIVISION_REGISTER_SUBMITTED',entityType:'Risk Register Import',entityId:batch.id,details:{risk_count:submitted.length,division:batch.division}});
        res.json({success:true,message:`All ${submitted.length} risks were submitted to the ${batch.division} Risk Champion.`});
    } catch (error) {
        await client.query('ROLLBACK').catch(()=>{});
        console.error(error);
        res.status(error.statusCode || 500).json({success:false,message:error.statusCode?error.message:'Unable to submit the division risk register.'});
    } finally { client.release(); }
};

exports.getAdminFocalSubmissions = async (req,res) => {
    try {
        const batches = (await pool.query(
            `SELECT batch.id,batch.upload_group_id,batch.division,batch.file_name,batch.template_type,batch.status,
                    batch.total_rows,batch.imported_rows,batch.created_at,batch.focal_submitted_at,
                    focal.full_name AS focal_name,focal.email AS focal_email,admin.full_name AS uploaded_by_name,
                    COUNT(risk.id)::int AS risk_count,
                    COUNT(risk.id) FILTER(WHERE gov.review_stage='Awaiting Focal Review')::int AS awaiting_focal,
                    COUNT(risk.id) FILTER(WHERE gov.review_stage='Awaiting Champion Review')::int AS awaiting_champion,
                    COUNT(risk.id) FILTER(WHERE gov.review_stage='Awaiting Chairman Review')::int AS awaiting_chairman,
                    COUNT(risk.id) FILTER(WHERE gov.review_stage='Finalised')::int AS finalised
             FROM risk_register_import_batches batch
             LEFT JOIN users focal ON focal.id=batch.accountable_focal_id
             LEFT JOIN users admin ON admin.id=batch.uploaded_by
             LEFT JOIN risks risk ON risk.import_batch_id=batch.id
             LEFT JOIN risk_assessment_governance gov ON gov.risk_id=risk.id
             WHERE batch.accountable_focal_id IS NOT NULL
             GROUP BY batch.id,focal.full_name,focal.email,admin.full_name
             ORDER BY batch.created_at DESC`
        )).rows;
        const summary = {total:batches.length,awaiting_focal:batches.filter(b=>b.status==='Awaiting Focal Review'||b.status==='Returned').length,submitted:batches.filter(b=>!['Awaiting Focal Review','Returned'].includes(b.status)).length,risks:batches.reduce((n,b)=>n+b.risk_count,0)};
        res.json({success:true,summary,batches});
    } catch (error) { console.error(error); res.status(500).json({success:false,message:'Unable to load division Focal submissions.'}); }
};

exports.getImportBatches = async (req, res) => {
    try {
        const conditions = [];
        const params = [];
        if (req.user.role === 'Risk Champion') {
            params.push(req.user.division || req.user.directorate);
            conditions.push(`batch.division=$${params.length}`);
        } else if (req.user.role === 'Risk Focal Person') {
            params.push(req.user.id);
            conditions.push(`batch.uploaded_by=$${params.length}`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await pool.query(
            `SELECT batch.*,
                    COALESCE(counts.risk_count,0)::int AS risk_count,
                    COALESCE(counts.champion_reviewed_count,0)::int AS champion_reviewed_count,
                    COALESCE(counts.pending_champion_count,0)::int AS pending_champion_count
             FROM risk_register_import_batches batch
             LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS risk_count,
                       COUNT(*) FILTER(WHERE governance.champion_decision IS NOT NULL)::int AS champion_reviewed_count,
                       COUNT(*) FILTER(WHERE governance.review_stage='Awaiting Champion Review')::int AS pending_champion_count
                FROM risks risk
                LEFT JOIN risk_assessment_governance governance ON governance.risk_id=risk.id
                WHERE risk.import_batch_id=batch.id
             ) counts ON TRUE
             ${where}
             ORDER BY batch.created_at DESC`,
            params
        );
        const batches = result.rows.map(batch => ({
            ...batch,
            can_batch_approve: canApproveImportBatch(batch, req.user)
        }));
        res.json({success:true,batches});
    } catch (error) {
        console.error(error);
        res.status(500).json({success:false,message:'Unable to load risk-register import batches.'});
    }
};

exports.approveImportBatch = async (req, res) => {
    const client = await pool.connect();
    const approved = [];
    try {
        const comments = optionalString(req.body.comments);
        await client.query('BEGIN');
        const batch = (await client.query(
            'SELECT * FROM risk_register_import_batches WHERE id=$1 FOR UPDATE',
            [req.params.id]
        )).rows[0];
        if (!batch) {
            await client.query('ROLLBACK');
            return res.status(404).json({success:false,message:'Risk-register import batch not found.'});
        }
        if (req.user.role !== 'System Administrator'
            && (req.user.division || req.user.directorate) !== batch.division) {
            await client.query('ROLLBACK');
            return res.status(403).json({success:false,message:'Only the assigned Division Risk Champion may approve this imported register.'});
        }
        if (batch.status !== 'Champion Review') {
            await client.query('ROLLBACK');
            return res.status(409).json({success:false,message:'This imported register is no longer awaiting Champion approval.'});
        }
        const risks = (await client.query(
            `SELECT risk.*,governance.id AS governance_id,governance.review_stage,
                    governance.champion_decision,governance.champion_score
             FROM risks risk
             JOIN risk_assessment_governance governance ON governance.risk_id=risk.id
             WHERE risk.import_batch_id=$1
             ORDER BY risk.id
             FOR UPDATE OF risk,governance`,
            [batch.id]
        )).rows;
        if (!risks.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({success:false,message:'This imported register contains no risks available for approval.'});
        }
        const incomplete = risks.filter(risk => !isChampionReviewComplete(risk));
        if (incomplete.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success:false,
                message:`Review all ${incomplete.length} remaining risk${incomplete.length === 1 ? '' : 's'} before approving this register.`,
                incomplete:incomplete.map(risk => ({id:risk.id,risk_id:risk.risk_id,risk_title:risk.risk_title}))
            });
        }
        for (const risk of risks) {
            await client.query(
                `UPDATE risk_assessment_governance
                 SET review_stage='Awaiting Chairman Review',updated_at=NOW()
                 WHERE risk_id=$1`,
                [risk.id]
            );
            await client.query(
                `UPDATE risks
                 SET workflow_status='Under Review',status='Under Review',
                     admission_status='Pending Chairman Approval',reviewed_at=NOW(),
                     reviewed_by=$1,review_comments=$2,updated_at=NOW()
                 WHERE id=$3`,
                [req.user.id,comments,risk.id]
            );
            const workflow = (await client.query(
                `SELECT instance.id AS instance_id,instance.status AS instance_status,
                        stage.id AS stage_id,stage.status AS stage_status
                 FROM workflow_instances instance
                 JOIN workflow_stage_instances stage
                   ON stage.workflow_instance_id=instance.id
                  AND stage.stage_order=instance.current_stage_order
                 WHERE instance.subject_type='Risk' AND instance.subject_id=$1
                   AND instance.status IN('Pending','Under Review','Escalated')
                 ORDER BY instance.created_at DESC LIMIT 1
                 FOR UPDATE OF instance,stage`,
                [String(risk.id)]
            )).rows[0];
            if (workflow) {
                await client.query(
                    `UPDATE workflow_stage_instances SET status='Approved',completed_at=NOW() WHERE id=$1`,
                    [workflow.stage_id]
                );
                await client.query(
                    `UPDATE workflow_instances SET status='Completed',completed_at=NOW(),updated_at=NOW() WHERE id=$1`,
                    [workflow.instance_id]
                );
                await client.query(
                    `INSERT INTO workflow_actions(
                        workflow_instance_id,stage_instance_id,action,from_status,to_status,comments,performed_by
                     ) VALUES($1,$2,'approve',$3,'Completed',$4,$5)`,
                    [workflow.instance_id,workflow.stage_id,workflow.instance_status,comments,req.user.id]
                );
            }
            await addRiskHistory(client,risk.id,'Champion Batch Approved',req.user.id,{
                fromStatus:'Awaiting Champion Review',
                toStatus:'Awaiting Chairman Review',
                comment:comments,
                details:{import_batch_id:batch.id,batch_approval:true,batch_size:risks.length}
            });
            approved.push(risk);
        }
        await client.query(
            `UPDATE risk_register_import_batches
             SET status='Awaiting Chairman',champion_reviewed_by=$1,
                 champion_reviewed_at=NOW(),champion_comments=$2,updated_at=NOW()
             WHERE id=$3`,
            [req.user.id,comments,batch.id]
        );
        await client.query('COMMIT');

        try {
            for (const risk of approved) {
                await Promise.allSettled([
                    completeBySource('ConsolidatedRiskAssessment',risk.id,{
                        actor:req.user,req,comments:'Approved with the imported risk-register batch.'
                    }),
                    completeBySource('RiskReview',risk.id,{
                        actor:req.user,req,comments:'Approved with the imported risk-register batch.'
                    })
                ]);
            }
            const chairmen = (await pool.query(
                `SELECT id FROM users WHERE role='Risk Committee Chairman' AND status='Active'`
            )).rows;
            const highCount = approved.filter(risk => risk.risk_level === 'High').length;
            for (const chairman of chairmen) {
                await createNotification({
                    actor:req.user,req,userId:chairman.id,
                    title:'Risk Register Batch Awaiting Final Review',
                    message:`All ${approved.length} risks from ${batch.file_name} require the Chairman’s final review.`,
                    type:'Risk',category:'Risk Governance',priority:highCount ? 'High' : 'Normal',
                    entityType:'Risk Register Import',entityId:batch.id,createdBy:req.user.id,systemGenerated:true
                });
                await createAction({
                    actionKey:`risk-register-chairman-batch:${batch.id}:${chairman.id}`,
                    module:'Risk',actionType:'Executive Batch Review',
                    title:`Review ${approved.length} imported risks`,
                    description:`Final review is required for the ${batch.division} register: ${batch.file_name}.`,
                    priority:highCount ? 'High' : 'Medium',status:'Escalated',
                    assignedTo:chairman.id,assignedRole:'Risk Committee Chairman',assignedBy:req.user.id,
                    sourceType:'RiskRegisterImportBatch',sourceId:batch.id,
                    actionUrl:`pages/risks.html?import_batch_id=${batch.id}`,
                    availableActions:['review','approve','view'],
                    metadata:{importBatchId:batch.id,riskIds:approved.map(risk => risk.id)}
                },{req});
            }
        } catch (sideEffectError) {
            console.error('Imported register batch follow-up failed after commit:', sideEffectError.message);
        }
        await logAudit({
            req,action:'RISK_REGISTER_BATCH_APPROVED',entityType:'Risk Register Import',
            entityId:batch.id,details:{riskCount:approved.length,riskIds:approved.map(risk=>risk.risk_id),comments}
        });
        res.json({
            success:true,
            message:`All ${approved.length} imported risks were approved together and sent to the Chairman.`,
            approved:approved.length
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);
        res.status(error.statusCode || 500).json({
            success:false,
            message:error.statusCode ? error.message : 'Unable to approve the imported risk-register batch.'
        });
    } finally {
        client.release();
    }
};

exports.updateRisk = async (req, res) => {
    const client = await pool.connect();

    try {
        return res.status(409).json({
            success:false,
            message:'Existing risks can only be amended from the Consolidated Risk Register.'
        });
        const { id } = req.params;
        const existing = await getRiskById(id);

        if (!existing) return res.status(404).json({ success: false, message: 'Risk not found.' });
        if (!canModifyIdentification(req.user, existing)) {
            await logAudit({ req, action: 'RISK_UPDATE_DENIED', entityType: 'Risk', entityId: id, status: 'Denied' });
            return res.status(403).json({ success: false, message: 'You do not have permission to update this risk.' });
        }

        const risk = normalizeRiskInput(req.body, req.user);
        if (['Risk Focal Person','Risk Champion'].includes(req.user.role)) {
            risk.directorate = req.user.division || req.user.directorate;
            risk.business_unit = req.user.division || req.user.directorate;
            risk.risk_owner = req.user.full_name || existing.risk_owner;
        }
        if (!canViewRisk(req.user, risk)) {
            return res.status(403).json({ success: false, message: 'You can only update risks for your assigned division.' });
        }

        const errors = validateRiskInput(risk);
        if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

        const inherentRiskScore = risk.impact * risk.likelihood;
        const requestedSubmission = risk.workflow_status === 'Submitted';
        const championSubmission = req.user.role === 'Risk Champion' && requestedSubmission;
        const workflowStatus = championSubmission ? 'Under Review' : requestedSubmission ? 'Submitted' : 'Draft';
        const admissionStatus = championSubmission ? 'Pending Chairman Approval' : requestedSubmission ? 'Pending Champion Approval' : 'Draft';

        await client.query('BEGIN');
        const result = await client.query(
            `
            UPDATE risks
            SET risk_title = $1,
                risk_description = $2,
                risk_category = $3,
                directorate = $4,
                business_unit = $5,
                programme_project = $6,
                risk_owner = $7,
                date_identified = $8,
                likelihood = $9,
                impact = $10,
                inherent_risk_score = $11,
                risk_level = $12,
                existing_controls = $13,
                control_effectiveness = $14,
                risk_treatment = $15,
                initial_mitigation_plan = $16,
                responsible_officer = $17,
                target_completion_date = $18,
                status = $19::varchar,
                workflow_status = $20::varchar,
                submitted_at = CASE WHEN $20::varchar = 'Submitted' AND submitted_at IS NULL THEN CURRENT_TIMESTAMP ELSE submitted_at END,
                assessment_year = $21,
                focal_visibility = $22,
                admission_status = $23::varchar,
                admitted_by = CASE WHEN $23::varchar = 'Admitted' THEN $24::integer ELSE NULL::integer END,
                admitted_at = CASE WHEN $23::varchar = 'Admitted' THEN CURRENT_TIMESTAMP ELSE NULL END,
                control_type=$25,
                control_owner=$26,
                control_design_adequacy=$27,
                control_evidence=$28,
                control_last_tested_date=$29,
                control_exceptions=$30,
                control_next_review_date=$31,
                control_assessment_basis=$32,
                control_assessment_confidence=$33,
                control_assessed_by=$34,
                control_assessed_at=NOW(),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $35
            RETURNING *
            `,
            [
                risk.risk_title,
                risk.risk_description,
                risk.risk_category,
                risk.directorate,
                risk.business_unit,
                risk.programme_project,
                risk.risk_owner,
                risk.date_identified,
                risk.likelihood,
                risk.impact,
                inherentRiskScore,
                calculateRiskLevel(inherentRiskScore),
                risk.existing_controls,
                risk.control_effectiveness,
                risk.risk_treatment,
                risk.initial_mitigation_plan,
                risk.responsible_officer,
                risk.target_completion_date,
                workflowStatus,
                workflowStatus,
                risk.assessment_year,
                req.user.role === 'Risk Champion' ? risk.focal_visibility : existing.focal_visibility,
                admissionStatus,
                req.user.id,
                risk.control_type,
                risk.control_owner,
                risk.control_design_adequacy,
                risk.control_evidence,
                risk.control_last_tested_date,
                risk.control_exceptions,
                risk.control_next_review_date,
                risk.control_assessment_basis,
                risk.control_assessment_confidence,
                req.user.id,
                id
            ]
        );

        const system = assessRiskText(result.rows[0]);
        if (req.user.role === 'Risk Focal Person') {
            await client.query(
                `UPDATE risk_assessment_governance SET
                    system_likelihood=$1,system_impact=$2,system_score=$3,system_level=$4,system_response=$5,
                    system_explanation=$6,matched_keywords=$7,rules_version=$8,
                    focal_likelihood=$9,focal_impact=$10,focal_score=$11,
                    focal_reason=COALESCE(focal_reason,'Assessment submitted during manual risk creation.'),
                    focal_by=$12,focal_at=NOW(),review_stage=$13,updated_at=NOW()
                 WHERE risk_id=$14`,
                [system.likelihood,system.impact,system.score,system.level,system.response,system.explanation,JSON.stringify(system.matched_keywords),system.rules_version,
                    risk.likelihood,risk.impact,inherentRiskScore,req.user.id,requestedSubmission ? 'Awaiting Champion Review' : 'Awaiting Focal Review',id]
            );
        } else if (req.user.role === 'Risk Champion') {
            await client.query(
                `UPDATE risk_assessment_governance SET
                    champion_likelihood=$1,champion_impact=$2,champion_score=$3,champion_decision='Adjusted',
                    champion_reason='Assessment entered directly by the Risk Champion.',champion_by=$4,champion_at=NOW(),
                    review_stage=$5,updated_at=NOW() WHERE risk_id=$6`,
                [risk.likelihood,risk.impact,inherentRiskScore,req.user.id,requestedSubmission ? 'Awaiting Chairman Review' : 'Awaiting Focal Review',id]
            );
        }

        await addRiskHistory(client, id, workflowStatus === 'Submitted' ? 'Submitted' : 'Risk Updated', req.user.id, {
            fromStatus: existing.workflow_status,
            toStatus: workflowStatus,
            details: { risk_id: existing.risk_id }
        });
        await client.query('COMMIT');

        if (workflowStatus === 'Submitted' && existing.workflow_status !== 'Submitted') {
            await startWorkflow({ workflowKey:'risk_approval', subjectType:'Risk', subjectId:id, itemTitle:`${existing.risk_id} - ${risk.risk_title}`, requesterId:req.user.id, division:risk.directorate, priority:calculateRiskLevel(inherentRiskScore), metadata:{risk_id:existing.risk_id} });
            await notifyRiskSubmitted(req,result.rows[0]);
        }
        if (championSubmission) {
            const chairmen=(await pool.query(`SELECT id,email,role,directorate,division FROM users WHERE role='Risk Committee Chairman' AND status='Active'`)).rows;
            await notifyRiskUsers({req,users:chairmen,title:'Champion Risk Awaiting Final Review',message:`${existing.risk_id} - ${risk.risk_title} was submitted by the Risk Champion for the Chairman’s final decision.`,risk:result.rows[0]});
        }

        await logAudit({
            req,
            action: championSubmission ? 'RISK_SUBMITTED_BY_CHAMPION' : workflowStatus === 'Submitted' ? 'RISK_SUBMITTED' : 'RISK_UPDATED',
            entityType: 'Risk',
            entityId: id,
            details: { risk_id: existing.risk_id, workflow_status: workflowStatus }
        });

        res.json({ success: true, message: 'Risk updated successfully.', risk: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);
        res.status(500).json({ success: false, message: 'Unable to update risk.' });
    } finally {
        client.release();
    }
};

exports.reviewRisk = async (req, res) => {
    try {
        const { id } = req.params;
        const decision = optionalString(req.body.decision);
        const reviewComments = optionalString(req.body.review_comments);
        const decisionMap = { approve: 'Accepted', reject: 'Returned', return: 'Returned' };
        const reviewDecisionMap = { approve: 'Approved', reject: 'Rejected', return: 'Returned for Rework' };
        const workflowStatus = decisionMap[decision];

        if (!workflowStatus) return res.status(400).json({ success: false, message: 'Select a valid review decision.' });

        const risk = await getRiskById(id);
        if (!risk) return res.status(404).json({ success: false, message: 'Risk not found.' });
        const consolidatedAssessment = (await pool.query(
            'SELECT review_stage FROM risk_assessment_governance WHERE risk_id=$1',
            [id]
        )).rows[0];
        if (consolidatedAssessment && consolidatedAssessment.review_stage !== 'Finalised') {
            return res.status(409).json({
                success:false,
                message:'Assessment decisions must be recorded from the Consolidated Risk Register.'
            });
        }
        if (!canReviewRisk(req.user, risk)) {
            await logAudit({ req, action: 'RISK_REVIEW_DENIED', entityType: 'Risk', entityId: id, status: 'Denied' });
            return res.status(403).json({ success: false, message: 'You do not have permission to review this risk.' });
        }
        if (!['Submitted','Under Review'].includes(risk.workflow_status)) {
            return res.status(400).json({ success: false, message: 'Only submitted risks under review can be actioned.' });
        }
        if (decision === 'approve' && risk.source_workplan_action_id) {
            return res.status(409).json({ success:false, message:'Uploaded work-plan risks must be approved together from the Work Plans page and sent to the Chairman as one batch.' });
        }

        let approvalAlreadyRecorded=false;
        let workflow=(await pool.query(`SELECT id,status FROM workflow_instances WHERE subject_type='Risk' AND subject_id=$1 AND status IN('Pending','Under Review','Escalated') ORDER BY created_at DESC LIMIT 1`,[String(id)])).rows[0];
        if(!workflow){
            const latest=(await pool.query(`SELECT wi.id,wi.status,(SELECT wa.action FROM workflow_actions wa WHERE wa.workflow_instance_id=wi.id ORDER BY wa.created_at DESC,wa.id DESC LIMIT 1) last_action FROM workflow_instances wi WHERE wi.subject_type='Risk' AND wi.subject_id=$1 ORDER BY wi.created_at DESC LIMIT 1`,[String(id)])).rows[0];
            if(latest&&latest.last_action===decision&&['Completed','Rejected','Returned'].includes(latest.status)){workflow=latest;approvalAlreadyRecorded=true}
            else workflow=await startWorkflow({workflowKey:'risk_approval',subjectType:'Risk',subjectId:id,itemTitle:`${risk.risk_id} - ${risk.risk_title}`,requesterId:risk.created_by,division:risk.division||risk.directorate,priority:risk.risk_level,metadata:{risk_id:risk.risk_id}});
        }
        if(!approvalAlreadyRecorded)await performApprovalAction({instanceId:workflow.id,action:decision,comments:reviewComments,req});
        const reviewClient=await pool.connect();
        let result;
        try {
            await reviewClient.query('BEGIN');
            result = await reviewClient.query(
                `UPDATE risks SET workflow_status=$1::varchar,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=$2::integer,review_comments=$3,status=CASE WHEN $1::varchar='Accepted' THEN 'Accepted' ELSE 'Returned' END,
                 admission_status=CASE WHEN $1::varchar='Accepted' THEN 'Admitted' WHEN $5::varchar='reject' THEN 'Rejected' ELSE 'Returned' END,
                 admitted_by=CASE WHEN $1::varchar='Accepted' THEN $2::integer ELSE NULL END,admitted_at=CASE WHEN $1::varchar='Accepted' THEN CURRENT_TIMESTAMP ELSE NULL END,
                 updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`,
                [workflowStatus, req.user.id, reviewComments, id, decision]
            );
            await reviewClient.query('INSERT INTO risk_reviews (risk_id,decision,review_comment,reviewed_by) VALUES ($1,$2,$3,$4)',[id,reviewDecisionMap[decision],reviewComments,req.user.id]);
            if(risk.workflow_status==='Submitted')await addRiskHistory(reviewClient,id,'Under Review',req.user.id,{fromStatus:'Submitted',toStatus:'Under Review',comment:reviewComments,details:{risk_id:risk.risk_id}});
            await addRiskHistory(reviewClient,id,workflowStatus,req.user.id,{fromStatus:'Under Review',toStatus:workflowStatus,comment:reviewComments,details:{risk_id:risk.risk_id}});
            await reviewClient.query('COMMIT');
        } catch (reviewError) {
            await reviewClient.query('ROLLBACK').catch(()=>{});
            throw reviewError;
        } finally { reviewClient.release(); }

        try {
        await logAudit({
            req,
            action: `RISK_${workflowStatus.toUpperCase().replaceAll(' ', '_')}`,
            entityType: 'Risk',
            entityId: id,
            details: { risk_id: risk.risk_id, review_comments: reviewComments }
        });
        await completeBySource('RiskReview',risk.id,{actor:req.user,req,comments:`Risk ${workflowStatus}.`});

        const requester=(await pool.query('SELECT id,email,role,directorate,division FROM users WHERE id=$1',[risk.created_by])).rows;
        await notifyRiskUsers({req,users:requester,title:`Risk ${workflowStatus}`,message:`${risk.risk_id} - ${risk.risk_title} was ${workflowStatus.toLowerCase()} by the Risk Champion.`,risk:result.rows[0]});
        if(workflowStatus==='Accepted'&&risk.risk_level==='High'){
            const chairmen=(await pool.query(`SELECT id,email,role,directorate,division FROM users WHERE role='Risk Committee Chairman' AND status='Active'`)).rows;
            await notifyRiskUsers({req,users:chairmen,title:'High Risk Escalation',message:`${risk.risk_id} - ${risk.risk_title} was accepted and requires committee visibility.`,risk:result.rows[0]});
            for(const chairman of chairmen)await createAction({actionKey:`committee-review:${risk.id}:${chairman.id}`,module:'Risk',actionType:'Executive Review',title:`Committee review: ${risk.risk_id}`,description:risk.risk_title,priority:risk.risk_level,status:'Escalated',assignedTo:chairman.id,assignedRole:'Risk Committee Chairman',assignedBy:req.user.id,sourceType:'CommitteeReview',sourceId:risk.id,actionUrl:'pages/pending-approvals.html',availableActions:['review','approve','return','view'],metadata:{riskId:risk.risk_id}},{req});
        }
        if(workflowStatus==='Returned'&&requester[0])await createAction({actionKey:`risk-correction:${risk.id}:${requester[0].id}:${Date.now()}`,module:'Risk',actionType:'Update Risk',title:`Correct and resubmit ${risk.risk_id}`,description:reviewComments||risk.risk_title,priority:risk.risk_level==='High'?'High':'Medium',status:'Returned',assignedTo:requester[0].id,assignedBy:req.user.id,division:risk.division||risk.directorate,sourceType:'RiskCorrection',sourceId:risk.id,actionUrl:`pages/create-risk.html?id=${risk.id}`,availableActions:['update','continue','view']},{req});
        } catch (sideEffectError) {
            console.error('Risk review saved, but a follow-up notification or action failed:',sideEffectError);
        }

        res.json({ success: true, message: `Risk ${workflowStatus.toLowerCase()} successfully.`, risk: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode||500).json({ success: false, message: error.statusCode?error.message:'Unable to review risk.' });
    }
};

function selectedAssessment(governance, selection, likelihood, impact, category) {
    const sources = {
        System: [governance.system_likelihood, governance.system_impact],
        Focal: [governance.focal_likelihood, governance.focal_impact],
        Champion: [governance.champion_likelihood, governance.champion_impact],
        Adjusted: [numberOrNull(likelihood), numberOrNull(impact)]
    };
    const values = sources[selection];
    if (!values || !values.every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5)) return null;
    const selectedLikelihood = Number(values[0]);
    const selectedImpact = Number(values[1]);
    const score = selectedLikelihood * selectedImpact;
    return {
        likelihood: selectedLikelihood,
        impact: selectedImpact,
        score,
        level: calculateRiskLevel(score),
        response: responseFor(selectedImpact, selectedLikelihood, category)
    };
}

async function createApprovedTreatmentPlan(client, risk, userId) {
    const existing = await client.query('SELECT id,approval_status FROM treatment_plans WHERE risk_id=$1 LIMIT 1', [risk.id]);
    if (existing.rowCount) {
        return (await client.query(
            `UPDATE treatment_plans
             SET lifecycle_status=CASE
                    WHEN status='Completed' THEN 'Completed'
                    WHEN approval_status='Approved' THEN 'Active Monitoring'
                    ELSE 'Pending Risk Approval'
                 END,
                 updated_at=NOW()
             WHERE id=$1 RETURNING *`,
            [existing.rows[0].id]
        )).rows[0];
    }
    const proposal = generateTreatmentProposal(risk);
    const result = await client.query(
        `INSERT INTO treatment_plans(
            risk_id,plan_title,treatment_strategy,action_owner,due_date,progress_percent,status,
            evidence_notes,created_by,source_workplan_action_id,plan_origin,lifecycle_status,
            system_proposed_strategy,uploaded_plan,system_improvements,treatment_objective,
            treatment_actions,evidence_required,monitoring_frequency,review_date,
            target_residual_likelihood,target_residual_impact,target_residual_score
        ) VALUES(
            $1,$2,$3,$4,$5,0,'Not Started',$6,$7,$8,$9,'Pending Risk Approval',
            $3,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
        ) RETURNING *`,
        [
            risk.id,
            `Treatment for ${risk.risk_title}`.slice(0, 200),
            proposal.strategy,
            proposal.owner,
            proposal.due_date,
            proposal.evidence_required,
            userId,
            risk.source_workplan_action_id,
            risk.entry_source || 'Manual',
            proposal.original_plan,
            proposal.system_improvements,
            proposal.objective,
            proposal.actions,
            proposal.evidence_required,
            proposal.monitoring_frequency,
            proposal.review_date,
            proposal.target_residual_likelihood,
            proposal.target_residual_impact,
            proposal.target_residual_score
        ]
    );
    return result.rows[0];
}

exports.recordAssessmentDecision = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const risk = (await client.query('SELECT * FROM risks WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
        if (!risk) {
            await client.query('ROLLBACK');
            return res.status(404).json({success:false,message:'Risk not found.'});
        }
        if (!canAccessDirectorate(req.user, risk.division || risk.directorate)) {
            await client.query('ROLLBACK');
            return res.status(403).json({success:false,message:'This risk is outside your permitted scope.'});
        }
        if (req.user.role === 'Risk Focal Person' && risk.accountable_focal_id
            && Number(risk.accountable_focal_id) !== Number(req.user.id)) {
            await client.query('ROLLBACK');
            return res.status(403).json({success:false,message:'This staged register is assigned to another Focal Person.'});
        }
        const governance = (await client.query('SELECT * FROM risk_assessment_governance WHERE risk_id=$1 FOR UPDATE', [risk.id])).rows[0];
        if (!governance) {
            await client.query('ROLLBACK');
            return res.status(409).json({success:false,message:'The consolidated assessment record is unavailable for this risk.'});
        }

        const role = req.user.role === 'System Administrator'
            ? optionalString(req.body.review_role)
            : req.user.role;
        const selection = optionalString(req.body.selection);
        const reason = optionalString(req.body.reason);
        let assessment;
        let nextStage;
        let action;
        let batchDraft = false;
        let finalizedImportBatchId = null;

        if (role === 'Risk Focal Person') {
            if (!['Awaiting Focal Review','Returned'].includes(governance.review_stage)) {
                await client.query('ROLLBACK');
                return res.status(409).json({success:false,message:'This risk is not awaiting a Focal Person assessment.'});
            }
            assessment = selectedAssessment(governance, selection || 'Adjusted', req.body.likelihood, req.body.impact, risk.risk_category);
            if (!assessment) {
                await client.query('ROLLBACK');
                return res.status(400).json({success:false,message:'Select valid Focal Person likelihood and impact values.'});
            }
            if (assessment.score !== governance.system_score && !reason) {
                await client.query('ROLLBACK');
                return res.status(400).json({success:false,message:'Explain why the Focal Person assessment differs from the system assessment.'});
            }
            await client.query(
                `UPDATE risk_assessment_governance SET
                    focal_likelihood=$1,focal_impact=$2,focal_score=$3,focal_reason=$4,focal_by=$5,focal_at=NOW(),
                    focal_assessment_status='Confirmed',
                    champion_likelihood=NULL,champion_impact=NULL,champion_score=NULL,champion_decision=NULL,champion_reason=NULL,champion_by=NULL,champion_at=NULL,
                    chairman_likelihood=NULL,chairman_impact=NULL,chairman_score=NULL,chairman_decision=NULL,chairman_reason=NULL,chairman_by=NULL,chairman_at=NULL,
                    review_stage='Awaiting Champion Review',updated_at=NOW()
                 WHERE risk_id=$6`,
                [assessment.likelihood,assessment.impact,assessment.score,reason || 'Focal Person accepted the system assessment.',req.user.id,risk.id]
            );
            if (optionalString(req.body.risk_category) && ALLOWED_CATEGORIES.includes(req.body.risk_category)) {
                await client.query('UPDATE risks SET risk_category=$1 WHERE id=$2', [req.body.risk_category, risk.id]);
            }
            await client.query(
                `UPDATE risks SET likelihood=$1,impact=$2,inherent_risk_score=$3,risk_level=$4,risk_treatment=$5,
                 workflow_status='Submitted',status='Submitted',admission_status='Pending Champion Approval',
                 submitted_at=COALESCE(submitted_at,NOW()),updated_at=NOW() WHERE id=$6`,
                [assessment.likelihood,assessment.impact,assessment.score,assessment.level,assessment.response,risk.id]
            );
            nextStage = 'Awaiting Champion Review';
            action = 'Focal Assessment Submitted';
        } else if (role === 'Risk Champion') {
            if (governance.review_stage !== 'Awaiting Champion Review') {
                await client.query('ROLLBACK');
                return res.status(409).json({success:false,message:'This risk is not awaiting Risk Champion review.'});
            }
            if (!['System','Focal','Adjusted'].includes(selection)) {
                await client.query('ROLLBACK');
                return res.status(400).json({success:false,message:'Select the System, Focal Person, or an adjusted Champion assessment.'});
            }
            assessment = selectedAssessment(governance, selection, req.body.likelihood, req.body.impact, risk.risk_category);
            if (!assessment) {
                await client.query('ROLLBACK');
                return res.status(400).json({success:false,message:'The selected Champion assessment is incomplete.'});
            }
            batchDraft = Boolean(risk.import_batch_id);
            await client.query(
                `UPDATE risk_assessment_governance SET
                    champion_likelihood=$1,champion_impact=$2,champion_score=$3,champion_decision=$4,champion_reason=$5,champion_by=$6,champion_at=NOW(),
                    chairman_likelihood=NULL,chairman_impact=NULL,chairman_score=NULL,chairman_decision=NULL,chairman_reason=NULL,chairman_by=NULL,chairman_at=NULL,
                    review_stage=$7,updated_at=NOW()
                 WHERE risk_id=$8`,
                [assessment.likelihood,assessment.impact,assessment.score,selection,reason || null,req.user.id,
                    batchDraft ? 'Awaiting Champion Review' : 'Awaiting Chairman Review',risk.id]
            );
            await client.query(
                `UPDATE risks SET likelihood=$1,impact=$2,inherent_risk_score=$3,risk_level=$4,risk_treatment=$5,
                 workflow_status='Under Review',status='Under Review',admission_status=$6,
                 reviewed_at=NOW(),reviewed_by=$7,review_comments=$8,updated_at=NOW() WHERE id=$9`,
                [assessment.likelihood,assessment.impact,assessment.score,assessment.level,assessment.response,
                    batchDraft ? 'Pending Champion Approval' : 'Pending Chairman Approval',
                    req.user.id,reason || null,risk.id]
            );
            nextStage = batchDraft ? 'Awaiting Champion Review' : 'Awaiting Chairman Review';
            action = batchDraft ? 'Champion Batch Assessment Saved' : 'Champion Assessment Recorded';
        } else if (role === 'Risk Committee Chairman') {
            if (governance.review_stage !== 'Awaiting Chairman Review') {
                await client.query('ROLLBACK');
                return res.status(409).json({success:false,message:'This risk is not awaiting the Chairman’s final assessment.'});
            }
            if (!['System','Champion','Adjusted'].includes(selection)) {
                await client.query('ROLLBACK');
                return res.status(400).json({success:false,message:'Select the System or Champion assessment, or record an adjusted final assessment.'});
            }
            assessment = selectedAssessment(governance, selection, req.body.likelihood, req.body.impact, risk.risk_category);
            if (!assessment) {
                await client.query('ROLLBACK');
                return res.status(400).json({success:false,message:'The selected final assessment is incomplete.'});
            }
            if (selection === 'Adjusted' && !reason) {
                await client.query('ROLLBACK');
                return res.status(400).json({success:false,message:'Explain the Chairman’s final adjustment.'});
            }
            await client.query(
                `UPDATE risk_assessment_governance SET
                    chairman_likelihood=$1,chairman_impact=$2,chairman_score=$3,chairman_decision=$4,chairman_reason=$5,chairman_by=$6,chairman_at=NOW(),
                    review_stage='Finalised',updated_at=NOW()
                 WHERE risk_id=$7`,
                [assessment.likelihood,assessment.impact,assessment.score,selection,reason || `Chairman accepted the ${selection} assessment as final.`,req.user.id,risk.id]
            );
            const finalRisk = (await client.query(
                `UPDATE risks SET likelihood=$1,impact=$2,inherent_risk_score=$3,risk_level=$4,risk_treatment=$5,
                 workflow_status='Accepted',status='Accepted',admission_status='Admitted',
                 admitted_by=$6,admitted_at=NOW(),committee_reviewed_by=$6,committee_reviewed_at=NOW(),
                 executive_comments=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,
                [assessment.likelihood,assessment.impact,assessment.score,assessment.level,assessment.response,req.user.id,reason || `Accepted ${selection} assessment.`,risk.id]
            )).rows[0];
            await createApprovedTreatmentPlan(client, finalRisk, req.user.id);
            if (risk.import_batch_id) {
                const finalizedBatch = (await client.query(
                    `UPDATE risk_register_import_batches batch
                     SET status='Finalised',updated_at=NOW()
                     WHERE batch.id=$1
                       AND NOT EXISTS(
                           SELECT 1
                           FROM risks batch_risk
                           JOIN risk_assessment_governance batch_governance
                             ON batch_governance.risk_id=batch_risk.id
                           WHERE batch_risk.import_batch_id=batch.id
                             AND batch_governance.review_stage<>'Finalised'
                       )
                     RETURNING batch.id`,
                    [risk.import_batch_id]
                )).rows[0];
                finalizedImportBatchId = finalizedBatch?.id || null;
            }
            nextStage = 'Finalised';
            action = 'Chairman Final Assessment';
        } else {
            await client.query('ROLLBACK');
            return res.status(403).json({success:false,message:'Your role cannot record this assessment decision.'});
        }

        if (risk.source_workplan_action_id) {
            if (role === 'Risk Focal Person') {
                await client.query(
                    `UPDATE workplan_risk_assessments SET
                        focal_category=COALESCE($1,focal_category),
                        focal_likelihood=$2,focal_impact=$3,focal_score=$4,
                        focal_reason=$5,focal_by=$6,focal_at=NOW(),
                        updated_by=$6,updated_at=NOW(),edit_count=edit_count+1
                     WHERE generated_risk_id=$7 OR action_id=$8`,
                    [
                        optionalString(req.body.risk_category),assessment.likelihood,assessment.impact,
                        assessment.score,reason,req.user.id,risk.id,risk.source_workplan_action_id
                    ]
                );
            } else if (role === 'Risk Champion') {
                const focalDecision = governance.focal_score
                    ? (selection === 'Focal' ? 'Approved' : 'Rejected')
                    : null;
                await client.query(
                    `UPDATE workplan_risk_assessments SET
                        likelihood=$1,impact=$2,risk_score=$3,risk_level=$4,risk_response=$5,
                        champion_likelihood=$1,champion_impact=$2,champion_score=$3,
                        champion_level=$4,champion_response=$5,champion_reason=$6,
                        champion_focal_decision=$7,champion_decision_reason=$6,
                        champion_by=$8,champion_at=NOW(),updated_by=$8,updated_at=NOW(),
                        edit_count=edit_count+1
                     WHERE generated_risk_id=$9 OR action_id=$10`,
                    [
                        assessment.likelihood,assessment.impact,assessment.score,assessment.level,
                        assessment.response,reason,focalDecision,req.user.id,
                        risk.id,risk.source_workplan_action_id
                    ]
                );
            } else if (role === 'Risk Committee Chairman') {
                await client.query(
                    `UPDATE workplan_risk_assessments SET
                        likelihood=$1,impact=$2,risk_score=$3,risk_level=$4,risk_response=$5,
                        chairman_likelihood=$1,chairman_impact=$2,chairman_score=$3,
                        chairman_level=$4,chairman_response=$5,chairman_reason=$6,
                        chairman_by=$7,chairman_at=NOW(),updated_by=$7,updated_at=NOW(),
                        edit_count=edit_count+1
                     WHERE generated_risk_id=$8 OR action_id=$9`,
                    [
                        assessment.likelihood,assessment.impact,assessment.score,assessment.level,
                        assessment.response,reason,req.user.id,risk.id,risk.source_workplan_action_id
                    ]
                );
            }
        }

        await addRiskHistory(client,risk.id,action,req.user.id,{
            fromStatus:governance.review_stage,
            toStatus:nextStage,
            comment:reason,
            details:{selection,likelihood:assessment.likelihood,impact:assessment.impact,score:assessment.score,level:assessment.level}
        });
        await client.query('COMMIT');
        await logAudit({req,action:'CONSOLIDATED_ASSESSMENT_DECISION',entityType:'Risk',entityId:risk.id,details:{role,selection,score:assessment.score,next_stage:nextStage}});
        try {
            if (batchDraft) {
                return res.json({
                    success:true,
                    message:'Champion assessment saved. Complete the remaining risks, then use Approve All for this uploaded register.'
                });
            }
            if (finalizedImportBatchId) {
                await completeBySource('RiskRegisterImportBatch',finalizedImportBatchId,{
                    actor:req.user,req,comments:'All risks in the imported register received final Chairman review.'
                });
            }
            await completeBySource('ConsolidatedRiskAssessment',risk.id,{actor:req.user,req,comments:`Moved to ${nextStage}.`});
            if (nextStage === 'Awaiting Champion Review') {
                const champions = (await pool.query(
                    `SELECT id,email,role,directorate,division FROM users
                     WHERE role='Risk Champion' AND status='Active'
                       AND COALESCE(NULLIF(division,''),directorate)=$1`,
                    [risk.division || risk.directorate]
                )).rows;
                await notifyRiskUsers({req,users:champions,title:'Focal Assessment Awaiting Champion Review',message:`${risk.risk_id} - ${risk.risk_title} is ready in the Consolidated Risk Register.`,risk});
                for (const champion of champions) {
                    await createAction({actionKey:`consolidated-champion:${risk.id}:${champion.id}`,module:'Risk',actionType:'Champion Assessment Review',title:`Review ${risk.risk_id}`,description:risk.risk_title,priority:assessment.level,status:'Pending',assignedTo:champion.id,assignedBy:req.user.id,division:risk.division||risk.directorate,dueAt:new Date(Date.now()+3*86400000),sourceType:'ConsolidatedRiskAssessment',sourceId:risk.id,actionUrl:'pages/risks.html',availableActions:['review','approve','view']},{req});
                }
            }
            if (nextStage === 'Awaiting Chairman Review') {
                const chairmen = (await pool.query(`SELECT id,email,role,directorate,division FROM users WHERE role='Risk Committee Chairman' AND status='Active'`)).rows;
                await notifyRiskUsers({req,users:chairmen,title:'Champion Assessment Awaiting Final Review',message:`${risk.risk_id} - ${risk.risk_title} is ready for the Chairman’s final decision.`,risk});
                for (const chairman of chairmen) {
                    await createAction({actionKey:`consolidated-chairman:${risk.id}:${chairman.id}`,module:'Risk',actionType:'Chairman Final Assessment',title:`Final review: ${risk.risk_id}`,description:risk.risk_title,priority:assessment.level,status:'Escalated',assignedTo:chairman.id,assignedBy:req.user.id,sourceType:'ConsolidatedRiskAssessment',sourceId:risk.id,actionUrl:'pages/risks.html',availableActions:['review','approve','view']},{req});
                }
            }
        } catch (sideEffectError) {
            console.error('Assessment saved, but a follow-up notification or action failed:', sideEffectError.message);
        }
        res.json({success:true,message:`Assessment recorded and moved to ${nextStage}.`});
    } catch (error) {
        await client.query('ROLLBACK').catch(()=>{});
        console.error(error);
        res.status(500).json({success:false,message:'Unable to record the consolidated assessment decision.'});
    } finally {
        client.release();
    }
};

exports.startRiskReview=async(req,res)=>{try{const risk=await getRiskById(req.params.id);if(!risk)return res.status(404).json({success:false,message:'Risk not found.'});if(!canReviewRisk(req.user,risk))return res.status(403).json({success:false,message:'You may only review risks in your assigned division.'});if(risk.workflow_status==='Under Review')return res.json({success:true,risk});if(risk.workflow_status!=='Submitted')return res.status(409).json({success:false,message:'Only submitted risks can enter review.'});const result=await pool.query(`UPDATE risks SET workflow_status='Under Review',status='Under Review',updated_at=NOW() WHERE id=$1 RETURNING *`,[risk.id]);await pool.query(`INSERT INTO risk_history(risk_id,action,from_status,to_status,changed_by,details) VALUES($1,'Under Review','Submitted','Under Review',$2,$3)`,[risk.id,req.user.id,{risk_id:risk.risk_id}]);await logAudit({req,action:'RISK_UNDER_REVIEW',entityType:'Risk',entityId:risk.id,details:{risk_id:risk.risk_id}});res.json({success:true,risk:result.rows[0]})}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to start risk review.'})}};

exports.committeeReview = async (req,res) => {
    const client=await pool.connect();
    try{
        const risk=await getRiskById(req.params.id);if(!risk)return res.status(404).json({success:false,message:'Risk not found.'});
        const committeeEscalated=(await pool.query(`SELECT EXISTS(SELECT 1 FROM actions WHERE source_type='CommitteeReview' AND source_id=$1 AND status NOT IN('Completed','Cancelled')) AS escalated`,[String(risk.id)])).rows[0].escalated;
        if(risk.risk_level!=='High'&&!committeeEscalated)return res.status(400).json({success:false,message:'Committee review is limited to High risks or risks formally escalated to the Chairman.'});
        const workplanBatchEscalated=(await pool.query(`SELECT EXISTS(SELECT 1 FROM risk_history WHERE risk_id=$1 AND action='Escalated to Committee' AND details ? 'workplan_upload_id') AS escalated`,[risk.id])).rows[0].escalated;
        if(workplanBatchEscalated)return res.status(409).json({success:false,message:'This work-plan risk belongs to a Chairman batch. Record one final decision from the Work Plans page.'});
        if(risk.committee_reviewed_at)return res.status(409).json({success:false,message:'This risk has already received committee review.'});
        if(!['Accepted','Under Review'].includes(risk.workflow_status))return res.status(409).json({success:false,message:'Only accepted or escalated risks can receive committee review.'});
        const action=String(req.body.action||'').toLowerCase(),comments=optionalString(req.body.comments),recommendations=optionalString(req.body.recommendations);
        if(!['approve','return','recommend'].includes(action))return res.status(400).json({success:false,message:'Select approve, return, or recommend.'});
        if(action!=='approve'&&!comments)return res.status(400).json({success:false,message:'Executive comments are required when returning a risk or recording recommendations.'});
        const nextStatus=action==='return'?'Returned':'Accepted';await client.query('BEGIN');
        const result=await client.query(`UPDATE risks SET workflow_status=$1,status=$1,committee_recommendations=COALESCE($2,committee_recommendations),executive_comments=$3,committee_reviewed_by=$4,committee_reviewed_at=NOW(),updated_at=NOW() WHERE id=$5 RETURNING *`,[nextStatus,recommendations,comments,req.user.id,risk.id]);
        await addRiskHistory(client,risk.id,action==='return'?'Risk Returned':'Committee Review',req.user.id,{fromStatus:risk.workflow_status,toStatus:nextStatus,comment:comments,details:{recommendations}});await client.query('COMMIT');
        await logAudit({req,action:action==='return'?'RISK_RETURNED':'RISK_COMMITTEE_REVIEWED',entityType:'Risk',entityId:risk.id,details:{risk_id:risk.risk_id,recommendations}});
        await completeBySource('CommitteeReview',risk.id,{actor:req.user,req,comments:'Committee review completed.'});
        const requester=(await pool.query('SELECT id,email,role,directorate,division FROM users WHERE id=$1',[risk.created_by])).rows;await notifyRiskUsers({req,users:requester,title:`Committee Review: ${nextStatus}`,message:`${risk.risk_id} - ${risk.risk_title}: ${comments}`,risk:result.rows[0]});
        res.json({success:true,message:'Committee review recorded.',risk:result.rows[0]});
    }catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e);res.status(500).json({success:false,message:'Unable to record committee review.'})}finally{client.release()}
};

exports.addTreatmentUpdate = async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const risk = await getRiskById(id);
        if (!risk) return res.status(404).json({ success: false, message: 'Risk not found.' });
        if (!canUpdateTreatment(req.user, risk)) {
            return res.status(403).json({ success: false, message: 'You do not have permission to update monitoring for this risk.' });
        }

        const currentImpact = numberOrNull(req.body.current_impact);
        const currentLikelihood = numberOrNull(req.body.current_likelihood);
        const residualImpact = numberOrNull(req.body.residual_impact);
        const residualLikelihood = numberOrNull(req.body.residual_likelihood);
        const treatmentStatus = optionalString(req.body.treatment_status) || 'In Progress';

        if (currentImpact !== null && (currentImpact < 1 || currentImpact > 5)) {
            return res.status(400).json({ success: false, message: 'Current impact must be between 1 and 5.' });
        }
        if (currentLikelihood !== null && (currentLikelihood < 1 || currentLikelihood > 5)) {
            return res.status(400).json({ success: false, message: 'Current likelihood must be between 1 and 5.' });
        }
        if (!ALLOWED_TREATMENT_STATUSES.includes(treatmentStatus)) {
            return res.status(400).json({ success: false, message: 'Select a valid treatment status.' });
        }
        if ((residualImpact === null) !== (residualLikelihood === null)) {
            return res.status(400).json({ success: false, message: 'Residual impact and residual likelihood are required together.' });
        }

        const currentRiskScore = currentImpact && currentLikelihood ? currentImpact * currentLikelihood : null;
        const residualScore = residualImpact && residualLikelihood ? residualImpact * residualLikelihood : null;

        let completedTreatmentPlanIds = [];
        await client.query('BEGIN');
        await client.query(
            `
            INSERT INTO risk_treatment_updates (
                risk_id, current_impact, current_likelihood, current_risk_score, progress_notes,
                treatment_status, review_date, residual_impact, residual_likelihood, residual_score, updated_by
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            `,
            [
                id,
                currentImpact,
                currentLikelihood,
                currentRiskScore,
                optionalString(req.body.progress_notes),
                treatmentStatus,
                optionalDate(req.body.review_date),
                residualImpact,
                residualLikelihood,
                residualScore,
                req.user.id
            ]
        );
        const result = await client.query(
            `
            UPDATE risks
            SET current_impact = COALESCE($1, current_impact),
                current_likelihood = COALESCE($2, current_likelihood),
                current_risk_score = COALESCE($3, current_risk_score),
                progress_notes = $4,
                treatment_status = $5::varchar,
                next_review_date = $6,
                residual_impact = COALESCE($7, residual_impact),
                residual_likelihood = COALESCE($8, residual_likelihood),
                residual_score = COALESCE($9, residual_score),
                residual_risk_score = COALESCE($9, residual_risk_score),
                status = CASE WHEN $5::varchar = 'Completed' THEN 'Monitoring' ELSE 'Treatment In Progress' END,
                workflow_status = CASE WHEN $5::varchar = 'Completed' THEN 'Monitoring' ELSE 'Treatment In Progress' END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
            RETURNING *
            `,
            [
                currentImpact,
                currentLikelihood,
                currentRiskScore,
                optionalString(req.body.progress_notes),
                treatmentStatus,
                optionalDate(req.body.review_date),
                residualImpact,
                residualLikelihood,
                residualScore,
                id
            ]
        );
        if (treatmentStatus === 'Completed') {
            completedTreatmentPlanIds = (await client.query(
                `UPDATE treatment_plans
                 SET progress_percent=100,status='Completed',updated_at=CURRENT_TIMESTAMP
                 WHERE risk_id=$1 AND (progress_percent<>100 OR status<>'Completed')
                 RETURNING id`,
                [id]
            )).rows.map(plan => plan.id);
        }
        await addRiskHistory(client, id, treatmentStatus==='Completed'?'Treatment Completed':'Treatment Updated', req.user.id, {
            fromStatus:risk.workflow_status,
            toStatus:treatmentStatus==='Completed'?'Monitoring':'Treatment In Progress',
            comment: optionalString(req.body.progress_notes),
            details: { treatment_status: treatmentStatus, residual_score: residualScore }
        });
        await client.query('COMMIT');

        await logAudit({ req, action: treatmentStatus==='Completed'?'TREATMENT_COMPLETED':'TREATMENT_UPDATED', entityType: 'Risk', entityId: id, details: { risk_id: risk.risk_id, treatment_status: treatmentStatus } });
        if(treatmentStatus==='Completed'){
            for (const planId of completedTreatmentPlanIds) {
                await completeBySource('TreatmentPlan',planId,{actor:req.user,req,comments:'Risk treatment completed through monitoring update.'});
            }
            const stakeholders=(await pool.query(`SELECT DISTINCT u.id,u.email,u.role,u.directorate,u.division FROM users u WHERE u.status='Active' AND (u.id=$1 OR (u.role='Risk Champion' AND COALESCE(NULLIF(u.division,''),u.directorate)=$2) OR u.role='Risk Committee Chairman')`,[risk.created_by,risk.division||risk.directorate])).rows;
            await notifyRiskUsers({req,users:stakeholders,title:'Treatment Completed',message:`Treatment for ${risk.risk_id} - ${risk.risk_title} is complete and the risk is now under monitoring.`,risk:result.rows[0]});
        }
        res.json({ success: true, message: 'Risk monitoring update saved.', risk: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);
        res.status(500).json({ success: false, message: 'Unable to save monitoring update.' });
    } finally {
        client.release();
    }
};

exports.closeRisk = async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const risk = await getRiskById(id);
        if (!risk) return res.status(404).json({ success: false, message: 'Risk not found.' });
        if (!canCloseRisk(req.user, risk)) {
            return res.status(403).json({ success: false, message: 'You do not have permission to close this risk.' });
        }

        const closureComments = optionalString(req.body.closure_comments);
        if (!closureComments) return res.status(400).json({ success: false, message: 'Closure comments are required.' });

        await client.query('BEGIN');
        const result = await client.query(
            `
            UPDATE risks
            SET status = 'Closed',
                workflow_status = 'Closed',
                closure_date = COALESCE($1, CURRENT_DATE),
                closure_comments = $2,
                closed_by = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING *
            `,
            [optionalDate(req.body.closure_date), closureComments, req.user.id, id]
        );
        await addRiskHistory(client, id, 'Closed', req.user.id, {
            fromStatus: risk.workflow_status,
            toStatus: 'Closed',
            comment: closureComments,
            details: { risk_id: risk.risk_id }
        });
        await client.query('COMMIT');

        await logAudit({ req, action: 'RISK_CLOSED', entityType: 'Risk', entityId: id, details: { risk_id: risk.risk_id } });
        res.json({ success: true, message: 'Risk closed successfully.', risk: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);
        res.status(500).json({ success: false, message: 'Unable to close risk.' });
    } finally {
        client.release();
    }
};

exports.deleteRisk = exports.closeRisk;

exports.getRiskHistory = async (req, res) => {
    try {
        const risk = await getRiskById(req.params.id);
        if (!risk) return res.status(404).json({ success: false, message: 'Risk not found.' });
        if (!canViewRisk(req.user, risk)) {
            return res.status(403).json({ success: false, message: 'You do not have permission to view this history.' });
        }

        const [history, reviews, updates] = await Promise.all([
            pool.query(
                `SELECT h.*, u.full_name AS changed_by_name FROM risk_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.risk_id = $1 ORDER BY h.changed_at DESC`,
                [req.params.id]
            ),
            pool.query(
                `SELECT rr.*, u.full_name AS reviewed_by_name FROM risk_reviews rr LEFT JOIN users u ON u.id = rr.reviewed_by WHERE rr.risk_id = $1 ORDER BY rr.reviewed_at DESC`,
                [req.params.id]
            ),
            pool.query(
                `SELECT rtu.*, u.full_name AS updated_by_name FROM risk_treatment_updates rtu LEFT JOIN users u ON u.id = rtu.updated_by WHERE rtu.risk_id = $1 ORDER BY rtu.created_at DESC`,
                [req.params.id]
            )
        ]);

        res.json({
            success: true,
            history: redactRiskHistory(history.rows, req.user.role),
            reviews: reviews.rows,
            treatment_updates: updates.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Unable to load risk history.' });
    }
};

exports.getAttachments = async (req, res) => {
    try {
        const risk = await getRiskById(req.params.id);
        if (!risk) return res.status(404).json({ success: false, message: 'Risk not found.' });
        if (!canViewRisk(req.user, risk)) {
            return res.status(403).json({ success: false, message: 'You do not have permission to view attachments.' });
        }

        const result = await pool.query(
            `
            SELECT id, risk_id, file_name, file_type, file_size, uploaded_by, uploaded_at
            FROM risk_attachments
            WHERE risk_id = $1
            ORDER BY uploaded_at DESC
            `,
            [req.params.id]
        );
        res.json({ success: true, attachments: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Unable to load attachments.' });
    }
};

exports.addAttachment = async (req, res) => {
    const client = await pool.connect();

    try {
        const risk = await getRiskById(req.params.id);
        if (!risk) return res.status(404).json({ success: false, message: 'Risk not found.' });
        if (!canViewRisk(req.user, risk)) {
            return res.status(403).json({ success: false, message: 'You do not have permission to upload attachments.' });
        }

        const fileName = optionalString(req.body.file_name);
        const fileType = optionalString(req.body.file_type);
        const fileData = optionalString(req.body.file_data);
        const fileSize = Number(req.body.file_size) || null;

        if (!fileName || !fileData) {
            return res.status(400).json({ success: false, message: 'Attachment file name and data are required.' });
        }

        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/png',
            'image/jpeg',
            'image/gif',
            'image/webp'
        ];

        if (fileType && !allowedTypes.includes(fileType)) {
            return res.status(400).json({ success: false, message: 'Only PDF, Word, Excel, and image attachments are allowed.' });
        }

        const base64 = fileData.includes(',') ? fileData.split(',').pop() : fileData;
        const buffer = Buffer.from(base64, 'base64');

        await client.query('BEGIN');
        const result = await client.query(
            `
            INSERT INTO risk_attachments (risk_id, file_name, file_type, file_size, file_data, uploaded_by)
            VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING id, risk_id, file_name, file_type, file_size, uploaded_by, uploaded_at
            `,
            [req.params.id, fileName, fileType, fileSize || buffer.length, buffer, req.user.id]
        );
        await addRiskHistory(client, req.params.id, 'Attachment Added', req.user.id, {
            details: { file_name: fileName }
        });
        await client.query('COMMIT');

        await logAudit({ req, action: 'RISK_UPDATED', entityType: 'Risk', entityId: req.params.id, details: { risk_id: risk.risk_id, attachment: fileName } });
        res.status(201).json({ success: true, message: 'Attachment uploaded successfully.', attachment: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);
        res.status(500).json({ success: false, message: 'Unable to upload attachment.' });
    } finally {
        client.release();
    }
};
