const test = require('node:test');
const assert = require('node:assert/strict');
const {
    calculateRiskLevel,
    LIKELIHOOD_INTERPRETATION,
    IMPACT_INTERPRETATION,
    RISK_CATEGORIES,
    RISK_APPETITES
} = require('../utils/riskMatrix');
const {
    assessRiskText,
    responseFor,
    likelihoodFromEvidence,
    impactFromEvidence
} = require('../utils/riskAssessmentEngine');

test('authoritative ERM three-level score bands are preserved', () => {
    for (let score = 1; score <= 10; score += 1) assert.equal(calculateRiskLevel(score), 'Low');
    for (let score = 11; score <= 16; score += 1) assert.equal(calculateRiskLevel(score), 'Medium');
    for (let score = 17; score <= 25; score += 1) assert.equal(calculateRiskLevel(score), 'High');
});

test('likelihood and consequence interpretations match the ERM framework', () => {
    assert.deepEqual(LIKELIHOOD_INTERPRETATION, {
        1: 'Rare (Very Low)',
        2: 'Unlikely (Low)',
        3: 'Possible (Medium)',
        4: 'Likely (High)',
        5: 'Almost Certain (Very High)'
    });
    assert.deepEqual(IMPACT_INTERPRETATION, {
        1: 'Insignificant (Very Low)',
        2: 'Minor (Low)',
        3: 'Moderate (Medium)',
        4: 'Major (High)',
        5: 'Catastrophic (Very High)'
    });
});

test('assessment engine produces a policy-based immutable numeric baseline and explanation', () => {
    const result = assessRiskText({
        risk_title: 'Cybersecurity breach affecting the public portal',
        risk_description: 'Unauthorised access to a database'
    });

    assert.equal(result.likelihood, 4);
    assert.equal(result.impact, 5);
    assert.equal(result.score, 20);
    assert.equal(result.level, 'High');
    assert.equal(result.response, 'Treat');
    assert.equal(result.category, 'Operational');
    assert.match(result.explanation, /Likelihood 4/);
    assert.ok(result.matched_keywords.length > 0);
});

test('response rules use the policy treatment vocabulary and category appetite', () => {
    assert.equal(responseFor(5, 5), 'Terminate');
    assert.equal(responseFor(4, 2), 'Transfer');
    assert.equal(responseFor(1, 1), 'Tolerate');
    assert.equal(responseFor(3, 4), 'Treat');
    assert.equal(responseFor(1, 1, 'Reputational'), 'Treat');
});

test('explicit policy evidence selects the intended likelihood and consequence values', () => {
    assert.equal(likelihoodFromEvidence('The event is unlikely.').value, 2);
    assert.equal(likelihoodFromEvidence('The event is likely and recurring.').value, 4);
    assert.equal(impactFromEvidence('A major impact with national media coverage.').value, 4);
    assert.equal(impactFromEvidence('First aid only and no days lost.').value, 1);
});

test('official ERM categories and appetites are exposed to the assessment engine', () => {
    assert.deepEqual(RISK_CATEGORIES, [
        'Strategic',
        'Financial',
        'Operational',
        'Reputational',
        'Human Capital',
        'Regulatory Compliance',
        'Supervision'
    ]);
    assert.deepEqual(RISK_APPETITES['Regulatory Compliance'], { attitude: 'None', appetite: 'None' });
    assert.deepEqual(RISK_APPETITES.Strategic, { attitude: 'Open', appetite: 'High' });
});
