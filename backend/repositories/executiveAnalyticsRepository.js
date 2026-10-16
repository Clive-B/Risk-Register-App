const pool = require('../config/db');
const { RISK_CATEGORIES } = require('../utils/riskMatrix');
const { DIVISIONS } = require('../utils/bulkUserWorkbookCorrectionEngine');

const RISK_LIFECYCLE_STATUSES = Object.freeze(['Open','In Progress','Mitigated','Accepted','Closed']);

function filters(query, alias = 'r') {
    const clauses = [];
    const params = [];
    const add = (sql, value) => {
        if (value !== undefined && value !== null && value !== '') {
            params.push(value);
            clauses.push(sql.replace('?', `$${params.length}`));
        }
    };
    add(`${alias}.created_at >= ?::date`, query.dateFrom);
    add(`${alias}.created_at < (?::date + INTERVAL '1 day')`, query.dateTo);
    add(`${alias}.directorate = ?`, query.directorate);
    add(`COALESCE(NULLIF(${alias}.division,''),${alias}.directorate) = ?`, query.division);
    add(`${alias}.risk_category = ?`, query.category);
    add(`${alias}.risk_owner = ?`, query.owner);
    add(`${alias}.status = ?`, query.status);
    add(`${alias}.risk_level = ?`, query.level);
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', clauses, params };
}

const effectiveColumns = `
    COALESCE(g.chairman_likelihood,g.champion_likelihood,g.system_likelihood,r.likelihood) AS effective_likelihood,
    COALESCE(g.chairman_impact,g.champion_impact,g.system_impact,r.impact) AS effective_impact,
    COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score) AS effective_score,
    CASE
        WHEN g.chairman_score IS NOT NULL THEN 'Committee'
        WHEN g.champion_score IS NOT NULL THEN 'Champion'
        ELSE 'System'
    END AS assessment_source`;

function levelFor(score) {
    const value = Number(score || 0);
    return value >= 17 ? 'High' : value >= 11 ? 'Medium' : 'Low';
}

function buildExecutiveSummary({
    totalRisks,
    highRisks,
    mediumRisks,
    overdueTreatments,
    pendingApprovals,
    complianceIssues,
    auditFindings
}) {
    if (!totalRisks && !auditFindings) {
        return 'There are currently no enterprise risks or open audit findings recorded. The dashboard is ready to reflect newly admitted records.';
    }
    const parts = [
        `${totalRisks} enterprise risk${totalRisks === 1 ? ' is' : 's are'} currently recorded`,
        `${highRisks} High and ${mediumRisks} Medium`,
        `${overdueTreatments} overdue treatment${overdueTreatments === 1 ? '' : 's'}`,
        `${pendingApprovals} pending governance approval${pendingApprovals === 1 ? '' : 's'}`,
        `${complianceIssues} open regulatory compliance issue${complianceIssues === 1 ? '' : 's'}`,
        `${auditFindings} open audit finding${auditFindings === 1 ? '' : 's'}`
    ];
    return `${parts.join('; ')}. Priority attention should follow the governed score, overdue status and outstanding Committee decisions shown below.`;
}

async function kpis(query) {
    const f = filters(query);
    const result = await pool.query(
        `WITH current_period AS (
            SELECT r.*,COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score) effective_score
            FROM risks r LEFT JOIN risk_assessment_governance g ON g.risk_id=r.id ${f.where}
        ), previous AS (
            SELECT * FROM risks r
            WHERE r.created_at>=date_trunc('month',CURRENT_DATE)-INTERVAL '1 month'
              AND r.created_at<date_trunc('month',CURRENT_DATE)
        ), current_month AS (
            SELECT * FROM risks r WHERE r.created_at>=date_trunc('month',CURRENT_DATE)
        )
        SELECT
            (SELECT COUNT(*)::int FROM current_period) total_risks,
            (SELECT COUNT(*)::int FROM current_period WHERE effective_score BETWEEN 11 AND 16) medium_risks,
            (SELECT COUNT(*)::int FROM current_period WHERE effective_score>=17) high_risks,
            (SELECT COUNT(*)::int FROM treatment_plans t JOIN current_period r ON r.id=t.risk_id WHERE t.status<>'Completed') open_treatments,
            (SELECT COUNT(*)::int FROM treatment_plans t JOIN current_period r ON r.id=t.risk_id WHERE t.due_date<CURRENT_DATE AND t.status<>'Completed') overdue_treatments,
            (SELECT CASE WHEN COUNT(*) FILTER(WHERE control_effectiveness<>'Not Assessed')=0 THEN NULL
                ELSE ROUND(100.0*COUNT(*) FILTER(WHERE control_effectiveness='Effective')
                    /COUNT(*) FILTER(WHERE control_effectiveness<>'Not Assessed'),1) END
             FROM current_period) control_assurance_rate,
            (SELECT COUNT(*)::int FROM current_period WHERE control_effectiveness='Not Assessed') unassessed_controls,
            (SELECT COUNT(*)::int FROM current_period
             WHERE effective_score>=17 AND control_effectiveness='Ineffective') high_risks_ineffective_controls,
            (SELECT COUNT(*)::int FROM current_period
             WHERE control_next_review_date<CURRENT_DATE) overdue_control_reviews,
            (SELECT CASE
                WHEN COUNT(*) FILTER(WHERE applicability='Applicable' AND assessment_status<>'Not Assessed')=0 THEN NULL
                ELSE ROUND(100.0*COUNT(*) FILTER(
                    WHERE applicability='Applicable'
                      AND assessment_status='Compliant'
                      AND evidence_verified
                )/COUNT(*) FILTER(
                    WHERE applicability='Applicable' AND assessment_status<>'Not Assessed'
                ),1)
            END FROM compliance_obligations WHERE record_status='Active'
                ${query.division ? `AND division=$${f.params.length + 1}` : ''}) compliance_rate,
            (SELECT COUNT(*)::int FROM actions WHERE status NOT IN('Completed','Cancelled')
                AND (LOWER(module)='audit' OR LOWER(action_type) LIKE '%audit%finding%')) audit_findings,
            (
                (SELECT COUNT(*) FROM risk_assessment_governance g JOIN current_period r ON r.id=g.risk_id WHERE g.review_stage<>'Finalised')
                +(SELECT COUNT(*) FROM treatment_plans t JOIN current_period r ON r.id=t.risk_id WHERE t.approval_status IN('Pending Champion Approval','Pending Committee Approval'))
                +(SELECT COUNT(*) FROM workflow_instances w WHERE w.status IN('Pending','Under Review','Escalated')
                    AND COALESCE(w.subject_type,'') NOT IN('Risk','TreatmentPlan'))
            )::int pending_approvals,
            (SELECT COUNT(*)::int FROM current_period WHERE closure_date>=date_trunc('month',CURRENT_DATE)) risks_closed_month,
            (SELECT COALESCE(ROUND(AVG(closure_date-created_at::date),1),0) FROM current_period WHERE closure_date IS NOT NULL) avg_resolution_days,
            (SELECT COUNT(*)::int FROM previous) previous_total_risks,
            (SELECT COUNT(*)::int FROM current_month) current_month_risks`,
        query.division ? [...f.params,query.division] : f.params
    );
    return result.rows[0];
}

async function heatmap(query) {
    const f = filters(query);
    return (await pool.query(
        `SELECT
            COALESCE(g.chairman_likelihood,g.champion_likelihood,g.system_likelihood,r.likelihood) likelihood,
            COALESCE(g.chairman_impact,g.champion_impact,g.system_impact,r.impact) impact,
            COUNT(DISTINCT CASE
                WHEN NULLIF(TRIM(r.programme_project),'') IS NOT NULL
                    THEN 'programme:' || LOWER(TRIM(r.programme_project))
                ELSE 'unassigned:' || r.id::text
            END)::int count,
            COUNT(DISTINCT r.id)::int risk_count,
            json_agg(json_build_object(
                'id',r.id,'risk_id',r.risk_id,'title',r.risk_title,
                'programme_project',NULLIF(TRIM(r.programme_project),''),
                'level',CASE WHEN COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score)>=17 THEN 'High'
                             WHEN COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score)>=11 THEN 'Medium' ELSE 'Low' END,
                'division',COALESCE(NULLIF(r.division,''),r.directorate)
            ) ORDER BY COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score) DESC) risks
         FROM risks r LEFT JOIN risk_assessment_governance g ON g.risk_id=r.id
         ${f.where}
         GROUP BY 1,2`,
        f.params
    )).rows;
}

async function trends(query) {
    const f = filters(query);
    return (await pool.query(
        `WITH months AS (
            SELECT generate_series(date_trunc('month',CURRENT_DATE)-INTERVAL '11 months',date_trunc('month',CURRENT_DATE),INTERVAL '1 month') period_start
        ), created AS (
            SELECT date_trunc('month',created_at) period_start,COUNT(*)::int value FROM risks r ${f.where} GROUP BY 1
        ), closed AS (
            SELECT date_trunc('month',closure_date) period_start,COUNT(*)::int value FROM risks r
            ${f.where ? `${f.where} AND` : 'WHERE'} closure_date IS NOT NULL GROUP BY 1
        ), treatment AS (
            SELECT date_trunc('month',t.updated_at) period_start,COUNT(*)::int value
            FROM treatment_plans t JOIN risks r ON r.id=t.risk_id
            ${f.where ? `${f.where} AND` : 'WHERE'} t.status='Completed' GROUP BY 1
        )
        SELECT to_char(m.period_start,'YYYY-MM') period,COALESCE(c.value,0) created,
               COALESCE(cl.value,0) closed,COALESCE(t.value,0) treatments_completed
        FROM months m LEFT JOIN created c ON c.period_start=m.period_start
        LEFT JOIN closed cl ON cl.period_start=m.period_start
        LEFT JOIN treatment t ON t.period_start=m.period_start ORDER BY m.period_start`,
        f.params
    )).rows;
}

async function scorecard(query) {
    const f = filters(query);
    return (await pool.query(
        `SELECT COALESCE(NULLIF(r.division,''),r.directorate) division,
            COUNT(DISTINCT r.id)::int total_risks,
            COUNT(DISTINCT r.id) FILTER(WHERE COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score)>=17)::int high_risks,
            CASE WHEN COUNT(DISTINCT r.id) FILTER(WHERE r.risk_category='Regulatory Compliance')=0 THEN NULL
                 ELSE ROUND(100.0*COUNT(DISTINCT r.id) FILTER(
                    WHERE r.risk_category='Regulatory Compliance'
                      AND COALESCE(r.workflow_status,r.status) IN('Accepted','Treatment In Progress','Monitoring','Closed')
                 )/COUNT(DISTINCT r.id) FILTER(WHERE r.risk_category='Regulatory Compliance'),1) END compliance_score,
            COALESCE(ROUND(100.0*COUNT(DISTINCT t.id) FILTER(WHERE t.status='Completed')/NULLIF(COUNT(DISTINCT t.id),0),1),0) treatment_completion,
            NULL::numeric audit_score,
            ROUND(GREATEST(0,100-(
                COUNT(DISTINCT r.id) FILTER(WHERE COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score)>=17)*10
                +COUNT(DISTINCT r.id) FILTER(WHERE COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score) BETWEEN 11 AND 16)*4
            ))::numeric,1) governance_score
         FROM risks r LEFT JOIN risk_assessment_governance g ON g.risk_id=r.id
         LEFT JOIN treatment_plans t ON t.risk_id=r.id ${f.where}
         GROUP BY COALESCE(NULLIF(r.division,''),r.directorate)
         ORDER BY governance_score DESC,total_risks DESC`,
        f.params
    )).rows;
}

async function board(query) {
    const f = filters(query);
    const whereOpen = f.where ? `${f.where} AND` : 'WHERE';
    const baseSelect = `SELECT r.id,r.risk_id,r.risk_title,r.risk_category,
        COALESCE(NULLIF(r.division,''),r.directorate) division,r.risk_owner,r.status,r.workflow_status,r.created_at,
        ${effectiveColumns}
        FROM risks r LEFT JOIN risk_assessment_governance g ON g.risk_id=r.id`;
    const [allCounts, risks, treatments, emerging, strategic, compliance, audit, categories] = await Promise.all([
        pool.query(
            `SELECT COUNT(*)::int total,
                COUNT(*) FILTER(WHERE effective_score>=17)::int high,
                COUNT(*) FILTER(WHERE effective_score BETWEEN 11 AND 16)::int medium,
                COUNT(*) FILTER(WHERE effective_score<=10)::int low
             FROM (${baseSelect} ${f.where}) governed`,
            f.params
        ),
        pool.query(`${baseSelect} ${f.where} ORDER BY effective_score DESC,r.created_at DESC LIMIT 10`, f.params),
        pool.query(
            `SELECT t.id,t.plan_title,t.action_owner,t.due_date,t.status,t.progress_percent,
                    r.risk_id,r.risk_title,COALESCE(NULLIF(r.division,''),r.directorate) division,
                    COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score) effective_score
             FROM treatment_plans t JOIN risks r ON r.id=t.risk_id
             LEFT JOIN risk_assessment_governance g ON g.risk_id=r.id
             ${whereOpen} t.status<>'Completed'
               AND (COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score)>=17 OR t.due_date<CURRENT_DATE)
             ORDER BY CASE WHEN t.due_date<CURRENT_DATE THEN 0 ELSE 1 END,
                      COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score) DESC,
                      t.due_date LIMIT 10`,
            f.params
        ),
        pool.query(`${baseSelect} ${whereOpen} r.created_at>=CURRENT_DATE-INTERVAL '90 days' ORDER BY r.created_at DESC,effective_score DESC LIMIT 10`, f.params),
        pool.query(`${baseSelect} ${whereOpen} r.risk_category='Strategic' AND COALESCE(r.workflow_status,r.status)<>'Closed' ORDER BY effective_score DESC LIMIT 10`, f.params),
        pool.query(`${baseSelect} ${whereOpen} r.risk_category='Regulatory Compliance' AND COALESCE(r.workflow_status,r.status)<>'Closed' ORDER BY effective_score DESC LIMIT 10`, f.params),
        pool.query(
            `SELECT a.id,a.title,a.description,a.priority,a.status,a.division,a.due_at,a.action_url,a.created_at
             FROM actions a WHERE a.status NOT IN('Completed','Cancelled')
               AND (LOWER(a.module)='audit' OR LOWER(a.action_type) LIKE '%audit%finding%')
             ORDER BY CASE a.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
                      a.due_at NULLS LAST,a.created_at DESC LIMIT 10`
        ),
        pool.query(
            `SELECT COALESCE(NULLIF(risk_category,''),'Uncategorised') risk_category,
                    COUNT(*)::int total,
                    COUNT(*) FILTER(WHERE effective_score>=17)::int high,
                    COUNT(*) FILTER(WHERE effective_score BETWEEN 11 AND 16)::int medium,
                    COUNT(*) FILTER(WHERE effective_score<=10)::int low,
                    COUNT(*) FILTER(WHERE COALESCE(workflow_status,status)='Closed')::int closed
             FROM (${baseSelect} ${f.where}) governed
             GROUP BY COALESCE(NULLIF(risk_category,''),'Uncategorised')
             ORDER BY total DESC,risk_category`,
            f.params
        )
    ]);
    const counts = allCounts.rows[0];
    const pending = await kpis(query);
    return {
        topRisks: risks.rows.map(risk => ({ ...risk, risk_level: levelFor(risk.effective_score) })),
        highPriorityTreatments: treatments.rows,
        emergingRisks: emerging.rows.map(risk => ({ ...risk, risk_level: levelFor(risk.effective_score) })),
        strategicRisks: strategic.rows.map(risk => ({ ...risk, risk_level: levelFor(risk.effective_score) })),
        complianceIssues: compliance.rows.map(risk => ({ ...risk, risk_level: levelFor(risk.effective_score) })),
        auditFindings: audit.rows,
        categoryGroups: categories.rows,
        riskAppetite: {
            total: counts.total,
            high: counts.high,
            medium: counts.medium,
            low: counts.low
        },
        dataAvailability: { compliance: true, auditFindings: true },
        executiveSummary: buildExecutiveSummary({
            totalRisks: counts.total,
            highRisks: counts.high,
            mediumRisks: counts.medium,
            overdueTreatments: pending.overdue_treatments,
            pendingApprovals: pending.pending_approvals,
            complianceIssues: compliance.rowCount,
            auditFindings: audit.rowCount
        })
    };
}

async function options() {
    const result = await pool.query(
        `SELECT
            ARRAY(
                SELECT DISTINCT value FROM (
                    SELECT COALESCE(NULLIF(TRIM(division),''),NULLIF(TRIM(directorate),'')) value FROM risks
                    UNION ALL
                    SELECT COALESCE(NULLIF(TRIM(division),''),NULLIF(TRIM(directorate),'')) value FROM users WHERE status='Active'
                ) configured WHERE value IS NOT NULL ORDER BY 1
            ) configured_divisions,
            ARRAY(
                SELECT DISTINCT value FROM (
                    SELECT NULLIF(TRIM(risk_owner),'') value FROM risks
                    UNION ALL
                    SELECT NULLIF(TRIM(full_name),'') value
                    FROM users
                    WHERE status='Active' AND role IN('Risk Focal Person','Risk Champion')
                ) configured WHERE value IS NOT NULL ORDER BY 1
            ) owners`
    );
    const configured = result.rows[0];
    const approvedDivisions = [...DIVISIONS];
    const mergeApproved = values => [
        ...approvedDivisions,
        ...(values || []).filter(value => !approvedDivisions.includes(value))
    ];
    return {
        divisions: mergeApproved(configured.configured_divisions),
        categories: [...RISK_CATEGORIES],
        owners: configured.owners || [],
        statuses: [...RISK_LIFECYCLE_STATUSES],
        levels: ['Low','Medium','High']
    };
}

async function assessmentSummary(query) {
    const f = filters(query);
    const [totals, governance, keywords, responses] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE source_workplan_action_id IS NULL)::int manual,COUNT(*) FILTER(WHERE source_workplan_action_id IS NOT NULL)::int workbook,COUNT(*) FILTER(WHERE risk_level='Medium')::int medium,COUNT(*) FILTER(WHERE risk_level='High')::int high,ROUND(AVG(likelihood)::numeric,1) avg_likelihood,ROUND(AVG(impact)::numeric,1) avg_impact,ROUND(AVG(inherent_risk_score)::numeric,1) avg_score FROM risks r ${f.where}`, f.params),
        pool.query(`SELECT COUNT(*)::int assessments,COUNT(*) FILTER(WHERE wa.focal_score IS NOT NULL)::int focal_proposals,COUNT(*) FILTER(WHERE wa.champion_at IS NOT NULL)::int champion_reviews,COUNT(*) FILTER(WHERE wa.chairman_at IS NOT NULL)::int final_approvals,COUNT(*) FILTER(WHERE wa.chairman_score IS NOT NULL AND wa.chairman_score<>wa.system_score)::int final_changes FROM workplan_risk_assessments wa JOIN risks r ON r.id=wa.generated_risk_id ${f.where}`, f.params),
        pool.query(`SELECT keyword,COUNT(*)::int count FROM workplan_risk_assessments wa JOIN risks r ON r.id=wa.generated_risk_id CROSS JOIN LATERAL jsonb_array_elements_text(wa.matched_keywords) keyword ${f.where} GROUP BY keyword ORDER BY count DESC,keyword LIMIT 8`, f.params),
        pool.query(`SELECT risk_treatment response,COUNT(*)::int count FROM risks r ${f.where} GROUP BY risk_treatment ORDER BY count DESC`, f.params)
    ]);
    const summary = { ...totals.rows[0], ...governance.rows[0], top_keywords: keywords.rows, response_distribution: responses.rows };
    summary.narrative = `Of ${summary.total} risks, ${summary.manual} were manually entered and ${summary.workbook} came from work plans. ${summary.high} are High and ${summary.medium} are Medium. ${summary.final_approvals} workbook assessments have final Chairman approval; ${summary.final_changes} final decisions differ from the original system score.`;
    return summary;
}

module.exports = {
    filters,
    kpis,
    heatmap,
    trends,
    scorecard,
    board,
    options,
    assessmentSummary,
    levelFor,
    buildExecutiveSummary
};
