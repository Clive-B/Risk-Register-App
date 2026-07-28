function isCommitteeDecisionRole(role) {
    return ['Risk Committee Chairman','System Administrator'].includes(role);
}

function requiredTreatmentApprovalStatus(role) {
    return isCommitteeDecisionRole(role)
        ? 'Pending Committee Approval'
        : 'Pending Champion Approval';
}

function isTreatmentEligible(plan, role) {
    return plan.approval_status === requiredTreatmentApprovalStatus(role)
        && !['Completed','Deferred'].includes(plan.lifecycle_status)
        && Boolean(String(plan.treatment_actions || '').trim())
        && Boolean(String(plan.action_owner || '').trim())
        && Boolean(plan.due_date);
}

module.exports = {
    isCommitteeDecisionRole,
    requiredTreatmentApprovalStatus,
    isTreatmentEligible
};
