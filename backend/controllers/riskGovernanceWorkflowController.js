const pool = require('../config/db');
const { remaining } = require('../services/slaService');

const pendingStatuses = ['Pending', 'Under Review', 'Escalated'];
const divisionOf = user => user.division || user.directorate || '';
const isChairman = user => ['Risk Committee Chairman', 'System Administrator'].includes(user.role);

function governedItem(overrides) {
    return {
        id: overrides.id,
        approval_type: overrides.approval_type,
        item_title: overrides.item_title,
        submitted_by: overrides.submitted_by || 'NCA GRC',
        current_stage: overrides.current_stage,
        priority: overrides.priority || 'Medium',
        submitted_at: overrides.submitted_at || null,
        due_at: overrides.due_at || null,
        status: 'Pending',
        division: overrides.division || '',
        item_count: Number(overrides.item_count || 1),
        item_kind: overrides.item_kind,
        action_url: overrides.action_url,
        bulk_supported: false,
        sla: overrides.due_at ? remaining(overrides.due_at) : { overdue: false, hours: null }
    };
}

async function legacyItems(user) {
    const params = [user.id, user.role];
    const conditions = [
        `wi.subject_type<>'Risk'`,
        `wi.status=ANY($3::varchar[])`,
        `(ws.approver_user_id=$1 OR (
            ws.approver_user_id IS NULL
            AND ws.approver_role=$2
            AND (wi.division IS NULL OR wi.division='' OR wi.division=$4)
        ) OR $2='System Administrator')`
    ];
    params.push(pendingStatuses, divisionOf(user));
    const result = await pool.query(
        `SELECT wi.*,wd.name approval_type,ws.name current_stage,u.full_name submitted_by
         FROM workflow_instances wi
         JOIN workflow_definitions wd ON wd.id=wi.workflow_definition_id
         JOIN workflow_stage_instances ws
           ON ws.workflow_instance_id=wi.id AND ws.stage_order=wi.current_stage_order
         JOIN users u ON u.id=wi.requester_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY wi.submitted_at DESC`,
        params
    );
    return result.rows.map(item => ({
        ...item,
        item_kind: 'legacy-workflow',
        item_count: 1,
        action_url: `approval-details.html?id=${item.id}`,
        bulk_supported: true,
        sla: remaining(item.due_at)
    }));
}

async function importBatchItems(user) {
    if (!['Risk Champion', 'Risk Committee Chairman', 'System Administrator'].includes(user.role)) return [];
    const chairman = isChairman(user);
    const params = [chairman ? 'Awaiting Chairman' : 'Champion Review'];
    const conditions = [`batch.status=$1`];
    if (!chairman) {
        params.push(divisionOf(user));
        conditions.push(`batch.division=$2`);
    }
    const result = await pool.query(
        `SELECT batch.*,u.full_name submitted_by,
                COUNT(risk.id)::int item_count,
                COUNT(risk.id) FILTER(WHERE governance.review_stage='Awaiting Champion Review')::int remaining_count,
                COUNT(risk.id) FILTER(WHERE risk.risk_level='High')::int high_count
         FROM risk_register_import_batches batch
         LEFT JOIN users u ON u.id=batch.uploaded_by
         LEFT JOIN risks risk ON risk.import_batch_id=batch.id
         LEFT JOIN risk_assessment_governance governance ON governance.risk_id=risk.id
         WHERE ${conditions.join(' AND ')}
         GROUP BY batch.id,u.full_name
         ORDER BY batch.created_at DESC`,
        params
    );
    return result.rows.map(batch => governedItem({
        id: `register-${batch.id}`,
        approval_type: 'Risk Register Upload',
        item_title: `${batch.file_name} · ${batch.item_count} risk${Number(batch.item_count) === 1 ? '' : 's'}`,
        submitted_by: batch.submitted_by,
        current_stage: chairman ? 'Committee Final Decision' : 'Champion Batch Review',
        priority: Number(batch.high_count) ? 'High' : 'Medium',
        submitted_at: batch.created_at,
        division: batch.division,
        item_count: batch.item_count,
        item_kind: 'risk-register-batch',
        action_url: `risks.html?import_batch_id=${batch.id}`
    }));
}

async function workplanItems(user) {
    if (!['Risk Champion', 'Risk Committee Chairman', 'System Administrator'].includes(user.role)) return [];
    const chairman = isChairman(user);
    const params = [];
    const conditions = [`upload.status='Processed'`];
    if (!chairman) {
        params.push(divisionOf(user));
        conditions.push(`upload.division=$1`);
    }
    conditions.push(chairman
        ? `EXISTS(
            SELECT 1 FROM workplan_programmes programme
            JOIN workplan_actions action ON action.programme_id=programme.id
            JOIN workplan_risk_assessments assessment ON assessment.action_id=action.id
            JOIN risks risk ON risk.id=assessment.generated_risk_id
            WHERE programme.upload_id=upload.id
              AND risk.workflow_status='Accepted' AND risk.committee_reviewed_at IS NULL
        )`
        : `EXISTS(
            SELECT 1 FROM workplan_programmes programme
            JOIN workplan_actions action ON action.programme_id=programme.id
            JOIN workplan_risk_assessments assessment ON assessment.action_id=action.id
            JOIN risks risk ON risk.id=assessment.generated_risk_id
            WHERE programme.upload_id=upload.id
              AND risk.workflow_status IN('Submitted','Under Review')
        )`);
    const result = await pool.query(
        `SELECT upload.*,u.full_name submitted_by,
                counts.item_count,counts.high_count
         FROM workplan_uploads upload
         LEFT JOIN users u ON u.id=upload.uploaded_by
         JOIN LATERAL(
            SELECT COUNT(risk.id)::int item_count,
                   COUNT(risk.id) FILTER(WHERE risk.risk_level='High')::int high_count
            FROM workplan_programmes programme
            JOIN workplan_actions action ON action.programme_id=programme.id
            JOIN workplan_risk_assessments assessment ON assessment.action_id=action.id
            JOIN risks risk ON risk.id=assessment.generated_risk_id
            WHERE programme.upload_id=upload.id
              AND ${chairman
                ? `risk.workflow_status='Accepted' AND risk.committee_reviewed_at IS NULL`
                : `risk.workflow_status IN('Submitted','Under Review')`}
         ) counts ON counts.item_count>0
         WHERE ${conditions.join(' AND ')}
         ORDER BY upload.submitted_at DESC,upload.created_at DESC`,
        params
    );
    return result.rows.map(upload => governedItem({
        id: `workplan-${upload.id}`,
        approval_type: 'Work Plan Upload',
        item_title: `${upload.plan_year} ${upload.division} work plan · ${upload.item_count} risk${Number(upload.item_count) === 1 ? '' : 's'}`,
        submitted_by: upload.submitted_by,
        current_stage: chairman ? 'Committee Final Decision' : 'Champion Batch Review',
        priority: Number(upload.high_count) ? 'High' : 'Medium',
        submitted_at: upload.submitted_at || upload.created_at,
        division: upload.division,
        item_count: upload.item_count,
        item_kind: 'workplan-batch',
        action_url: `workplans.html?workplan_id=${upload.id}`
    }));
}

async function riskItems(user) {
    if (!['Risk Champion', 'Risk Committee Chairman', 'System Administrator'].includes(user.role)) return [];
    const chairman = isChairman(user);
    const params = [];
    const conditions = [
        `governance.review_stage=$1`,
        `risk.import_batch_id IS NULL`,
        `risk.source_workplan_action_id IS NULL`
    ];
    params.push(chairman ? 'Awaiting Chairman Review' : 'Awaiting Champion Review');
    if (!chairman) {
        params.push(divisionOf(user));
        conditions.push(`COALESCE(NULLIF(risk.division,''),risk.directorate)=$2`);
    }
    const result = await pool.query(
        `SELECT risk.id,risk.risk_id,risk.risk_title,risk.risk_level,risk.submitted_at,risk.created_at,
                COALESCE(NULLIF(risk.division,''),risk.directorate) division,
                creator.full_name submitted_by
         FROM risks risk
         JOIN risk_assessment_governance governance ON governance.risk_id=risk.id
         LEFT JOIN users creator ON creator.id=risk.created_by
         WHERE ${conditions.join(' AND ')}
         ORDER BY risk.updated_at DESC`,
        params
    );
    if (!chairman) {
        return result.rows.map(risk => governedItem({
            id: `risk-${risk.id}`,
            approval_type: 'Individual Risk Assessment',
            item_title: `${risk.risk_id} - ${risk.risk_title}`,
            submitted_by: risk.submitted_by,
            current_stage: 'Champion Assessment',
            priority: risk.risk_level,
            submitted_at: risk.submitted_at || risk.created_at,
            division: risk.division,
            item_kind: 'risk',
            action_url: `pending-approvals.html?risk_id=${risk.id}`
        }));
    }
    const groups = new Map();
    result.rows.forEach(risk => {
        const key = risk.division || 'Unassigned';
        const group = groups.get(key) || { risks: [], high: 0, submitted_at: risk.submitted_at || risk.created_at };
        group.risks.push(risk);
        if (risk.risk_level === 'High') group.high += 1;
        groups.set(key, group);
    });
    return [...groups.entries()].map(([division, group]) => governedItem({
        id: `committee-risks-${encodeURIComponent(division)}`,
        approval_type: 'Committee Risk Decisions',
        item_title: `${division} · ${group.risks.length} risk${group.risks.length === 1 ? '' : 's'}`,
        submitted_by: 'Division Risk Champions',
        current_stage: 'Committee Final Decision',
        priority: group.high ? 'High' : 'Medium',
        submitted_at: group.submitted_at,
        division,
        item_count: group.risks.length,
        item_kind: 'committee-risk-group',
        action_url: `pending-approvals.html?queue=risks&division=${encodeURIComponent(division)}`
    }));
}

async function treatmentItems(user) {
    if (!['Risk Champion', 'Risk Committee Chairman', 'System Administrator'].includes(user.role)) return [];
    const chairman = isChairman(user);
    const params = [chairman ? 'Pending Committee Approval' : 'Pending Champion Approval'];
    const conditions = [`plan.approval_status=$1`];
    if (!chairman) {
        params.push(divisionOf(user));
        conditions.push(`COALESCE(NULLIF(risk.division,''),risk.directorate)=$2`);
    }
    const result = await pool.query(
        `SELECT COALESCE(NULLIF(risk.division,''),risk.directorate,'Unassigned') division,
                COUNT(*)::int item_count,
                COUNT(*) FILTER(WHERE risk.risk_level='High')::int high_count,
                MAX(plan.updated_at) submitted_at
         FROM treatment_plans plan
         JOIN risks risk ON risk.id=plan.risk_id
         WHERE ${conditions.join(' AND ')}
         GROUP BY COALESCE(NULLIF(risk.division,''),risk.directorate,'Unassigned')
         ORDER BY division`,
        params
    );
    return result.rows.map(group => governedItem({
        id: `treatments-${encodeURIComponent(group.division)}`,
        approval_type: 'Treatment Plan Decisions',
        item_title: `${group.division} · ${group.item_count} treatment plan${Number(group.item_count) === 1 ? '' : 's'}`,
        submitted_by: chairman ? 'Division Risk Champions' : 'Risk Focal Persons',
        current_stage: chairman ? 'Committee Final Decision' : 'Champion Treatment Review',
        priority: Number(group.high_count) ? 'High' : 'Medium',
        submitted_at: group.submitted_at,
        division: group.division,
        item_count: group.item_count,
        item_kind: 'treatment-group',
        action_url: `pending-approvals.html?queue=treatments&division=${encodeURIComponent(group.division)}`
    }));
}

async function buildInbox(user) {
    const parts = await Promise.all([
        legacyItems(user),
        importBatchItems(user),
        workplanItems(user),
        riskItems(user),
        treatmentItems(user)
    ]);
    return parts.flat().sort((a, b) => {
        if (Boolean(a.sla?.overdue) !== Boolean(b.sla?.overdue)) return a.sla?.overdue ? -1 : 1;
        if (a.priority !== b.priority) return a.priority === 'High' ? -1 : b.priority === 'High' ? 1 : 0;
        return new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0);
    });
}

exports.mine = async (req, res, next) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
        const search = String(req.query.search || '').trim().toLowerCase();
        const type = String(req.query.type || '').trim();
        let approvals = await buildInbox(req.user);
        if (search) approvals = approvals.filter(item =>
            [item.item_title, item.approval_type, item.submitted_by, item.division]
                .some(value => String(value || '').toLowerCase().includes(search)));
        if (type) approvals = approvals.filter(item => item.item_kind === type);
        const total = approvals.length;
        const offset = (page - 1) * limit;
        res.json({
            success: true,
            approvals: approvals.slice(offset, offset + limit),
            pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
        });
    } catch (error) {
        next(error);
    }
};

exports.kpis = async (req, res, next) => {
    try {
        const inbox = await buildInbox(req.user);
        const historical = await pool.query(
            `SELECT
                COUNT(*) FILTER(WHERE status='Completed' AND completed_at::date=CURRENT_DATE)::int approved_today,
                COUNT(*) FILTER(WHERE status IN('Rejected','Returned') AND completed_at::date=CURRENT_DATE)::int rejected_today,
                COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM(completed_at-submitted_at))/3600)
                    FILTER(WHERE completed_at IS NOT NULL),1),0) average_approval_hours,
                COALESCE(ROUND(100.0*COUNT(*) FILTER(WHERE status='Completed')/NULLIF(COUNT(*),0),1),0) completion_rate
             FROM workflow_instances`
        );
        res.json({
            success: true,
            kpis: {
                pending_approvals: inbox.length,
                approved_today: historical.rows[0].approved_today,
                rejected_today: historical.rows[0].rejected_today,
                overdue_approvals: inbox.filter(item => item.sla?.overdue).length,
                average_approval_hours: historical.rows[0].average_approval_hours,
                completion_rate: historical.rows[0].completion_rate
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.authorizeDetails = async (req, res, next) => {
    try {
        if (req.user.role === 'System Administrator') return next();
        const item = (await pool.query(
            `SELECT wi.requester_id,wi.division,wi.priority,wi.subject_type,
                    ws.approver_user_id,ws.approver_role
             FROM workflow_instances wi
             JOIN workflow_stage_instances ws
               ON ws.workflow_instance_id=wi.id AND ws.stage_order=wi.current_stage_order
             WHERE wi.id=$1`,
            [req.params.id]
        )).rows[0];
        if (!item) return res.status(404).json({ success: false, message: 'Workflow not found.' });
        const own = Number(item.requester_id) === Number(req.user.id);
        const assigned = Number(item.approver_user_id) === Number(req.user.id);
        const divisionRole = !item.approver_user_id
            && item.approver_role === req.user.role
            && item.division === divisionOf(req.user);
        const chairman = req.user.role === 'Risk Committee Chairman' && ['High', 'Critical'].includes(item.priority);
        if (!(own || assigned || divisionRole || chairman)) {
            return res.status(403).json({ success: false, message: 'You do not have permission to view this workflow.' });
        }
        next();
    } catch (error) {
        next(error);
    }
};
