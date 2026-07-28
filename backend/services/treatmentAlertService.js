const pool = require('../config/db');
const { createNotification } = require('./notificationService');
const { createAction } = require('./actionService');

let running = false;
let alertTimer = null;

function expectedProgress(createdAt, dueDate) {
    const start = new Date(createdAt).getTime();
    const end = new Date(dueDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return Math.max(0, Math.min(100, Math.round(((Date.now() - start) / (end - start)) * 100)));
}

function deriveAlert(plan) {
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(plan.due_date); due.setHours(0,0,0,0);
    const days = Math.ceil((due - today) / 86400000);
    const expected = expectedProgress(plan.created_at, plan.due_date);
    if (days < 0) return { code:'OVERDUE', severity:'Critical', message:`Treatment is ${Math.abs(days)} day(s) overdue at ${plan.progress_percent}% completion.` };
    if (days <= 7) return { code:'DUE_SOON', severity:'High', message:`Treatment is due in ${days} day(s) and is ${plan.progress_percent}% complete.` };
    if (expected >= 25 && Number(plan.progress_percent) + 15 < expected) return { code:'BEHIND_SCHEDULE', severity:'High', message:`Treatment progress is ${plan.progress_percent}%; expected progress is approximately ${expected}%.` };
    const staleDays = Math.floor((Date.now() - new Date(plan.updated_at).getTime()) / 86400000);
    if (staleDays >= 14) return { code:'UPDATE_OVERDUE', severity:'High', message:`No treatment progress update has been recorded for ${staleDays} days.` };
    return null;
}

async function run() {
    if (running) return;
    running = true;
    try {
        const plans = (await pool.query(`SELECT tp.*,r.risk_id risk_code,r.risk_title,r.risk_level,r.division,r.directorate FROM treatment_plans tp JOIN risks r ON r.id=tp.risk_id WHERE tp.status<>'Completed' AND tp.progress_percent<100`)).rows;
        for (const plan of plans) {
            const alert = deriveAlert(plan);
            if (!alert) continue;
            const inserted = await pool.query(`INSERT INTO treatment_alerts(treatment_plan_id,alert_code,severity,message) VALUES($1,$2,$3,$4) ON CONFLICT(treatment_plan_id,alert_code,alert_date) DO NOTHING RETURNING id`,[plan.id,alert.code,alert.severity,alert.message]);
            if (!inserted.rowCount) continue;
            const division=plan.division||plan.directorate;
            const users=(await pool.query(`SELECT id,email,role FROM users WHERE status='Active' AND ((role='Risk Champion' AND COALESCE(NULLIF(division,''),directorate)=$1) OR (role='Risk Committee Chairman' AND $2='High'))`,[division,plan.risk_level])).rows;
            for (const user of users) {
                const title=`Treatment alert: ${plan.risk_code}`;
                const message=`${plan.plan_title}: ${alert.message}`;
                await createNotification({actor:{id:null,role:'System Administrator'},userId:user.id,title,message,type:'Alert',category:'Treatment',priority:alert.severity,entityType:'TreatmentPlan',entityId:plan.id,systemGenerated:true});
                await createAction({actionKey:`treatment-alert:${plan.id}:${alert.code}:${user.id}`,module:'Treatment',actionType:'Treatment Alert',title,description:message,priority:alert.severity==='Critical'?'Critical':'High',status:alert.code==='OVERDUE'?'Escalated':'Pending',assignedTo:user.id,division,dueAt:plan.due_date,sourceType:'TreatmentPlan',sourceId:plan.id,actionUrl:'pages/treatment.html',availableActions:['view','follow-up'],notificationEnabled:false,metadata:{alert_code:alert.code,risk_id:plan.risk_id}});
            }
        }
    } catch (error) {
        console.error('[treatmentAlertService]', error.message);
    } finally { running = false; }
}

function start() {
    if (alertTimer) return;
    alertTimer = setInterval(run, 60 * 60 * 1000);
    if (alertTimer.unref) alertTimer.unref();
    setTimeout(run, 5000);
}

module.exports = { run, start, deriveAlert };
