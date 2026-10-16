const OFFICIAL_RISK_REGISTER_TEMPLATE = 'Division Risk Register Tracker';

function requireOfficialRiskRegisterTemplate(parsed) {
    if (parsed?.template_type !== OFFICIAL_RISK_REGISTER_TEMPLATE) {
        throw Object.assign(
            new Error('Only the official Template 3 Division Risk Register Tracker is accepted for new risk-register uploads.'),
            { statusCode: 400 }
        );
    }
    return parsed;
}

module.exports = { OFFICIAL_RISK_REGISTER_TEMPLATE, requireOfficialRiskRegisterTemplate };
