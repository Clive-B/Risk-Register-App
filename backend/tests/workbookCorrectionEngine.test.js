const test = require('node:test');
const assert = require('node:assert/strict');

const {
    APPROVED_RESPONSES,
    CORRECTION_RULES_VERSION,
    buildWorkbookCorrectionProposal
} = require('../utils/workbookCorrectionEngine');

function proposal(overrides = {}) {
    const risk = {
        risk_title:'Service interruption risk',
        risk_description:'A system outage may interrupt service delivery and delay programme outcomes.',
        risk_category:'Operational',
        risk_owner:'Risk Owner',
        responsible_officer:'Risk Owner',
        initial_mitigation_plan:'Implement and test continuity controls.',
        ...overrides
    };
    return buildWorkbookCorrectionProposal({
        row:{ original_data:{...risk}, corrections:[] },
        risk
    });
}

test('workbook correction rules translate Accept and generate all missing assessment stages', () => {
    const result = proposal({ risk_treatment:'Accept' });

    assert.equal(result.rules_version, CORRECTION_RULES_VERSION);
    assert.equal(result.values.risk_treatment, 'Tolerate');
    [
        'likelihood','impact','current_likelihood','current_impact',
        'residual_likelihood','residual_impact'
    ].forEach(field => assert.ok(Number.isInteger(result.values[field]) && result.values[field] >= 1 && result.values[field] <= 5));

    const responseRule = result.corrections.find(rule => rule.rule_id === 'RESPONSE-ACCEPT-TO-TOLERATE');
    assert.equal(responseRule.confidence_level, 'High');
    assert.equal(responseRule.proposed_correction, 'Tolerate');
});

test('unrecognised responses require an explicit ERM dropdown selection', () => {
    const result = proposal({ risk_treatment:'Avoid' });
    const responseRule = result.corrections.find(rule => rule.rule_id === 'RESPONSE-USER-SELECTION');

    assert.equal(result.values.risk_treatment, null);
    assert.deepEqual(result.approved_responses, APPROVED_RESPONSES);
    assert.equal(responseRule.confidence_level, 'Low');
    assert.match(responseRule.validation_rule, /Terminate, Treat, Transfer or Tolerate/);
});

test('each correction exposes the complete governed rule and audit structure', () => {
    const result = proposal({ risk_treatment:'Treat' });

    assert.ok(result.corrections.length >= 6);
    result.corrections.forEach(rule => {
        assert.equal(rule.rules_version, CORRECTION_RULES_VERSION);
        assert.ok(rule.detection_rule);
        assert.ok(Object.hasOwn(rule, 'proposed_correction'));
        assert.ok(rule.explanation);
        assert.ok(['High','Medium','Low'].includes(rule.confidence_level));
        assert.equal(rule.editable_value, true);
        assert.ok(rule.validation_rule);
        assert.ok(rule.audit_record);
    });
});

test('generated post-mitigation targets start from the current assessment', () => {
    const result = proposal({
        risk_treatment:'Treat',
        likelihood:5,
        impact:5,
        current_likelihood:3,
        current_impact:2
    });

    assert.equal(result.values.residual_likelihood, 2);
    assert.equal(result.values.residual_impact, 1);
});

test('Template 3 proposes contextual values or governed review prompts for every missing field', () => {
    const original = {
        risk_id:null,programme_project:'Network resilience programme',risk_title:'Service outage risk',
        risk_description:'A recurring network outage could interrupt regulated services.',risk_source:null,risk_cause:null,
        risk_category:null,date_identified:null,risk_owner:null,likelihood:null,impact:null,risk_treatment:null,
        current_likelihood:null,current_impact:null,residual_likelihood:null,residual_impact:null,
        existing_controls:null,control_type:null,control_owner:null,control_design_adequacy:null,
        control_evidence:null,control_last_tested_date:null,control_exceptions:null,control_next_review_date:null,
        control_effectiveness:null,control_assessment_basis:null,initial_mitigation_plan:null,
        responsible_officer:null,target_completion_date:null
    };
    const result = buildWorkbookCorrectionProposal({
        row:{excel_row:13,original_data:original,corrections:[]},
        risk:{...original,directorate:'Information Technology',division:'Information Technology'},
        templateType:'Division Risk Register Tracker'
    });

    const missingFields = Object.entries(original).filter(([,value]) => value === null).map(([field]) => field);
    missingFields.forEach(field => assert.ok(result.corrections.some(rule => rule.field === field),`${field} should have a governed suggestion`));
    assert.match(result.values.risk_id,/^IT-RSK-/);
    assert.equal(result.values.risk_treatment,'Treat');
    assert.equal(result.values.control_effectiveness,'Not Assessed');
    assert.equal(result.values.control_last_tested_date,null);
});
