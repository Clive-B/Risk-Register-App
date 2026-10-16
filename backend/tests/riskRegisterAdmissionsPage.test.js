const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'../..');
const read = relative => fs.readFileSync(path.join(root,relative),'utf8');

test('dedicated Risk Register page exposes both governed templates and correction workspace',() => {
    const page = read('frontend/pages/risk-register.html');
    assert.match(page,/NCA Official Risk Register Template<\/h2>/);
    assert.match(page,/NCA Official Risk Register Template 2/);
    assert.match(page,/NCA_Official_Risk_Register_Upload_Template\.xlsx/);
    assert.match(page,/NCA_Official_Risk_Register_Template_2\.xlsx/);
    assert.match(page,/data-upload-engine="standard"/);
    assert.match(page,/data-upload-engine="legal"/);
    assert.match(page,/id="correctionWorkspace"/);
    assert.match(page,/id="confirmAllCorrections"/);
    assert.match(page,/Open Consolidated Risk Register/);
});

test('risk admission engine previews, corrects and imports through governed endpoints',() => {
    const script = read('frontend/js/risk-register.js');
    assert.match(script,/\/risks\/import\/preview/);
    assert.match(script,/\/risks\/import"/);
    assert.match(script,/corrected_rows/);
    assert.match(script,/control_effectiveness/);
    assert.match(script,/detection_rule/);
    assert.match(script,/confidence_level/);
    assert.match(script,/validation_rule/);
    assert.match(script,/audit_record/);
    assert.match(script,/validRows\.forEach\(row => \{ row\.confirmed = true; \}\)/);
    assert.match(script,/Resolve \$\{issueCount\} Failed Correction/);
    assert.match(script,/serverErrorStillApplies/);
    assert.match(script,/risk category.+CATEGORIES\.includes/is);
    assert.match(script,/renderCorrectionWorkspace\(state\.preview,\{preserveView:true\}\)/);
    assert.match(script,/focus\(\{preventScroll:true\}\)/);
    assert.match(script,/System suggested/);
});

test('Risk Register navigation is focal-only and consolidated upload button is absent',() => {
    const app = read('frontend/js/app.js');
    const consolidated = read('frontend/pages/risks.html');
    const script = read('frontend/js/risks.js');
    const styles = read('frontend/css/risks.css');
    assert.match(app,/riskRegister:\s*\[roles\.FOCAL\]/);
    assert.match(app,/\["Risk Register",\s*"pages\/risk-register\.html",\s*"riskRegister"\]/);
    assert.match(app,/file === "risk-register\.html"\) return "riskRegister"/);
    assert.doesNotMatch(consolidated,/id="importRiskBtn"/);
    assert.match(script,/data-action="edit" data-id="\$\{risk\.id\}"/);
    assert.match(script,/window\.NCAGRC\.riskMatrix\.calculateLevel\(score\)/);
    assert.doesNotMatch(script,/return app\.riskMatrix\.calculateLevel\(score\)/);
    assert.match(script,/document\.body\.classList\.add\("modal-open"\)/);
    assert.match(styles,/\.modal\{[\s\S]*z-index:12050/);
    assert.match(consolidated,/id="risk_source"/);
    assert.match(consolidated,/id="risk_cause"/);
    assert.match(script,/risk_source: fields\.risk_source\.value\.trim\(\)/);
    assert.match(script,/risk_cause: fields\.risk_cause\.value\.trim\(\)/);
    assert.match(consolidated,/id="riskHistoryDialog"/);
    assert.match(consolidated,/id="riskAttachmentsDialog"/);
    assert.match(consolidated,/id="riskAttachmentInput"/);
    assert.doesNotMatch(script,/window\.alert/);
    assert.match(script,/riskHistoryDialog\.showModal\(\)/);
    assert.match(script,/riskAttachmentsDialog\.showModal\(\)/);
    assert.match(script,/uploadRiskAttachment/);
});
