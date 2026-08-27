require('dotenv').config();
const pool = require('../config/db');

const IMPORT_SOURCES = [
    'Risk Register Tracking Template',
    'Legal Legacy Risk Register',
    'Division Risk Register Tracker',
    'Imported Workbook'
];

async function main() {
    const databaseName = String(process.env.DB_NAME || '');
    if (process.env.NODE_ENV === 'production' || !databaseName.toLowerCase().includes('test')) {
        throw new Error('Imported risk-register reset is restricted to a non-production test database.');
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const batches = (await client.query(
            `SELECT id,upload_group_id,division,file_name,template_type,status,created_at
             FROM risk_register_import_batches ORDER BY id FOR UPDATE`
        )).rows;
        const batchIds = batches.map(batch => String(batch.id));
        const groupIds = [...new Set(batches.map(batch => batch.upload_group_id).filter(Boolean).map(String))];
        const risks = (await client.query(
            `SELECT id,risk_id,risk_title,entry_source,import_batch_id
             FROM risks
             WHERE import_batch_id IS NOT NULL OR entry_source=ANY($1::text[])
             ORDER BY id FOR UPDATE`,[IMPORT_SOURCES]
        )).rows;
        const riskIds = risks.map(risk => String(risk.id));
        const riskCodes = risks.map(risk => String(risk.risk_id));
        const sourceFiles = [...new Set(batches.map(batch => batch.file_name).filter(Boolean))];
        const planIds = riskIds.length ? (await client.query(
            'SELECT id::text FROM treatment_plans WHERE risk_id::text=ANY($1::text[])',[riskIds]
        )).rows.map(row => row.id) : [];
        const workflowIds = riskIds.length ? (await client.query(
            `SELECT id::text FROM workflow_instances WHERE subject_type='Risk' AND subject_id=ANY($1::text[])`,[riskIds]
        )).rows.map(row => row.id) : [];
        const actionIds = (riskIds.length || batchIds.length) ? (await client.query(
            `SELECT id::text FROM actions
             WHERE (source_type IN ('Risk','RiskReview','CommitteeReview','ConsolidatedRiskAssessment','RiskCorrection') AND source_id=ANY($1::text[]))
                OR (source_type='TreatmentPlan' AND source_id=ANY($2::text[]))
                OR (source_type IN ('RiskRegisterImportBatch','RiskRegisterFocalReview') AND source_id=ANY($3::text[]))
                OR workflow_instance_id::text=ANY($4::text[])
                OR metadata->>'riskId'=ANY($5::text[])
                OR metadata->>'importBatchId'=ANY($3::text[])`,
            [riskIds,planIds,batchIds,workflowIds,riskCodes]
        )).rows.map(row => row.id) : [];
        if (process.argv.includes('--preview')) {
            await client.query('ROLLBACK');
            console.log(JSON.stringify({
                database:databaseName,
                wouldRemove:{
                    uploadGroups:groupIds.length,
                    importBatches:batches.length,
                    risks:risks.length,
                    treatmentPlans:planIds.length,
                    workflows:workflowIds.length,
                    actions:actionIds.length,
                    batches:batches.map(batch => ({id:String(batch.id),division:batch.division,fileName:batch.file_name,status:batch.status}))
                }
            },null,2));
            return;
        }
        const notifications = await client.query(
            `DELETE FROM notifications
             WHERE (entity_type='Risk' AND entity_id=ANY($1::text[]))
                OR (entity_type='Workflow' AND entity_id=ANY($2::text[]))
                OR (entity_type='Action' AND entity_id=ANY($3::text[]))
                OR (entity_type IN ('RiskRegisterImportBatch','Risk Import') AND entity_id=ANY($4::text[]))`,
            [riskIds,workflowIds,actionIds,batchIds]
        );
        const audits = await client.query(
            `DELETE FROM audit_logs
             WHERE (entity_type='Risk' AND entity_id=ANY($1::text[]))
                OR (entity_type='Workflow' AND entity_id=ANY($2::text[]))
                OR (entity_type='Action' AND entity_id=ANY($3::text[]))
                OR (entity_type IN ('RiskRegisterImportBatch','Risk Import') AND (entity_id=ANY($4::text[]) OR details->>'file_name'=ANY($5::text[])))
                OR (entity_type='Risk Register Import Group' AND entity_id=ANY($6::text[]))`,
            [riskIds,workflowIds,actionIds,batchIds,sourceFiles,groupIds]
        );
        const communications = await client.query(
            `DELETE FROM communication_logs
             WHERE (reference_type='Risk' AND reference_id=ANY($1::text[]))
                OR (reference_type='Workflow' AND reference_id=ANY($2::text[]))
                OR (reference_type='Action' AND reference_id=ANY($3::text[]))
                OR (reference_type='RiskRegisterImportBatch' AND reference_id=ANY($4::text[]))`,
            [riskIds,workflowIds,actionIds,batchIds]
        );
        const actions = await client.query('DELETE FROM actions WHERE id::text=ANY($1::text[])',[actionIds]);
        const workflows = await client.query('DELETE FROM workflow_instances WHERE id::text=ANY($1::text[])',[workflowIds]);
        const deletedRisks = await client.query(
            `DELETE FROM risks WHERE import_batch_id IS NOT NULL OR entry_source=ANY($1::text[])`,[IMPORT_SOURCES]
        );
        const deletedBatches = await client.query('DELETE FROM risk_register_import_batches');
        const deletedGroups = await client.query('DELETE FROM risk_register_admin_upload_groups');
        await client.query('COMMIT');
        console.log(JSON.stringify({
            database:databaseName,
            removed:{batches:batches.map(batch => ({id:String(batch.id),division:batch.division,fileName:batch.file_name,status:batch.status})),risks},
            deleted:{uploadGroups:deletedGroups.rowCount,importBatches:deletedBatches.rowCount,risks:deletedRisks.rowCount,
                treatmentPlans:planIds.length,workflows:workflows.rowCount,actions:actions.rowCount,
                notifications:notifications.rowCount,auditLogs:audits.rowCount,communicationLogs:communications.rowCount}
        },null,2));
    } catch (error) {
        await client.query('ROLLBACK').catch(()=>{});
        throw error;
    } finally { client.release(); }
}

main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>pool.end());
