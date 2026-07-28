const LIKELIHOOD_INTERPRETATION = Object.freeze({
    1: 'Rare (Very Low)',
    2: 'Unlikely (Low)',
    3: 'Possible (Medium)',
    4: 'Likely (High)',
    5: 'Almost Certain (Very High)'
});

const IMPACT_INTERPRETATION = Object.freeze({
    1: 'Insignificant (Very Low)',
    2: 'Minor (Low)',
    3: 'Moderate (Medium)',
    4: 'Major (High)',
    5: 'Catastrophic (Very High)'
});

const RISK_CATEGORIES = Object.freeze([
    'Strategic',
    'Financial',
    'Operational',
    'Reputational',
    'Human Capital',
    'Regulatory Compliance',
    'Supervision'
]);

const RISK_APPETITES = Object.freeze({
    Strategic: Object.freeze({ attitude: 'Open', appetite: 'High' }),
    Financial: Object.freeze({ attitude: 'Cautious', appetite: 'Moderate' }),
    Operational: Object.freeze({ attitude: 'Cautious', appetite: 'Moderate' }),
    Reputational: Object.freeze({ attitude: 'None', appetite: 'None' }),
    'Human Capital': Object.freeze({ attitude: 'Seek', appetite: 'Significant' }),
    'Regulatory Compliance': Object.freeze({ attitude: 'None', appetite: 'None' }),
    Supervision: Object.freeze({ attitude: 'Open', appetite: 'High' })
});

function calculateRiskLevel(score) {
    const value = Number(score);
    if (value >= 17) return 'High';
    if (value >= 11) return 'Medium';
    return 'Low';
}

module.exports = {
    calculateRiskLevel,
    LIKELIHOOD_INTERPRETATION,
    IMPACT_INTERPRETATION,
    RISK_CATEGORIES,
    RISK_APPETITES,
    LEVELS: Object.freeze(['Low', 'Medium', 'High'])
};
