require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const apiBase = process.env.API_URL || 'http://127.0.0.1:3000/api';
const email = 'admin@nca.org.gh';

async function request(path, token = '', options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
            ...(options.body ? {'Content-Type':'application/json'} : {}),
            ...(token ? {Authorization:`Bearer ${token}`} : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json();
    if (!response.ok || payload.success !== true) {
        throw new Error(`${path} failed (${response.status}): ${payload.message || 'Unknown error'}`);
    }
    return payload;
}

async function run() {
    const password = String(process.env.TEST_USER_PASSWORD || '');
    const account = (await pool.query(
        'SELECT password_hash FROM users WHERE LOWER(email)=LOWER($1) AND role=$2',
        [email,'System Administrator']
    )).rows[0];
    if (!password || !account || !(await bcrypt.compare(password,account.password_hash))) {
        throw new Error('Configured administrator test credential does not match the stored account.');
    }
    const login = await request('/auth/login','',{method:'POST',body:{email,password}});
    const token = login.token;
    const [risks,treatments,kpis] = await Promise.all([
        request('/risks',token),
        request('/treatments',token),
        request('/executive-analytics/kpis',token)
    ]);
    const riskRows = risks.risks || [];
    const planRows = treatments.treatmentPlans || [];
    const firstRisk = riskRows[0] || {};
    const firstPlan = planRows[0] || {};
    ['control_effectiveness','control_type','control_design_adequacy']
        .forEach(field => assertField(firstRisk,field,'risk'));
    if (planRows.length) {
        ['control_effectiveness','control_type','control_design_adequacy']
            .forEach(field => assertField(firstPlan,field,'treatment'));
    }
    ['control_assurance_rate','unassessed_controls','high_risks_ineffective_controls','overdue_control_reviews']
        .forEach(field => assertField(kpis.kpis || {},field,'KPI'));
    await request('/auth/logout',token,{method:'POST'});
    console.log(JSON.stringify({
        verified:true,
        risks:riskRows.length,
        treatments:planRows.length,
        controlAssuranceKpis:true
    },null,2));
}

function assertField(record, field, source) {
    if (!Object.prototype.hasOwnProperty.call(record,field)) {
        throw new Error(`${source} response is missing ${field}.`);
    }
}

run()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
