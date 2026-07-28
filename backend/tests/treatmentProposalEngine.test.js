const test = require('node:test');
const assert = require('node:assert/strict');
const { generateTreatmentProposal } = require('../utils/treatmentProposalEngine');

test('treatment proposal preserves uploaded plan and adds separate improvements', () => {
    const proposal = generateTreatmentProposal({
        risk_title: 'Regulatory reporting failure',
        risk_category: 'Regulatory Compliance',
        likelihood: 2,
        impact: 3,
        risk_treatment: 'Treat',
        initial_mitigation_plan: 'Existing owner reviews the return.',
        responsible_officer: 'Compliance Manager',
        target_completion_date: '2026-12-15'
    });

    assert.equal(proposal.original_plan, 'Existing owner reviews the return.');
    assert.equal(proposal.actions, proposal.original_plan);
    assert.match(proposal.system_improvements, /compliance ownership/i);
    assert.equal(proposal.owner, 'Compliance Manager');
    assert.equal(proposal.due_date, '2026-12-15');
    assert.equal(proposal.monitoring_frequency, 'Monthly');
    assert.equal(proposal.target_residual_score, 2);
});

test('treatment proposal generates a complete plan when upload has no plan', () => {
    const proposal = generateTreatmentProposal({
        risk_title: 'Service interruption',
        risk_category: 'Operational',
        likelihood: 4,
        impact: 4,
        risk_treatment: 'Treat',
        risk_owner: 'Operations'
    });

    assert.equal(proposal.original_plan, null);
    assert.equal(proposal.actions, proposal.system_improvements);
    assert.equal(proposal.owner, 'Operations');
    assert.equal(proposal.monitoring_frequency, 'Quarterly');
    assert.equal(proposal.target_residual_score, 9);
    assert.match(proposal.evidence_required, /residual assessment/i);
});
