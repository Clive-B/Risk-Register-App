const CHAIRMAN_ROLE = 'Risk Committee Chairman';

const FOCAL_ASSESSMENT_FIELDS = [
    'focal_category',
    'focal_likelihood',
    'focal_impact',
    'focal_score',
    'focal_reason',
    'focal_by',
    'focal_at',
    'focal_review_history',
    'champion_focal_decision'
];

function redactFocalAssessment(record, role) {
    if (role !== CHAIRMAN_ROLE || !record) return record;
    const visible = { ...record };
    FOCAL_ASSESSMENT_FIELDS.forEach(field => delete visible[field]);
    return visible;
}

function redactFocalAssessments(records, role) {
    return (records || []).map(record => redactFocalAssessment(record, role));
}

function redactRiskHistory(records, role) {
    if (role !== CHAIRMAN_ROLE) return records || [];
    return (records || [])
        .filter(record => record.action !== 'Focal Assessment Submitted')
        .map(record => {
            if (!String(record.action || '').startsWith('Focal Challenge ')) return record;
            const visible = { ...record, action: 'Champion Assessment Recorded' };
            if (visible.details && typeof visible.details === 'object') {
                visible.details = { ...visible.details };
                delete visible.details.focal;
                delete visible.details.focal_challenge;
            }
            return visible;
        });
}

module.exports = {
    FOCAL_ASSESSMENT_FIELDS,
    redactFocalAssessment,
    redactFocalAssessments,
    redactRiskHistory
};
