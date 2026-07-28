require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
    if (process.env.NODE_ENV === 'production') throw new Error('Upload preview verification is disabled in production.');
    const password = process.env.TEST_USER_PASSWORD;
    if (!password) throw new Error('TEST_USER_PASSWORD is required.');
    const workbookPath = path.resolve(__dirname, '..', '..', 'Risk Register Tracking Template (1).xlsx');
    const fileData = fs.readFileSync(workbookPath).toString('base64');
    const loginResponse = await fetch('http://127.0.0.1:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test.rips.focal@nca.org.gh', password })
    });
    const login = await loginResponse.json();
    if (!loginResponse.ok || !login.token) throw new Error(login.message || 'Test login failed.');

    const previewResponse = await fetch('http://127.0.0.1:3000/api/risks/import/preview', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${login.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            file_name: path.basename(workbookPath),
            file_data: fileData
        })
    });
    const preview = await previewResponse.json();
    if (!previewResponse.ok) throw new Error(preview.message || 'Preview failed.');
    const rows = preview.preview?.rows || [];
    const proposals = rows.map(row => row.treatment_proposal).filter(Boolean);
    if (!rows.length || proposals.length !== rows.length) throw new Error('Not every risk received a treatment proposal.');
    if (proposals.some(item => !item.strategy || !item.system_improvements || !item.actions || !item.owner || !item.due_date)) {
        throw new Error('One or more treatment proposals are incomplete.');
    }
    const treatmentResponse = await fetch('http://127.0.0.1:3000/api/treatments', {
        headers: { Authorization: `Bearer ${login.token}` }
    });
    const treatmentData = await treatmentResponse.json();
    if (!treatmentResponse.ok) throw new Error(treatmentData.message || 'Treatment page API failed.');
    const visiblePlans = treatmentData.treatmentPlans || [];
    if (visiblePlans.some(plan => !plan.treatment_actions || !plan.system_improvements || !plan.lifecycle_status)) {
        throw new Error('The Treatment Plans page returned an incomplete structured plan.');
    }
    console.log(JSON.stringify({
        templateType: preview.preview.template_type,
        rows: rows.length,
        proposals: proposals.length,
        uploadedPlansRetained: proposals.filter(item => item.original_plan).length,
        treatmentPagePlans: visiblePlans.length,
        complete: true
    }, null, 2));
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
