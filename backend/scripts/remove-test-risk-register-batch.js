require('dotenv').config();
const pool=require('../config/db');

function argument(name){
    const index=process.argv.indexOf(`--${name}`);
    return index>=0?process.argv[index+1]:null;
}

async function main(){
    const databaseName=String(process.env.DB_NAME||'');
    if(process.env.NODE_ENV==='production'||!databaseName.toLowerCase().includes('test')){
        throw new Error('Risk-register batch cleanup is restricted to a non-production test database.');
    }

    const batchId=Number(argument('batch'));
    const expectedDivision=String(argument('division')||'').trim();
    if(!Number.isInteger(batchId)||batchId<1||!expectedDivision){
        throw new Error('Usage: node scripts/remove-test-risk-register-batch.js --batch <id> --division "<expected division>"');
    }

    const client=await pool.connect();
    try{
        await client.query('BEGIN');
        const batch=(await client.query(
            `SELECT batch.*,u.email uploaded_by_email
             FROM risk_register_import_batches batch
             LEFT JOIN users u ON u.id=batch.uploaded_by
             WHERE batch.id=$1 FOR UPDATE OF batch`,
            [batchId]
        )).rows[0];
        if(!batch)throw new Error(`Risk-register import batch ${batchId} was not found.`);
        if(String(batch.division).toLowerCase()!==expectedDivision.toLowerCase()){
            throw new Error(`Cleanup stopped: batch ${batchId} belongs to "${batch.division}", not "${expectedDivision}".`);
        }

        const risks=(await client.query(
            `SELECT id,risk_id,risk_title,entry_source
             FROM risks WHERE import_batch_id=$1 ORDER BY id FOR UPDATE`,
            [batch.id]
        )).rows;
        const riskIds=risks.map(risk=>String(risk.id));
        const riskCodes=risks.map(risk=>String(risk.risk_id));
        const planIds=riskIds.length?(await client.query(
            'SELECT id::text FROM treatment_plans WHERE risk_id::text=ANY($1::text[])',
            [riskIds]
        )).rows.map(row=>row.id):[];
        const workflowIds=riskIds.length?(await client.query(
            `SELECT id::text FROM workflow_instances
             WHERE subject_type='Risk' AND subject_id=ANY($1::text[])`,
            [riskIds]
        )).rows.map(row=>row.id):[];
        const actionIds=(await client.query(
            `SELECT id::text FROM actions
            WHERE (source_type IN ('Risk','RiskReview','CommitteeReview','ConsolidatedRiskAssessment','RiskCorrection') AND source_id=ANY($1::text[]))
                OR (source_type='TreatmentPlan' AND source_id=ANY($2::text[]))
                OR (source_type IN ('RiskRegisterImportBatch','RiskRegisterFocalReview') AND source_id=$3::text)
                OR workflow_instance_id::text=ANY($4::text[])
                OR metadata->>'riskId'=ANY($5::text[])
                OR metadata->>'importBatchId'=$3::text`,
            [riskIds,planIds,String(batch.id),workflowIds,riskCodes]
        )).rows.map(row=>row.id);

        const notifications=await client.query(
            `DELETE FROM notifications
             WHERE (entity_type='Risk' AND entity_id=ANY($1::text[]))
                OR (entity_type='Workflow' AND entity_id=ANY($2::text[]))
                OR (entity_type='Action' AND entity_id=ANY($3::text[]))
                OR (entity_type IN ('RiskRegisterImportBatch','Risk Register Import Batch','Risk Import','Risk Register Import') AND entity_id=$4::text)`,
            [riskIds,workflowIds,actionIds,String(batch.id)]
        );
        const audits=await client.query(
            `DELETE FROM audit_logs
             WHERE (entity_type='Risk' AND entity_id=ANY($1::text[]))
                OR (entity_type='Workflow' AND entity_id=ANY($2::text[]))
                OR (entity_type='Action' AND entity_id=ANY($3::text[]))
                OR (entity_type IN ('RiskRegisterImportBatch','Risk Register Import Batch','Risk Register Import') AND entity_id=$4::text)
                OR (entity_type='Risk Import'
                    AND details->>'file_name'=$5
                    AND user_id IS NOT DISTINCT FROM $6
                    AND created_at>=($7::timestamptz-INTERVAL '10 minutes'))`,
            [riskIds,workflowIds,actionIds,String(batch.id),batch.file_name,batch.uploaded_by,batch.created_at]
        );
        const communications=await client.query(
            `DELETE FROM communication_logs
             WHERE (reference_type='Risk' AND reference_id=ANY($1::text[]))
                OR (reference_type='Workflow' AND reference_id=ANY($2::text[]))
                OR (reference_type='Action' AND reference_id=ANY($3::text[]))
                OR (reference_type='RiskRegisterImportBatch' AND reference_id=$4::text)`,
            [riskIds,workflowIds,actionIds,String(batch.id)]
        );
        const deletedActions=await client.query(
            'DELETE FROM actions WHERE id::text=ANY($1::text[])',
            [actionIds]
        );
        const deletedWorkflows=await client.query(
            'DELETE FROM workflow_instances WHERE id::text=ANY($1::text[])',
            [workflowIds]
        );
        const deletedRisks=await client.query(
            'DELETE FROM risks WHERE import_batch_id=$1',
            [batch.id]
        );
        const deletedBatch=await client.query(
            'DELETE FROM risk_register_import_batches WHERE id=$1',
            [batch.id]
        );
        let deletedUploadGroups=0;
        if(batch.upload_group_id){
            const deletedGroup=await client.query(
                `DELETE FROM risk_register_admin_upload_groups group_record
                 WHERE group_record.id=$1
                   AND NOT EXISTS (
                       SELECT 1 FROM risk_register_import_batches batch_record
                       WHERE batch_record.upload_group_id=group_record.id
                   )`,
                [batch.upload_group_id]
            );
            deletedUploadGroups=deletedGroup.rowCount;
            if(deletedUploadGroups){
                await client.query(
                    `DELETE FROM audit_logs
                     WHERE entity_type='Risk Register Import Group' AND entity_id=$1::text`,
                    [batch.upload_group_id]
                );
            }
        }
        await client.query('COMMIT');

        console.log(JSON.stringify({
            database:databaseName,
            removedBatch:{
                id:String(batch.id),
                division:batch.division,
                fileName:batch.file_name,
                uploadedBy:batch.uploaded_by_email,
                createdAt:batch.created_at
            },
            removedRisks:risks,
            deleted:{
                importBatches:deletedBatch.rowCount,
                uploadGroups:deletedUploadGroups,
                risks:deletedRisks.rowCount,
                treatmentPlans:planIds.length,
                workflows:deletedWorkflows.rowCount,
                actions:deletedActions.rowCount,
                notifications:notifications.rowCount,
                auditLogs:audits.rowCount,
                communicationLogs:communications.rowCount
            }
        },null,2));
    }catch(error){
        await client.query('ROLLBACK').catch(()=>{});
        throw error;
    }finally{
        client.release();
    }
}

main()
    .catch(error=>{
        console.error(error.message);
        process.exitCode=1;
    })
    .finally(()=>pool.end());
