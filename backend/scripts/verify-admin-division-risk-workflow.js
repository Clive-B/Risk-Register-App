require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const pool = require('../config/db');

const apiBase = process.env.API_URL || 'http://127.0.0.1:3000/api';
const password = process.env.WORKFLOW_TEST_PASSWORD;
let groupId = null;
let batchId = null;

async function request(route,{token,method='GET',body}={}) {
    const response = await fetch(`${apiBase}${route}`,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
    const payload = await response.json().catch(()=>({}));
    if (!response.ok || payload.success !== true) throw new Error(`${route} (${response.status}): ${payload.message || 'Request failed'}`);
    return payload;
}

function workbookData() {
    const template = path.resolve(__dirname,'../../frontend/templates/NCA_Official_Division_Risk_Register_Tracker_Upload_Template.xlsx');
    const workbook = XLSX.readFile(template);
    const sheet = workbook.Sheets['Risk Register'];
    const suffix = Date.now().toString().slice(-8);
    const cells = {A13:1,B13:'Governed workflow verification',C13:`IT-VERIFY-${suffix}`,D13:'Verification delivery risk',E13:'A controlled verification delay may affect a test milestone.',F13:'Operational',J13:new Date(),K13:'Director, Information Technology',L13:2,M13:3,O13:'Treat',P13:'Monitor the verification milestone and escalate exceptions.',U13:new Date(Date.now()+30*86400000)};
    Object.entries(cells).forEach(([address,value])=>{sheet[address]={t:value instanceof Date?'d':typeof value==='number'?'n':'s',v:value};});
    return XLSX.write(workbook,{type:'base64',bookType:'xlsx'});
}

async function run() {
    if (!password) throw new Error('WORKFLOW_TEST_PASSWORD is required.');
    const admin = await request('/auth/login',{method:'POST',body:{email:'admin@nca.org.gh',password}});
    const options = await request('/risks/admin-import-options',{token:admin.token});
    const focal = options.focals.find(item=>item.division==='Information Technology');
    if (!focal) throw new Error('No active Information Technology Focal Person is available.');
    const fileData = workbookData();
    const preview = await request('/risks/import/preview',{token:admin.token,method:'POST',body:{division:focal.division,focal_user_id:focal.id,file_name:'Workflow Verification.xlsx',file_data:fileData}});
    if (preview.preview.rows.length !== 1) throw new Error('Expected exactly one verification risk.');
    const row = preview.preview.rows[0];
    const staged = await request('/risks/admin-import-groups',{token:admin.token,method:'POST',body:{items:[{division:focal.division,focal_user_id:focal.id,file_name:'Workflow Verification.xlsx',file_data:fileData,corrected_rows:[{excel_row:row.excel_row,confirmed:true,values:row.proposed_correction.values}]}]}});
    groupId = staged.group_id;
    batchId = staged.batches[0].id;
    const focalLogin = await request('/auth/login',{method:'POST',body:{email:focal.email,password}});
    const admissions = await request('/risks/focal-admission-batches',{token:focalLogin.token});
    const batch = admissions.batches.find(item=>String(item.id)===String(batchId));
    if (!batch || batch.risks.length !== 1) throw new Error('The staged register was not visible to its assigned Focal Person.');
    const risk = batch.risks[0];
    await request(`/risks/focal-admission-batches/${batchId}/submit`,{token:focalLogin.token,method:'POST',body:{assessments:[{risk_id:risk.id,likelihood:risk.system_likelihood,impact:risk.system_impact,reason:''}]}});
    const monitor = await request('/risks/admin-focal-submissions',{token:admin.token});
    const monitored = monitor.batches.find(item=>String(item.id)===String(batchId));
    if (!monitored || monitored.status !== 'Champion Review' || monitored.awaiting_champion !== 1) throw new Error('Admin monitoring did not reflect the Focal submission.');
    console.log(JSON.stringify({verified:true,template:preview.preview.template_type,adminStaging:true,focalSubmission:true,adminMonitoring:true},null,2));
}

async function cleanup() {
    if (!batchId) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM actions WHERE source_type IN('RiskRegisterFocalReview','RiskReview','ConsolidatedRiskAssessment') AND (source_id=$1 OR source_id IN(SELECT id::text FROM risks WHERE import_batch_id=$2))`,[String(batchId),batchId]);
        await client.query('DELETE FROM notifications WHERE entity_type IN(\'Risk Register Import\',\'Risk\') AND (entity_id=$1 OR entity_id IN(SELECT id::text FROM risks WHERE import_batch_id=$2))',[String(batchId),batchId]);
        await client.query('DELETE FROM risks WHERE import_batch_id=$1',[batchId]);
        await client.query('DELETE FROM risk_register_import_batches WHERE id=$1',[batchId]);
        if (groupId) await client.query('DELETE FROM risk_register_admin_upload_groups WHERE id=$1',[groupId]);
        await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

run().then(cleanup).catch(async error=>{console.error(error.message);try{await cleanup()}catch(cleanupError){console.error(`Cleanup failed: ${cleanupError.message}`)}process.exitCode=1}).finally(()=>pool.end());
