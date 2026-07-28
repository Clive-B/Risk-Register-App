const { calculateRiskLevel } = require('./riskMatrix');
const { responseFor } = require('./riskAssessmentEngine');

const RULES_VERSION = 'ERM-2026.05-TREATMENT-1';

const CATEGORY_ACTIONS = {
    Strategic: 'Assign an executive sponsor, define delivery milestones, review dependencies and report exceptions against corporate objectives.',
    Financial: 'Introduce budget controls, reconciliations, variance thresholds and documented financial review evidence.',
    Operational: 'Document the operating procedure, assign control owners, test continuity arrangements and track corrective actions.',
    Reputational: 'Approve stakeholder communications, monitor public sentiment and maintain an incident escalation and response protocol.',
    'Human Capital': 'Confirm workforce capacity, competency, succession, safety and training controls with accountable owners.',
    'Regulatory Compliance': 'Map the applicable obligation, assign compliance ownership, test adherence and retain review evidence.',
    Supervision: 'Set supervisory milestones, validate service-provider evidence, track enforcement exceptions and escalate overdue responses.'
};

const STRATEGY_ACTIONS = {
    Terminate: 'Remove the risk source by stopping, redesigning or replacing the activity where practicable.',
    Treat: 'Apply preventive and consequence-reducing controls with measurable completion evidence.',
    Transfer: 'Define the exposure to be shared through an approved contract, insurance arrangement, outsourcing or partnership, while monitoring retained exposure.',
    Tolerate: 'Record the informed retention decision, maintain existing controls and monitor for changes in exposure.'
};

function isoDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function futureDate(days) {
    return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function targetResidual(strategy, likelihood, impact) {
    const currentLikelihood = Math.max(1, Math.min(5, Number(likelihood) || 3));
    const currentImpact = Math.max(1, Math.min(5, Number(impact) || 3));
    if (strategy === 'Terminate') return { likelihood: 1, impact: 1 };
    if (strategy === 'Transfer') return { likelihood: currentLikelihood, impact: Math.max(1, currentImpact - 1) };
    if (strategy === 'Treat') return {
        likelihood: Math.max(1, currentLikelihood - 1),
        impact: Math.max(1, currentImpact - 1)
    };
    return { likelihood: currentLikelihood, impact: currentImpact };
}

function generateTreatmentProposal(input = {}) {
    const category = input.risk_category || 'Operational';
    const likelihood = Number(input.likelihood) || 3;
    const impact = Number(input.impact) || 3;
    const score = likelihood * impact;
    const level = input.risk_level || calculateRiskLevel(score);
    const strategy = input.risk_treatment || responseFor(impact, likelihood, category);
    const originalPlan = String(input.initial_mitigation_plan || '').trim() || null;
    const residual = targetResidual(strategy, likelihood, impact);
    const residualScore = residual.likelihood * residual.impact;
    const days = level === 'High' ? 30 : level === 'Medium' ? 60 : 90;
    const monitoringFrequency = ['Reputational', 'Regulatory Compliance'].includes(category)
        ? 'Monthly'
        : level === 'High' ? 'Monthly' : level === 'Medium' ? 'Quarterly' : 'Six-monthly';
    const improvement = [
        STRATEGY_ACTIONS[strategy] || STRATEGY_ACTIONS.Treat,
        CATEGORY_ACTIONS[category] || CATEGORY_ACTIONS.Operational,
        `Target a residual score of ${residualScore} (${calculateRiskLevel(residualScore)}) and escalate any missed milestone.`
    ].join(' ');

    return {
        rules_version: RULES_VERSION,
        strategy,
        original_plan: originalPlan,
        system_improvements: improvement,
        objective: `Manage ${input.risk_title || 'the identified risk'} within the ${category} risk appetite and reduce or monitor exposure from score ${score}.`,
        actions: originalPlan || improvement,
        owner: input.responsible_officer || input.risk_owner || input.default_owner || 'Risk owner',
        due_date: isoDate(input.target_completion_date || input.due_date) || futureDate(days),
        evidence_required: `Approved action record; owner confirmation; implementation evidence; control test or monitoring result; residual assessment confirming L${residual.likelihood} × I${residual.impact} = ${residualScore}.`,
        monitoring_frequency: monitoringFrequency,
        review_date: isoDate(input.next_review_date || input.target_completion_date || input.due_date) || futureDate(days),
        target_residual_likelihood: residual.likelihood,
        target_residual_impact: residual.impact,
        target_residual_score: residualScore
    };
}

module.exports = { RULES_VERSION, generateTreatmentProposal };
