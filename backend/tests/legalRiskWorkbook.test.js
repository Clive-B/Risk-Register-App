const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const { parseRiskWorkbook } = require('../utils/riskWorkbook');
const { buildWorkbookCorrectionProposal } = require('../utils/workbookCorrectionEngine');

const projectRoot = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(projectRoot, 'RISK REGISTER LEGAL July 2026.xlsx');
const templatePath = path.join(projectRoot, 'frontend', 'templates', 'NCA_Official_Risk_Register_Template_2.xlsx');

function parseFile(filePath) {
    return parseRiskWorkbook(path.basename(filePath), fs.readFileSync(filePath).toString('base64'));
}

test('Legal legacy register is recognized and continuation rows are consolidated into seven risks', () => {
    const parsed = parseFile(sourcePath);

    assert.equal(parsed.template_type, 'Legal Legacy Risk Register');
    assert.equal(parsed.sheet_name, 'Legal Div');
    assert.equal(parsed.header_row, 1);
    assert.equal(parsed.rows.length, 7);
    assert.deepEqual(parsed.rows.map(row => row.excel_row), [2, 4, 6, 7, 9, 10, 11]);
    assert.equal(new Set(parsed.rows.map(row => row.data.risk_id)).size, 7);
    parsed.rows.forEach(row => assert.match(row.data.risk_id, /^LEGAL-RSK-2026-\d{4}$/));

    assert.match(parsed.rows[0].data.risk_source, /Indebtedness of IWCL/i);
    assert.match(parsed.rows[0].data.risk_cause, /Absence of provision in the licence/i);
});

test('Legal workbook spelling corrections are explainable and retain their governed audit structure', () => {
    const parsed = parseFile(sourcePath);
    const spelling = parsed.rows
        .flatMap(row => row.corrections)
        .find(item => item.field === 'programme_project');

    assert.ok(spelling);
    assert.match(spelling.original, /Qaulity/i);
    assert.match(spelling.proposed, /Quality/i);
    assert.match(spelling.reason, /original wording remains in the audit record/i);
});

test('Legal register correction proposal generates editable assessment and treatment suggestions', () => {
    const parsed = parseFile(sourcePath);
    const row = parsed.rows[0];
    const result = buildWorkbookCorrectionProposal({ row, risk:row.data });

    [
        'likelihood', 'impact', 'current_likelihood', 'current_impact',
        'residual_likelihood', 'residual_impact'
    ].forEach(field => assert.ok(Number(result.values[field]) >= 1 && Number(result.values[field]) <= 5));
    assert.ok(result.values.initial_mitigation_plan);
    assert.ok(result.values.responsible_officer);
    assert.match(String(result.values.target_completion_date), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(result.values.risk_treatment, null);

    const responseRule = result.corrections.find(item => item.rule_id === 'RESPONSE-USER-SELECTION');
    assert.ok(responseRule);
    assert.equal(responseRule.editable_value, true);
    assert.ok(responseRule.detection_rule);
    assert.ok(responseRule.explanation);
    assert.ok(responseRule.confidence_level);
    assert.ok(responseRule.validation_rule);
    assert.ok(responseRule.audit_record);
});

test('downloadable governed Legal template contains formulas and parses through the same profile', () => {
    assert.equal(fs.existsSync(templatePath), true);
    const workbook = XLSX.readFile(templatePath, { cellFormula:true });
    assert.deepEqual(workbook.SheetNames, ['Approved Values', 'Instructions', 'Legal Risk Register']);

    const sheet = workbook.Sheets['Legal Risk Register'];
    assert.equal(sheet.N2.f, 'IF(OR(L2="",M2=""),"",L2*M2)');
    assert.equal(sheet.Q2.f, 'IF(OR(O2="",P2=""),"",O2*P2)');
    assert.equal(sheet.T2.f, 'IF(OR(R2="",S2=""),"",R2*S2)');

    sheet.B2 = { t:'s', v:'Review Legal agreements' };
    sheet.C2 = { t:'s', v:'Operational' };
    sheet.D2 = { t:'s', v:'Legal advice may be delayed and affect regulatory decisions.' };
    sheet.E2 = { t:'s', v:'Late submission of requests' };
    sheet.F2 = { t:'s', v:'Delayed legal advice' };
    sheet.G2 = { t:'s', v:'Incomplete supporting documents' };
    sheet.H2 = { t:'s', v:'Legal review checklist' };
    sheet.I2 = { t:'s', v:'Director Legal' };
    sheet.J2 = { t:'s', v:'Head, Legal Advisory' };
    sheet.K2 = { t:'n', v:3 };
    sheet.L2 = { t:'n', v:3 };
    const sample = XLSX.write(workbook, { type:'buffer', bookType:'xlsx' });
    const parsed = parseRiskWorkbook(path.basename(templatePath), sample.toString('base64'));
    assert.equal(parsed.template_type, 'Legal Legacy Risk Register');
    assert.equal(parsed.rows.length, 1);
});

test('Focal Person page exposes the governed Legal template download', () => {
    const html = fs.readFileSync(path.join(projectRoot, 'frontend', 'pages', 'risks.html'), 'utf8');
    assert.match(html, /NCA_Official_Risk_Register_Template_2\.xlsx/);
    assert.match(html, /NCA Official Risk Register Template 2/i);
    assert.match(html, />Upload Risk Register</i);
});
