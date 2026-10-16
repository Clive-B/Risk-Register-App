const pool = require('../config/db');
const { logAudit } = require('../utils/auditLogger');
const { createNotification } = require('../services/notificationService');
const { sendEmail } = require('../services/emailService');
const { createAction, completeBySource } = require('../services/actionService');
const { isCommitteeDecisionRole, requiredTreatmentApprovalStatus } = require('../utils/committeeApproval');
const {
    CONTROL_EFFECTIVENESS,
    CONTROL_TYPES,
    DESIGN_ADEQUACY,
    assessControlAssurance,
    controlScoreConsistency
} = require('../utils/controlAssurance');

async function notifyTreatment(req,riskId,title,message){const users=(await pool.query(`SELECT DISTINCT u.id,u.email,u.role,u.division,u.directorate FROM risks r JOIN users u ON u.status='Active' AND (u.id=r.created_by OR (u.role='Risk Champion' AND COALESCE(NULLIF(u.division,''),u.directorate)=COALESCE(NULLIF(r.division,''),r.directorate)) OR (u.role='Risk Committee Chairman' AND r.risk_level='High')) WHERE r.id=$1`,[riskId])).rows;await Promise.allSettled(users.map(u=>Promise.all([createNotification({actor:req.user,req,userId:u.id,title,message,type:'Risk',category:'Treatment',priority:'Normal',entityType:'Risk',entityId:riskId,createdBy:req.user.id,systemGenerated:true}),sendEmail({to:u.email,subject:title,text:message,html:`<p>${message}</p>`,emailType:'Treatment',userId:u.id,role:u.role,directorate:u.division||u.directorate,sentBy:req.user.id})])))}

const ALLOWED_STRATEGIES = ['Terminate', 'Treat', 'Transfer', 'Tolerate'];
const ALLOWED_STATUSES = ['Not Started', 'In Progress', 'Completed', 'Overdue'];

function normalizeTreatmentInput(body) {
    return {
        risk_id: Number(body.risk_id),
        plan_title: String(body.plan_title || '').trim(),
        treatment_strategy: String(body.treatment_strategy || '').trim(),
        action_owner: String(body.action_owner || '').trim(),
        due_date: String(body.due_date || '').trim(),
        progress_percent: Number(body.progress_percent),
        status: String(body.status || 'Not Started').trim(),
        evidence_file_name: String(body.evidence_file_name || '').trim(),
        evidence_url: String(body.evidence_url || '').trim(),
        evidence_notes: String(body.evidence_notes || '').trim(),
        treatment_objective: String(body.treatment_objective || '').trim(),
        treatment_actions: String(body.treatment_actions || '').trim(),
        evidence_required: String(body.evidence_required || '').trim(),
        monitoring_frequency: String(body.monitoring_frequency || '').trim(),
        review_date: String(body.review_date || '').trim(),
        target_residual_likelihood: Number(body.target_residual_likelihood),
        target_residual_impact: Number(body.target_residual_impact)
    };
}

function optionalText(value) {
    const normalized = String(value || '').trim();
    return normalized || null;
}

function normalizeControlReassessment(body) {
    return {
        requested:body.control_reassessment === true || String(body.control_reassessment).toLowerCase() === 'true',
        control_effectiveness:optionalText(body.control_effectiveness),
        control_type:optionalText(body.control_type),
        control_owner:optionalText(body.control_owner),
        control_design_adequacy:optionalText(body.control_design_adequacy),
        control_evidence:optionalText(body.control_evidence),
        control_last_tested_date:optionalText(body.control_last_tested_date),
        control_exceptions:optionalText(body.control_exceptions),
        control_next_review_date:optionalText(body.control_next_review_date),
        control_assessment_basis:optionalText(body.control_assessment_basis)
    };
}

function validateControlReassessment(control, existingRisk, user) {
    if (!control.requested) return [];
    if (!['Risk Champion','System Administrator'].includes(user.role)) {
        return ['Only the assigned Risk Champion may reassess control effectiveness during treatment monitoring.'];
    }
    const errors = [];
    if (['Completed','Deferred'].includes(existingRisk.lifecycle_status)) {
        errors.push('Control effectiveness can only be reassessed while the treatment is ongoing.');
    }
    if (!CONTROL_EFFECTIVENESS.includes(control.control_effectiveness)) errors.push('Select a valid control effectiveness.');
    if (!CONTROL_TYPES.includes(control.control_type)) errors.push('Select a valid control type.');
    if (!DESIGN_ADEQUACY.includes(control.control_design_adequacy)) errors.push('Select a valid control design adequacy.');
    if (!control.control_assessment_basis) errors.push('Record the reason for the control-effectiveness assessment.');
    if (control.control_effectiveness === 'Effective') {
        const governedConclusion = assessControlAssurance({
            existing_controls:existingRisk.existing_controls,
            ...control
        });
        if (governedConclusion.rating !== 'Effective') {
            errors.push('An Effective rating requires adequate design, dated operating evidence and no unresolved control exceptions.');
        }
    }
    for (const [field,label] of [
        ['control_last_tested_date','Control last tested date'],
        ['control_next_review_date','Control next review date']
    ]) {
        if (control[field] && Number.isNaN(Date.parse(control[field]))) errors.push(`${label} must be valid.`);
    }
    return errors;
}

function validateTreatmentInput(plan) {
    const errors = [];

    if (!Number.isInteger(plan.risk_id)) errors.push('Select a valid risk.');
    if (!plan.plan_title) errors.push('Treatment plan title is required.');
    if (!ALLOWED_STRATEGIES.includes(plan.treatment_strategy)) errors.push('Select a valid treatment strategy.');
    if (!plan.action_owner) errors.push('Action owner is required.');
    if (!plan.treatment_actions) errors.push('Treatment actions are required.');
    if (!plan.due_date || Number.isNaN(Date.parse(plan.due_date))) errors.push('Valid due date is required.');
    if (!Number.isInteger(plan.progress_percent) || plan.progress_percent < 0 || plan.progress_percent > 100) {
        errors.push('Progress must be between 0 and 100.');
    }
    if (!ALLOWED_STATUSES.includes(plan.status)) errors.push('Select a valid status.');
    if (plan.review_date && Number.isNaN(Date.parse(plan.review_date))) errors.push('Enter a valid review date.');
    if (![plan.target_residual_likelihood, plan.target_residual_impact].every(value => Number.isInteger(value) && value >= 1 && value <= 5)) {
        errors.push('Target residual likelihood and impact must be between 1 and 5.');
    }
    if (plan.evidence_url && !/^https?:\/\/|^file:\/\/|^[\w .:/\\-]+$/i.test(plan.evidence_url)) {
        errors.push('Enter a valid evidence reference.');
    }

    return errors;
}

function deriveStatus(plan) {
    if (plan.progress_percent === 100) return 'Completed';
    if (plan.due_date && new Date(plan.due_date) < startOfToday()) return 'Overdue';
    if (plan.progress_percent > 0) return 'In Progress';
    return plan.status === 'Overdue' ? 'Not Started' : plan.status;
}

function startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

function canAccessRisk(user, risk) {
    if (['System Administrator','Risk Committee Chairman'].includes(user.role)) return true;
    if (user.division !== (risk.division || risk.directorate)) return false;
    if (user.role !== 'Risk Focal Person') return true;
    return Number(risk.created_by) === Number(user.id)
        || risk.entry_source !== 'Manual - Risk Champion'
        || risk.focal_visibility === true;
}

function canModifyPlan(user, plan) {
    if (user.role === 'System Administrator') return true;
    if (user.role === 'Risk Committee Chairman') return !['Completed','Deferred'].includes(plan.lifecycle_status);
    if (user.role === 'Risk Champion') return user.division === (plan.division || plan.directorate);
    if (user.role === 'Risk Focal Person') {
        return user.division === plan.division
            && (Number(plan.risk_created_by) === Number(user.id)
                || plan.entry_source !== 'Manual - Risk Champion'
                || plan.focal_visibility === true);
    }
    return false;
}

async function getRiskForAccess(riskId) {
    const result = await pool.query(
        'SELECT id, directorate, division, created_by, risk_treatment, entry_source, focal_visibility, workflow_status FROM risks WHERE id = $1',
        [riskId]
    );

    return result.rows[0];
}

exports.getTreatmentPlans = async (req, res) => {
    try {
        const filters = {
            search: String(req.query.search || '').trim().toLowerCase(),
            status: String(req.query.status || '').trim(),
            directorate: String(req.query.directorate || '').trim(),
            sort: String(req.query.sort || 'due_asc').trim()
        };

        const conditions = [];
        const params = [];

        if (req.user.role === 'Risk Focal Person') {
            params.push(req.user.division);
            conditions.push(`r.division = $${params.length}`);
            params.push(req.user.id);
            conditions.push(`(r.created_by = $${params.length} OR r.entry_source <> 'Manual - Risk Champion' OR r.focal_visibility = TRUE)`);
        } else if (req.user.role === 'Risk Champion') {
            params.push(req.user.division);
            conditions.push(`COALESCE(NULLIF(r.division,''),r.directorate) = $${params.length}`);
        } else if (filters.directorate) {
            params.push(filters.directorate);
            conditions.push(`COALESCE(NULLIF(r.division,''),r.directorate) = $${params.length}`);
        }

        if (filters.status === 'Overdue') {
            conditions.push(`tp.due_date < CURRENT_DATE AND tp.status <> 'Completed'`);
        } else if (filters.status) {
            params.push(filters.status);
            conditions.push(`tp.status = $${params.length}`);
        }

        if (filters.search) {
            params.push(`%${filters.search}%`);
            conditions.push(`(
                LOWER(tp.plan_title) LIKE $${params.length}
                OR LOWER(tp.action_owner) LIKE $${params.length}
                OR LOWER(r.risk_id) LIKE $${params.length}
                OR LOWER(r.risk_title) LIKE $${params.length}
            )`);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const orderBy = {
            due_asc: 'tp.due_date ASC, tp.updated_at DESC',
            due_desc: 'tp.due_date DESC, tp.updated_at DESC',
            progress_desc: 'tp.progress_percent DESC, tp.due_date ASC',
            progress_asc: 'tp.progress_percent ASC, tp.due_date ASC',
            completion_desc: 'tp.completed_at DESC NULLS LAST, tp.updated_at DESC',
            completion_asc: 'tp.completed_at ASC NULLS LAST, tp.updated_at ASC'
        }[filters.sort] || 'tp.due_date ASC, tp.updated_at DESC';

        const result = await pool.query(
            `
            SELECT
                tp.*,
                r.risk_id AS risk_code,
                r.risk_title,
                r.directorate,
                r.division,
                r.risk_level,
                r.inherent_risk_score,
                r.current_risk_score,
                r.existing_controls,
                r.control_effectiveness,
                r.control_type,
                r.control_owner,
                r.control_design_adequacy,
                r.control_evidence,
                r.control_last_tested_date,
                r.control_exceptions,
                r.control_next_review_date,
                r.control_assessment_basis,
                r.control_assessment_confidence,
                r.control_assessed_at,
                control_assessor.full_name AS control_assessed_by_name,
                u.full_name AS created_by_name,
                focal_reviewer.full_name AS focal_reviewed_by_name,
                champion_reviewer.full_name AS champion_approved_by_name,
                committee_reviewer.full_name AS committee_approved_by_name,
                return_reviewer.full_name AS committee_returned_by_name,
                (tp.due_date < CURRENT_DATE AND tp.progress_percent < 100) AS is_overdue
            FROM treatment_plans tp
            INNER JOIN risks r ON r.id = tp.risk_id
            LEFT JOIN users u ON u.id = tp.created_by
            LEFT JOIN users focal_reviewer ON focal_reviewer.id=tp.focal_reviewed_by
            LEFT JOIN users champion_reviewer ON champion_reviewer.id=tp.champion_approved_by
            LEFT JOIN users committee_reviewer ON committee_reviewer.id=tp.approved_by
            LEFT JOIN users return_reviewer ON return_reviewer.id=tp.committee_returned_by
            LEFT JOIN users control_assessor ON control_assessor.id=r.control_assessed_by
            ${whereClause}
            ORDER BY ${orderBy}
            `,
            params
        );

        const treatmentPlans = result.rows.map(plan => ({
            ...plan,
            control_score_consistency_warning:controlScoreConsistency({
                effectiveness:plan.control_effectiveness,
                inherentScore:plan.inherent_risk_score,
                currentScore:plan.current_risk_score
            })
        }));
        res.json({
            success: true,
            treatmentPlans
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Unable to load treatment plans.'
        });
    }
};

exports.createTreatmentPlan = async (req, res) => {
    try {
        const plan = normalizeTreatmentInput(req.body);
        if (!Number.isInteger(plan.risk_id)) {
            return res.status(400).json({success:false,message:'Select a valid risk.'});
        }
        const risk = await getRiskForAccess(plan.risk_id);

        if (!risk) {
            return res.status(404).json({
                success: false,
                message: 'Risk not found.'
            });
        }

        if (!canAccessRisk(req.user, risk)) {
            return res.status(403).json({
                success: false,
                message: 'You can only create treatment plans for risks in your assigned division.'
            });
        }

        const errors = validateTreatmentInput(plan);
        if (errors.length > 0) {
            return res.status(400).json({success:false,message:errors[0],errors});
        }

        const status = deriveStatus(plan);
        const result = await pool.query(
            `
            INSERT INTO treatment_plans (
                risk_id,
                plan_title,
                treatment_strategy,
                action_owner,
                due_date,
                progress_percent,
                status,
                evidence_file_name,
                evidence_url,
                evidence_notes,
                created_by,
                plan_origin,
                lifecycle_status,
                system_proposed_strategy,
                treatment_objective,
                treatment_actions,
                evidence_required,
                monitoring_frequency,
                review_date,
                target_residual_likelihood,
                target_residual_impact,
                target_residual_score,
                focal_reviewed_by,
                focal_reviewed_at,
                completed_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Manual',$12,$3,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),CASE WHEN $7='Completed' THEN NOW() ELSE NULL END)
            RETURNING *
            `,
            [
                plan.risk_id,
                plan.plan_title,
                plan.treatment_strategy,
                plan.action_owner,
                plan.due_date,
                plan.progress_percent,
                status,
                plan.evidence_file_name,
                plan.evidence_url,
                plan.evidence_notes,
                req.user.id,
                ['Accepted','Treatment In Progress','Monitoring'].includes(risk.workflow_status) ? 'Active Monitoring' : 'Focal Reviewed',
                plan.treatment_objective,
                plan.treatment_actions,
                plan.evidence_required,
                plan.monitoring_frequency,
                plan.review_date || plan.due_date,
                plan.target_residual_likelihood,
                plan.target_residual_impact,
                plan.target_residual_likelihood * plan.target_residual_impact,
                req.user.id
            ]
        );

        const treatmentPlanId = result.rows[0].id;
        const riskTreatmentStatus = status === 'Completed' ? 'Completed' : status === 'Not Started' ? 'Not Started' : 'In Progress';
        await pool.query(`UPDATE risks SET workflow_status=CASE WHEN workflow_status IN('Accepted','Treatment In Progress','Monitoring') THEN CASE WHEN $2::varchar='Completed' THEN 'Monitoring' ELSE 'Treatment In Progress' END ELSE workflow_status END,status=CASE WHEN workflow_status IN('Accepted','Treatment In Progress','Monitoring') THEN CASE WHEN $2::varchar='Completed' THEN 'Monitoring' ELSE 'Treatment In Progress' END ELSE status END,treatment_status=$2::varchar,updated_at=NOW() WHERE id=$1`,[plan.risk_id,riskTreatmentStatus]);
        await logAudit({req,action:'TREATMENT_ASSIGNED',entityType:'Risk',entityId:plan.risk_id,details:{treatment_plan_id:treatmentPlanId,action_owner:plan.action_owner,status}});
        await notifyTreatment(req,plan.risk_id,'Treatment Plan Assigned',`${plan.plan_title} was assigned to ${plan.action_owner}.`);
        if(status!=='Completed'&&risk.created_by)await createAction({actionKey:`treatment:${treatmentPlanId}:${risk.created_by}`,module:'Treatment',actionType:'Update Treatment',title:plan.plan_title,description:`Treatment assigned for risk ${plan.risk_id}.`,priority:'High',status:'Pending',assignedTo:risk.created_by,assignedBy:req.user.id,division:risk.division||risk.directorate,dueAt:plan.due_date,sourceType:'TreatmentPlan',sourceId:treatmentPlanId,actionUrl:'pages/treatment.html',availableActions:['update','upload','complete','view'],emailEnabled:true},{req});
        if(status==='Completed')await notifyTreatment(req,plan.risk_id,'Treatment Completed',`${plan.plan_title} has been completed and moved to monitoring.`);
        if(status==='Completed')await completeBySource('TreatmentPlan',treatmentPlanId,{actor:req.user,req,comments:'Treatment plan completed.'});

        res.status(201).json({
            success: true,
            message: 'Treatment plan created successfully.',
            treatmentPlan: result.rows[0]
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Unable to create treatment plan.'
        });
    }
};

exports.updateTreatmentPlan = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const plan = normalizeTreatmentInput(req.body);
        const control = normalizeControlReassessment(req.body);
        if (!Number.isInteger(plan.risk_id)) {
            return res.status(400).json({success:false,message:'Select a valid risk.'});
        }
        const existing = await pool.query(
            `
            SELECT tp.*, r.directorate, r.division,
                   r.created_by AS risk_created_by, r.entry_source, r.focal_visibility,
                   r.existing_controls,r.control_effectiveness,r.control_type,r.control_owner,
                   r.control_design_adequacy,r.control_evidence,r.control_last_tested_date,
                   r.control_exceptions,r.control_next_review_date,r.control_assessment_basis,
                   r.control_assessment_confidence,r.inherent_risk_score,r.current_risk_score
            FROM treatment_plans tp
            INNER JOIN risks r ON r.id = tp.risk_id
            WHERE tp.id = $1
            `,
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Treatment plan not found.'
            });
        }
        if (Number(plan.risk_id) !== Number(existing.rows[0].risk_id)) {
            return res.status(400).json({
                success:false,
                message:'A treatment plan cannot be reassigned to another risk.'
            });
        }

        const risk = await getRiskForAccess(plan.risk_id);

        if (!risk) {
            return res.status(404).json({
                success: false,
                message: 'Risk not found.'
            });
        }

        if (!canModifyPlan(req.user, existing.rows[0]) || !canAccessRisk(req.user, risk)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update this treatment plan.'
            });
        }

        const errors = [
            ...validateTreatmentInput(plan),
            ...validateControlReassessment(control,existing.rows[0],req.user)
        ];
        if (errors.length > 0) {
            return res.status(400).json({success:false,message:errors[0],errors});
        }

        const status = deriveStatus(plan);
        await client.query('BEGIN');
        await client.query('SELECT id FROM risks WHERE id=$1 FOR UPDATE',[plan.risk_id]);
        const result = await client.query(
            `
            UPDATE treatment_plans
            SET
                risk_id = $1,
                plan_title = $2,
                treatment_strategy = $3,
                action_owner = $4,
                due_date = $5,
                progress_percent = $6,
                status = $7,
                evidence_file_name = $8,
                evidence_url = $9,
                evidence_notes = $10,
                treatment_objective = $11,
                treatment_actions = $12,
                evidence_required = $13,
                monitoring_frequency = $14,
                review_date = $15,
                target_residual_likelihood = $16,
                target_residual_impact = $17,
                target_residual_score = $18,
                lifecycle_status = $19,
                focal_reviewed_by = CASE WHEN $20::varchar='Risk Focal Person' THEN $21 ELSE focal_reviewed_by END,
                focal_reviewed_at = CASE WHEN $20::varchar='Risk Focal Person' THEN NOW() ELSE focal_reviewed_at END,
                completed_at = CASE WHEN $7='Completed' THEN COALESCE(completed_at,NOW()) ELSE NULL END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $22
            RETURNING *
            `,
            [
                plan.risk_id,
                plan.plan_title,
                plan.treatment_strategy,
                plan.action_owner,
                plan.due_date,
                plan.progress_percent,
                status,
                plan.evidence_file_name,
                plan.evidence_url,
                plan.evidence_notes,
                plan.treatment_objective,
                plan.treatment_actions,
                plan.evidence_required,
                plan.monitoring_frequency,
                plan.review_date || plan.due_date,
                plan.target_residual_likelihood,
                plan.target_residual_impact,
                plan.target_residual_likelihood * plan.target_residual_impact,
                status === 'Completed' ? 'Completed' : 'Pending Risk Approval',
                req.user.role,
                req.user.id,
                id
            ]
        );

        const approvalUpdate = req.user.role === 'Risk Committee Chairman'
            ? await client.query(
                `UPDATE treatment_plans SET
                    approval_status='Pending Committee Approval',
                    approved_by=NULL,approved_at=NULL,approval_comments=NULL,
                    committee_returned_by=NULL,committee_returned_at=NULL,committee_return_comments=NULL,
                    updated_at=NOW()
                 WHERE id=$1 RETURNING *`,
                [id]
            )
            : await client.query(
                `UPDATE treatment_plans SET
                    approval_status='Pending Champion Approval',
                    champion_approved_by=NULL,champion_approved_at=NULL,champion_approval_comments=NULL,
                    approved_by=NULL,approved_at=NULL,approval_comments=NULL,
                    committee_returned_by=NULL,committee_returned_at=NULL,committee_return_comments=NULL,
                    updated_at=NOW()
                 WHERE id=$1 RETURNING *`,
                [id]
            );
        const riskTreatmentStatus = status === 'Completed' ? 'Completed' : status === 'Not Started' ? 'Not Started' : 'In Progress';
        await client.query(`UPDATE risks SET workflow_status=CASE WHEN workflow_status IN('Accepted','Treatment In Progress','Monitoring') THEN CASE WHEN $2::varchar='Completed' THEN 'Monitoring' ELSE 'Treatment In Progress' END ELSE workflow_status END,status=CASE WHEN workflow_status IN('Accepted','Treatment In Progress','Monitoring') THEN CASE WHEN $2::varchar='Completed' THEN 'Monitoring' ELSE 'Treatment In Progress' END ELSE status END,treatment_status=$2::varchar,updated_at=NOW() WHERE id=$1`,[plan.risk_id,riskTreatmentStatus]);
        let controlWarning = null;
        if (control.requested) {
            const proposed = assessControlAssurance({
                existing_controls:existing.rows[0].existing_controls,
                ...control
            });
            const before = {
                effectiveness:existing.rows[0].control_effectiveness,
                type:existing.rows[0].control_type,
                owner:existing.rows[0].control_owner,
                design_adequacy:existing.rows[0].control_design_adequacy,
                evidence:existing.rows[0].control_evidence,
                last_tested_date:existing.rows[0].control_last_tested_date,
                exceptions:existing.rows[0].control_exceptions,
                next_review_date:existing.rows[0].control_next_review_date,
                reason:existing.rows[0].control_assessment_basis
            };
            const after = {
                effectiveness:control.control_effectiveness,
                type:control.control_type,
                owner:control.control_owner,
                design_adequacy:control.control_design_adequacy,
                evidence:control.control_evidence,
                last_tested_date:control.control_last_tested_date,
                exceptions:control.control_exceptions,
                next_review_date:control.control_next_review_date,
                reason:control.control_assessment_basis
            };
            await client.query(
                `UPDATE risks SET
                    control_effectiveness=$1,control_type=$2,control_owner=$3,
                    control_design_adequacy=$4,control_evidence=$5,control_last_tested_date=$6,
                    control_exceptions=$7,control_next_review_date=$8,control_assessment_basis=$9,
                    control_assessment_confidence=$10,control_assessed_by=$11,
                    control_assessed_at=NOW(),updated_at=NOW()
                 WHERE id=$12`,
                [
                    control.control_effectiveness,control.control_type,control.control_owner,
                    control.control_design_adequacy,control.control_evidence,control.control_last_tested_date,
                    control.control_exceptions,control.control_next_review_date,control.control_assessment_basis,
                    proposed.confidence,req.user.id,plan.risk_id
                ]
            );
            controlWarning = controlScoreConsistency({
                effectiveness:control.control_effectiveness,
                inherentScore:existing.rows[0].inherent_risk_score,
                currentScore:existing.rows[0].current_risk_score
            });
            await client.query(
                `INSERT INTO risk_history(
                    risk_id,action,from_status,to_status,comment,changed_by,details
                 ) VALUES($1,'Control Assurance Reassessed',$2,$2,$3,$4,$5)`,
                [
                    plan.risk_id,
                    status,
                    control.control_assessment_basis,
                    req.user.id,
                    {
                        treatment_plan_id:Number(id),
                        before,
                        after,
                        confidence:proposed.confidence,
                        score_consistency_warning:controlWarning
                    }
                ]
            );
        }
        await client.query('COMMIT');
        const auditAction=req.user.role==='Risk Committee Chairman'
            ? 'COMMITTEE_TREATMENT_AMENDED'
            : status==='Completed'?'TREATMENT_COMPLETED':'TREATMENT_UPDATED';
        await logAudit({
            req,action:auditAction,entityType:'Risk',entityId:plan.risk_id,
            details:{
                treatment_plan_id:id,status,
                ...(req.user.role==='Risk Committee Chairman'?{
                    champion_submission:{
                        plan_title:existing.rows[0].plan_title,
                        treatment_strategy:existing.rows[0].treatment_strategy,
                        action_owner:existing.rows[0].action_owner,
                        due_date:existing.rows[0].due_date,
                        treatment_actions:existing.rows[0].treatment_actions,
                        target_residual_score:existing.rows[0].target_residual_score,
                        champion_approved_by:existing.rows[0].champion_approved_by,
                        champion_approved_at:existing.rows[0].champion_approved_at
                    },
                    committee_amendment:{
                        plan_title:plan.plan_title,treatment_strategy:plan.treatment_strategy,
                        action_owner:plan.action_owner,due_date:plan.due_date,
                        treatment_actions:plan.treatment_actions,
                        target_residual_score:plan.target_residual_likelihood*plan.target_residual_impact
                    }
                }:{}),
                ...(control.requested?{
                    control_reassessment:{
                        from:existing.rows[0].control_effectiveness,
                        to:control.control_effectiveness,
                        reason:control.control_assessment_basis,
                        score_consistency_warning:controlWarning
                    }
                }:{})
            }
        });
        if(status==='Completed')await notifyTreatment(req,plan.risk_id,'Treatment Completed',`${plan.plan_title} has been completed and moved to monitoring.`);
        else if(control.requested)await notifyTreatment(req,plan.risk_id,'Treatment and Control Assurance Updated',`${plan.plan_title} is ${plan.progress_percent}% complete. Control effectiveness was reassessed as ${control.control_effectiveness}.`);
        else await notifyTreatment(req,plan.risk_id,'Treatment Progress Updated',`${plan.plan_title} is ${plan.progress_percent}% complete and ${status}.`);
        if(status==='Completed')await completeBySource('TreatmentPlan',id,{actor:req.user,req,comments:'Treatment plan completed.'});

        res.json({
            success: true,
            message: controlWarning
                ? `Treatment and control assurance updated. Review warning: ${controlWarning}`
                : control.requested
                    ? 'Treatment and control assurance updated successfully.'
                    : 'Treatment plan updated successfully.',
            treatmentPlan: approvalUpdate.rows[0] || result.rows[0],
            controlWarning
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Unable to update treatment plan.'
        });
    } finally {
        client.release();
    }
};

exports.approveAllTreatmentPlans = async (req, res) => {
    const client = await pool.connect();
    try {
        const division = req.user.role === 'Risk Champion'
            ? req.user.division
            : String(req.body.division || '').trim();
        const comments = String(req.body.comments || '').trim() || null;
        const params = [req.user.id, comments];
        const scope = [];
        const planIds = [...new Set((req.body.plan_ids || []).map(Number).filter(Number.isInteger))];
        if (planIds.length) {
            params.push(planIds);
            scope.push(`tp.id=ANY($${params.length}::int[])`);
        }
        if (division) {
            params.push(division);
            scope.push(`COALESCE(NULLIF(r.division,''),r.directorate)=$${params.length}`);
        }

        const committeeDecision = isCommitteeDecisionRole(req.user.role);
        const requiredStatus = requiredTreatmentApprovalStatus(req.user.role);
        params.push(requiredStatus);
        const requiredStatusIndex = params.length;
        await client.query('BEGIN');
        const result = await client.query(
            `UPDATE treatment_plans tp
             SET approval_status=${committeeDecision ? "'Approved'" : "'Pending Committee Approval'"},
                 champion_approved_by=CASE WHEN ${committeeDecision ? 'FALSE' : 'TRUE'} THEN $1 ELSE champion_approved_by END,
                 champion_approved_at=CASE WHEN ${committeeDecision ? 'FALSE' : 'TRUE'} THEN NOW() ELSE champion_approved_at END,
                 champion_approval_comments=CASE WHEN ${committeeDecision ? 'FALSE' : 'TRUE'} THEN $2 ELSE champion_approval_comments END,
                 approved_by=CASE WHEN ${committeeDecision ? 'TRUE' : 'FALSE'} THEN $1 ELSE NULL END,
                 approved_at=CASE WHEN ${committeeDecision ? 'TRUE' : 'FALSE'} THEN NOW() ELSE NULL END,
                 approval_comments=CASE WHEN ${committeeDecision ? 'TRUE' : 'FALSE'} THEN $2 ELSE NULL END,
                 committee_returned_by=NULL,committee_returned_at=NULL,committee_return_comments=NULL,
                 lifecycle_status=CASE
                    WHEN tp.status='Completed' THEN 'Completed'
                    WHEN ${committeeDecision ? 'TRUE' : 'FALSE'} AND r.workflow_status IN('Accepted','Treatment In Progress','Monitoring') THEN 'Active Monitoring'
                    ELSE 'Pending Risk Approval'
                 END,
                 updated_at=NOW()
             FROM risks r
             WHERE r.id=tp.risk_id
               AND tp.approval_status=$${requiredStatusIndex}
               AND tp.lifecycle_status NOT IN('Completed','Deferred')
               AND NULLIF(BTRIM(tp.treatment_actions),'') IS NOT NULL
               AND NULLIF(BTRIM(tp.action_owner),'') IS NOT NULL
               AND tp.due_date IS NOT NULL
               ${scope.length ? `AND ${scope.join(' AND ')}` : ''}
             RETURNING tp.id,r.risk_id,r.risk_title`,
            params
        );
        await client.query('COMMIT');
        await logAudit({
            req,
            action:committeeDecision ? 'COMMITTEE_TREATMENT_PLANS_BULK_APPROVED' : 'CHAMPION_TREATMENT_PLANS_BULK_APPROVED',
            entityType:'Treatment Plan',
            entityId:division || 'Enterprise',
            details:{division:division || 'Enterprise',count:result.rowCount,planIds:result.rows.map(plan => plan.id),comments}
        });
        res.json({
            success:true,
            message:result.rowCount
                ? committeeDecision
                    ? `${result.rowCount} treatment plan${result.rowCount === 1 ? '' : 's'} received final Committee approval.`
                    : `${result.rowCount} treatment plan${result.rowCount === 1 ? '' : 's'} approved by the Champion and sent to the Committee.`
                : `No eligible treatment plans were awaiting ${committeeDecision ? 'Committee' : 'Champion'} approval.`,
            approvedCount:result.rowCount,
            treatmentPlans:result.rows
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);
        res.status(500).json({success:false,message:'Unable to approve the treatment plans.'});
    } finally {
        client.release();
    }
};

exports.decideTreatmentPlan = async (req, res) => {
    const client = await pool.connect();
    try {
        const action = String(req.body.action || '').trim().toLowerCase();
        const comments = String(req.body.comments || '').trim() || null;
        if (!['approve','return'].includes(action)) {
            return res.status(400).json({success:false,message:'Select approve or return.'});
        }
        if (action === 'return' && !comments) {
            return res.status(400).json({success:false,message:'A reason is required when returning a treatment plan.'});
        }
        const committeeDecision = isCommitteeDecisionRole(req.user.role);
        const requiredStatus = requiredTreatmentApprovalStatus(req.user.role);
        await client.query('BEGIN');
        const plan = (await client.query(
            `SELECT tp.*,COALESCE(NULLIF(r.division,''),r.directorate) AS division,r.workflow_status,r.risk_id AS risk_code
             FROM treatment_plans tp JOIN risks r ON r.id=tp.risk_id
             WHERE tp.id=$1 FOR UPDATE OF tp`,
            [req.params.id]
        )).rows[0];
        if (!plan) {
            await client.query('ROLLBACK');
            return res.status(404).json({success:false,message:'Treatment plan not found.'});
        }
        if (req.user.role === 'Risk Champion' && req.user.division !== plan.division) {
            await client.query('ROLLBACK');
            return res.status(403).json({success:false,message:'This treatment plan is outside your division.'});
        }
        if (plan.approval_status !== requiredStatus) {
            await client.query('ROLLBACK');
            return res.status(409).json({success:false,message:`This plan is not awaiting ${committeeDecision ? 'Committee' : 'Champion'} approval.`});
        }
        if (!plan.treatment_actions || !plan.action_owner || !plan.due_date) {
            await client.query('ROLLBACK');
            return res.status(409).json({success:false,message:'Complete the treatment actions, owner and due date before approval.'});
        }
        let updated;
        if (action === 'return') {
            updated = (await client.query(
                `UPDATE treatment_plans SET approval_status='Returned',
                    committee_returned_by=CASE WHEN $1::boolean THEN $2 ELSE committee_returned_by END,
                    committee_returned_at=CASE WHEN $1::boolean THEN NOW() ELSE committee_returned_at END,
                    committee_return_comments=CASE WHEN $1::boolean THEN $3 ELSE committee_return_comments END,
                    approval_comments=$3,updated_at=NOW()
                 WHERE id=$4 RETURNING *`,
                [committeeDecision,req.user.id,comments,plan.id]
            )).rows[0];
        } else if (committeeDecision) {
            updated = (await client.query(
                `UPDATE treatment_plans SET approval_status='Approved',
                    approved_by=$1,approved_at=NOW(),approval_comments=$2,
                    committee_returned_by=NULL,committee_returned_at=NULL,committee_return_comments=NULL,
                    lifecycle_status=CASE WHEN status='Completed' THEN 'Completed'
                        WHEN $3::varchar IN('Accepted','Treatment In Progress','Monitoring') THEN 'Active Monitoring'
                        ELSE 'Pending Risk Approval' END,updated_at=NOW()
                 WHERE id=$4 RETURNING *`,
                [req.user.id,comments,plan.workflow_status,plan.id]
            )).rows[0];
        } else {
            updated = (await client.query(
                `UPDATE treatment_plans SET approval_status='Pending Committee Approval',
                    champion_approved_by=$1,champion_approved_at=NOW(),champion_approval_comments=$2,
                    approved_by=NULL,approved_at=NULL,approval_comments=NULL,updated_at=NOW()
                 WHERE id=$3 RETURNING *`,
                [req.user.id,comments,plan.id]
            )).rows[0];
        }
        await client.query('COMMIT');
        await logAudit({
            req,
            action:`${committeeDecision ? 'COMMITTEE' : 'CHAMPION'}_TREATMENT_${action.toUpperCase()}`,
            entityType:'Treatment Plan',entityId:plan.id,
            details:{riskId:plan.risk_code,division:plan.division,comments}
        });
        await notifyTreatment(
            req,plan.risk_id,
            action === 'return' ? 'Treatment Plan Returned' : committeeDecision ? 'Treatment Plan Finally Approved' : 'Treatment Plan Sent to Committee',
            `${plan.plan_title} was ${action === 'return' ? 'returned for rework' : committeeDecision ? 'approved by the Risk Committee' : 'approved by the Risk Champion and sent to the Committee'}.`
        );
        res.json({
            success:true,
            message:action === 'return'
                ? 'Treatment plan returned for rework.'
                : committeeDecision ? 'Final Committee approval recorded.' : 'Champion approval recorded and sent to the Committee.',
            treatmentPlan:updated
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(error);
        res.status(500).json({success:false,message:'Unable to record the treatment decision.'});
    } finally {
        client.release();
    }
};

exports.deleteTreatmentPlan = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await pool.query(
            `
            SELECT tp.id, tp.created_by, r.directorate, r.division,
                   r.created_by AS risk_created_by, r.entry_source, r.focal_visibility
            FROM treatment_plans tp
            INNER JOIN risks r ON r.id = tp.risk_id
            WHERE tp.id = $1
            `,
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Treatment plan not found.'
            });
        }

        if (!canModifyPlan(req.user, existing.rows[0])) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this treatment plan.'
            });
        }

        await pool.query('DELETE FROM treatment_plans WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Treatment plan deleted successfully.'
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Unable to delete treatment plan.'
        });
    }
};
