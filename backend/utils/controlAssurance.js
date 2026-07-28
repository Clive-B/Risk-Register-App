const CONTROL_EFFECTIVENESS = Object.freeze([
    'Effective',
    'Partially Effective',
    'Ineffective',
    'Not Assessed'
]);
const CONTROL_TYPES = Object.freeze([
    'Preventive',
    'Detective',
    'Corrective',
    'Mixed',
    'Not Assessed'
]);
const DESIGN_ADEQUACY = Object.freeze([
    'Adequate',
    'Partially Adequate',
    'Inadequate',
    'Not Assessed'
]);

function text(value) {
    return String(value || '').trim().toLowerCase();
}

function validDate(value) {
    return value && !Number.isNaN(Date.parse(value));
}

function assessControlAssurance(input = {}) {
    const controls = text(input.existing_controls);
    const evidence = text(input.control_evidence);
    const exceptions = text(input.control_exceptions);
    const design = String(input.control_design_adequacy || 'Not Assessed');
    const explicitAbsence = ['no control','no existing','none in place','absent','not implemented']
        .some(signal => controls.includes(signal));
    const failure = ['failed','ineffective','not operating','routinely bypassed','material weakness']
        .some(signal => `${controls} ${exceptions}`.includes(signal));
    const weakness = ['weak','inconsistent','gap','partially','outdated','inadequate','limited','exception']
        .some(signal => `${controls} ${exceptions}`.includes(signal));
    const operatingEvidence = ['tested','reviewed','audit','report','log','certificate','reconciliation','evidence']
        .some(signal => evidence.includes(signal));
    const hasTestDate = validDate(input.control_last_tested_date);

    if (explicitAbsence || failure || design === 'Inadequate') {
        return {
            rating: 'Ineffective',
            confidence: explicitAbsence || failure ? 'High' : 'Medium',
            basis: explicitAbsence
                ? 'The record states that no implemented control is operating.'
                : 'The control record identifies failure, material weakness, or inadequate design.'
        };
    }
    if (!controls || controls === 'no existing controls were documented in the tracking template.'
        || controls === 'no existing controls were documented in the uploaded work plan.') {
        return {
            rating: 'Not Assessed',
            confidence: 'High',
            basis: 'No assessable control description or operating evidence has been recorded.'
        };
    }
    if (weakness || design === 'Partially Adequate') {
        return {
            rating: 'Partially Effective',
            confidence: evidence || exceptions ? 'Medium' : 'Low',
            basis: 'Controls exist, but the record identifies design, coverage, consistency, or operating gaps.'
        };
    }
    if (design === 'Adequate' && evidence && hasTestDate && operatingEvidence && !exceptions) {
        return {
            rating: 'Effective',
            confidence: 'High',
            basis: 'The control is recorded as adequately designed and supported by dated operating evidence with no exceptions.'
        };
    }
    return {
        rating: 'Not Assessed',
        confidence: evidence || hasTestDate ? 'Medium' : 'Low',
        basis: 'Controls are described, but there is insufficient verified design and operating evidence for a defensible effectiveness conclusion.'
    };
}

function controlScoreConsistency({ effectiveness, inherentScore, currentScore }) {
    if (inherentScore === null || inherentScore === undefined || inherentScore === ''
        || currentScore === null || currentScore === undefined || currentScore === '') return null;
    const inherent = Number(inherentScore);
    const current = Number(currentScore);
    if (![inherent,current].every(Number.isFinite)) return null;
    if (effectiveness === 'Ineffective' && current < inherent) {
        return 'Current risk is lower than inherent risk despite an Ineffective control rating. Review the current assessment evidence.';
    }
    if (effectiveness === 'Effective' && current >= inherent) {
        return 'Controls are rated Effective but the current risk has not reduced. Confirm whether the rating or current assessment is correct.';
    }
    if (effectiveness === 'Not Assessed' && current < inherent) {
        return 'Current risk is lower than inherent risk without an assessed control conclusion. Record supporting control evidence.';
    }
    return null;
}

module.exports = {
    CONTROL_EFFECTIVENESS,
    CONTROL_TYPES,
    DESIGN_ADEQUACY,
    assessControlAssurance,
    controlScoreConsistency
};
