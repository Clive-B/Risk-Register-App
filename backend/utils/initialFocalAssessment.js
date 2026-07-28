function rating(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

function deriveInitialFocalAssessment(risk, source, overrides = {}) {
    let likelihood = overrides.likelihood ?? null;
    let impact = overrides.impact ?? null;

    if (likelihood === null || impact === null) {
        if (source === 'Risk Register Tracking Template') {
            likelihood ??= rating(risk.current_likelihood);
            impact ??= rating(risk.current_impact);
        }
        likelihood ??= rating(risk.likelihood);
        impact ??= rating(risk.impact);
    }

    likelihood = rating(likelihood);
    impact = rating(impact);

    return {
        likelihood,
        impact,
        score: likelihood !== null && impact !== null ? likelihood * impact : null
    };
}

module.exports = { deriveInitialFocalAssessment };
