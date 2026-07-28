const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const page = fs.readFileSync(path.join(root, 'frontend/pages/treatment.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'frontend/js/treatment.js'), 'utf8');
const stylesheet = fs.readFileSync(path.join(root, 'frontend/css/treatment.css'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'backend/controllers/treatmentController.js'), 'utf8');

test('every treatment row exposes a separate read-only View action before Edit', () => {
    const viewPosition = script.indexOf('data-action="view"');
    const editPosition = script.indexOf('data-action="edit"');
    assert.ok(viewPosition >= 0);
    assert.ok(editPosition > viewPosition);
    assert.match(script, /if \(button\.dataset\.action === "view"\)/);
    assert.match(script, /openTreatmentView\(button\.dataset\.id\)/);
});

test('the governed treatment view is an explicit NCA dialog with close controls', () => {
    assert.match(page, /<dialog id="treatmentViewDialog"/);
    assert.match(page, /id="closeTreatmentViewIcon"/);
    assert.match(page, /id="closeTreatmentView"/);
    assert.match(page, /Read-only governed view/);
    assert.match(stylesheet, /\.treatment-view-accent/);
    assert.match(stylesheet, /linear-gradient\(90deg,#0067b9/);
    assert.match(stylesheet, /\.treatment-view-dialog\[open\]\s*\{[^}]*display:flex;[^}]*flex-direction:column;/s);
    assert.match(stylesheet, /\.treatment-view-body\s*\{[^}]*flex:1 1 auto;[^}]*min-height:0;/s);
    assert.match(stylesheet, /\.treatment-view-footer\s*\{[^}]*flex:0 0 auto;/s);
});

test('the read-only view presents treatment, evidence and governance data without invoking an update', () => {
    const start = script.indexOf('function openTreatmentView');
    const end = script.indexOf('function closeTreatmentView', start);
    const viewFunction = script.slice(start, end);
    assert.match(viewFunction, /Current treatment actions/);
    assert.match(viewFunction, /Original uploaded treatment/);
    assert.match(viewFunction, /System-suggested improvements/);
    assert.match(viewFunction, /Monitoring and evidence/);
    assert.match(viewFunction, /Governance decisions/);
    assert.doesNotMatch(viewFunction, /apiRequest|method:\s*"PUT"|saveTreatmentPlan/);
    assert.match(controller, /focal_reviewed_by_name/);
    assert.match(controller, /champion_approved_by_name/);
    assert.match(controller, /committee_approved_by_name/);
});
