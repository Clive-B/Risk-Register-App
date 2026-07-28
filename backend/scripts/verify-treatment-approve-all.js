require('dotenv').config();
const pool = require('../config/db');

async function main() {
    if (process.env.NODE_ENV === 'production') throw new Error('Treatment approval verification is disabled in production.');
    const password = process.env.TEST_USER_PASSWORD;
    if (!password) throw new Error('TEST_USER_PASSWORD is required.');
    let riskId;
    try {
        const user = (await pool.query(
            "SELECT id FROM users WHERE email='test.rips.champion@nca.org.gh' AND status='Active'"
        )).rows[0];
        if (!user) throw new Error('The RIPS Champion test user is unavailable.');
        const code = `TEST-TP-${Date.now()}`;
        const risk = (await pool.query(
            `INSERT INTO risks(
                risk_id,risk_title,risk_description,risk_category,directorate,division,risk_owner,
                likelihood,impact,inherent_risk_score,risk_level,existing_controls,control_effectiveness,
                risk_treatment,initial_mitigation_plan,responsible_officer,target_completion_date,
                status,workflow_status,treatment_status,created_by,assessment_year,entry_source,admission_status
             ) VALUES(
                $1,'Temporary treatment approval verification','Temporary verification risk.','Operational',
                'RIPS','RIPS','Test owner',2,2,4,'Low','Documented test control.','Effective',
                'Tolerate','Monitor the control.','Test owner',CURRENT_DATE+30,
                'Draft','Draft','Not Started',$2,2026,'Manual - Risk Champion','Draft'
             ) RETURNING id`,
            [code,user.id]
        )).rows[0];
        riskId = risk.id;
        const plan = (await pool.query(
            `INSERT INTO treatment_plans(
                risk_id,plan_title,treatment_strategy,action_owner,due_date,status,created_by,
                lifecycle_status,treatment_actions,system_improvements,approval_status
             ) VALUES(
                $1,'Temporary approval plan','Tolerate','Test owner',CURRENT_DATE+30,'Not Started',$2,
                'Focal Reviewed','Monitor and report.','Maintain controls and review evidence.','Pending Approval'
             ) RETURNING id`,
            [riskId,user.id]
        )).rows[0];

        const loginResponse = await fetch('http://127.0.0.1:3000/api/auth/login', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({email:'test.rips.champion@nca.org.gh',password})
        });
        const login = await loginResponse.json();
        if (!loginResponse.ok || !login.token) throw new Error(login.message || 'Champion login failed.');
        const response = await fetch('http://127.0.0.1:3000/api/treatments/approve-all', {
            method:'POST',
            headers:{Authorization:`Bearer ${login.token}`,'Content-Type':'application/json'},
            body:JSON.stringify({plan_ids:[plan.id],comments:''})
        });
        const result = await response.json();
        if (!response.ok || result.approvedCount !== 1) throw new Error(result.message || 'Approve All failed.');
        const approved = (await pool.query(
            'SELECT approval_status,approved_by,approved_at FROM treatment_plans WHERE id=$1',
            [plan.id]
        )).rows[0];
        if (approved.approval_status !== 'Approved' || Number(approved.approved_by) !== Number(user.id) || !approved.approved_at) {
            throw new Error('Approve All did not persist the Champion decision.');
        }
        console.log(JSON.stringify({approvedCount:result.approvedCount,divisionScope:'RIPS',persisted:true}, null, 2));
    } finally {
        if (riskId) await pool.query('DELETE FROM risks WHERE id=$1', [riskId]);
        await pool.query(
            "DELETE FROM audit_logs WHERE action='TREATMENT_PLANS_BULK_APPROVED' AND entity_type='Treatment Plan' AND details->>'count'='1' AND created_at > NOW()-INTERVAL '10 minutes'"
        );
        await pool.end();
    }
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
