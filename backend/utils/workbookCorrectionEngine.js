const { assessRiskText } = require('./riskAssessmentEngine');
const { generateTreatmentProposal } = require('./treatmentProposalEngine');
const { divisionRiskCode } = require('./divisionRiskCode');

const CORRECTION_RULES_VERSION = 'ERM-WORKBOOK-CORRECTIONS-1.1';
const APPROVED_RESPONSES = ['Terminate','Treat','Transfer','Tolerate'];
const ASSESSMENT_FIELDS = [
    ['likelihood','Pre-Mitigation Likelihood'],
    ['impact','Pre-Mitigation Impact'],
    ['current_likelihood','Current Likelihood'],
    ['current_impact','Current Impact'],
    ['residual_likelihood','Post-Mitigation Likelihood'],
    ['residual_impact','Post-Mitigation Impact']
];

const CATEGORY_CONTROLS = {
    Strategic:'Document executive sponsorship, delivery milestones, dependency reviews and escalation thresholds.',
    Financial:'Document budget approvals, reconciliations, variance reviews and segregation-of-duties checks.',
    Operational:'Document approved procedures, supervisory checks, continuity arrangements and exception escalation.',
    Reputational:'Document stakeholder communication, media monitoring and incident-escalation controls.',
    'Human Capital':'Document workforce planning, competency, succession, safety and training controls.',
    'Regulatory Compliance':'Document the applicable obligation, compliance ownership, monitoring and retained evidence.',
    Supervision:'Document supervisory milestones, service-provider evidence reviews and enforcement escalation.'
};

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

function concise(value,maxLength=120) {
    const text = String(value || '').replace(/\s+/g,' ').trim();
    return text.length <= maxLength ? text : `${text.slice(0,maxLength - 1).trim()}…`;
}

function stableCode(value) {
    let hash = 2166136261;
    for (const character of String(value || '')) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash,16777619);
    }
    return (hash >>> 0).toString(36).toUpperCase().padStart(6,'0').slice(0,6);
}

function futureDate(days) {
    return new Date(Date.now() + days * 86400000).toISOString().slice(0,10);
}

function addMissingSuggestion({corrections,values,original,field,value,ruleId,explanation,validation,confidence='Low'}) {
    if (populated(original[field]) || corrections.some(item => item.field === field)) return;
    values[field] = value;
    corrections.push(ruleRecord({
        ruleId,
        mistakeType:'Missing contextual value',
        field,
        original:null,
        proposed:value,
        detection:`${field.replaceAll('_',' ')} is empty in the workbook.`,
        explanation,
        confidence,
        validation
    }));
}

function buildWorkbookCorrectionProposal({row,risk,baseCorrections = [],templateType=''}) {
    const values = {...risk};
    const corrections = normalizeExistingCorrections(baseCorrections);
    const system = assessRiskText(risk);
    const original = row.original_data || {};
    if (templateType === 'Division Risk Register Tracker') {
    const division = risk.division || risk.directorate || risk.business_unit || 'NCA';
    const programme = concise(risk.programme_project || original.programme_project || risk.risk_title || original.risk_title || `${division} operations`);
    const contextualTitle = concise(risk.risk_title || original.risk_title || `Risk affecting ${programme}`,180);
    const contextualDescription = concise(risk.risk_description || original.risk_description || `There is a risk that constraints affecting ${programme} could prevent the intended ${division} outcome from being achieved.`,600);
    const contextualOwner = `Director, ${division}`;
    const contextualControls = CATEGORY_CONTROLS[system.category] || CATEGORY_CONTROLS.Operational;
    const contextualKey = [division,programme,contextualTitle,contextualDescription,row.excel_row].join('|');

    addMissingSuggestion({corrections,values,original,field:'risk_id',value:`${divisionRiskCode(division)}-RSK-${stableCode(contextualKey)}`,ruleId:'CONTEXT-RISK-ID',
        explanation:'A provisional unique Risk ID was generated from the division, programme, risk event and Excel row. It remains editable and is checked against the enterprise register before admission.',confidence:'Medium',
        validation:'Confirm a unique Risk ID no longer than 30 characters.'});
    addMissingSuggestion({corrections,values,original,field:'programme_project',value:programme,ruleId:'CONTEXT-PROGRAMME',
        explanation:'The closest available activity context was used to propose a programme or project label.',
        validation:'Confirm the approved programme, project or process name.'});
    addMissingSuggestion({corrections,values,original,field:'risk_title',value:contextualTitle,ruleId:'CONTEXT-RISK-TITLE',
        explanation:'A concise risk name was proposed from the programme and available risk-event wording.',
        validation:'Confirm that the title identifies one distinct risk event.'});
    addMissingSuggestion({corrections,values,original,field:'risk_description',value:contextualDescription,ruleId:'CONTEXT-RISK-DESCRIPTION',
        explanation:'A risk statement was proposed from the programme, title, source and cause available in the row.',
        validation:'Confirm that the description clearly states the uncertain event and its consequence.'});
    addMissingSuggestion({corrections,values,original,field:'risk_source',value:`${system.category} conditions associated with ${programme}.`,ruleId:'CONTEXT-RISK-SOURCE',
        explanation:'The proposed source uses the detected ERM category and programme context; it is not treated as verified evidence.',
        validation:'Confirm the actual internal or external source of the risk.'});
    addMissingSuggestion({corrections,values,original,field:'risk_cause',value:`Potential process, capacity, dependency or control gaps affecting ${programme}.`,ruleId:'CONTEXT-RISK-CAUSE',
        explanation:'A reviewable cause prompt was generated from the activity context because no verified root cause was supplied.',
        validation:'Replace or confirm this prompt using the actual root cause.'});
    addMissingSuggestion({corrections,values,original,field:'risk_category',value:system.category,ruleId:'CONTEXT-RISK-CATEGORY',
        explanation:`The ${system.category} category was proposed from ERM keyword and activity context.`,confidence:system.confidence,
        validation:'Select an ERM-approved risk category.'});
    addMissingSuggestion({corrections,values,original,field:'date_identified',value:risk.date_identified || new Date().toISOString().slice(0,10),ruleId:'CONTEXT-DATE-IDENTIFIED',
        explanation:'The upload date is proposed as a provisional identification date because the historical date was not supplied.',
        validation:'Confirm the actual date identified.'});
    addMissingSuggestion({corrections,values,original,field:'risk_owner',value:contextualOwner,ruleId:'CONTEXT-RISK-OWNER',
        explanation:'The accountable division-director role is proposed rather than inventing the name of an employee.',
        validation:'Confirm the accountable NCA role or officer.'});
    addMissingSuggestion({corrections,values,original,field:'existing_controls',value:contextualControls,ruleId:'CONTEXT-EXISTING-CONTROLS',
        explanation:'A category-aligned control prompt was proposed from the risk context. It must be replaced or confirmed against controls that actually operate.',
        validation:'Record only controls that exist and can be evidenced.'});
    addMissingSuggestion({corrections,values,original,field:'control_type',value:'Not Assessed',ruleId:'CONTEXT-CONTROL-TYPE',
        explanation:'Control type remains Not Assessed until the proposed controls are verified.',
        validation:'Select Preventive, Detective, Corrective, Mixed or Not Assessed.'});
    addMissingSuggestion({corrections,values,original,field:'control_owner',value:contextualOwner,ruleId:'CONTEXT-CONTROL-OWNER',
        explanation:'The accountable division-director role is proposed pending confirmation of the operational control owner.',
        validation:'Confirm the role responsible for operating the control.'});
    addMissingSuggestion({corrections,values,original,field:'control_design_adequacy',value:'Not Assessed',ruleId:'CONTEXT-CONTROL-DESIGN',
        explanation:'Design adequacy cannot be inferred safely without a verified control design and is therefore proposed as Not Assessed.',
        validation:'Assess the control design as Adequate, Partially Adequate, Inadequate or Not Assessed.'});
    addMissingSuggestion({corrections,values,original,field:'control_evidence',value:'Evidence not supplied — attach the approved procedure, owner confirmation, operating record or control-test result.',ruleId:'CONTEXT-CONTROL-EVIDENCE',
        explanation:'The system identifies the evidence gap and suggests the evidence types needed; it does not claim that evidence exists.',
        validation:'Replace this prompt with a verifiable evidence reference when available.'});
    addMissingSuggestion({corrections,values,original,field:'control_last_tested_date',value:null,ruleId:'CONTEXT-CONTROL-LAST-TESTED',
        explanation:'No test date is proposed because a historical control-test date cannot be inferred. Human confirmation is required.',
        validation:'Enter the actual last-tested date, or leave blank while control effectiveness remains Not Assessed.'});
    addMissingSuggestion({corrections,values,original,field:'control_exceptions',value:'Control exceptions were not documented in the workbook; confirm after evidence review and testing.',ruleId:'CONTEXT-CONTROL-EXCEPTIONS',
        explanation:'The proposal records the information gap without asserting that no exceptions exist.',
        validation:'Record verified exceptions or confirm the outcome of control testing.'});
    addMissingSuggestion({corrections,values,original,field:'control_next_review_date',value:risk.target_completion_date || futureDate(system.level === 'High' ? 30 : system.level === 'Medium' ? 60 : 90),ruleId:'CONTEXT-CONTROL-NEXT-REVIEW',
        explanation:'A provisional review date was proposed from the assessed risk level and treatment urgency.',
        validation:'Confirm a realistic future control-review date.'});
    addMissingSuggestion({corrections,values,original,field:'control_effectiveness',value:'Not Assessed',ruleId:'CONTEXT-CONTROL-EFFECTIVENESS',
        explanation:'Control effectiveness remains Not Assessed because verified design, operating evidence and testing were not supplied.',
        validation:'Do not select Effective without adequate design, dated evidence and no unresolved exceptions.'});
    addMissingSuggestion({corrections,values,original,field:'control_assessment_basis',value:'Control effectiveness is not yet assessed because verified design, operating evidence and a dated control test were not supplied.',ruleId:'CONTEXT-CONTROL-BASIS',
        explanation:'The proposal transparently records why the control assessment cannot yet be elevated.',
        validation:'Update the basis when verified control-assurance evidence is available.'});
    }

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
        values.responsible_officer = risk.responsible_officer || risk.risk_owner || values.risk_owner || null;
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
    } else if (!originalResponse && templateType === 'Division Risk Register Tracker') {
        values.risk_treatment = system.response;
        corrections.push(ruleRecord({
            ruleId:'RESPONSE-CONTEXTUAL-PROPOSAL',
            mistakeType:'Missing ERM response',
            field:'risk_treatment',original:null,proposed:system.response,
            detection:'The Risk Response is blank.',
            explanation:`The system proposed ${system.response} from the contextual ERM assessment, category appetite and score. The authorised reviewer makes the decision.`,
            confidence:system.confidence,
            validation:'Confirm Terminate, Treat, Transfer or Tolerate.'
        }));
    } else {
        values.risk_treatment = null;
        corrections.push(ruleRecord({
            ruleId:'RESPONSE-USER-SELECTION',
            mistakeType:'Unrecognized ERM response',
            field:'risk_treatment',original:originalResponse,proposed:null,
            detection:'The Risk Response is not one of the four ERM-approved responses.',
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
