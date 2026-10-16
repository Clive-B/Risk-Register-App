const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const root = path.resolve(__dirname, '..', '..');

test('official Template 3 exposes the approved risk-register admission fields', () => {
    const workbook = XLSX.readFile(path.join(root, 'frontend', 'templates', 'NCA_Official_Division_Risk_Register_Tracker_Upload_Template.xlsx'));
    const sheet = workbook.Sheets['Risk Register'];
    const headers = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 11 })[0];
    [
        'Program/Project',
        'Risk ID',
        'Risk Name',
        'Risk Description',
        'Risk Category',
        'Risk Source',
        'Risk Event',
        'Risk Cause',
        'Risk Response (Control)',
        'Mitigation Plan / Actions'
    ].forEach(header => assert.ok(headers.includes(header), `${header} is missing`));
});

test('work-plan admission never derives control effectiveness from risk level', () => {
    const source = fs.readFileSync(path.join(root, 'backend', 'controllers', 'workplanController.js'), 'utf8');
    assert.match(source, /'Not Assessed'/);
    assert.doesNotMatch(source, /risk_level\s*===\s*'Low'\s*\?\s*'Partially Effective'/);
});

test('consolidated register and treatment view expose the governed assurance record', () => {
    const riskPage = fs.readFileSync(path.join(root, 'frontend', 'pages', 'risks.html'), 'utf8');
    const riskScript = fs.readFileSync(path.join(root, 'frontend', 'js', 'risks.js'), 'utf8');
    const treatmentScript = fs.readFileSync(path.join(root, 'frontend', 'js', 'treatment.js'), 'utf8');
    assert.match(riskPage, /id="control_design_adequacy"/);
    assert.match(riskScript, /control_assessment_basis/);
    assert.match(treatmentScript, /Control assurance supporting this treatment/);
});

test('correction workspace safely hydrates newly governed fields during a rolling server refresh', () => {
    const riskScript = fs.readFileSync(path.join(root, 'frontend', 'js', 'risks.js'), 'utf8');
    assert.match(riskScript, /control_type:"Not Assessed"/);
    assert.match(riskScript, /control_design_adequacy:"Not Assessed"/);
    assert.match(riskScript, /control_effectiveness:"Not Assessed"/);
});

test('Champion treatment monitoring supports governed control reassessment', () => {
    const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'treatmentController.js'), 'utf8');
    const treatmentPage = fs.readFileSync(path.join(root, 'frontend', 'pages', 'treatment.html'), 'utf8');
    const treatmentScript = fs.readFileSync(path.join(root, 'frontend', 'js', 'treatment.js'), 'utf8');

    assert.match(controller, /Only the assigned Risk Champion may reassess control effectiveness/);
    assert.match(controller, /Control Assurance Reassessed/);
    assert.match(controller, /Record the reason for the control-effectiveness assessment/);
    assert.match(controller, /An Effective rating requires adequate design, dated operating evidence/);
    assert.match(controller, /score_consistency_warning/);
    assert.match(treatmentPage, /id="controlReassessmentSection"/);
    assert.match(treatmentPage, /Reason for the Effectiveness Rating/);
    assert.match(treatmentScript, /\["Risk Champion","System Administrator"\]\.includes\(currentUser\.role\)/);
    assert.match(treatmentScript, /control_reassessment:true/);
});

test('control reassessment updates assurance only and preserves governed risk scores', () => {
    const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'treatmentController.js'), 'utf8');
    const marker = controller.indexOf('control_effectiveness=$1');
    const start = controller.lastIndexOf('`UPDATE risks SET', marker);
    const end = controller.indexOf('`INSERT INTO risk_history(', marker);
    assert.ok(start >= 0 && end > start, 'control reassessment transaction was not found');
    const controlUpdate = controller.slice(start, end);
    assert.doesNotMatch(controlUpdate, /inherent_risk_score\s*=/);
    assert.doesNotMatch(controlUpdate, /current_risk_score\s*=/);
    assert.doesNotMatch(controlUpdate, /residual_risk_score\s*=/);
});
