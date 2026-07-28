const pool = require('../config/db');

const STOP_WORDS = new Set(['a','an','and','are','as','at','be','by','for','from','has','in','is','it','of','on','or','that','the','this','to','was','were','will','with']);

function tokens(value) {
    return new Set(String(value || '').toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(word => !STOP_WORDS.has(word)) || []);
}

function similarity(left, right) {
    const a = tokens(left);
    const b = tokens(right);
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    a.forEach(word => { if (b.has(word)) intersection += 1; });
    return intersection / (a.size + b.size - intersection);
}

async function loadSuccessfulCases() {
    const result = await pool.query(`
        SELECT r.id, r.risk_id, r.risk_title, r.risk_description, r.risk_category,
               r.risk_level, r.division, r.inherent_risk_score,
               COALESCE(r.residual_score, r.residual_risk_score) AS residual_score,
               r.closure_comments, tp.id AS treatment_id, tp.plan_title,
               tp.treatment_strategy, tp.evidence_notes, tp.progress_percent,
               tp.status AS treatment_status, tp.updated_at
        FROM risks r
        JOIN treatment_plans tp ON tp.risk_id = r.id
        WHERE tp.status = 'Completed'
           OR r.closure_date IS NOT NULL
           OR r.status = 'Closed'
           OR r.workflow_status = 'Closed'
        ORDER BY tp.updated_at DESC
        LIMIT 500
    `);
    return result.rows;
}

async function loadApprovedAssessmentCases() {
    const result = await pool.query(`
        SELECT wa.id, wa.risk_title, wa.risk_description, wa.risk_category,
               wa.chairman_likelihood AS likelihood, wa.chairman_impact AS impact,
               wa.chairman_score AS risk_score, wa.chairman_level AS risk_level,
               wa.chairman_response AS risk_response, wa.chairman_reason,
               COALESCE(wa.reviewed_programme,p.programme) AS programme,
               p.goal, p.kpi, a.action_point, w.division, wa.matched_keywords,
               wa.chairman_at
        FROM workplan_risk_assessments wa
        JOIN workplan_actions a ON a.id=wa.action_id
        JOIN workplan_programmes p ON p.id=a.programme_id
        JOIN workplan_uploads w ON w.id=p.upload_id
        WHERE wa.chairman_at IS NOT NULL
          AND wa.chairman_likelihood IS NOT NULL
          AND wa.chairman_impact IS NOT NULL
        ORDER BY wa.chairman_at DESC
        LIMIT 500
    `);
    return result.rows;
}

function recommendAssessment(assessment, context, cases) {
    const source = `${context.programme || ''} ${context.goal || ''} ${context.kpi || ''} ${context.action || ''} ${assessment.risk_title || ''}`;
    const ranked = cases.map(item => {
        const lexical = similarity(source, `${item.programme || ''} ${item.goal || ''} ${item.kpi || ''} ${item.action_point || ''} ${item.risk_title || ''}`);
        const categoryMatch = item.risk_category === assessment.risk_category;
        if (!categoryMatch && lexical < 0.1) return null;
        let score = lexical + (categoryMatch ? 0.25 : 0) + (item.division === context.division ? 0.1 : 0);
        return { item, score: Math.min(score, 1) };
    }).filter(Boolean).filter(match => match.score >= 0.25).sort((a,b) => b.score-a.score).slice(0,5);
    if (!ranked.length) return null;
    const weight = ranked.reduce((sum,match)=>sum+match.score,0);
    const likelihood = Math.max(1,Math.min(5,Math.round(ranked.reduce((sum,match)=>sum+Number(match.item.likelihood)*match.score,0)/weight)));
    const impact = Math.max(1,Math.min(5,Math.round(ranked.reduce((sum,match)=>sum+Number(match.item.impact)*match.score,0)/weight)));
    return {
        likelihood,
        impact,
        confidence: ranked[0].score >= 0.65 ? 'High' : ranked[0].score >= 0.4 ? 'Medium' : 'Low',
        explanation: `${ranked.length} similar Chairman-approved assessment${ranked.length===1?'':'s'} informed the suggested likelihood and impact.`,
        supporting_cases: ranked.map(({item,score})=>({
            assessment_id:item.id,
            risk_title:item.risk_title,
            likelihood:Number(item.likelihood),
            impact:Number(item.impact),
            response:item.risk_response,
            chairman_reason:item.chairman_reason,
            similarity:Number(score.toFixed(2))
        }))
    };
}

function recommend(assessment, context, cases) {
    const source = `${context.programme || ''} ${context.goal || ''} ${context.action || ''} ${assessment.risk_title} ${assessment.risk_description}`;
    const ranked = cases.map(item => {
        const lexical = similarity(source, `${item.risk_title} ${item.risk_description} ${item.plan_title} ${item.evidence_notes || ''}`);
        const categoryMatch = item.risk_category === assessment.risk_category;
        if (!categoryMatch && lexical < 0.08) return null;
        let score = lexical;
        if (categoryMatch) score += 0.22;
        if (item.risk_level === assessment.risk_level) score += 0.12;
        if (item.division && item.division === context.division) score += 0.08;
        const improvement = Number(item.inherent_risk_score || 0) - Number(item.residual_score || item.inherent_risk_score || 0);
        if (improvement > 0) score += Math.min(0.18, improvement / 100);
        if (Number(item.progress_percent) === 100) score += 0.08;
        return { item, score, improvement };
    }).filter(match => match && match.score >= 0.22).sort((a, b) => b.score - a.score).slice(0, 3);

    if (!ranked.length) {
        return {
            mode: 'baseline',
            confidence: assessment.confidence,
            suggested_response: assessment.risk_response,
            suggested_treatment: assessment.treatment_recommendation,
            explanation: 'No sufficiently similar completed historical case is available yet. This is the governed baseline recommendation.',
            supporting_cases: []
        };
    }

    const best = ranked[0].item;
    return {
        mode: 'historical',
        confidence: ranked[0].score >= 0.65 ? 'High' : ranked[0].score >= 0.4 ? 'Medium' : 'Low',
        suggested_response: best.treatment_strategy || assessment.risk_response,
        suggested_treatment: best.plan_title || assessment.treatment_recommendation,
        explanation: `${ranked.length} similar completed case${ranked.length === 1 ? '' : 's'} support this recommendation. Outcomes and residual-risk improvement are weighted more heavily.`,
        supporting_cases: ranked.map(({ item, score, improvement }) => ({
            risk_id: item.risk_id,
            risk_title: item.risk_title,
            treatment: item.plan_title,
            outcome: item.closure_comments || item.evidence_notes || 'Treatment completed',
            residual_improvement: improvement,
            similarity: Number(Math.min(score, 1).toFixed(2))
        }))
    };
}

module.exports = { loadSuccessfulCases, loadApprovedAssessmentCases, recommend, recommendAssessment, similarity };
