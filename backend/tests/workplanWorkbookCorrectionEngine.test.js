const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
    WORKPLAN_RULES_VERSION,
    applyWorkplanCorrections,
    parseWorkplanWorkbook
} = require('../utils/workplanWorkbookCorrectionEngine');
const { RISK_CATEGORIES } = require('../utils/riskMatrix');

function assessment(programme,action) {
    return {
        risk_title:`Delay in ${action.action}`,
        risk_description:`The action ${action.action} may be delayed and affect ${programme.programme}.`,
        risk_category:'Operational',
        likelihood:3,
        impact:3,
        risk_score:9,
        risk_level:'Low',
        risk_response:'Treat',
        treatment_recommendation:'Assign an owner, milestones and monitoring evidence.',
        assessment_rationale:'ERM rules applied to the work-plan action.',
        confidence:'Medium',
        matched_keywords:['delay'],
        rules_version:'ERM-TEST',
        assessment_explanation:'ERM rules applied to the work-plan action.'
    };
}

function workbookBuffer() {
    const rows = [
        ['Flexible Work Plan'],
        ['KEY ACTION POINT','PROGRAMMES','END','START','WEIGHT (100%)','NO.','GOAL(S)','KPI','TARGET','BASELINE','BUDGET (GHC)','STRATEGIC PILLAR'],
        ['1. Implement the service platform','Digital service programme','Decenmber','January','40','1','Improve services','Availability','100%','Current service','1000','Digital'],
        ['2. Complete user acceptance testing',null,'June','April','60',null,null,null,null,null,null,null]
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'Flexible');
    return XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
}

test('work-plan correction engine detects flexible supported column order', () => {
    const parsed = parseWorkplanWorkbook(workbookBuffer(),2026,{assess:assessment,categories:RISK_CATEGORIES});

    assert.equal(parsed.sheet_name,'Flexible');
    assert.equal(parsed.programmes.length,1);
    assert.equal(parsed.proposals.length,2);
    assert.equal(parsed.proposals[0].values.end,'December');
    assert.equal(parsed.proposals[1].values.programme,'Digital service programme');
    assert.equal(parsed.rules_version,WORKPLAN_RULES_VERSION);
});

test('work-plan rules expose detection, proposal, confidence, validation and audit fields', () => {
    const parsed = parseWorkplanWorkbook(workbookBuffer(),2026,{assess:assessment,categories:RISK_CATEGORIES});
    const rules = parsed.proposals.flatMap(row => row.corrections);

    assert.ok(rules.some(rule => rule.rule_id === 'WORKPLAN-DECEMBER-TYPO'));
    rules.forEach(rule => {
        assert.ok(rule.detection_rule);
        assert.ok(Object.hasOwn(rule,'proposed_correction'));
        assert.ok(rule.explanation);
        assert.ok(['High','Medium','Low'].includes(rule.confidence_level));
        assert.equal(rule.editable_value,true);
        assert.ok(rule.validation_rule);
        assert.ok(rule.audit_record);
    });
});

test('confirmed work-plan corrections retain immutable system and Focal values', () => {
    const parsed = parseWorkplanWorkbook(workbookBuffer(),2026,{assess:assessment,categories:RISK_CATEGORIES});
    const corrected = parsed.proposals.map(row => ({
        action_key:row.action_key,
        confirmed:true,
        values:{...row.values,likelihood:row === parsed.proposals[0] ? 4 : 3}
    }));
    const applied = applyWorkplanCorrections(parsed,corrected,{assess:assessment,categories:RISK_CATEGORIES,year:2026});
    const first = applied.programmes[0].actions[0];

    assert.equal(first.assessment.system_assessment.likelihood,3);
    assert.equal(first.assessment.likelihood,4);
    assert.equal(first.assessment.risk_score,12);
    assert.equal(first.correction_audit.confirmed,true);
    assert.equal(first.correction_audit.rules_version,WORKPLAN_RULES_VERSION);
});

test('normalized one-action-per-row templates group repeated Programme Numbers', () => {
    const rows = [
        ['Programme Number','Strategic Pillar','Programme','Goal','KPI','Target','Baseline','Key Action Point','Budget (GHC)','Weight (100%)','Start Month','End Month'],
        ['RIPS-01','Innovation','Industry intelligence','Improve evidence','Reports','4','1','Prepare Q1 bulletin','1000','50','January','March'],
        ['RIPS-01','Innovation','Industry intelligence','Improve evidence','Reports','4','1','Prepare Q2 bulletin','1000','50','April','June']
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'Work Plan');
    const parsed = parseWorkplanWorkbook(
        XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),
        2026,
        {assess:assessment,categories:RISK_CATEGORIES}
    );

    assert.equal(parsed.programmes.length,1);
    assert.equal(parsed.programmes[0].actions.length,2);
    assert.equal(parsed.proposals.length,2);
    assert.equal(parsed.proposals[1].values.programme_number,'RIPS-01');
});
