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

test('Template 3 splits one parent Risk ID across distinct risk events into traceable child IDs', () => {
    const templatePath = path.join(root,'frontend/templates/NCA_Official_Division_Risk_Register_Tracker_Upload_Template.xlsx');
    const workbook = XLSX.readFile(templatePath,{cellStyles:true});
    const sheet = workbook.Sheets['Risk Register'];
    [13,14,15].forEach((row,index) => {
        const values = {
            [`B${row}`]:'Shared resilience programme',
            [`C${row}`]:index === 0 ? 'IT-RSK-0042' : null,
            [`D${row}`]:`Distinct service risk ${index + 1}`,
            [`E${row}`]:`A distinct risk event ${index + 1} could interrupt service delivery.`,
            [`F${row}`]:'Operational',[`J${row}`]:new Date('2026-09-01T00:00:00Z'),
            [`K${row}`]:'Director, Information Technology',[`L${row}`]:3,[`M${row}`]:4,
            [`O${row}`]:'Treat',[`P${row}`]:'Implement and test resilience controls.',
            [`U${row}`]:new Date('2026-12-31T00:00:00Z')
        };
        Object.entries(values).forEach(([address,value]) => {
            if (value !== null) sheet[address] = {t:value instanceof Date?'d':typeof value==='number'?'n':'s',v:value};
        });
    });
    const parsed = parseRiskWorkbook('Shared Parent Division Tracker.xlsx',XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}).toString('base64'));

    assert.deepEqual(parsed.rows.map(row => row.data.risk_id),['IT-RSK-0042-01','IT-RSK-0042-02','IT-RSK-0042-03']);
    parsed.rows.forEach(row => {
        assert.equal(row.data.parent_risk_id,'IT-RSK-0042');
        assert.ok(row.corrections.some(correction => correction.field === 'risk_id' && /parent lineage/.test(correction.rule)));
    });
});

test('Template 3 creates division parent and child IDs for a merged programme with blank Risk IDs', () => {
    const templatePath = path.join(root,'frontend/templates/NCA_Official_Division_Risk_Register_Tracker_Upload_Template.xlsx');
    const workbook = XLSX.readFile(templatePath,{cellStyles:true});
    const sheet = workbook.Sheets['Risk Register'];
    [13,14,15,16].forEach((row,index) => {
        const values = {
            [`B${row}`]:index === 0 ? 'Automated Spectrum Management System expansion' : null,
            [`D${row}`]:null,
            [`E${row}`]:`Distinct Engineering risk event ${index + 1} affecting the programme.`,
            [`F${row}`]:'Operational',[`G${row}`]:index === 1 ? 'Cyber threat environment' : 'People and process',
            [`I${row}`]:`Distinct cause ${index + 1}`,[`J${row}`]:new Date('2026-09-01T00:00:00Z'),
            [`K${row}`]:'Director, Engineering',[`L${row}`]:4,[`M${row}`]:3,
            [`O${row}`]:'Treat',[`P${row}`]:'Implement and verify programme controls.',
            [`U${row}`]:new Date('2026-12-31T00:00:00Z')
        };
        Object.entries(values).forEach(([address,value]) => {
            if (value !== null) sheet[address] = {t:value instanceof Date?'d':typeof value==='number'?'n':'s',v:value};
        });
    });
    const parsed = parseRiskWorkbook('Engineering Updated.xlsx',XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}).toString('base64'),{division:'Engineering'});

    assert.deepEqual(parsed.rows.map(row => row.data.risk_id),[
        'ENGI-RSK-2026-001-01','ENGI-RSK-2026-001-02','ENGI-RSK-2026-001-03','ENGI-RSK-2026-001-04'
    ]);
    parsed.rows.forEach((row,index) => {
        assert.equal(row.data.parent_risk_id,'ENGI-RSK-2026-001');
        assert.equal(row.data.programme_project,'Automated Spectrum Management System expansion');
        assert.equal(row.original_data.risk_id,null);
        assert.ok(row.corrections.some(correction => correction.field === 'risk_id' && correction.proposed.endsWith(`-0${index + 1}`)));
    });
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
    assert.match(read('frontend/css/division-risk-workflow.css'),/\.workflow-main \.submit-bar\{position:static/);
});

test('Admin Template 3 uses the complete guided correction contract before submit-all', () => {
    const uploadPage = read('frontend/pages/admin-division-risk-uploads.html');
    const uploadScript = read('frontend/js/admin-division-risk-uploads.js');
    assert.match(uploadScript,/control_effectiveness:'Control Effectiveness'/);
    assert.match(uploadScript,/residual_likelihood:'Post-Mitigation Likelihood'/);
    assert.match(uploadScript,/data-edit=/);
    assert.match(uploadScript,/Why the system changed this row/);
    assert.match(uploadScript,/confidence_level/);
    assert.match(uploadScript,/validation_rule/);
    assert.match(uploadScript,/data-confirm-all/);
    assert.match(uploadScript,/row\.client_errors\?\.length === 0/);
    assert.match(uploadScript,/corrected_rows:item\.preview\.rows\.map/);
    assert.match(uploadPage,/Administrator Template 3 upload history/);
    assert.match(uploadPage,/id="uploadHistoryRows"/);
    assert.match(uploadScript,/\/risks\/admin-focal-submissions/);
    assert.match(uploadScript,/Possible repeat upload/);
    assert.match(uploadScript,/System suggested/);
    assert.match(uploadScript,/serverErrorStillApplies/);
    assert.match(uploadScript,/risk category.+CATEGORIES\.includes/is);
    assert.match(uploadScript,/render\(\{preserveView:true\}\)/);
    assert.match(uploadScript,/focus\(\{preventScroll:true\}\)/);
    assert.match(uploadScript,/workspace\.scrollTop = saved\.scrollTop/);
});
