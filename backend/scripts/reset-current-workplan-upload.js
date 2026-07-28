require('dotenv').config();
const pool = require('../config/db');

async function run() {
    const databaseName = String(process.env.DB_NAME || '');
    if (process.env.NODE_ENV === 'production' || !databaseName.toLowerCase().includes('test')) {
        throw new Error('Work-plan reset is restricted to a non-production test database.');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const uploads = (await client.query(`
            SELECT id, file_name, status, division, plan_year
            FROM workplan_uploads
            WHERE file_name='RIPS WORKPLAN 2026.xlsx'
              AND division='RIPS'
              AND plan_year=2026
            FOR UPDATE
        `)).rows;
        if (!uploads.length) {
            await client.query('COMMIT');
            return { uploads: [], deleted: { workplans: 0, risks: 0 } };
        }

        const uploadIds = uploads.map(row => String(row.id));
        const assessmentRows = (await client.query(`
            SELECT assessment.id::text AS assessment_id,
                   assessment.generated_risk_id::text AS risk_id,
                   assessment.generated_treatment_id::text AS treatment_id
            FROM workplan_programmes programme
            JOIN workplan_actions action ON action.programme_id=programme.id
            JOIN workplan_risk_assessments assessment ON assessment.action_id=action.id
            WHERE programme.upload_id::text=ANY($1::text[])
        `, [uploadIds])).rows;
        const assessmentIds = assessmentRows.map(row => row.assessment_id);
        const riskIds = [...new Set(assessmentRows.map(row => row.risk_id).filter(Boolean))];
        const treatmentIds = [...new Set(assessmentRows.map(row => row.treatment_id).filter(Boolean))];
        const riskCodes = riskIds.length ? (await client.query('SELECT risk_id FROM risks WHERE id::text=ANY($1::text[])', [riskIds])).rows.map(row => row.risk_id) : [];
        const workflowIds = riskIds.length ? (await client.query("SELECT id::text FROM workflow_instances WHERE subject_type='Risk' AND subject_id=ANY($1::text[])", [riskIds])).rows.map(row => row.id) : [];
        const actionIds = riskIds.length ? (await client.query(`
            SELECT id::text FROM actions
            WHERE (source_type IN ('Risk','RiskReview','WorkPlanRisk','CommitteeReview','RiskCorrection') AND source_id=ANY($1::text[]))
               OR (source_type IN('WorkPlanChampionBatch','WorkPlanCommitteeBatch') AND source_id=ANY($5::text[]))
               OR (source_type='TreatmentPlan' AND source_id=ANY($2::text[]))
               OR workflow_instance_id::text=ANY($3::text[])
               OR metadata->>'riskId'=ANY($4::text[])
               OR metadata->>'workplan_id'=ANY($5::text[])
               OR metadata->>'workplanId'=ANY($5::text[])
        `, [riskIds, treatmentIds, workflowIds, riskCodes, uploadIds])).rows.map(row => row.id) : [];

        const notifications = await client.query(`
            DELETE FROM notifications
            WHERE (entity_type='Risk' AND entity_id=ANY($1::text[]))
               OR (entity_type='Workflow' AND entity_id=ANY($2::text[]))
               OR (entity_type='Action' AND entity_id=ANY($3::text[]))
               OR (entity_type='WorkPlan' AND entity_id=ANY($4::text[]))
        `, [riskIds, workflowIds, actionIds, uploadIds]);
        const communications = await client.query(`
            DELETE FROM communication_logs
            WHERE (reference_type='Risk' AND reference_id=ANY($1::text[]))
               OR (reference_type='Workflow' AND reference_id=ANY($2::text[]))
               OR (reference_type='Action' AND reference_id=ANY($3::text[]))
        `, [riskIds, workflowIds, actionIds]);
        const audits = await client.query(`
            DELETE FROM audit_logs
            WHERE (entity_type='Risk' AND entity_id=ANY($1::text[]))
               OR (entity_type='Workflow' AND entity_id=ANY($2::text[]))
               OR (entity_type='Action' AND entity_id=ANY($3::text[]))
               OR (entity_type='WorkPlan' AND entity_id=ANY($4::text[]))
               OR (entity_type='WorkPlanAssessment' AND entity_id=ANY($5::text[]))
        `, [riskIds, workflowIds, actionIds, uploadIds, assessmentIds]);
        const actions = await client.query('DELETE FROM actions WHERE id::text=ANY($1::text[])', [actionIds]);
        const workflows = await client.query('DELETE FROM workflow_instances WHERE id::text=ANY($1::text[])', [workflowIds]);
        const risks = await client.query('DELETE FROM risks WHERE id::text=ANY($1::text[])', [riskIds]);
        const workplans = await client.query('DELETE FROM workplan_uploads WHERE id::text=ANY($1::text[])', [uploadIds]);
        await client.query('COMMIT');
        return {
            uploads,
            deleted: {
                workplans: workplans.rowCount,
                risks: risks.rowCount,
                workflows: workflows.rowCount,
                actions: actions.rowCount,
                notifications: notifications.rowCount,
                communication_logs: communications.rowCount,
                audit_logs: audits.rowCount
            }
        };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

run()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
