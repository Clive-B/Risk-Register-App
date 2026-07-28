const {
    calculateRiskLevel,
    LIKELIHOOD_INTERPRETATION,
    IMPACT_INTERPRETATION,
    RISK_APPETITES
} = require('./riskMatrix');

const RULES_VERSION = 'ERM-2026.05';

function responseFor(impact, likelihood, category = '') {
    const score = Number(impact) * Number(likelihood);
    if (score === 25) return 'Terminate';
    if (['Reputational', 'Regulatory Compliance'].includes(category)) return 'Treat';
    if (score >= 11) return 'Treat';
    if (Number(impact) >= 4 && Number(likelihood) <= 2) return 'Transfer';
    if (score >= 6) return 'Treat';
    return 'Tolerate';
}

function uniqueMatches(source, pattern) {
    return [...new Set(source.match(pattern) || [])];
}

function evidenceRating(source, rules, fallback) {
    for (const rule of rules) {
        rule.pattern.lastIndex = 0;
        if (!rule.pattern.test(source)) continue;
        rule.pattern.lastIndex = 0;
        return { value: rule.value, evidence: uniqueMatches(source, rule.pattern) };
    }
    return { value: fallback, evidence: [] };
}

function likelihoodFromEvidence(source, fallback = 3) {
    return evidenceRating(source, [
        { value: 5, pattern:/almost certain|very likely|many times|regular occurrences?|occurs? regularly/g },
        { value: 4, pattern:/\blikely\b|frequent|recurring|repeated|record of past occurrences?|occurs? often/g },
        { value: 3, pattern:/\bpossible\b|occurred in the past|could happen again/g },
        { value: 2, pattern:/\bunlikely\b|not expected|slight possibility/g },
        { value: 1, pattern:/\brare\b|highly unlikely|exceptional circumstances?|very remote/g }
    ], fallback);
}

function impactFromEvidence(source, fallback = 3) {
    return evidenceRating(source, [
        { value: 5, pattern:/fatalit|permanent disabil|government inquiry|disastrous impact|catastrophic|unavailable for more than (?:one|1) day/g },
        { value: 4, pattern:/single death|serious injur|long-term illness|national media|major impact|unavailable for (?:one|1) day|prolonged outage/g },
        { value: 3, pattern:/hospitali[sz]|numerous days lost|public dissatisfaction|service provider dissatisfaction|regional media|significant impact|unavailable for less than (?:one|1) day/g },
        { value: 2, pattern:/medical treatment|some days lost|local media|minor impact|unavailable for several hours/g },
        { value: 1, pattern:/first aid|no days lost|negligible impact|day-to-day management|unavailable for less than (?:one|1) hour/g }
    ], fallback);
}

function assessRiskText(input = {}) {
    const source = [
        input.risk_title,
        input.risk_description,
        input.risk_source,
        input.risk_cause,
        input.programme_project,
        input.business_unit,
        input.existing_controls
    ].filter(Boolean).join(' ').toLowerCase();

    let likelihood = 3;
    let impact = 3;
    let category = input.risk_category || 'Operational';
    let matchedKeywords = [];

    const categoryRules = [
        { pattern:/health|safety|injury|hazard|emergency|occupational|workforce|staff welfare|training|succession|retention/g, likelihood:3, impact:4, category:'Human Capital' },
        { pattern:/reputation|public confidence|media|stakeholder trust|public perception/g, likelihood:3, impact:4, category:'Reputational' },
        { pattern:/legal|litigation|contract|statute|court|counsel|compliance|policy requirement|regulatory obligation/g, likelihood:3, impact:4, category:'Regulatory Compliance' },
        { pattern:/supervis\w*|license|service provider|telecom\w* industry|enforcement action|consumer protection/g, likelihood:3, impact:4, category:'Supervision' },
        { pattern:/cyber|security|privacy|breach|unauthori[sz]ed|malware|phishing|access control/g, likelihood:4, impact:5, category:'Operational' },
        { pattern:/portal|backend|interface|system testing|server|cloud|iot|open ran|digital infrastructure|data collection|software|database|business continuity/g, likelihood:4, impact:4, category:'Operational' },
        { pattern:/financial|budget|fund|cost|profitability|liquidity|solvency|financial report/g, likelihood:3, impact:4, category:'Financial' },
        { pattern:/strategy|strategic|objective|mandate|research|analysis|advis\w*|publication|corporate plan/g, likelihood:3, impact:3, category:'Strategic' }
    ];

    for (const rule of categoryRules) {
        rule.pattern.lastIndex = 0;
        if (!rule.pattern.test(source)) continue;
        rule.pattern.lastIndex = 0;
        matchedKeywords = uniqueMatches(source, rule.pattern);
        likelihood = rule.likelihood;
        impact = rule.impact;
        category = rule.category;
        break;
    }

    const likelihoodEvidence = likelihoodFromEvidence(source, likelihood);
    const impactEvidence = impactFromEvidence(source, impact);
    likelihood = likelihoodEvidence.value;
    impact = impactEvidence.value;
    matchedKeywords = [...new Set([...matchedKeywords, ...likelihoodEvidence.evidence, ...impactEvidence.evidence])];

    const score = likelihood * impact;
    const level = calculateRiskLevel(score);
    const response = responseFor(impact, likelihood, category);
    const appetite = RISK_APPETITES[category] || RISK_APPETITES.Operational;
    const confidence = likelihoodEvidence.evidence.length && impactEvidence.evidence.length
        ? 'High'
        : matchedKeywords.length ? 'Medium' : 'Low';
    const basis = matchedKeywords.length
        ? `ERM evidence matched ${matchedKeywords.map(keyword => `“${keyword}”`).join(', ')}, selecting the ${category} criteria.`
        : `The source did not contain explicit ERM likelihood or consequence evidence, so the ${category} policy baseline was used and requires human review.`;

    return {
        likelihood,
        impact,
        score,
        level,
        response,
        category,
        matched_keywords: matchedKeywords,
        rules_version: RULES_VERSION,
        confidence,
        appetite,
        explanation: `${basis} Likelihood ${likelihood} (${LIKELIHOOD_INTERPRETATION[likelihood]}) × consequence ${impact} (${IMPACT_INTERPRETATION[impact]}) = ${score}, producing a ${level} rating under the ERM bands (Low 1–10, Medium 11–16, High 17–25). The category appetite is ${appetite.appetite} (${appetite.attitude}) and the system suggests ${response}; the authorised reviewer makes the treatment decision. Rules version ${RULES_VERSION}.`
    };
}

module.exports = {
    RULES_VERSION,
    assessRiskText,
    responseFor,
    likelihoodFromEvidence,
    impactFromEvidence
};
