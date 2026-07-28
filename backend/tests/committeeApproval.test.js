const test = require('node:test');
const assert = require('node:assert/strict');
const {
    requiredTreatmentApprovalStatus,
    isTreatmentEligible
} = require('../utils/committeeApproval');

test('Champion and Committee treatment approvals are separate governed stages', () => {
    assert.equal(requiredTreatmentApprovalStatus('Risk Champion'),'Pending Champion Approval');
    assert.equal(requiredTreatmentApprovalStatus('Risk Committee Chairman'),'Pending Committee Approval');
});

test('Chairman can approve only complete plans already approved by a Champion', () => {
    const complete={
        approval_status:'Pending Committee Approval',
        lifecycle_status:'Pending Risk Approval',
        treatment_actions:'Implement the agreed control.',
        action_owner:'Director, RIPS',
        due_date:'2026-12-31'
    };
    assert.equal(isTreatmentEligible(complete,'Risk Committee Chairman'),true);
    assert.equal(isTreatmentEligible({...complete,approval_status:'Pending Champion Approval'},'Risk Committee Chairman'),false);
    assert.equal(isTreatmentEligible({...complete,treatment_actions:''},'Risk Committee Chairman'),false);
});
