const { assessRiskText } = require('./riskAssessmentEngine');
const { generateTreatmentProposal } = require('./treatmentProposalEngine');

const CORRECTION_RULES_VERSION = 'ERM-WORKBOOK-CORRECTIONS-1.0';
const APPROVED_RESPONSES = ['Terminate','Treat','Transfer','Tolerate'];
const ASSESSMENT_FIELDS = [
    ['likelihood','Pre-Mitigation Likelihood'],
    ['impact','Pre-Mitigation Impact'],
    ['current_likelihood','Current Likelihood'],
    ['current_impact','Current Impact'],
    ['residual_likelihood','Post-Mitigation Likelihood'],
    ['residual_impact','Post-Mitigation Impact']
];

function populated(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
}

function validRating(value) {
    return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5;
}

function ruleRecord({
    ruleId,mistakeType,field,original,proposed,detection,explanation,
    confidence='High',validation,audit='Original, proposed and confirmed values are retained.'
}) {
    return {
        rule_id:ruleId,
        rules_version:CORRECTION_RULES_VERSION,
        mistake_type:mistakeType,
        field,
        original:original ?? null,
        proposed:proposed ?? null,
        reason:explanation,
        rule:validation,
        detection_rule:detection,
        proposed_correction:proposed ?? null,
        explanation,
        confidence_level:confidence,
        editable_value:true,
        validation_rule:validation,
        audit_record:audit
    };
}

function normalizeExistingCorrections(corrections = []) {
    return corrections.map((correction,index) => correction.rule_id ? correction : ruleRecord({
        ruleId:`STRUCTURE-${String(index + 1).padStart(3,'0')}`,
        mistakeType:'Workbook structure',
        field:correction.field,
        original:correction.original,
        proposed:correction.proposed,
        detection:correction.reason,
        explanation:correction.reason,
        confidence:'High',
        validation:correction.rule
    }));
}

function buildWorkbookCorrectionProposal({row,risk,baseCorrections = []}) {
    const values = {...risk};
    const corrections = normalizeExistingCorrections(baseCorrections);
    const system = assessRiskText(risk);
    const original = row.original_data || {};

    const preLikelihood = validRating(original.likelihood) ? Number(original.likelihood) : system.likelihood;
    const preImpact = validRating(original.impact) ? Number(original.impact) : system.impact;
    if (!validRating(original.likelihood)) {
        corrections.push(ruleRecord({
            ruleId:'ASSESS-PRE-LIKELIHOOD',
            mistakeType:populated(original.likelihood) ? 'Invalid assessment value' : 'Missing assessment value',
            field:'likelihood',original:original.likelihood,proposed:preLikelihood,
            detection:'Pre-Mitigation Likelihood is empty or is not an integer from 1 to 5.',
            explanation:'The system applied the authoritative ERM likelihood criteria to the risk statement and proposed a Focal-reviewable value.',
            confidence:'Medium',
            validation:'Select a Pre-Mitigation Likelihood from 1 to 5.'
        }));
    }
    if (!validRating(original.impact)) {
        corrections.push(ruleRecord({
            ruleId:'ASSESS-PRE-IMPACT',
            mistakeType:populated(original.impact) ? 'Invalid assessment value' : 'Missing assessment value',
            field:'impact',original:original.impact,proposed:preImpact,
            detection:'Pre-Mitigation Impact is empty or is not an integer from 1 to 5.',
            explanation:'The system applied the authoritative ERM consequence criteria to the risk statement and proposed a Focal-reviewable value.',
            confidence:'Medium',
            validation:'Select a Pre-Mitigation Impact from 1 to 5.'
        }));
    }
    values.likelihood = preLikelihood;
    values.impact = preImpact;

    const currentLikelihood = validRating(original.current_likelihood)
        ? Number(original.current_likelihood)
        : preLikelihood;
    const currentImpact = validRating(original.current_impact)
        ? Number(original.current_impact)
        : preImpact;
    if (!validRating(original.current_likelihood)) {
        corrections.push(ruleRecord({
            ruleId:'ASSESS-CURRENT-LIKELIHOOD',
            mistakeType:populated(original.current_likelihood) ? 'Invalid assessment value' : 'Missing assessment value',
            field:'current_likelihood',original:original.current_likelihood,proposed:currentLikelihood,
            detection:'Current Likelihood is empty or invalid.',
            explanation:'Without verified control-performance evidence, the ERM-safe proposal retains the Pre-Mitigation Likelihood. The Focal Person may amend it using current control evidence.',
            confidence:'Medium',
            validation:'Select a Current Likelihood from 1 to 5.'
        }));
    }
    if (!validRating(original.current_impact)) {
        corrections.push(ruleRecord({
            ruleId:'ASSESS-CURRENT-IMPACT',
            mistakeType:populated(original.current_impact) ? 'Invalid assessment value' : 'Missing assessment value',
            field:'current_impact',original:original.current_impact,proposed:currentImpact,
            detection:'Current Impact is empty or invalid.',
            explanation:'Without verified evidence of changed consequences, the ERM-safe proposal retains the Pre-Mitigation Impact. The Focal Person may amend it.',
            confidence:'Medium',
            validation:'Select a Current Impact from 1 to 5.'
        }));
    }
    values.current_likelihood = currentLikelihood;
    values.current_impact = currentImpact;

    const treatmentProposal = generateTreatmentProposal({
        ...risk,
        likelihood:currentLikelihood,
        impact:currentImpact,
        current_likelihood:currentLikelihood,
        current_impact:currentImpact
    });
    const postLikelihood = validRating(original.residual_likelihood)
        ? Number(original.residual_likelihood)
        : Number(treatmentProposal.target_residual_likelihood);
    const postImpact = validRating(original.residual_impact)
        ? Number(original.residual_impact)
        : Number(treatmentProposal.target_residual_impact);
    if (!validRating(original.residual_likelihood)) {
        corrections.push(ruleRecord({
            ruleId:'ASSESS-POST-LIKELIHOOD',
            mistakeType:populated(original.residual_likelihood) ? 'Invalid assessment value' : 'Missing assessment value',
            field:'residual_likelihood',original:original.residual_likelihood,proposed:postLikelihood,
            detection:'Post-Mitigation Likelihood is empty or invalid.',
            explanation:'The system proposed a target likelihood based on the risk assessment and generated treatment plan. It remains subject to Focal Person confirmation.',
            confidence:'Medium',
            validation:'Select a Post-Mitigation Likelihood from 1 to 5.'
        }));
    }
    if (!validRating(original.residual_impact)) {
        corrections.push(ruleRecord({
            ruleId:'ASSESS-POST-IMPACT',
            mistakeType:populated(original.residual_impact) ? 'Invalid assessment value' : 'Missing assessment value',
            field:'residual_impact',original:original.residual_impact,proposed:postImpact,
            detection:'Post-Mitigation Impact is empty or invalid.',
            explanation:'The system proposed a target impact based on the treatment objective. The Focal Person must confirm whether the target is realistic.',
            confidence:'Medium',
            validation:'Select a Post-Mitigation Impact from 1 to 5.'
        }));
    }
    values.residual_likelihood = postLikelihood;
    values.residual_impact = postImpact;

    if (!populated(original.initial_mitigation_plan)) {
        values.initial_mitigation_plan = treatmentProposal.actions;
        corrections.push(ruleRecord({
            ruleId:'TREATMENT-ACTIONS-PROPOSAL',
            mistakeType:'Missing treatment actions',
            field:'initial_mitigation_plan',
            original:original.initial_mitigation_plan,
            proposed:treatmentProposal.actions,
            detection:'The workbook did not provide a mitigation plan or treatment actions.',
            explanation:'The system generated an editable treatment proposal from the risk event, causes, controls and assessment.',
            confidence:'Medium',
            validation:'Confirm practical treatment actions appropriate to the risk and division.'
        }));
    }
    if (!populated(original.responsible_officer)) {
        values.responsible_officer = risk.responsible_officer || risk.risk_owner || null;
        corrections.push(ruleRecord({
            ruleId:'TREATMENT-OWNER-PROPOSAL',
            mistakeType:'Missing treatment owner',
            field:'responsible_officer',
            original:original.responsible_officer,
            proposed:values.responsible_officer,
            detection:'The workbook did not provide a separate responsible officer.',
            explanation:'The recorded Risk Owner is proposed as the treatment owner and remains editable.',
            confidence:'Medium',
            validation:'Every treatment plan must have a responsible officer.'
        }));
    }
    if (!populated(original.target_completion_date)) {
        values.target_completion_date = treatmentProposal.due_date;
        corrections.push(ruleRecord({
            ruleId:'TREATMENT-DUE-DATE-PROPOSAL',
            mistakeType:'Missing target date',
            field:'target_completion_date',
            original:original.target_completion_date,
            proposed:treatmentProposal.due_date,
            detection:'The workbook did not provide a target completion date.',
            explanation:'A target date was proposed from the generated treatment plan and remains editable by the Focal Person.',
            confidence:'Medium',
            validation:'Enter a valid target completion date between 2020 and 2100.'
        }));
    }

    const originalResponse = String(original.risk_treatment || '').trim();
    const approvedResponse = APPROVED_RESPONSES.find(item => item.toLowerCase() === originalResponse.toLowerCase());
    if (originalResponse.toLowerCase() === 'accept') {
        values.risk_treatment = 'Tolerate';
        if (!corrections.some(item => item.field === 'risk_treatment')) {
            corrections.push(ruleRecord({
                ruleId:'RESPONSE-ACCEPT-TO-TOLERATE',
                mistakeType:'Unapproved ERM terminology',
                field:'risk_treatment',original:originalResponse,proposed:'Tolerate',
                detection:'The workbook response is Accept.',
                explanation:'Accept is translated to the ERM-approved response Tolerate.',
                confidence:'High',
                validation:'Select Terminate, Treat, Transfer or Tolerate.'
            }));
        }
    } else if (approvedResponse) {
        values.risk_treatment = approvedResponse;
    } else {
        values.risk_treatment = null;
        corrections.push(ruleRecord({
            ruleId:'RESPONSE-USER-SELECTION',
            mistakeType:originalResponse ? 'Unrecognized ERM response' : 'Missing ERM response',
            field:'risk_treatment',original:originalResponse || null,proposed:null,
            detection:'The Risk Response is blank or is not one of the four ERM-approved responses.',
            explanation:'The system will not guess an ambiguous treatment response. The Focal Person must choose from the approved ERM list.',
            confidence:'Low',
            validation:'Choose Terminate, Treat, Transfer or Tolerate.'
        }));
    }

    ASSESSMENT_FIELDS.forEach(([field]) => {
        if (validRating(values[field])) values[field] = Number(values[field]);
    });
    return {
        values,
        corrections,
        rules_version:CORRECTION_RULES_VERSION,
        system_assessment:system,
        approved_responses:APPROVED_RESPONSES
    };
}

module.exports = {
    APPROVED_RESPONSES,
    ASSESSMENT_FIELDS,
    CORRECTION_RULES_VERSION,
    buildWorkbookCorrectionProposal,
    ruleRecord
};
