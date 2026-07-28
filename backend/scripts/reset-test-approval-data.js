require('dotenv').config();
const pool = require('../config/db');

async function resetTestApprovalData() {
    const databaseName = String(process.env.DB_NAME || '');
    if (process.env.NODE_ENV === 'production' || !databaseName.toLowerCase().includes('test')) {
        throw new Error('Approval-data reset is restricted to a non-production test database.');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const risks = (await client.query(
            'SELECT id::text,risk_id,risk_title,entry_source FROM risks ORDER BY id FOR UPDATE'
        )).rows;
        const riskIds = risks.map(risk => risk.id);
        const riskCodes = risks.map(risk => risk.risk_id);
        const treatmentIds = (await client.query(
            'SELECT id::text FROM treatment_plans ORDER BY id FOR UPDATE'
        )).rows.map(row => row.id);
        const workflowIds = (await client.query(
            'SELECT id::text FROM workflow_instances ORDER BY id FOR UPDATE'
        )).rows.map(row => row.id);
        const actionIds = (await client.query(
            'SELECT id::text FROM actions ORDER BY id FOR UPDATE'
        )).rows.map(row => row.id);
        const batchIds = (await client.query(
            'SELECT id::text FROM risk_register_import_batches ORDER BY id FOR UPDATE'
        )).rows.map(row => row.id);

        const notifications = await client.query(
            `DELETE FROM notifications
             WHERE (entity_type='Risk' AND entity_id=ANY($1::text[]))
                OR (entity_type='Workflow' AND entity_id=ANY($2::text[]))
                OR (entity_type='Action' AND entity_id=ANY($3::text[]))
                OR (entity_type IN('Treatment Plan','TreatmentPlan') AND entity_id=ANY($4::text[]))
                OR (entity_type IN('Risk Register Import','Risk Register Import Batch') AND entity_id=ANY($5::text[]))`,
            [riskIds, workflowIds, actionIds, treatmentIds, batchIds]
        );
        const communications = await client.query(
            `DELETE FROM communication_logs
             WHERE (reference_type='Risk' AND reference_id=ANY($1::text[]))
                OR (reference_type='Workflow' AND reference_id=ANY($2::text[]))
                OR (reference_type='Action' AND reference_id=ANY($3::text[]))
                OR (reference_type IN('Treatment Plan','TreatmentPlan') AND reference_id=ANY($4::text[]))`,
            [riskIds, workflowIds, actionIds, treatmentIds]
        );
        const audits = await client.query(
            `DELETE FROM audit_logs
             WHERE (entity_type='Risk' AND entity_id=ANY($1::text[]))
                OR (entity_type='Workflow' AND entity_id=ANY($2::text[]))
                OR (entity_type='Action' AND entity_id=ANY($3::text[]))
                OR (entity_type IN('Treatment Plan','TreatmentPlan') AND entity_id=ANY($4::text[]))
                OR entity_type IN('Risk Import','Risk Register Import','Risk Register Import Batch')`,
            [riskIds, workflowIds, actionIds, treatmentIds]
        );

        const deletedActions = await client.query('DELETE FROM actions');
        const deletedWorkflows = await client.query('DELETE FROM workflow_instances');
        const deletedRisks = await client.query('DELETE FROM risks');
        const deletedBatches = await client.query('DELETE FROM risk_register_import_batches');

        await client.query(
            `UPDATE workplan_risk_assessments
             SET generated_risk_id=NULL,generated_treatment_id=NULL
             WHERE generated_risk_id IS NOT NULL OR generated_treatment_id IS NOT NULL`
        );

        await client.query('COMMIT');
        return {
            database: databaseName,
            removedRisks: risks,
            deleted: {
                risks: deletedRisks.rowCount,
                treatmentPlans: treatmentIds.length,
                riskRegisterBatches: deletedBatches.rowCount,
                workflows: deletedWorkflows.rowCount,
                actions: deletedActions.rowCount,
                notifications: notifications.rowCount,
                communicationLogs: communications.rowCount,
                auditLogs: audits.rowCount
            },
            preserved: ['users', 'roles', 'workflow definitions', 'work-plan uploads', 'ERM rules']
        };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

resetTestApprovalData()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
