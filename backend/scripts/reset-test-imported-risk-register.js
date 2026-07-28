require('dotenv').config();
const pool = require('../config/db');

async function main() {
    const databaseName = String(process.env.DB_NAME || '');
    if (process.env.NODE_ENV === 'production' || !databaseName.toLowerCase().includes('test')) {
        throw new Error('Imported risk-register reset is restricted to a non-production test database.');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const risks = (await client.query(
            `SELECT id,risk_id,risk_title,entry_source
             FROM risks
             WHERE entry_source IN ('Risk Register Tracking Template','Imported Workbook')
             ORDER BY id`
        )).rows;
        if (!risks.length) {
            await client.query('COMMIT');
            console.log(JSON.stringify({ risks: [], deleted: { risks: 0 } }, null, 2));
            return;
        }

        const riskIds = risks.map(risk => String(risk.id));
        const riskCodes = risks.map(risk => risk.risk_id);
        const planIds = (await client.query(
            'SELECT id::text FROM treatment_plans WHERE risk_id::text = ANY($1::text[])',
            [riskIds]
        )).rows.map(row => row.id);
        const workflowIds = (await client.query(
            "SELECT id::text FROM workflow_instances WHERE subject_type='Risk' AND subject_id = ANY($1::text[])",
            [riskIds]
        )).rows.map(row => row.id);
        const actionIds = (await client.query(
            `SELECT id::text FROM actions
             WHERE (source_type IN ('Risk','RiskReview','CommitteeReview') AND source_id = ANY($1::text[]))
                OR (source_type='TreatmentPlan' AND source_id = ANY($2::text[]))
                OR workflow_instance_id::text = ANY($3::text[])
                OR metadata->>'riskId' = ANY($4::text[])`,
            [riskIds, planIds, workflowIds, riskCodes]
        )).rows.map(row => row.id);
        const sourceFiles = (await client.query(
            `SELECT DISTINCT details->>'file_name' AS file_name
             FROM risk_history
             WHERE risk_id::text = ANY($1::text[]) AND NULLIF(details->>'file_name','') IS NOT NULL`,
            [riskIds]
        )).rows.map(row => row.file_name);

        const notifications = await client.query(
            `DELETE FROM notifications
             WHERE (entity_type='Risk' AND entity_id = ANY($1::text[]))
                OR (entity_type='Workflow' AND entity_id = ANY($2::text[]))
                OR (entity_type='Action' AND entity_id = ANY($3::text[]))`,
            [riskIds, workflowIds, actionIds]
        );
        const audits = await client.query(
            `DELETE FROM audit_logs
             WHERE (entity_type='Risk' AND entity_id = ANY($1::text[]))
                OR (entity_type='Workflow' AND entity_id = ANY($2::text[]))
                OR (entity_type='Action' AND entity_id = ANY($3::text[]))
                OR (entity_type='Risk Import' AND details->>'file_name' = ANY($4::text[]))`,
            [riskIds, workflowIds, actionIds, sourceFiles]
        );
        const communications = await client.query(
            `DELETE FROM communication_logs
             WHERE (reference_type='Risk' AND reference_id = ANY($1::text[]))
                OR (reference_type='Workflow' AND reference_id = ANY($2::text[]))
                OR (reference_type='Action' AND reference_id = ANY($3::text[]))`,
            [riskIds, workflowIds, actionIds]
        );
        const actions = await client.query('DELETE FROM actions WHERE id::text = ANY($1::text[])', [actionIds]);
        const workflows = await client.query('DELETE FROM workflow_instances WHERE id::text = ANY($1::text[])', [workflowIds]);
        const deletedRisks = await client.query('DELETE FROM risks WHERE id::text = ANY($1::text[])', [riskIds]);
        await client.query('COMMIT');
        console.log(JSON.stringify({
            risks,
            sourceFiles,
            deleted: {
                risks: deletedRisks.rowCount,
                treatmentPlans: planIds.length,
                workflows: workflows.rowCount,
                actions: actions.rowCount,
                notifications: notifications.rowCount,
                auditLogs: audits.rowCount,
                communicationLogs: communications.rowCount
            }
        }, null, 2));
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

main()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
