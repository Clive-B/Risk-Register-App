const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CONTROL_EFFECTIVENESS,
    assessControlAssurance,
    controlScoreConsistency
} = require('../utils/controlAssurance');

test('control assurance includes an honest Not Assessed state', () => {
    assert.deepEqual(CONTROL_EFFECTIVENESS, [
        'Effective','Partially Effective','Ineffective','Not Assessed'
    ]);
    assert.equal(assessControlAssurance({
        existing_controls:'Monthly supervisory review'
    }).rating, 'Not Assessed');
});

test('Effective requires adequate design, dated evidence and no exceptions', () => {
    assert.deepEqual(assessControlAssurance({
        existing_controls:'Monthly access review and reconciliation',
        control_design_adequacy:'Adequate',
        control_evidence:'Reviewed access log and signed reconciliation report',
        control_last_tested_date:'2026-07-01',
        control_exceptions:''
    }), {
        rating:'Effective',
        confidence:'High',
        basis:'The control is recorded as adequately designed and supported by dated operating evidence with no exceptions.'
    });
});

test('risk-score movement is validated against control assurance without modifying the score', () => {
    assert.match(controlScoreConsistency({
        effectiveness:'Ineffective',inherentScore:16,currentScore:6
    }), /Review the current assessment evidence/);
    assert.equal(controlScoreConsistency({
        effectiveness:'Partially Effective',inherentScore:16,currentScore:12
    }), null);
});
