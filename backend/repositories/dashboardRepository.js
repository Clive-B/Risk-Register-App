const pool=require('../config/db');
const {applyScope}=require('../middleware/scopeMiddleware');

const DASHBOARD_TELEMETRY_ACTIONS=[
    'CLIENT_EVENT',
    'LOGIN',
    'LOGOUT',
    'FIRST_LOGIN',
    'FAILED_LOGIN',
    'LOGIN_FAILED',
    'ACCESS_DENIED',
    'NOTIFICATION_LISTED',
    'NOTIFICATION_UNREAD_COUNT_VIEWED',
    'NOTIFICATION_READ',
    'NOTIFICATION_READ_ALL'
];

function scopedWhere(req,alias='r'){
    const conditions=[],params=[];
    applyScope(req,conditions,params,{alias});
    if(req.user.role==='Risk Focal Person'){
        params.push(req.user.id);
        conditions.push(`(${alias}.created_by=$${params.length} OR ${alias}.entry_source<>'Manual - Risk Champion' OR ${alias}.focal_visibility=TRUE)`);
    }
    return{where:conditions.length?`WHERE ${conditions.join(' AND ')}`:'',conditions,params};
}

async function statistics(req){
    if(req.user.role==='System Administrator'){
        const result=await pool.query(`SELECT
          (SELECT COUNT(*)::int FROM users) users,
          (SELECT COUNT(*)::int FROM users WHERE status='Active') active_users,
          (SELECT COUNT(*)::int FROM users WHERE locked_until>NOW()) locked_accounts,
          (SELECT COUNT(*)::int FROM users WHERE created_at>=NOW()-INTERVAL '30 days') new_users,
          (SELECT COUNT(*)::int FROM audit_logs WHERE action IN ('FAILED_LOGIN','LOGIN_FAILED') AND created_at>=NOW()-INTERVAL '24 hours') failed_logins,
          (SELECT COUNT(*)::int FROM risks WHERE admission_status='Admitted') total_risks,
          (SELECT COUNT(*)::int FROM risks WHERE workflow_status='Draft') draft_risks,
          (SELECT COUNT(*)::int FROM risks WHERE workflow_status='Submitted') submitted_risks,
          (SELECT COUNT(*)::int FROM risks WHERE workflow_status='Accepted') accepted_risks,
          (SELECT COUNT(*)::int FROM risks WHERE admission_status='Admitted' AND risk_level='High') high_risks,
          (SELECT COUNT(*)::int FROM risks WHERE admission_status='Admitted' AND risk_level='Medium') medium_risks,
          (SELECT COUNT(*)::int FROM treatment_plans WHERE status<>'Completed') open_treatments,
          (SELECT COUNT(*)::int FROM treatment_plans WHERE status='Completed') completed_treatments,
          (SELECT COUNT(*)::int FROM treatment_plans WHERE due_date<CURRENT_DATE AND status<>'Completed') overdue_treatments,
          (SELECT COUNT(*)::int FROM workflow_instances WHERE status IN('Pending','Under Review','Escalated')) pending_approvals,
          (SELECT COUNT(*)::int FROM workflow_instances WHERE status IN('Approved','Completed') AND completed_at::date=CURRENT_DATE) approved_today,
          (SELECT COUNT(*)::int FROM workflow_instances WHERE status='Rejected' AND completed_at::date=CURRENT_DATE) rejected_today,
          (SELECT COUNT(*)::int FROM workflow_instances WHERE status IN('Pending','Under Review','Escalated') AND due_at<NOW()) overdue_approvals,
          (SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM(completed_at-submitted_at))/3600),1),0) FROM workflow_instances WHERE completed_at IS NOT NULL) average_approval_hours,
          (SELECT COALESCE(ROUND(100.0*COUNT(*) FILTER(WHERE status='Completed')/NULLIF(COUNT(*),0),1),0) FROM workflow_instances) workflow_completion_rate`);
        return result.rows[0];
    }
    const {where,params}=scopedWhere(req);
    const result=await pool.query(`SELECT COUNT(*) FILTER(WHERE admission_status='Admitted')::int total_risks,
      (SELECT COUNT(*)::int FROM risks mine WHERE mine.created_by=$${params.length + 1}) my_risks,
      COUNT(*) FILTER(WHERE workflow_status='Draft')::int draft_risks,
      COUNT(*) FILTER(WHERE workflow_status='Submitted')::int submitted_risks,
      COUNT(*) FILTER(WHERE workflow_status='Accepted')::int accepted_risks,
      COUNT(*) FILTER(WHERE workflow_status='Returned')::int returned_risks,
      COUNT(*) FILTER(WHERE admission_status='Admitted' AND risk_level='High')::int high_risks,
      COUNT(*) FILTER(WHERE admission_status='Admitted' AND risk_level='Medium')::int medium_risks,
      COUNT(*) FILTER(WHERE treatment_status='Completed')::int completed_treatments,
      COUNT(*) FILTER(WHERE treatment_status IS DISTINCT FROM 'Completed')::int open_treatments,
      COUNT(*) FILTER(WHERE target_completion_date<CURRENT_DATE AND treatment_status IS DISTINCT FROM 'Completed')::int overdue_treatments,
      (SELECT COUNT(*)::int FROM workflow_instances wi JOIN workflow_stage_instances ws ON ws.workflow_instance_id=wi.id AND ws.stage_order=wi.current_stage_order WHERE wi.status IN('Pending','Under Review','Escalated') AND (ws.approver_user_id=$${params.length + 1} OR (ws.approver_user_id IS NULL AND ws.approver_role=$${params.length + 2}))) pending_approvals,
      (SELECT COUNT(*)::int FROM workflow_instances wi WHERE wi.requester_id=$${params.length + 1} AND wi.status='Completed' AND wi.completed_at::date=CURRENT_DATE) approved_today,
      (SELECT COUNT(*)::int FROM workflow_instances wi WHERE wi.requester_id=$${params.length + 1} AND wi.status='Rejected' AND wi.completed_at::date=CURRENT_DATE) rejected_today,
      (SELECT COUNT(*)::int FROM workflow_instances wi JOIN workflow_stage_instances ws ON ws.workflow_instance_id=wi.id AND ws.stage_order=wi.current_stage_order WHERE wi.due_at<NOW() AND wi.status IN('Pending','Under Review','Escalated') AND (ws.approver_user_id=$${params.length + 1} OR (ws.approver_user_id IS NULL AND ws.approver_role=$${params.length + 2}))) overdue_approvals
      FROM risks r ${where}`,[...params,req.user.id,req.user.role]);
    return result.rows[0];
}

async function tasks(req){
    if(req.user.role==='System Administrator'){
        const r=await pool.query(`SELECT * FROM (
          SELECT 'Unlock Account' title,'User' module,id::text reference_id,locked_until::date due_date,'Pending' status FROM users WHERE locked_until>NOW()
          UNION ALL SELECT 'Review Audit Logs','Audit',NULL,CURRENT_DATE,'Pending' WHERE EXISTS(SELECT 1 FROM audit_logs WHERE created_at>=CURRENT_DATE)
        ) x ORDER BY due_date NULLS LAST LIMIT 20`);return r.rows;
    }
    const {where,params}=scopedWhere(req);
    const extra=req.user.role==='Risk Focal Person'?`AND r.created_by=$${params.push(req.user.id)}`:'';
    const r=await pool.query(`SELECT CASE WHEN workflow_status='Draft' THEN 'Complete Risk' WHEN workflow_status='Returned' THEN 'Complete Correction' WHEN workflow_status IN('Submitted','Under Review') THEN 'Review Risk' ELSE 'Complete Treatment' END title,
      'Risk' module,id::text reference_id,COALESCE(target_completion_date,next_review_date) due_date,
      CASE WHEN COALESCE(target_completion_date,next_review_date)<CURRENT_DATE THEN 'Overdue' ELSE 'Pending' END status,risk_title detail
      FROM risks r ${where} ${where?'AND':'WHERE'} workflow_status IN ('Draft','Returned','Submitted','Under Review','Accepted','Treatment In Progress','Monitoring') ${extra}
      ORDER BY due_date NULLS LAST LIMIT 20`,params);return r.rows;
}

async function activity(req){
    const params=[];const conditions=[];
    if(req.user.role==='Risk Champion'){
        params.push(req.user.division,req.user.id);
        conditions.push(`(r.division=$1 OR a.user_id=$2)`);
    }
    if(req.user.role==='Risk Focal Person'){
        params.push(req.user.division,req.user.id);
        conditions.push(`(r.division=$1 OR a.user_id=$2)`);
    }
    params.push(DASHBOARD_TELEMETRY_ACTIONS);
    conditions.push(`NOT (a.action=ANY($${params.length}::text[]))`);
    conditions.push(`a.action NOT LIKE 'NOTIFICATION\\_%' ESCAPE '\\'`);
    conditions.push(`a.action NOT LIKE 'DASHBOARD\\_%' ESCAPE '\\'`);
    conditions.push(`a.action NOT LIKE 'EMAIL\\_%' ESCAPE '\\'`);
    conditions.push(`a.action NOT LIKE 'PASSWORD\\_%' ESCAPE '\\'`);
    conditions.push(`a.action NOT LIKE 'SMTP\\_%' ESCAPE '\\'`);
    conditions.push(`a.action NOT LIKE 'TEMPLATE\\_%' ESCAPE '\\'`);
    const r=await pool.query(`SELECT a.id,a.user_email "user",a.user_role role,a.action,a.entity_type module,a.created_at timestamp,a.status
      FROM audit_logs a LEFT JOIN risks r ON a.entity_type='Risk' AND a.entity_id=r.id::text
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.created_at DESC LIMIT 5`,params);return r.rows;
}

module.exports={statistics,tasks,activity,DASHBOARD_TELEMETRY_ACTIONS};
