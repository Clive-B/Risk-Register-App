const crypto = require('crypto');
const zlib = require('zlib');
const XLSX = require('xlsx');
const pool = require('../config/db');
const { logAudit } = require('../utils/auditLogger');
const { createAction, completeBySource } = require('../services/actionService');
const { startWorkflow } = require('../services/workflowService');
const { createNotification } = require('../services/notificationService');
const historicalRecommendations = require('../services/historicalRiskRecommendationService');
const { generateTreatmentProposal } = require('../utils/treatmentProposalEngine');
const { redactFocalAssessments } = require('../utils/assessmentVisibility');
const {
    RULES_VERSION,
    assessRiskText,
    responseFor
} = require('../utils/riskAssessmentEngine');
const {
    calculateRiskLevel: level,
    LIKELIHOOD_INTERPRETATION,
    IMPACT_INTERPRETATION,
    RISK_CATEGORIES
} = require('../utils/riskMatrix');
const {
    WORKPLAN_RULES_VERSION,
    applyWorkplanCorrections,
    parseWorkplanWorkbook,
    validateValues:validateWorkplanCorrection
} = require('../utils/workplanWorkbookCorrectionEngine');

const UPLOAD_ROLES = ['System Administrator', 'Risk Focal Person'];
const VIEW_ROLES = ['System Administrator', 'Risk Focal Person', 'Risk Champion', 'Risk Committee Chairman'];
const MONTHS = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,decenmber:12,quarterly:12 };
const UPLOAD_COLUMNS = 'w.id,w.plan_year,w.division,w.file_name,w.file_hash,w.status,w.programme_count,w.action_count,w.high_critical_count,w.warnings,w.uploaded_by,w.submitted_at,w.created_at,w.updated_at,w.source_size_bytes,w.snapshot_size_bytes,w.snapshot_encoding,w.original_expires_at,w.original_purged_at,w.archived_at,w.version_number,(w.file_data IS NOT NULL) AS original_available';

function text(value) { return String(value ?? '').replace(/\r/g, '').trim(); }
function numeric(value) { const number = Number(String(value ?? '').replace(/[%,$GHC\s]/gi, '')); return Number.isFinite(number) ? number : null; }
function monthNumber(label) { return MONTHS[text(label).toLowerCase()] || null; }
function endOfMonth(year, label) { const month = monthNumber(label); return month ? new Date(Date.UTC(year, month, 0)).toISOString().slice(0,10) : `${year}-12-31`; }
function retentionDays() { const days = Number(process.env.WORKPLAN_ORIGINAL_RETENTION_DAYS || 365); return Number.isFinite(days) ? Math.max(0, Math.min(days, 3650)) : 365; }
function archiveSnapshot(parsed, metadata) {
    const canonical = {
        schema_version:2,
        ...metadata,
        correction_audit:parsed.correction_audit || null,
        programmes:parsed.programmes,
        warnings:parsed.warnings
    };
    return zlib.gzipSync(Buffer.from(JSON.stringify(canonical)), { level: 9 });
}

function splitActions(value) {
    const source = text(value);
    if (!source) return [];
    const matches = [];
    const pattern = /(?:^|\n)\s*(\d+)\s*[.)]\s*([\s\S]*?)(?=(?:\n\s*\d+\s*[.)]\s)|$)/g;
    let match;
    while ((match = pattern.exec(source))) {
        const action = text(match[2]).replace(/\s+/g, ' ');
        if (action) matches.push({ number: match[1], action });
    }
    return matches.length ? matches : [{ number: null, action: source.replace(/\s+/g, ' ') }];
}

function assess(programme, action) {
    const actionSummary = action.action.replace(/^\W+/, '').slice(0, 130);
    const riskTitle = `Delay or ineffective delivery of ${actionSummary}`.slice(0, 200);
    const riskDescription = `The action “${action.action}” may be delayed, inadequately executed or unsupported by sufficient evidence, resulting in failure to achieve the programme target and strategic goal.`;
    const system = assessRiskText({
        risk_title:riskTitle,
        risk_description:riskDescription,
        programme_project:programme.programme,
        business_unit:`${programme.goal || ''} ${programme.kpi || ''}`
    });
    const treatment = {
        Terminate:'Reconsider, redesign or stop the activity that gives rise to the exposure where practicable.',
        Treat:'Implement preventive and consequence-reducing controls, assign accountable owners, milestones and monitoring evidence.',
        Transfer:'Use approved contracts, insurance, outsourcing or partnerships to transfer or share the exposure.',
        Tolerate:'Record the informed retention decision, maintain controls, assign ownership and monitor the consequences.'
    }[system.response];
    return {
        risk_title:riskTitle,
        risk_description:riskDescription,
        risk_category:system.category,
        likelihood:system.likelihood,
        impact:system.impact,
        risk_score:system.score,
        risk_level:system.level,
        risk_response:system.response,
        treatment_recommendation:treatment,
        assessment_rationale:system.explanation,
        confidence:system.confidence,
        matched_keywords:system.matched_keywords,
        rules_version:system.rules_version,
        assessment_explanation:system.explanation
    };
}

function parseWorkbook(buffer, year) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw Object.assign(new Error('The workbook does not contain a worksheet.'), { statusCode: 400 });
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false, blankrows: false });
    const headerIndex = rows.findIndex(row => row.some(cell => /PROGRAMMES/i.test(text(cell))) && row.some(cell => /KEY ACTION POINT/i.test(text(cell))));
    if (headerIndex < 0) throw Object.assign(new Error('Required work-plan columns were not found.'), { statusCode: 400 });

    const programmes = [];
    const warnings = [];
    let current = null;
    for (let index = headerIndex + 2; index < rows.length; index += 1) {
        const row = rows[index];
        if (text(row[2])) {
            current = {
                number: text(row[0]), pillar: text(row[1]), programme: text(row[2]), goal: text(row[3]),
                kpi: text(row[4]), target: text(row[5]), baseline: text(row[6]), budget: numeric(row[8]), source_row: index + 1, actions: []
            };
            programmes.push(current);
        }
        if (!current || !text(row[7])) continue;
        let weight = numeric(row[9]);
        let start = text(row[10]);
        let end = text(row[11]);
        if (text(row[9]) && monthNumber(row[9]) && monthNumber(row[10]) && !text(row[11])) {
            warnings.push(`Row ${index + 1}: schedule values were shifted and have been corrected.`);
            weight = null; start = text(row[9]); end = text(row[10]);
        }
        if (/decenmber/i.test(end)) warnings.push(`Row ${index + 1}: “Decenmber” was interpreted as December.`);
        const parts = splitActions(row[7]);
        parts.forEach((part, partIndex) => current.actions.push({
            number: part.number || (parts.length > 1 ? String(partIndex + 1) : null), action: part.action,
            weight: parts.length === 1 ? weight : null, start, end, due_date: endOfMonth(year, end), source_row: index + 1
        }));
    }
    if (!programmes.length) throw Object.assign(new Error('No programmes were found in the workbook.'), { statusCode: 400 });
    programmes.forEach(programme => programme.actions.forEach(action => { action.assessment = assess(programme, action); }));
    return { programmes, warnings };
}

function decodeWorkplanRequest(req) {
    const fileName = text(req.body.file_name);
    const year = Number(req.body.plan_year);
    const division = req.user.role === 'Risk Focal Person' ? req.user.division : text(req.body.division);
    if (!/\.(xlsx|xls)$/i.test(fileName)) {
        throw Object.assign(new Error('Upload an .xlsx or .xls work-plan file.'),{statusCode:400});
    }
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
        throw Object.assign(new Error('Enter a valid plan year.'),{statusCode:400});
    }
    if (!division) throw Object.assign(new Error('A division is required.'),{statusCode:400});
    const encoded = String(req.body.file_data || '').replace(/^data:.*;base64,/,'').replace(/\s/g,'');
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw Object.assign(new Error('The uploaded workbook data is invalid.'),{statusCode:400});
    }
    const buffer = Buffer.from(encoded,'base64');
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
        throw Object.assign(new Error('The workbook is empty or exceeds 10 MB.'),{statusCode:400});
    }
    const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
    const isCompound = buffer.length >= 8
        && buffer.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
    if ((/\.xlsx$/i.test(fileName) && !isZip) || (/\.xls$/i.test(fileName) && !isCompound)) {
        throw Object.assign(new Error('The file contents do not match the selected Excel format.'),{statusCode:400});
    }
    return {fileName,year,division,buffer};
}

async function addHistoricalWorkplanGuidance(parsed,division) {
    const [successfulCases,approvedAssessmentCases] = await Promise.all([
        historicalRecommendations.loadSuccessfulCases(),
        historicalRecommendations.loadApprovedAssessmentCases()
    ]);
    parsed.programmes.forEach(programme => programme.actions.forEach(action => {
        const assessment = action.assessment;
        const learning = historicalRecommendations.recommendAssessment(
            assessment,
            {programme:programme.programme,goal:programme.goal,kpi:programme.kpi,action:action.action,division},
            approvedAssessmentCases
        );
        if (learning) {
            assessment.assessment_explanation += ` Historical advisory only: ${learning.explanation} It suggested likelihood ${learning.likelihood} (${LIKELIHOOD_INTERPRETATION[learning.likelihood]}) × consequence ${learning.impact} (${IMPACT_INTERPRETATION[learning.impact]}), but did not alter the ERM policy baseline.`;
            assessment.historical_assessment_recommendation = learning;
        }
        assessment.intelligent_recommendation = historicalRecommendations.recommend(
            assessment,
            {programme:programme.programme,goal:programme.goal,action:action.action,division},
            successfulCases
        );
        if (learning) assessment.intelligent_recommendation.assessment_advisory = learning;
        assessment.intelligent_recommendation.assessment_learning = learning;
        assessment.intelligent_recommendation.workbook_correction = action.correction_audit;
    }));
    return {successfulCases,approvedAssessmentCases};
}

function canSee(user, division) { return ['System Administrator','Risk Committee Chairman'].includes(user.role) || user.division === division; }

exports.previewUpload = async (req,res) => {
    try {
        if (!UPLOAD_ROLES.includes(req.user.role)) {
            return res.status(403).json({success:false,message:'Only a Risk Focal Person may upload a work plan.'});
        }
        const {fileName,year,division,buffer} = decodeWorkplanRequest(req);
        const parsed = parseWorkplanWorkbook(buffer,year,{assess,categories:RISK_CATEGORIES});
        const rows = parsed.proposals.map(row => {
            const errors = validateWorkplanCorrection(row.values,RISK_CATEGORIES);
            return {...row,valid:errors.length === 0,errors};
        });
        const validRows = rows.filter(row => row.valid).length;
        res.json({
            success:true,
            message:'Work plan analysed. Review and confirm the governed corrections before upload.',
            preview:{
                file_name:fileName,plan_year:year,division,
                sheet_name:parsed.sheet_name,header_row:parsed.header_row,
                format:parsed.format,rules_version:WORKPLAN_RULES_VERSION,
                rows,warnings:parsed.warnings,
                approved_categories:RISK_CATEGORIES,
                approved_responses:['Terminate','Treat','Transfer','Tolerate'],
                education:{
                    title:'How governed work-plan correction works',
                    steps:[
                        'The system detects a supported work-plan layout by its governed column meanings rather than fixed column positions.',
                        'Merged programme values, schedule mistakes, spelling errors and invalid numeric values are detected and proposed separately from the original workbook.',
                        'Every action receives an immutable ERM system assessment. Any Focal Person edit is retained as a separate confirmed upload proposal.',
                        'Each rule displays its detection, proposal, explanation, confidence, validation and audit treatment.',
                        'No work plan is admitted until every action is valid and explicitly confirmed.'
                    ]
                },
                summary:{
                    total_rows:rows.length,
                    valid_rows:validRows,
                    failed_rows:rows.length-validRows,
                    programme_count:parsed.programmes.length
                }
            }
        });
    } catch(error) {
        console.error('Work-plan preview failed:',error.message);
        await logAudit({req,action:'WORKPLAN_PREVIEW_FAILED',entityType:'WorkPlan',status:'Failed',details:{file_name:req.body?.file_name,error:error.message}});
        res.status(error.statusCode || 500).json({success:false,message:error.statusCode ? error.message : 'Unable to analyse the work plan.'});
    }
};

exports.list = async (req, res) => {
    try {
        if (!VIEW_ROLES.includes(req.user.role)) return res.status(403).json({ success:false, message:'Access denied.' });
        const params = [];
        const where = ['System Administrator','Risk Committee Chairman'].includes(req.user.role) ? '' : (params.push(req.user.division), 'WHERE w.division=$1');
        const result = await pool.query(`SELECT ${UPLOAD_COLUMNS},u.full_name AS uploaded_by_name FROM workplan_uploads w LEFT JOIN users u ON u.id=w.uploaded_by ${where} ORDER BY w.created_at DESC`, params);
        res.json({ success:true, workplans:result.rows, canUpload:UPLOAD_ROLES.includes(req.user.role) });
    } catch (error) { console.error(error); res.status(500).json({ success:false, message:'Unable to load work plans.' }); }
};

exports.get = async (req, res) => {
    try {
        const upload = (await pool.query(`SELECT ${UPLOAD_COLUMNS} FROM workplan_uploads w WHERE w.id=$1`,[req.params.id])).rows[0];
        if (!upload) return res.status(404).json({success:false,message:'Work plan not found.'});
        if (!canSee(req.user, upload.division)) return res.status(403).json({success:false,message:'Access denied.'});
        const rows = (await pool.query(`SELECT p.id programme_id,p.programme_number,p.strategic_pillar,COALESCE(wa.reviewed_programme,p.programme) AS programme,p.programme AS original_programme,p.goal,p.kpi,p.target,p.baseline,p.budget,p.source_row programme_source_row,a.id action_id,a.action_number,a.action_point,a.weight,a.start_label,a.end_label,a.due_date,a.source_row action_source_row,wa.id assessment_id,wa.risk_title,wa.risk_description,wa.risk_category,wa.likelihood,wa.impact,wa.risk_score,wa.risk_level,wa.risk_response,wa.treatment_recommendation,wa.assessment_rationale,wa.confidence,wa.intelligent_recommendation,wa.system_likelihood,wa.system_impact,wa.system_score,wa.system_level,wa.system_response,wa.matched_keywords,wa.assessment_explanation,wa.rules_version,wa.focal_category,wa.focal_likelihood,wa.focal_impact,wa.focal_score,wa.focal_reason,wa.focal_at,wa.champion_focal_decision,wa.champion_decision_reason,wa.champion_likelihood,wa.champion_impact,wa.champion_score,wa.champion_level,wa.champion_response,wa.champion_reason,wa.champion_at,wa.chairman_likelihood,wa.chairman_impact,wa.chairman_score,wa.chairman_level,wa.chairman_response,wa.chairman_reason,wa.chairman_at,wa.updated_by,wa.updated_at,wa.edit_count,wa.generated_risk_id,wa.generated_treatment_id,r.workflow_status AS generated_workflow_status,r.committee_reviewed_at,EXISTS(SELECT 1 FROM risk_history escalation WHERE escalation.risk_id=r.id AND escalation.action='Escalated to Committee') AS committee_escalated FROM workplan_programmes p JOIN workplan_actions a ON a.programme_id=p.id JOIN workplan_risk_assessments wa ON wa.action_id=a.id LEFT JOIN risks r ON r.id=wa.generated_risk_id WHERE p.upload_id=$1 ORDER BY p.id,a.id`,[upload.id])).rows;
        const assessmentIds = req.user.role === 'Risk Committee Chairman' ? [] : rows.map(row => String(row.assessment_id));
        const focalHistory = assessmentIds.length ? (await pool.query(`SELECT audit.entity_id AS assessment_id,audit.created_at,audit.details,COALESCE(actor.full_name,audit.user_email,'Risk Focal Person') AS reviewed_by FROM audit_logs audit LEFT JOIN users actor ON actor.id=audit.user_id WHERE audit.entity_type='WorkPlanAssessment' AND audit.action='WORKPLAN_ASSESSMENT_EDITED' AND audit.entity_id=ANY($1::text[]) ORDER BY audit.created_at,audit.id`,[assessmentIds])).rows : [];
        const focalHistoryByAssessment = focalHistory.reduce((map,entry) => {
            const key=String(entry.assessment_id);
            if(!map[key]) map[key]=[];
            map[key].push({reviewed_at:entry.created_at,reviewed_by:entry.reviewed_by,system:entry.details?.system||null,proposal:entry.details?.decision||null,programme:entry.details?.programme||null,action_point:entry.details?.action_point||null,treatment_recommendation:entry.details?.treatment_recommendation||null});
            return map;
        },{});
        rows.forEach(row => { row.focal_review_history=focalHistoryByAssessment[String(row.assessment_id)]||[]; });
        const canSubmit = upload.status === 'Draft' && UPLOAD_ROLES.includes(req.user.role) && canSee(req.user, upload.division);
        const generatedRisks = rows.filter(row => row.generated_risk_id);
        let pendingReviewCount = 0;
        if (generatedRisks.length) {
            pendingReviewCount = Number((await pool.query(`SELECT COUNT(*)::int AS count FROM risks WHERE id=ANY($1::int[]) AND workflow_status IN('Submitted','Under Review')`,[generatedRisks.map(row=>row.generated_risk_id)])).rows[0].count);
        }
        const championScope = req.user.role === 'Risk Champion' && req.user.division === upload.division && upload.status === 'Processed';
        const canChampionEdit = championScope && pendingReviewCount > 0;
        const championEscalationCount = rows.filter(row => ['Submitted','Under Review'].includes(row.generated_workflow_status)).length;
        const unresolvedChallengeCount = rows.filter(row =>
            row.focal_score
            && (
                Number(row.focal_likelihood) !== Number(row.system_likelihood || row.likelihood)
                || Number(row.focal_impact) !== Number(row.system_impact || row.impact)
            )
            && !row.champion_focal_decision
        ).length;
        const canBatchApprove = championScope && championEscalationCount > 0 && unresolvedChallengeCount === 0;
        const chairmanPendingCount = rows.filter(row => row.generated_workflow_status === 'Accepted' && !row.committee_reviewed_at).length;
        const canChairmanEdit = req.user.role === 'Risk Committee Chairman' && upload.status === 'Processed' && chairmanPendingCount > 0;
        const canChairmanBatchApprove = canChairmanEdit && chairmanPendingCount > 0;
        res.json({
            success:true,
            workplan:upload,
            assessments:redactFocalAssessments(rows, req.user.role),
            permissions:{
                canSubmit,
                canEdit:false,
                canChampionEdit,
                canChairmanEdit,
                chairmanPendingCount,
                canBatchApprove,
                canChairmanBatchApprove,
                championEscalationCount,
                ...(req.user.role === 'Risk Committee Chairman' ? {} : { unresolvedChallengeCount }),
                generatedRiskCount:generatedRisks.length,
                pendingReviewCount,
                batchThreshold:5,
                submissionMessage:canSubmit
                    ? 'Assessment review is complete when you submit the work plan into the official risk workflow.'
                    : upload.status !== 'Draft'
                        ? `This work plan is already ${upload.status.toLowerCase()}.`
                        : 'Only the Risk Focal Person for this division can submit the assessed work plan.'
            }
        });
    } catch(error){console.error(error);res.status(500).json({success:false,message:'Unable to load work-plan assessment.'});}
};

exports.updateAssessment = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const current = (await client.query(`
            SELECT wa.*, a.action_point, a.due_date, p.programme AS original_programme,
                   COALESCE(wa.reviewed_programme,p.programme) AS programme, p.goal, p.kpi,
                   w.id AS upload_id, w.status AS upload_status, w.division
            FROM workplan_risk_assessments wa
            JOIN workplan_actions a ON a.id=wa.action_id
            JOIN workplan_programmes p ON p.id=a.programme_id
            JOIN workplan_uploads w ON w.id=p.upload_id
            WHERE w.id=$1 AND wa.id=$2
            FOR UPDATE OF wa, a, w
        `, [req.params.id, req.params.assessmentId])).rows[0];
        if (!current) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success:false, message:'Work-plan assessment not found.' });
        }
        await client.query('ROLLBACK');
        return res.status(409).json({
            success:false,
            message:'Work-plan risk amendments must be made from the Consolidated Risk Register.'
        });
        const focalDraftEdit = UPLOAD_ROLES.includes(req.user.role) && canSee(req.user, current.division) && current.upload_status === 'Draft';
        const championReviewEdit = req.user.role === 'Risk Champion' && req.user.division === current.division && current.upload_status === 'Processed' && current.generated_risk_id;
        const chairmanReviewEdit = req.user.role === 'Risk Committee Chairman' && current.upload_status === 'Processed' && current.generated_risk_id;
        if (!focalDraftEdit && !championReviewEdit && !chairmanReviewEdit) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success:false, message:'This assessment is not editable at your current workflow stage.' });
        }
        let officialRisk = null;
        if (championReviewEdit || chairmanReviewEdit) {
            officialRisk = (await client.query(`SELECT r.*,EXISTS(SELECT 1 FROM risk_history escalation WHERE escalation.risk_id=r.id AND escalation.action='Escalated to Committee') AS committee_escalated FROM risks r WHERE r.id=$1 FOR UPDATE OF r`,[current.generated_risk_id])).rows[0];
            const championActionable = championReviewEdit && officialRisk && ['Submitted','Under Review'].includes(officialRisk.workflow_status);
            const chairmanActionable = chairmanReviewEdit && officialRisk && officialRisk.workflow_status === 'Accepted' && !officialRisk.committee_reviewed_at;
            if (!championActionable && !chairmanActionable) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success:false, message:'This work-plan risk is no longer awaiting your review.' });
            }
        }

        const input = {
            programme:text(req.body.programme),
            action_point:text(req.body.action_point),
            treatment_recommendation:text(req.body.treatment_recommendation),
            risk_category:text(req.body.risk_category),
            likelihood:req.body.likelihood === '' || req.body.likelihood === null || req.body.likelihood === undefined ? null : Number(req.body.likelihood),
            impact:req.body.impact === '' || req.body.impact === null || req.body.impact === undefined ? null : Number(req.body.impact),
            reason:text(req.body.reason),
            challenge_decision:text(req.body.challenge_decision).toLowerCase()
        };
        const hasFocalChallenge = Boolean(current.focal_score);
        if (championReviewEdit && hasFocalChallenge && input.challenge_decision === 'approve') {
            input.likelihood = Number(current.focal_likelihood);
            input.impact = Number(current.focal_impact);
        }
        const errors = [];
        if (!input.programme) errors.push('Programme is required.');
        if (!input.action_point) errors.push('Action point is required.');
        if (!input.treatment_recommendation) errors.push('Treatment recommendation is required.');
        if (!RISK_CATEGORIES.includes(input.risk_category)) errors.push('Select a valid risk category.');
        if ((input.likelihood === null) !== (input.impact === null)) errors.push('Likelihood and impact must be provided together.');
        if (input.likelihood !== null && (!Number.isInteger(input.likelihood) || input.likelihood < 1 || input.likelihood > 5)) errors.push('Likelihood must be between 1 and 5.');
        if (input.impact !== null && (!Number.isInteger(input.impact) || input.impact < 1 || input.impact > 5)) errors.push('Impact must be between 1 and 5.');
        if ((championReviewEdit || chairmanReviewEdit) && (input.likelihood === null || input.impact === null)) errors.push('Likelihood and impact are required for reviewer decisions.');
        if (championReviewEdit && hasFocalChallenge && !['approve','reject'].includes(input.challenge_decision)) errors.push('Approve or reject the Focal Person proposal.');
        if (championReviewEdit && hasFocalChallenge && input.challenge_decision === 'reject' && input.likelihood === Number(current.focal_likelihood) && input.impact === Number(current.focal_impact)) errors.push('Record a Champion likelihood or impact that differs from the rejected Focal proposal.');
        if (chairmanReviewEdit && !input.reason) errors.push('The Chairman must record a reason for the final assessment decision.');
        if (errors.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success:false, message:errors.join(' ') });
        }

        await client.query('UPDATE workplan_actions SET action_point=$1 WHERE id=$2',[input.action_point,current.action_id]);
        let updated;
        let decision = null;
        if (focalDraftEdit) {
            const focalScore = input.likelihood === null ? null : input.likelihood * input.impact;
            updated = (await client.query(`UPDATE workplan_risk_assessments SET reviewed_programme=$1,risk_category=$2,focal_category=$2,treatment_recommendation=$3,focal_likelihood=$4,focal_impact=$5,focal_score=$6,focal_reason=NULLIF($7,''),focal_by=$8,focal_at=NOW(),champion_focal_decision=NULL,champion_decision_reason=NULL,champion_likelihood=NULL,champion_impact=NULL,champion_score=NULL,champion_level=NULL,champion_response=NULL,champion_reason=NULL,champion_by=NULL,champion_at=NULL,updated_by=$8,updated_at=NOW(),edit_count=edit_count+1 WHERE id=$9 RETURNING *`,[input.programme,input.risk_category,input.treatment_recommendation,input.likelihood,input.impact,focalScore,input.reason,req.user.id,current.id])).rows[0];
            decision = {likelihood:input.likelihood,impact:input.impact,score:focalScore,reason:input.reason,category:input.risk_category};
        } else {
            const score = input.likelihood * input.impact;
            const riskLevel = level(score);
            const response = responseFor(input.impact,input.likelihood,input.risk_category);
            const rolePrefix = chairmanReviewEdit ? 'chairman' : 'champion';
            const championDecision = championReviewEdit && hasFocalChallenge ? (input.challenge_decision === 'approve' ? 'Approved' : 'Rejected') : null;
            const championDecisionReason = input.reason || null;
            const roleColumns = chairmanReviewEdit
                ? `chairman_likelihood=$4,chairman_impact=$5,chairman_score=$6,chairman_level=$7,chairman_response=$8,chairman_reason=NULLIF($9,''),chairman_by=$10,chairman_at=NOW()`
                : `champion_likelihood=$4,champion_impact=$5,champion_score=$6,champion_level=$7,champion_response=$8,champion_reason=COALESCE($13::text,NULLIF($9::text,'')),champion_focal_decision=$12,champion_decision_reason=COALESCE($13::text,NULLIF($9::text,'')),champion_by=$10,champion_at=NOW()`;
            const updateParameters = [input.programme,input.risk_category,input.treatment_recommendation,input.likelihood,input.impact,score,riskLevel,response,input.reason,req.user.id,current.id];
            if (championReviewEdit) updateParameters.push(championDecision,championDecisionReason);
            updated = (await client.query(`UPDATE workplan_risk_assessments SET reviewed_programme=$1,risk_category=$2,treatment_recommendation=$3,likelihood=$4,impact=$5,risk_score=$6,risk_level=$7,risk_response=$8,${roleColumns},updated_by=$10,updated_at=NOW(),edit_count=edit_count+1 WHERE id=$11 RETURNING *`,updateParameters)).rows[0];
            const nextWorkflow = championReviewEdit ? 'Under Review' : 'Accepted';
            await client.query(`UPDATE risks SET programme_project=$1,risk_category=$2,likelihood=$3,impact=$4,inherent_risk_score=$5,risk_level=$6,risk_treatment=$7,initial_mitigation_plan=$8,workflow_status=$9,status=$9,updated_at=NOW() WHERE id=$10`,[input.programme,input.risk_category,input.likelihood,input.impact,score,riskLevel,response,input.treatment_recommendation,nextWorkflow,current.generated_risk_id]);
            if (current.generated_treatment_id) await client.query(`UPDATE treatment_plans SET plan_title=$1,treatment_strategy=$2,evidence_notes=$3,updated_at=NOW() WHERE id=$4`,[`Treatment for ${input.action_point}`.slice(0,200),response,input.treatment_recommendation,current.generated_treatment_id]);
            if (championReviewEdit && officialRisk.workflow_status === 'Submitted') await client.query(`INSERT INTO risk_history(risk_id,action,from_status,to_status,changed_by,details) VALUES($1,'Under Review','Submitted','Under Review',$2,$3)`,[officialRisk.id,req.user.id,{workplan_upload_id:current.upload_id,batch_review:true}]);
            const reviewLabel = chairmanReviewEdit ? 'Chairman Assessment Edit' : championDecision ? `Focal Challenge ${championDecision}` : 'Champion Assessment Edit';
            await client.query(`INSERT INTO risk_history(risk_id,action,from_status,to_status,comment,changed_by,details) VALUES($1,$2,$3,$3,$4,$5,$6)`,[officialRisk.id,reviewLabel,nextWorkflow,championDecisionReason||input.reason||`${rolePrefix} assessment recorded.`,req.user.id,{workplan_upload_id:current.upload_id,focal_challenge:hasFocalChallenge,challenge_decision:championDecision,system:{likelihood:current.system_likelihood,impact:current.system_impact,score:current.system_score},focal:{likelihood:current.focal_likelihood,impact:current.focal_impact,score:current.focal_score,reason:current.focal_reason},champion:{likelihood:input.likelihood,impact:input.impact,score,riskLevel,response,reason:championDecisionReason}}]);
            decision = {challengeDecision:championDecision,likelihood:input.likelihood,impact:input.impact,score,riskLevel,response,reason:championDecisionReason,category:input.risk_category};
        }
        await client.query(`
            UPDATE workplan_uploads upload
               SET high_critical_count = (
                       SELECT COUNT(*)::int
                       FROM workplan_programmes programme
                       JOIN workplan_actions action ON action.programme_id=programme.id
                       JOIN workplan_risk_assessments assessment ON assessment.action_id=action.id
                       WHERE programme.upload_id=upload.id
                         AND assessment.risk_level = 'High'
                   ),
                   updated_at=NOW()
             WHERE upload.id=$1
        `,[current.upload_id]);
        await client.query('COMMIT');
        const reviewerRole = chairmanReviewEdit ? 'Risk Committee Chairman' : championReviewEdit ? 'Risk Champion' : 'Risk Focal Person';
        const auditAction = chairmanReviewEdit ? 'CHAIRMAN_WORKPLAN_ASSESSMENT_EDITED' : championReviewEdit ? 'CHAMPION_WORKPLAN_ASSESSMENT_EDITED' : 'WORKPLAN_ASSESSMENT_EDITED';
        await logAudit({req,action:auditAction,entityType:'WorkPlanAssessment',entityId:current.id,details:{workplanId:current.upload_id,programme:input.programme,action_point:input.action_point,treatment_recommendation:input.treatment_recommendation,system:{likelihood:current.system_likelihood,impact:current.system_impact,score:current.system_score,level:current.system_level,response:current.system_response},decision}});
        res.json({success:true,message:focalDraftEdit?'Focal Person proposal saved without changing the system baseline.':`${reviewerRole} assessment saved; score, rating and response were recalculated.`,assessment:updated});
    } catch(error) {
        await client.query('ROLLBACK').catch(()=>{});
        console.error(error);
        res.status(500).json({success:false,message:'Unable to update the work-plan assessment.'});
    } finally { client.release(); }
};

exports.getArchiveSnapshot = async (req, res) => {
    try {
        const upload = (await pool.query(`SELECT ${UPLOAD_COLUMNS},w.json_snapshot_gzip FROM workplan_uploads w WHERE w.id=$1`, [req.params.id])).rows[0];
        if (!upload) return res.status(404).json({ success:false, message:'Archived work plan not found.' });
        if (!canSee(req.user, upload.division)) return res.status(403).json({ success:false, message:'Access denied.' });
        if (!upload.json_snapshot_gzip) return res.status(409).json({ success:false, message:'This legacy upload has no JSON snapshot.' });
        const snapshot = JSON.parse(zlib.gunzipSync(upload.json_snapshot_gzip).toString('utf8'));
        delete upload.json_snapshot_gzip;
        res.json({ success:true, workplan:upload, snapshot });
    } catch (error) { console.error(error); res.status(500).json({ success:false, message:'Unable to reconstruct the archived work plan.' }); }
};

exports.championBatchApprove = async (req, res) => {
    const client = await pool.connect();
    const approved = [];
    try {
        const comments = text(req.body.review_comments);
        await client.query('BEGIN');
        const upload = (await client.query('SELECT * FROM workplan_uploads WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
        if (!upload) { await client.query('ROLLBACK'); return res.status(404).json({success:false,message:'Work plan not found.'}); }
        if (!['Risk Champion','System Administrator'].includes(req.user.role) || (req.user.role === 'Risk Champion' && req.user.division !== upload.division)) {
            await client.query('ROLLBACK');
            return res.status(403).json({success:false,message:'Only the assigned division Risk Champion may approve this work plan.'});
        }
        if (upload.status !== 'Processed') { await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'Only submitted work plans can be approved.'}); }
        const unresolvedChallenges = (await client.query(`SELECT assessment.id,assessment.risk_title FROM workplan_risk_assessments assessment JOIN workplan_actions action ON action.id=assessment.action_id JOIN workplan_programmes programme ON programme.id=action.programme_id WHERE programme.upload_id=$1 AND assessment.focal_score IS NOT NULL AND (assessment.focal_likelihood IS DISTINCT FROM COALESCE(assessment.system_likelihood,assessment.likelihood) OR assessment.focal_impact IS DISTINCT FROM COALESCE(assessment.system_impact,assessment.impact)) AND assessment.champion_focal_decision IS NULL ORDER BY assessment.id`,[upload.id])).rows;
        if (unresolvedChallenges.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({success:false,message:`Resolve all ${unresolvedChallenges.length} Focal Person challenge${unresolvedChallenges.length === 1 ? '' : 's'} before sending the batch to the Chairman.`,unresolvedChallenges});
        }
        const risks = (await client.query(`SELECT r.* FROM workplan_risk_assessments assessment JOIN risks r ON r.id=assessment.generated_risk_id JOIN workplan_actions action ON action.id=assessment.action_id JOIN workplan_programmes programme ON programme.id=action.programme_id WHERE programme.upload_id=$1 AND r.workflow_status IN('Submitted','Under Review') ORDER BY r.id FOR UPDATE OF r`,[upload.id])).rows;
        if (!risks.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({success:false,message:'There are no pending work-plan risks to send to the Chairman.'});
        }
        for (const risk of risks) {
            const workflow = await startWorkflow({workflowKey:'risk_approval',subjectType:'Risk',subjectId:risk.id,itemTitle:`${risk.risk_id} - ${risk.risk_title}`,requesterId:risk.created_by,division:risk.division||risk.directorate,priority:risk.risk_level,metadata:{risk_id:risk.risk_id,workplan_id:upload.id},client});
            const stage = (await client.query(`SELECT wi.id instance_id,wi.status instance_status,ws.id stage_id,ws.status stage_status,ws.approver_user_id,ws.approver_role FROM workflow_instances wi JOIN workflow_stage_instances ws ON ws.workflow_instance_id=wi.id AND ws.stage_order=wi.current_stage_order WHERE wi.id=$1 FOR UPDATE OF wi,ws`,[workflow.id])).rows[0];
            if (!stage || !['Pending','Under Review','Escalated'].includes(stage.instance_status)) throw Object.assign(new Error(`Workflow for ${risk.risk_id} is no longer actionable.`),{statusCode:409});
            const authorized = req.user.role === 'System Administrator' || Number(stage.approver_user_id) === Number(req.user.id) || stage.approver_role === req.user.role;
            if (!authorized) throw Object.assign(new Error(`You are not authorized to approve ${risk.risk_id}.`),{statusCode:403});
            await client.query(`UPDATE workflow_stage_instances SET status='Approved',completed_at=NOW() WHERE id=$1`,[stage.stage_id]);
            await client.query(`UPDATE workflow_instances SET status='Completed',completed_at=NOW(),updated_at=NOW() WHERE id=$1`,[stage.instance_id]);
            await client.query(`INSERT INTO workflow_actions(workflow_instance_id,stage_instance_id,action,from_status,to_status,comments,performed_by) VALUES($1,$2,'approve',$3,'Completed',$4,$5)`,[stage.instance_id,stage.stage_id,stage.instance_status,comments,req.user.id]);
            await client.query(`UPDATE risks SET workflow_status='Accepted',status='Accepted',reviewed_at=NOW(),reviewed_by=$1,review_comments=$2,admission_status='Admitted',admitted_by=$1,admitted_at=NOW(),updated_at=NOW() WHERE id=$3`,[req.user.id,comments,risk.id]);
            await client.query(`UPDATE workplan_risk_assessments SET champion_likelihood=COALESCE(champion_likelihood,likelihood),champion_impact=COALESCE(champion_impact,impact),champion_score=COALESCE(champion_score,risk_score),champion_level=COALESCE(champion_level,risk_level),champion_response=COALESCE(champion_response,risk_response),champion_reason=COALESCE(NULLIF(champion_reason,''),NULLIF($1,'')),champion_by=$2,champion_at=COALESCE(champion_at,NOW()) WHERE generated_risk_id=$3`,[comments,req.user.id,risk.id]);
            await client.query(`INSERT INTO risk_reviews(risk_id,decision,review_comment,reviewed_by) VALUES($1,'Approved',$2,$3)`,[risk.id,comments,req.user.id]);
            if (risk.workflow_status === 'Submitted') await client.query(`INSERT INTO risk_history(risk_id,action,from_status,to_status,comment,changed_by,details) VALUES($1,'Under Review','Submitted','Under Review',$2,$3,$4)`,[risk.id,comments,req.user.id,{workplan_upload_id:upload.id,batch_approval:true}]);
            await client.query(`INSERT INTO risk_history(risk_id,action,from_status,to_status,comment,changed_by,details) VALUES($1,'Accepted','Under Review','Accepted',$2,$3,$4)`,[risk.id,comments,req.user.id,{workplan_upload_id:upload.id,batch_approval:true,batch_size:risks.length}]);
            await client.query(`INSERT INTO risk_history(risk_id,action,from_status,to_status,comment,changed_by,details) VALUES($1,'Escalated to Committee','Accepted','Accepted',$2,$3,$4)`,[risk.id,comments,req.user.id,{workplan_upload_id:upload.id,batch_escalation:true,batch_size:risks.length}]);
            approved.push(risk);
        }
        await client.query('COMMIT');

        try {
            for (const risk of approved) {
                await Promise.allSettled([
                    completeBySource('RiskReview',risk.id,{actor:req.user,req,comments:'Approved with work-plan batch.'}),
                    completeBySource('WorkPlanRisk',risk.id,{actor:req.user,req,comments:'Approved with work-plan batch.'})
                ]);
                if (risk.created_by) await createNotification({actor:req.user,req,userId:risk.created_by,title:'Work Plan Risks Approved',message:`${risk.risk_id} - ${risk.risk_title} was approved by the Risk Champion as part of a ${approved.length}-risk work-plan batch.`,type:'Risk',category:'Risk Governance',priority:risk.risk_level==='High'?'High':'Normal',entityType:'Risk',entityId:risk.id,createdBy:req.user.id,systemGenerated:true});
            }
            await completeBySource('WorkPlanChampionBatch',upload.id,{actor:req.user,req,comments:'Champion approved and submitted the complete work-plan risk batch.'});
            const chairmen = (await pool.query(`SELECT id FROM users WHERE role='Risk Committee Chairman' AND status='Active'`)).rows;
            const highCount=approved.filter(risk=>risk.risk_level==='High').length;
            for (const chairman of chairmen) {
                await createNotification({actor:req.user,req,userId:chairman.id,title:'Work Plan Risk Approval Batch',message:`All ${approved.length} risks from the ${upload.plan_year} ${upload.division} work plan require one final Chairman decision.`,type:'Risk',category:'Risk Governance',priority:highCount?'High':'Normal',entityType:'WorkPlan',entityId:upload.id,createdBy:req.user.id,systemGenerated:true});
                await createAction({actionKey:`workplan-committee-batch:${upload.id}:${chairman.id}`,module:'Risk',actionType:'Executive Batch Review',title:`Review all ${approved.length} work-plan risks`,description:`One final batch decision is required for the ${upload.plan_year} ${upload.division} work plan.`,priority:highCount?'High':'Medium',status:'Escalated',assignedTo:chairman.id,assignedRole:'Risk Committee Chairman',assignedBy:req.user.id,sourceType:'WorkPlanCommitteeBatch',sourceId:upload.id,actionUrl:'pages/workplans.html',availableActions:['review','approve','view'],metadata:{workplanId:upload.id,riskIds:approved.map(risk=>risk.id)}},{req});
            }
        } catch (sideEffectError) {
            console.error('Work-plan batch approval follow-up failed after commit:', sideEffectError);
        }
        await logAudit({req,action:'WORKPLAN_BATCH_APPROVED',entityType:'WorkPlan',entityId:upload.id,details:{riskCount:approved.length,riskIds:approved.map(risk=>risk.risk_id),reviewComments:comments}});
        res.json({success:true,message:`All ${approved.length} work-plan risks were approved together and sent to the Chairman as one batch.`,approved:approved.length});
    } catch(error) {
        await client.query('ROLLBACK').catch(()=>{});
        console.error(error);
        res.status(error.statusCode||500).json({success:false,message:error.statusCode?error.message:'Unable to approve the work-plan risk batch.'});
    } finally { client.release(); }
};

exports.chairmanBatchApprove = async (req, res) => {
    const client = await pool.connect();
    let finalized = [];
    try {
        const comments = text(req.body.review_comments);
        const recommendations = text(req.body.recommendations);
        if (!comments) return res.status(400).json({success:false,message:'The Chairman must record a reason for the final assessment decision.'});
        await client.query('BEGIN');
        const upload = (await client.query('SELECT * FROM workplan_uploads WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
        if (!upload) { await client.query('ROLLBACK'); return res.status(404).json({success:false,message:'Work plan not found.'}); }
        if (!['Risk Committee Chairman','System Administrator'].includes(req.user.role)) { await client.query('ROLLBACK'); return res.status(403).json({success:false,message:'Only the Risk Committee Chairman may finalize this batch.'}); }
        finalized = (await client.query(`
            SELECT r.*
            FROM workplan_risk_assessments assessment
            JOIN risks r ON r.id=assessment.generated_risk_id
            JOIN workplan_actions action ON action.id=assessment.action_id
            JOIN workplan_programmes programme ON programme.id=action.programme_id
            WHERE programme.upload_id=$1
              AND r.workflow_status='Accepted'
              AND r.committee_reviewed_at IS NULL
            ORDER BY r.id
            FOR UPDATE OF r
        `,[upload.id])).rows;
        if (!finalized.length) { await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'There is no pending work-plan batch for final approval.'}); }
        for (const risk of finalized) {
            await client.query(`UPDATE risks SET workflow_status='Accepted',status='Accepted',committee_recommendations=COALESCE(NULLIF($1,''),committee_recommendations),executive_comments=$2,committee_reviewed_by=$3,committee_reviewed_at=NOW(),updated_at=NOW() WHERE id=$4`,[recommendations,comments,req.user.id,risk.id]);
            await client.query(`UPDATE treatment_plans SET lifecycle_status=CASE WHEN status='Completed' THEN 'Completed' ELSE 'Active Monitoring' END,updated_at=NOW() WHERE risk_id=$1`,[risk.id]);
            await client.query(`UPDATE workplan_risk_assessments SET chairman_likelihood=COALESCE(chairman_likelihood,likelihood),chairman_impact=COALESCE(chairman_impact,impact),chairman_score=COALESCE(chairman_score,risk_score),chairman_level=COALESCE(chairman_level,risk_level),chairman_response=COALESCE(chairman_response,risk_response),chairman_reason=COALESCE(NULLIF(chairman_reason,''),$1),chairman_by=$2,chairman_at=COALESCE(chairman_at,NOW()) WHERE generated_risk_id=$3`,[comments,req.user.id,risk.id]);
            await client.query(`INSERT INTO risk_history(risk_id,action,from_status,to_status,comment,changed_by,details) VALUES($1,'Committee Batch Approved','Accepted','Accepted',$2,$3,$4)`,[risk.id,comments,req.user.id,{workplan_upload_id:upload.id,batch_final:true,batch_size:finalized.length,recommendations}]);
        }
        await client.query('COMMIT');
        try {
            await completeBySource('WorkPlanCommitteeBatch',upload.id,{actor:req.user,req,comments:'Chairman approved the complete work-plan risk batch.'});
            const recipients=[...new Set(finalized.map(risk=>risk.created_by).filter(Boolean))];
            for(const userId of recipients) await createNotification({actor:req.user,req,userId,title:'Chairman Batch Approval Completed',message:`The Chairman finalized all ${finalized.length} risks from the ${upload.plan_year} ${upload.division} work plan.`,type:'Risk',category:'Risk Governance',priority:'High',entityType:'WorkPlan',entityId:upload.id,createdBy:req.user.id,systemGenerated:true});
        } catch(sideEffectError) { console.error('Chairman batch approval follow-up failed after commit:',sideEffectError); }
        await logAudit({req,action:'WORKPLAN_CHAIRMAN_BATCH_APPROVED',entityType:'WorkPlan',entityId:upload.id,details:{riskCount:finalized.length,riskIds:finalized.map(risk=>risk.risk_id),reviewComments:comments,recommendations}});
        res.json({success:true,message:`Chairman final approval recorded for all ${finalized.length} work-plan risks as one batch.`,approved:finalized.length});
    } catch(error) {
        await client.query('ROLLBACK').catch(()=>{});
        console.error(error);
        res.status(error.statusCode||500).json({success:false,message:error.statusCode?error.message:'Unable to finalize the Chairman work-plan batch.'});
    } finally { client.release(); }
};

exports.upload = async (req, res) => {
    const client = await pool.connect();
    try {
        if (!UPLOAD_ROLES.includes(req.user.role)) return res.status(403).json({success:false,message:'Only a Risk Focal Person may upload a work plan.'});
        const {fileName,year,division,buffer} = decodeWorkplanRequest(req);
        const parsed = applyWorkplanCorrections(
            parseWorkplanWorkbook(buffer,year,{assess,categories:RISK_CATEGORIES}),
            req.body.corrected_rows,
            {assess,categories:RISK_CATEGORIES,year}
        );
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        const actionCount = parsed.programmes.reduce((sum,p)=>sum+p.actions.length,0);
        let highCritical = parsed.programmes.reduce((sum,p)=>sum+p.actions.filter(a=>a.assessment.risk_level==='High').length,0);
        const [successfulCases, approvedAssessmentCases] = await Promise.all([
            historicalRecommendations.loadSuccessfulCases(),
            historicalRecommendations.loadApprovedAssessmentCases()
        ]);
        parsed.programmes.forEach(programme => programme.actions.forEach(action => {
            const assessment = action.assessment;
            const learning = historicalRecommendations.recommendAssessment(
                assessment,
                { programme:programme.programme, goal:programme.goal, kpi:programme.kpi, action:action.action, division },
                approvedAssessmentCases
            );
            if (learning) {
                assessment.assessment_explanation += ` Historical advisory only: ${learning.explanation} It suggested likelihood ${learning.likelihood} (${LIKELIHOOD_INTERPRETATION[learning.likelihood]}) × consequence ${learning.impact} (${IMPACT_INTERPRETATION[learning.impact]}), but did not alter the ERM policy baseline.`;
                assessment.historical_assessment_recommendation = learning;
            }
            assessment.intelligent_recommendation = historicalRecommendations.recommend(
                assessment,
                { programme:programme.programme, goal:programme.goal, action:action.action, division },
                successfulCases
            );
            if (learning) assessment.intelligent_recommendation.assessment_advisory = learning;
            assessment.intelligent_recommendation.assessment_learning = learning;
            assessment.intelligent_recommendation.workbook_correction = action.correction_audit;
        }));
        highCritical = parsed.programmes.reduce((sum,p)=>sum+p.actions.filter(a=>a.assessment.risk_level==='High').length,0);
        const snapshot = archiveSnapshot(parsed, { plan_year:year, division, file_name:fileName, file_hash:hash });
        const keepDays = retentionDays();
        const expiresAt = keepDays ? new Date(Date.now() + keepDays * 86400000) : new Date();
        await client.query('BEGIN');
        const version = Number((await client.query('SELECT COALESCE(MAX(version_number),0)+1 AS version FROM workplan_uploads WHERE division=$1 AND plan_year=$2',[division,year])).rows[0].version);
        const upload = (await client.query(`INSERT INTO workplan_uploads(plan_year,division,file_name,file_hash,file_data,json_snapshot_gzip,source_size_bytes,snapshot_size_bytes,original_expires_at,programme_count,action_count,high_critical_count,warnings,uploaded_by,version_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[year,division,fileName,hash,keepDays?buffer:null,snapshot,buffer.length,snapshot.length,expiresAt,parsed.programmes.length,actionCount,highCritical,JSON.stringify(parsed.warnings),req.user.id,version])).rows[0];
        for (const programme of parsed.programmes) {
            const savedProgramme=(await client.query(`INSERT INTO workplan_programmes(upload_id,programme_number,strategic_pillar,programme,goal,kpi,target,baseline,budget,source_row) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[upload.id,programme.number,programme.pillar,programme.programme,programme.goal,programme.kpi,programme.target,programme.baseline,programme.budget,programme.source_row])).rows[0];
            for (const action of programme.actions) {
                const savedAction=(await client.query(`INSERT INTO workplan_actions(programme_id,action_number,action_point,weight,start_label,end_label,due_date,source_row) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[savedProgramme.id,action.number,action.action,action.weight,action.start,action.end,action.due_date,action.source_row])).rows[0];
                const a=action.assessment;
                const system=a.system_assessment || a;
                const focalChanged=a.risk_category !== system.risk_category
                    || a.likelihood !== system.likelihood
                    || a.impact !== system.impact
                    || a.risk_response !== system.risk_response;
                await client.query(
                    `INSERT INTO workplan_risk_assessments(
                        action_id,risk_title,risk_description,risk_category,likelihood,impact,risk_score,risk_level,
                        risk_response,treatment_recommendation,assessment_rationale,confidence,intelligent_recommendation,
                        system_likelihood,system_impact,system_score,system_level,system_response,matched_keywords,
                        assessment_explanation,rules_version,focal_category,focal_likelihood,focal_impact,focal_score,
                        focal_reason,focal_by,focal_at
                     ) VALUES(
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                        $14,$15,$16,$17,$18,$19,$20,$21,
                        $22,$23,$24,$25,$26,$27,$28
                     )`,
                    [
                        savedAction.id,a.risk_title,a.risk_description,a.risk_category,a.likelihood,a.impact,
                        a.risk_score,a.risk_level,a.risk_response,a.treatment_recommendation,
                        system.assessment_rationale,system.confidence,JSON.stringify(a.intelligent_recommendation),
                        system.likelihood,system.impact,system.risk_score,system.risk_level,system.risk_response,
                        JSON.stringify(system.matched_keywords),system.assessment_explanation,system.rules_version,
                        a.risk_category,
                        a.likelihood,
                        a.impact,
                        a.risk_score,
                        focalChanged
                            ? 'Edited and confirmed during governed workbook correction.'
                            : 'Accepted the ERM system proposal during governed workbook correction.',
                        req.user.id,
                        new Date()
                    ]
                );
            }
        }
        await client.query('COMMIT');
        await logAudit({req,action:'WORKPLAN_UPLOADED',entityType:'WorkPlan',entityId:upload.id,details:{division,year,programmes:parsed.programmes.length,actions:actionCount,highCritical,archive:{sourceBytes:buffer.length,snapshotBytes:snapshot.length,retentionDays:keepDays},historicalCases:successfulCases.length,approvedAssessmentCases:approvedAssessmentCases.length,rulesVersion:WORKPLAN_RULES_VERSION,correctionConfirmation:{confirmedActions:parsed.correction_audit.confirmed_actions}}});
        delete upload.file_data;
        delete upload.json_snapshot_gzip;
        res.status(201).json({success:true,message:'Work plan assessed successfully. Review the generated risks before submission.',workplan:upload});
    } catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(error);if(error.code==='23505')return res.status(409).json({success:false,message:'This workbook version has already been uploaded for the division and year.'});res.status(error.statusCode||500).json({success:false,message:error.message||'Unable to assess the work plan.'});} finally{client.release();}
};

async function nextRiskCode(client, year) {
    const prefix=`WP-RSK-${year}-`;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[prefix]);
    const result=await client.query(`SELECT risk_id FROM risks WHERE risk_id LIKE $1 ORDER BY risk_id DESC LIMIT 1`,[`${prefix}%`]);
    const last=result.rowCount?Number(result.rows[0].risk_id.slice(prefix.length)):0;
    return `${prefix}${String(last+1).padStart(4,'0')}`;
}

exports.submit = async (req,res) => {
    const client=await pool.connect();
    const escalations=[];
    try{
        await client.query('BEGIN');
        const upload=(await client.query('SELECT * FROM workplan_uploads WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
        if(!upload){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Work plan not found.'});}
        if(!UPLOAD_ROLES.includes(req.user.role)||!canSee(req.user,upload.division)){await client.query('ROLLBACK');return res.status(403).json({success:false,message:'Only the uploading division’s Risk Focal Person may submit this work plan.'});}
        if(upload.status!=='Draft'){await client.query('ROLLBACK');return res.status(409).json({success:false,message:'This work plan has already been submitted.'});}
        const rows=(await client.query(`SELECT wa.*,a.id workplan_action_id,a.action_point,a.due_date,COALESCE(wa.reviewed_programme,p.programme) AS programme,p.goal,p.kpi FROM workplan_risk_assessments wa JOIN workplan_actions a ON a.id=wa.action_id JOIN workplan_programmes p ON p.id=a.programme_id WHERE p.upload_id=$1 ORDER BY wa.id`,[upload.id])).rows;
        for(const item of rows){
            const riskCode=await nextRiskCode(client,upload.plan_year);
            const risk=(await client.query(`INSERT INTO risks(risk_id,risk_title,risk_description,risk_category,directorate,division,business_unit,programme_project,risk_owner,date_identified,likelihood,impact,inherent_risk_score,residual_risk_score,risk_level,existing_controls,control_effectiveness,risk_treatment,initial_mitigation_plan,responsible_officer,target_completion_date,status,workflow_status,submitted_at,treatment_status,created_by,source_workplan_action_id,assessment_year,entry_source,admission_status,focal_visibility) VALUES($1,$2,$3,$4,$5,$5,$5,$6,$7,CURRENT_DATE,$8,$9,$10,NULL,$11,$12,'Not Assessed',$13,$14,$7,$15,'Draft','Draft',NULL,'Not Started',$16,$17,$18,'Work Plan','Draft',TRUE) RETURNING *`,[riskCode,item.risk_title,item.risk_description,item.risk_category,upload.division,item.programme,req.user.full_name,item.likelihood,item.impact,item.risk_score,item.risk_level,'No existing controls were documented in the uploaded work plan.',item.risk_response,item.treatment_recommendation,item.due_date,req.user.id,item.workplan_action_id,upload.plan_year])).rows[0];
            await client.query(
                `INSERT INTO risk_assessment_governance(
                    risk_id,review_stage,system_likelihood,system_impact,system_score,system_level,system_response,
                    system_explanation,matched_keywords,rules_version,
                    focal_likelihood,focal_impact,focal_score,focal_reason,focal_by,focal_at
                ) VALUES(
                    $1,'Awaiting Focal Review',$2,$3,$4,$5,$6,$7,$8,$9,
                    $10,$11,$12,$13,$14,$15
                ) ON CONFLICT(risk_id) DO NOTHING`,
                [
                    risk.id,
                    item.system_likelihood || item.likelihood,
                    item.system_impact || item.impact,
                    item.system_score || item.risk_score,
                    item.system_level || item.risk_level,
                    item.system_response || item.risk_response,
                    item.assessment_explanation || item.assessment_rationale || 'System-generated work-plan assessment.',
                    JSON.stringify(item.matched_keywords || []),
                    item.rules_version || RULES_VERSION,
                    item.focal_likelihood,
                    item.focal_impact,
                    item.focal_score,
                    item.focal_reason,
                    item.focal_by,
                    item.focal_at
                ]
            );
            const proposal=generateTreatmentProposal({
                ...risk,
                risk_title:item.risk_title,
                risk_category:item.risk_category,
                likelihood:item.likelihood,
                impact:item.impact,
                risk_level:item.risk_level,
                risk_treatment:item.risk_response,
                initial_mitigation_plan:null,
                responsible_officer:req.user.full_name,
                due_date:item.due_date
            });
            const treatment=(await client.query(
                `INSERT INTO treatment_plans(
                    risk_id,plan_title,treatment_strategy,action_owner,due_date,progress_percent,status,
                    evidence_notes,created_by,source_workplan_action_id,plan_origin,lifecycle_status,
                    system_proposed_strategy,system_improvements,treatment_objective,treatment_actions,
                    evidence_required,monitoring_frequency,review_date,target_residual_likelihood,
                    target_residual_impact,target_residual_score,source_file_name
                ) VALUES(
                    $1,$2,$3,$4,$5,0,'Not Started',$6,$7,$8,'Work Plan',$9,
                    $3,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
                ) RETURNING *`,
                [
                    risk.id,
                    `Treatment for ${item.action_point}`.slice(0,200),
                    item.risk_response,
                    req.user.full_name,
                    proposal.due_date,
                    proposal.evidence_required,
                    req.user.id,
                    item.workplan_action_id,
                    'Pending Risk Approval',
                    proposal.system_improvements,
                    proposal.objective,
                    item.treatment_recommendation || proposal.actions,
                    proposal.evidence_required,
                    proposal.monitoring_frequency,
                    proposal.review_date,
                    proposal.target_residual_likelihood,
                    proposal.target_residual_impact,
                    proposal.target_residual_score,
                    upload.file_name
                ]
            )).rows[0];
            await client.query('UPDATE workplan_risk_assessments SET generated_risk_id=$1,generated_treatment_id=$2 WHERE id=$3',[risk.id,treatment.id,item.id]);
            await client.query(`INSERT INTO risk_history(risk_id,action,to_status,changed_by,details) VALUES($1,'Generated from Work Plan','Draft',$2,$3)`,[risk.id,req.user.id,{workplan_upload_id:upload.id,workplan_action_id:item.workplan_action_id}]);
            escalations.push({risk,treatment,actionPoint:item.action_point});
        }
        await client.query(`UPDATE workplan_uploads SET status='Processed',submitted_at=NOW(),archived_at=NOW(),updated_at=NOW() WHERE id=$1`,[upload.id]);
        await client.query('COMMIT');

        await logAudit({req,action:'WORKPLAN_SUBMITTED',entityType:'WorkPlan',entityId:upload.id,details:{risks:escalations.length,high:escalations.filter(x=>x.risk.risk_level==='High').length}});
        res.json({success:true,message:'Work plan submitted. Risks were added to the Consolidated Risk Register for Focal Person assessment before Champion and Chairman review.',createdRisks:escalations.length});
    }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(error);res.status(error.statusCode||500).json({success:false,message:error.message||'Unable to submit the work plan.'});}finally{client.release();}
};

module.exports.parseWorkbook = parseWorkbook;
