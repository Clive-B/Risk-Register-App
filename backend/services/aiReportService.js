const pool = require('../config/db');

const CHAMPION_REPORT = 'Champion Divisional';
const CHAIRMAN_REPORT = 'Chairman Critical';

function number(value) {
    return Number(value || 0);
}

function percentage(value) {
    return Math.round(number(value) * 10) / 10;
}

function effectiveAssessment(risk, includeFocal = true) {
    if (risk.chairman_score) {
        return {
            source: 'Committee',
            likelihood: number(risk.chairman_likelihood),
            impact: number(risk.chairman_impact),
            score: number(risk.chairman_score)
        };
    }
    if (risk.champion_score) {
        return {
            source: 'Champion',
            likelihood: number(risk.champion_likelihood),
            impact: number(risk.champion_impact),
            score: number(risk.champion_score)
        };
    }
    if (includeFocal && risk.focal_score) {
        return {
            source: 'Focal Person',
            likelihood: number(risk.focal_likelihood),
            impact: number(risk.focal_impact),
            score: number(risk.focal_score)
        };
    }
    return {
        source: 'System',
        likelihood: number(risk.system_likelihood || risk.likelihood),
        impact: number(risk.system_impact || risk.impact),
        score: number(risk.system_score || risk.inherent_risk_score)
    };
}

function isCriticalHeatCell(assessment) {
    return (assessment.likelihood === 5 && assessment.impact === 5)
        || (assessment.likelihood === 5 && assessment.impact === 4)
        || (assessment.likelihood === 4 && assessment.impact === 5);
}

function treatmentConfidence(plan, now = new Date()) {
    let score = 100;
    const due = plan.due_date ? new Date(plan.due_date) : null;
    const updated = plan.updated_at ? new Date(plan.updated_at) : null;
    if (!String(plan.treatment_actions || '').trim()) score -= 25;
    if (!String(plan.action_owner || '').trim()) score -= 20;
    if (!plan.due_date) score -= 15;
    if (!plan.evidence_file_name && !plan.evidence_url && !String(plan.evidence_notes || '').trim()) score -= 15;
    if (due && due < now && number(plan.progress_percent) < 100) score -= 20;
    if (updated && (now - updated) / 86400000 > 30) score -= 10;
    if (!plan.target_residual_score) score -= 10;
    score = Math.max(0, score);
    return {
        score,
        label: score >= 80 ? 'Strong' : score >= 55 ? 'Moderate' : 'Weak'
    };
}

function riskDataQuality(risk, plans) {
    const issues = [];
    if (!String(risk.risk_owner || '').trim()) issues.push('Risk owner is not recorded.');
    if (!String(risk.risk_description || '').trim()) issues.push('Risk description is not recorded.');
    if (!risk.next_review_date) issues.push('Next risk review date is not recorded.');
    if (!plans.length) issues.push('No treatment plan is recorded.');
    for (const plan of plans) {
        if (!String(plan.treatment_actions || '').trim()) issues.push(`Treatment ${plan.id} has no recorded actions.`);
        if (!String(plan.action_owner || '').trim()) issues.push(`Treatment ${plan.id} has no recorded owner.`);
        if (!plan.due_date) issues.push(`Treatment ${plan.id} has no due date.`);
        if (!plan.evidence_file_name && !plan.evidence_url && !String(plan.evidence_notes || '').trim()) {
            issues.push(`Treatment ${plan.id} has no evidence recorded.`);
        }
    }
    return issues;
}

function treatmentView(plan) {
    const confidence = treatmentConfidence(plan);
    return {
        id: plan.id,
        title: plan.plan_title,
        strategy: plan.treatment_strategy,
        objective: plan.treatment_objective || 'Not recorded',
        actions: plan.treatment_actions || 'Not recorded',
        owner: plan.action_owner || 'Not recorded',
        due_date: plan.due_date,
        review_date: plan.review_date,
        progress: number(plan.progress_percent),
        status: plan.status,
        lifecycle_status: plan.lifecycle_status,
        approval_status: plan.approval_status,
        evidence: plan.evidence_file_name || plan.evidence_url || plan.evidence_notes || 'Not recorded',
        updated_at: plan.updated_at,
        target_residual_score: plan.target_residual_score,
        confidence
    };
}

function buildRiskView(risk, plans, reportType) {
    const chairmanView = reportType === CHAIRMAN_REPORT;
    const assessment = effectiveAssessment(risk, !chairmanView);
    const treatmentPlans = plans.map(treatmentView);
    const overdue = treatmentPlans.filter(plan => plan.status === 'Overdue'
        || (plan.due_date && new Date(plan.due_date) < new Date() && plan.progress < 100));
    const averageProgress = treatmentPlans.length
        ? percentage(treatmentPlans.reduce((sum, plan) => sum + plan.progress, 0) / treatmentPlans.length)
        : 0;
    const view = {
        id: risk.id,
        risk_id: risk.risk_id,
        title: risk.risk_title,
        description: risk.risk_description,
        division: risk.division || risk.directorate,
        programme: risk.programme_project || risk.business_unit || 'Not recorded',
        owner: risk.risk_owner || 'Not recorded',
        category: risk.risk_category,
        workflow_status: risk.workflow_status,
        system_assessment: {
            likelihood: number(risk.system_likelihood || risk.likelihood),
            impact: number(risk.system_impact || risk.impact),
            score: number(risk.system_score || risk.inherent_risk_score)
        },
        champion_assessment: risk.champion_score ? {
            likelihood: number(risk.champion_likelihood),
            impact: number(risk.champion_impact),
            score: number(risk.champion_score)
        } : null,
        committee_assessment: risk.chairman_score ? {
            likelihood: number(risk.chairman_likelihood),
            impact: number(risk.chairman_impact),
            score: number(risk.chairman_score)
        } : null,
        effective_assessment: assessment,
        treatment_progress: averageProgress,
        treatments: treatmentPlans,
        overdue_treatments: overdue.length,
        decision_required: chairmanView && (!risk.chairman_score || treatmentPlans.some(plan => plan.approval_status === 'Pending Committee Approval')),
        action_links: {
            risk: `risks.html?risk=${risk.id}`,
            treatment: `treatment.html?risk=${risk.id}`,
            action_centre: `action-centre.html?risk=${risk.id}`
        }
    };
    if (!chairmanView) {
        view.focal_assessment = risk.focal_score ? {
            likelihood: number(risk.focal_likelihood),
            impact: number(risk.focal_impact),
            score: number(risk.focal_score)
        } : null;
    }
    view.data_quality_issues = riskDataQuality(risk, plans);
    return view;
}

function summaryFor(risks) {
    const plans = risks.flatMap(risk => risk.treatments);
    const open = risks.filter(risk => risk.workflow_status !== 'Closed').length;
    const overdue = risks.reduce((sum, risk) => sum + risk.overdue_treatments, 0);
    const progress = plans.length ? percentage(plans.reduce((sum, plan) => sum + plan.progress, 0) / plans.length) : 0;
    return {
        total_risks: risks.length,
        open_risks: open,
        total_treatments: plans.length,
        average_treatment_progress: progress,
        overdue_treatments: overdue,
        decisions_required: risks.filter(risk => risk.decision_required).length,
        risks_with_data_gaps: risks.filter(risk => risk.data_quality_issues.length).length,
        risks_by_level: risks.reduce((result, risk) => {
            const score = risk.effective_assessment.score;
            const level = score >= 17 ? 'High' : score >= 11 ? 'Medium' : 'Low';
            result[level] = (result[level] || 0) + 1;
            return result;
        }, {}),
        risks_by_status: risks.reduce((result, risk) => {
            const status = risk.workflow_status || 'Not recorded';
            result[status] = (result[status] || 0) + 1;
            return result;
        }, {}),
        critical_cells: risks.reduce((result, risk) => {
            const assessment = risk.effective_assessment;
            const cell = `L${assessment.likelihood}×I${assessment.impact} = ${assessment.score}`;
            result[cell] = (result[cell] || 0) + 1;
            return result;
        }, {}),
        treatments_by_status: plans.reduce((result, plan) => {
            result[plan.status || 'Not recorded'] = (result[plan.status || 'Not recorded'] || 0) + 1;
            return result;
        }, {})
    };
}

function narrativeFor(type, division, summary, risks) {
    if (!risks.length) {
        return type === CHAIRMAN_REPORT
            ? 'No risks currently occupy the governed 25/20/20 heat-map cells in the selected scope.'
            : `No risks are recorded for ${division || 'the selected division'} in this reporting scope.`;
    }
    const stalled = risks.filter(risk => risk.overdue_treatments > 0 || risk.treatment_progress < 25).length;
    const strongest = [...risks].sort((a, b) => b.treatment_progress - a.treatment_progress)[0];
    if (type === CHAIRMAN_REPORT) {
        return `${summary.total_risks} risk(s) occupy the governed critical cells 25 (L5×I5), 20 (L5×I4), or 20 (L4×I5). `
            + `${summary.decisions_required} require a Committee decision, ${summary.overdue_treatments} treatment(s) are overdue, `
            + `and average treatment progress is ${summary.average_treatment_progress}%. `
            + `${stalled} risk(s) require attention because treatment is overdue or below 25% progress.`;
    }
    return `${division} has ${summary.total_risks} recorded risk(s) and ${summary.total_treatments} treatment plan(s). `
        + `Average treatment progress is ${summary.average_treatment_progress}%, with ${summary.overdue_treatments} overdue treatment(s). `
        + `${strongest?.risk_id || 'No risk'} currently has the strongest recorded treatment progress.`;
}

function recommendationsFor(type, risks) {
    const recommendations = [];
    const overdue = risks.filter(risk => risk.overdue_treatments);
    const gaps = risks.filter(risk => risk.data_quality_issues.length);
    const decisions = risks.filter(risk => risk.decision_required);
    if (type === CHAIRMAN_REPORT && decisions.length) {
        recommendations.push(`Committee decision required for ${decisions.map(risk => risk.risk_id).join(', ')}.`);
    }
    if (overdue.length) {
        recommendations.push(`Escalate overdue treatment actions for ${overdue.map(risk => risk.risk_id).join(', ')} through the Action Centre.`);
    }
    if (gaps.length) {
        recommendations.push(`Resolve report data gaps for ${gaps.map(risk => risk.risk_id).join(', ')} before finalising the report.`);
    }
    const weak = risks.filter(risk => risk.treatments.some(plan => plan.confidence.label === 'Weak'));
    if (weak.length) recommendations.push(`Strengthen treatment completeness and evidence for ${weak.map(risk => risk.risk_id).join(', ')}.`);
    if (!recommendations.length) recommendations.push('Continue monitoring approved treatments and record evidence at each review date.');
    return recommendations;
}

async function loadRisks({ reportType, division, periodEnd }, db = pool) {
    const params = [periodEnd];
    const conditions = ['r.created_at::date <= $1::date'];
    if (division) {
        params.push(division);
        conditions.push(`COALESCE(NULLIF(r.division,''),r.directorate)=$${params.length}`);
    }
    const result = await db.query(
        `SELECT r.*,
                g.system_likelihood,g.system_impact,g.system_score,
                g.focal_likelihood,g.focal_impact,g.focal_score,
                g.champion_likelihood,g.champion_impact,g.champion_score,
                g.chairman_likelihood,g.chairman_impact,g.chairman_score
         FROM risks r
         LEFT JOIN risk_assessment_governance g ON g.risk_id=r.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score) DESC,
                  r.updated_at DESC`,
        params
    );
    return reportType === CHAIRMAN_REPORT
        ? result.rows.filter(risk => isCriticalHeatCell(effectiveAssessment(risk, false)))
        : result.rows;
}

async function loadTreatments(riskIds, db = pool) {
    if (!riskIds.length) return [];
    return (await db.query(
        `SELECT * FROM treatment_plans WHERE risk_id=ANY($1::int[]) ORDER BY due_date,updated_at DESC`,
        [riskIds]
    )).rows;
}

async function previousComparison({ reportType, division, excludeId }, summary, db = pool) {
    const params = [reportType, division || null];
    let exclusion = '';
    if (excludeId) {
        params.push(excludeId);
        exclusion = `AND id<>$${params.length}`;
    }
    const previous = (await db.query(
        `SELECT id,created_at,report_data FROM ai_report_snapshots
         WHERE report_type=$1 AND division IS NOT DISTINCT FROM $2 AND status='Finalised' ${exclusion}
         ORDER BY finalised_at DESC LIMIT 1`,
        params
    )).rows[0];
    if (!previous) return null;
    const old = previous.report_data?.summary || {};
    return {
        previous_report_id: previous.id,
        previous_report_date: previous.created_at,
        risk_change: summary.total_risks - number(old.total_risks),
        treatment_progress_change: percentage(summary.average_treatment_progress - number(old.average_treatment_progress)),
        overdue_change: summary.overdue_treatments - number(old.overdue_treatments),
        decision_change: summary.decisions_required - number(old.decisions_required)
    };
}

async function buildReport(options, db = pool) {
    const reportType = options.reportType;
    const periodEnd = options.periodEnd || new Date().toISOString().slice(0, 10);
    const rawRisks = await loadRisks({ ...options, periodEnd }, db);
    const treatments = await loadTreatments(rawRisks.map(risk => risk.id), db);
    const byRisk = treatments.reduce((map, plan) => {
        (map[plan.risk_id] ||= []).push(plan);
        return map;
    }, {});
    const risks = rawRisks.map(risk => buildRiskView(risk, byRisk[risk.id] || [], reportType));
    const summary = summaryFor(risks);
    const comparison = await previousComparison(options, summary, db);
    return {
        schema_version: '2026.1',
        report_type: reportType,
        title: reportType === CHAIRMAN_REPORT
            ? 'Risk Committee Critical Risk Report — 25/20/20'
            : `${options.division} Divisional Risk and Treatment Report`,
        scope: {
            division: options.division || 'All Divisions',
            period_start: options.periodStart || null,
            period_end: periodEnd,
            critical_cells: reportType === CHAIRMAN_REPORT ? ['L5×I5 = 25', 'L5×I4 = 20', 'L4×I5 = 20'] : []
        },
        generated_at: new Date().toISOString(),
        evidence_rule: 'Narrative statements are derived only from recorded risks, treatments, dates, progress, evidence, and governed assessment values. Missing values are shown as Not recorded.',
        summary,
        comparison,
        narrative: narrativeFor(reportType, options.division, summary, risks),
        recommendations: recommendationsFor(reportType, risks),
        risks,
        data_quality: risks.flatMap(risk => risk.data_quality_issues.map(issue => ({ risk_id: risk.risk_id, issue })))
    };
}

module.exports = {
    CHAMPION_REPORT,
    CHAIRMAN_REPORT,
    buildReport,
    effectiveAssessment,
    isCriticalHeatCell,
    treatmentConfidence,
    riskDataQuality
};
