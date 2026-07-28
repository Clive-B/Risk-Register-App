const pool = require('../config/db');
const { logAudit } = require('../utils/auditLogger');
const { DIVISIONS } = require('../utils/bulkUserWorkbookCorrectionEngine');

const ASSESSMENTS = ['Not Assessed','Compliant','Partially Compliant','Non-Compliant'];
const FREQUENCIES = ['Monthly','Quarterly','Biannual','Annual','Event-driven'];
const scoped = user => !['System Administrator','Risk Committee Chairman'].includes(user.role);
const text = value => String(value || '').trim();

function fail(message,statusCode=400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
}

function handle(res,error) {
    console.error('[compliance]',error.message);
    res.status(error.statusCode || 500).json({success:false,message:error.statusCode ? error.message : 'Unable to complete the compliance request.'});
}

exports.options = async (_req,res) => res.json({success:true,data:{
    divisions:DIVISIONS,assessments:ASSESSMENTS,frequencies:FREQUENCIES,
    applicability:['Applicable','Not Applicable']
}});

exports.list = async (req,res) => {
    try {
        const clauses=["o.record_status='Active'"],params=[];
        const add=(sql,value)=>{if(value){params.push(value);clauses.push(sql.replace('?',`$${params.length}`));}};
        if(scoped(req.user)) add('o.division=?',req.user.division);
        else add('o.division=?',req.query.division);
        add('o.assessment_status=?',req.query.assessmentStatus);
        add('o.applicability=?',req.query.applicability);
        const result=await pool.query(`SELECT o.*,
            assessor.full_name assessed_by_name,verifier.full_name verified_by_name
            FROM compliance_obligations o
            LEFT JOIN users assessor ON assessor.id=o.assessed_by
            LEFT JOIN users verifier ON verifier.id=o.verified_by
            WHERE ${clauses.join(' AND ')}
            ORDER BY CASE o.assessment_status WHEN 'Non-Compliant' THEN 1 WHEN 'Partially Compliant' THEN 2 WHEN 'Not Assessed' THEN 3 ELSE 4 END,
                     o.due_date NULLS LAST,o.obligation_code`,params);
        const summary=await pool.query(`SELECT
            COUNT(*) FILTER(WHERE applicability='Applicable')::int applicable,
            COUNT(*) FILTER(WHERE applicability='Applicable' AND assessment_status<>'Not Assessed')::int assessed,
            COUNT(*) FILTER(WHERE applicability='Applicable' AND assessment_status='Compliant' AND evidence_verified)::int verified_compliant,
            COUNT(*) FILTER(WHERE applicability='Applicable' AND assessment_status='Partially Compliant')::int partial,
            COUNT(*) FILTER(WHERE applicability='Applicable' AND assessment_status='Non-Compliant')::int non_compliant,
            COUNT(*) FILTER(WHERE applicability='Applicable' AND assessment_status='Not Assessed')::int not_assessed
            FROM compliance_obligations WHERE record_status='Active' ${scoped(req.user)?'AND division=$1':req.query.division?'AND division=$1':''}`,
            scoped(req.user)?[req.user.division]:req.query.division?[req.query.division]:[]);
        const s=summary.rows[0],denominator=Number(s.assessed);
        res.json({success:true,data:{obligations:result.rows,summary:{
            ...s,complianceRate:denominator?Number((100*Number(s.verified_compliant)/denominator).toFixed(1)):null
        }}});
    } catch(error){handle(res,error);}
};

exports.create = async (req,res) => {
    try {
        const code=text(req.body.obligationCode),title=text(req.body.title),source=text(req.body.regulatorySource);
        const requirement=text(req.body.requirement),division=text(req.body.division),owner=text(req.body.owner);
        const frequency=text(req.body.frequency)||'Annual';
        if(!code||!title||!source||!requirement||!owner) fail('Code, title, regulatory source, requirement and owner are required.');
        if(!DIVISIONS.includes(division)) fail('Select an approved division.');
        if(!FREQUENCIES.includes(frequency)) fail('Select an approved assessment frequency.');
        if(scoped(req.user)&&division!==req.user.division) fail('You may create obligations only for your division.',403);
        const result=await pool.query(`INSERT INTO compliance_obligations
            (obligation_code,title,regulatory_source,requirement,division,owner,frequency,due_date,created_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [code,title,source,requirement,division,owner,frequency,req.body.dueDate||null,req.user.id]);
        await logAudit({req,action:'COMPLIANCE_OBLIGATION_CREATED',entityType:'ComplianceObligation',entityId:result.rows[0].id,details:{code,division}});
        res.status(201).json({success:true,data:result.rows[0]});
    } catch(error){if(error.code==='23505')error=Object.assign(new Error('Obligation code already exists.'),{statusCode:409});handle(res,error);}
};

exports.assess = async (req,res) => {
    const client=await pool.connect();
    try {
        const status=text(req.body.assessmentStatus),applicability=text(req.body.applicability)||'Applicable';
        const evidenceReference=text(req.body.evidenceReference),evidenceSummary=text(req.body.evidenceSummary);
        if(!ASSESSMENTS.includes(status)) fail('Select an approved assessment status.');
        if(!['Applicable','Not Applicable'].includes(applicability)) fail('Select an approved applicability value.');
        if(status==='Compliant'&&(!evidenceReference||!evidenceSummary)) fail('Compliant assessments require an evidence reference and summary.');
        const found=await client.query('SELECT * FROM compliance_obligations WHERE id=$1 AND record_status=$2',[req.params.id,'Active']);
        if(!found.rowCount) fail('Compliance obligation not found.',404);
        if(scoped(req.user)&&found.rows[0].division!==req.user.division) fail('You may assess obligations only for your division.',403);
        await client.query('BEGIN');
        const updated=await client.query(`UPDATE compliance_obligations SET applicability=$1,assessment_status=$2,
            evidence_reference=$3,evidence_summary=$4,corrective_action=$5,corrective_due_date=$6,
            evidence_verified=FALSE,verification_notes=NULL,verified_by=NULL,verified_at=NULL,
            assessed_by=$7,assessed_at=NOW(),updated_at=NOW() WHERE id=$8 RETURNING *`,
            [applicability,status,evidenceReference||null,evidenceSummary||null,text(req.body.correctiveAction)||null,req.body.correctiveDueDate||null,req.user.id,req.params.id]);
        await client.query(`INSERT INTO compliance_assessment_history
            (obligation_id,action,assessment_status,evidence_reference,evidence_verified,comments,performed_by)
            VALUES($1,'Assessed',$2,$3,FALSE,$4,$5)`,
            [req.params.id,status,evidenceReference||null,evidenceSummary||null,req.user.id]);
        await client.query('COMMIT');
        await logAudit({req,action:'COMPLIANCE_ASSESSED',entityType:'ComplianceObligation',entityId:req.params.id,details:{status,applicability}});
        res.json({success:true,data:updated.rows[0]});
    } catch(error){await client.query('ROLLBACK').catch(()=>{});handle(res,error);} finally{client.release();}
};

exports.verify = async (req,res) => {
    const client=await pool.connect();
    try {
        const found=await client.query('SELECT * FROM compliance_obligations WHERE id=$1 AND record_status=$2',[req.params.id,'Active']);
        if(!found.rowCount) fail('Compliance obligation not found.',404);
        const obligation=found.rows[0];
        if(req.user.role==='Risk Champion'&&obligation.division!==req.user.division) fail('You may verify obligations only for your division.',403);
        if(obligation.applicability!=='Applicable'||obligation.assessment_status==='Not Assessed') fail('Only assessed, applicable obligations can be verified.');
        if(Number(obligation.assessed_by)===Number(req.user.id)) fail('Assessment must be verified by a different authorized user.');
        if(obligation.assessment_status==='Compliant'&&(!obligation.evidence_reference||!obligation.evidence_summary)) fail('Compliant evidence is incomplete.');
        const notes=text(req.body.notes);
        if(!notes) fail('Verification notes are required.');
        await client.query('BEGIN');
        const updated=await client.query(`UPDATE compliance_obligations SET evidence_verified=TRUE,
            verification_notes=$1,verified_by=$2,verified_at=NOW(),updated_at=NOW() WHERE id=$3 RETURNING *`,
            [notes,req.user.id,req.params.id]);
        await client.query(`INSERT INTO compliance_assessment_history
            (obligation_id,action,assessment_status,evidence_reference,evidence_verified,comments,performed_by)
            VALUES($1,'Verified',$2,$3,TRUE,$4,$5)`,
            [req.params.id,obligation.assessment_status,obligation.evidence_reference,notes,req.user.id]);
        await client.query('COMMIT');
        await logAudit({req,action:'COMPLIANCE_EVIDENCE_VERIFIED',entityType:'ComplianceObligation',entityId:req.params.id,details:{status:obligation.assessment_status}});
        res.json({success:true,data:updated.rows[0]});
    } catch(error){await client.query('ROLLBACK').catch(()=>{});handle(res,error);} finally{client.release();}
};
