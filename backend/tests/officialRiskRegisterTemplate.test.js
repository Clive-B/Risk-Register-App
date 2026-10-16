const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    OFFICIAL_RISK_REGISTER_TEMPLATE,
    requireOfficialRiskRegisterTemplate
} = require('../utils/officialRiskRegisterTemplate');

test('Template 3 is the sole official risk-register upload type', () => {
    const parsed = { template_type:'Division Risk Register Tracker' };
    assert.equal(OFFICIAL_RISK_REGISTER_TEMPLATE, parsed.template_type);
    assert.equal(requireOfficialRiskRegisterTemplate(parsed), parsed);
    ['Official Risk Register','Risk Register Tracking Template','Legal Legacy Risk Register'].forEach(template_type => {
        assert.throws(
            () => requireOfficialRiskRegisterTemplate({ template_type }),
            /Only the official Template 3 Division Risk Register Tracker is accepted/
        );
    });
});

test('every Focal and Administrator risk-register admission path enforces Template 3 server-side', () => {
    const controller = fs.readFileSync(path.resolve(__dirname,'../controllers/riskController.js'),'utf8');
    const calls = controller.match(/requireOfficialRiskRegisterTemplate\s*\(/g) || [];
    assert.equal(calls.length, 3);
});
