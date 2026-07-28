require('dotenv').config();
const bcrypt=require('bcrypt');
const pool=require('../config/db');

const apiBase='http://127.0.0.1:3000/api';
const email='test.admin@nca.org.gh';

async function request(path,{token,method='GET',body}={}) {
    const response=await fetch(`${apiBase}${path}`,{
        method,
        headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
        body:body===undefined?undefined:JSON.stringify(body)
    });
    const payload=await response.json();
    if(!response.ok||payload.success===false) throw new Error(`${method} ${path}: ${payload.message||response.status}`);
    return payload;
}

async function verify() {
    const password=String(process.env.TEST_USER_PASSWORD||'');
    if(!password) throw new Error('TEST_USER_PASSWORD is not configured.');
    const accountResult=await pool.query(`SELECT id,email,role,status,must_change_password,password_hash
        FROM users WHERE LOWER(email)=LOWER($1)`,[email]);
    const account=accountResult.rows[0];
    if(!account) throw new Error('Test administrator account was not found.');
    if(!await bcrypt.compare(password,account.password_hash)) throw new Error('Configured test administrator password does not match the stored credential.');
    const originalResult=await pool.query(`SELECT layout,hidden_widgets,default_dashboard
        FROM executive_dashboard_preferences WHERE user_id=$1`,[account.id]);
    const original=originalResult.rows[0]||null;
    let token;
    try {
        const login=await request('/auth/login',{method:'POST',body:{email,password}});
        token=login.token;
        if(login.mustChangePassword) throw new Error('Administrator account unexpectedly requires a password change.');
        const before=await request('/executive-analytics/preferences',{token});
        const probe={
            layout:['risk-trends','heatmap','scorecard','ai-insights'],
            hiddenWidgets:['ai-insights'],
            defaultDashboard:'Board'
        };
        await request('/executive-analytics/preferences',{token,method:'PUT',body:probe});
        const saved=await request('/executive-analytics/preferences',{token});
        if(saved.preferences.default_dashboard!=='Board'||!saved.preferences.hidden_widgets.includes('ai-insights')) {
            throw new Error('Saved dashboard preferences were not returned correctly.');
        }
        if(original) {
            await request('/executive-analytics/preferences',{token,method:'PUT',body:{
                layout:original.layout||[],
                hiddenWidgets:original.hidden_widgets||[],
                defaultDashboard:original.default_dashboard||'Executive'
            }});
        } else {
            await request('/executive-analytics/preferences',{token,method:'DELETE'});
        }
        console.log(JSON.stringify({
            valid:true,
            account:{email:account.email,role:account.role,status:account.status,mustChangePassword:account.must_change_password},
            retrieved:true,savedAndReadBack:true,originalStateRestored:true,
            closeControlsVerifiedByAutomatedTest:true,
            initialPreference:before.preferences.default_dashboard
        },null,2));
    } finally {
        if(token) await request('/auth/logout',{token,method:'POST'}).catch(()=>{});
        await pool.end();
    }
}

verify().catch(error=>{console.error(error.message);process.exitCode=1;pool.end().catch(()=>{});});
