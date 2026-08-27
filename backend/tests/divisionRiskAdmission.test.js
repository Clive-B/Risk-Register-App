const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const {parseRiskWorkbook} = require('../utils/riskWorkbook');

const root = path.resolve(__dirname,'../..');
const read = relative => fs.readFileSync(path.join(root,relative),'utf8');

test('approved division tracker has a clean downloadable Template 3 parsed by its own profile', () => {
    const templatePath = path.join(root,'frontend/templates/NCA_Official_Division_Risk_Register_Tracker_Upload_Template.xlsx');
    const workbook = XLSX.readFile(templatePath,{cellStyles:true});
    const sheet = workbook.Sheets['Risk Register'];
    const values = {
        A13:1,B13:'Annual administration programme',C13:'ADMIN-TEST-0001',D13:'Delivery delay',
        E13:'Delay may prevent the programme from reaching its approved target.',F13:'Operational',
        J13:new Date('2026-08-28T00:00:00Z'),K13:'Director, Administration',L13:3,M13:4,
        O13:'Treat',P13:'Track milestones and escalate blocked activities.',U13:new Date('2026-12-31T00:00:00Z')
    };
    Object.entries(values).forEach(([address,value]) => { sheet[address] = {t:value instanceof Date?'d':typeof value==='number'?'n':'s',v:value}; });
    const buffer = XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
    const parsed = parseRiskWorkbook('Division Tracker.xlsx',buffer.toString('base64'));
    assert.equal(parsed.template_type,'Division Risk Register Tracker');
    assert.equal(parsed.header_row,12);
    assert.equal(parsed.rows.length,1);
    assert.equal(parsed.rows[0].data.risk_id,'ADMIN-TEST-0001');
    assert.equal(parsed.rows[0].data.risk_owner,'Director, Administration');
});

test('Admin staging, Focal submission and Admin monitoring are separate governed endpoints', () => {
    const routes = read('backend/routes/risks.js');
    const controller = read('backend/controllers/riskController.js');
    const migration = read('backend/migrations/048_admin_division_risk_admission.sql');
    assert.match(routes,/admin-import-groups/);
    assert.match(routes,/focal-admission-batches\/:id\/submit/);
    assert.match(routes,/admin-focal-submissions/);
    assert.match(controller,/forceFocalReview:true/);
    assert.match(controller,/Only the assigned Focal Person may submit/);
    assert.match(migration,/accountable_focal_id/);
    assert.match(migration,/Awaiting Focal Review/);
});

test('role-specific pages expose one Admin submit-all and a read-only submission monitor', () => {
    const upload = read('frontend/pages/admin-division-risk-uploads.html');
    const focal = read('frontend/pages/focal-risk-admissions.html');
    const monitor = read('frontend/pages/admin-focal-submissions.html');
    const app = read('frontend/js/app.js');
    const sidebar = read('frontend/css/sidebar.css');
    assert.match(upload,/Send All to Focal Review/);
    assert.match(upload,/NCA_Official_Division_Risk_Register_Tracker_Upload_Template\.xlsx/);
    assert.match(focal,/Submit the complete division register/i);
    assert.match(monitor,/read-only oversight/i);
    assert.match(app,/adminDivisionRiskUploads: \[roles\.ADMIN\]/);
    assert.match(app,/focalRiskAdmissions: \[roles\.FOCAL\]/);
    assert.match(upload,/<main class="main workflow-main">/);
    assert.match(focal,/<main class="main workflow-main">/);
    assert.match(monitor,/<main class="main workflow-main">/);
    assert.match(sidebar,/\.main\.workflow-main\s*\{/);
    assert.match(sidebar,/\.workflow-main \.submit-bar/);
});
