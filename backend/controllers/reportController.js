const pool = require('../config/db');
const { logAudit } = require('../utils/auditLogger');
const { sendEmail } = require('../services/emailService');
const {
    CHAMPION_REPORT,
    CHAIRMAN_REPORT,
    buildReport
} = require('../services/aiReportService');

const TYPES = [CHAMPION_REPORT, CHAIRMAN_REPORT];
const FREQUENCIES = ['Weekly', 'Monthly', 'Quarterly'];

function dateValue(value, fallback = null) {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function permittedScope(req, requestedType, requestedDivision) {
    if (!TYPES.includes(requestedType)) throw Object.assign(new Error('Select a valid report type.'), { status: 400 });
    if (req.user.role === 'Risk Champion') {
        if (requestedType !== CHAMPION_REPORT) throw Object.assign(new Error('Risk Champions can generate only their divisional report.'), { status: 403 });
        return req.user.division;
    }
    if (!['System Administrator', 'Risk Committee Chairman'].includes(req.user.role)) {
        throw Object.assign(new Error('You do not have permission to generate governed reports.'), { status: 403 });
    }
    if (req.user.role === 'Risk Committee Chairman' && requestedType !== CHAIRMAN_REPORT) {
        throw Object.assign(new Error('The Chairman can generate the Committee critical-risk report.'), { status: 403 });
    }
    return String(requestedDivision || '').trim() || null;
}

exports.options = async (req, res) => {
    const divisions = (await pool.query(
        `SELECT DISTINCT COALESCE(NULLIF(BTRIM(division),''),directorate) division
         FROM risks WHERE COALESCE(NULLIF(BTRIM(division),''),directorate) IS NOT NULL ORDER BY 1`
    )).rows.map(row => row.division);
    res.json({
        success: true,
        reportTypes: req.user.role === 'Risk Champion' ? [CHAMPION_REPORT]
            : req.user.role === 'Risk Committee Chairman' ? [CHAIRMAN_REPORT] : TYPES,
        divisions,
        frequencies: FREQUENCIES
    });
};

exports.generate = async (req, res) => {
    try {
        const reportType = String(req.body.report_type || '');
        const division = permittedScope(req, reportType, req.body.division);
        if (reportType === CHAMPION_REPORT && !division) {
            return res.status(400).json({ success: false, message: 'A division is required for a Champion report.' });
        }
        const today = new Date().toISOString().slice(0, 10);
        const options = {
            reportType,
            division,
            periodStart: dateValue(req.body.period_start),
            periodEnd: dateValue(req.body.period_end, today)
        };
        const report = await buildReport(options);
        const inserted = await pool.query(
            `INSERT INTO ai_report_snapshots(
                report_type,division,period_start,period_end,report_data,commentary,created_by
             ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status,created_at`,
            [reportType, division, options.periodStart, options.periodEnd, report, String(req.body.commentary || '').trim() || null, req.user.id]
        );
        await logAudit({
            req,
            action: 'AI_REPORT_GENERATED',
            entityType: 'AIReport',
            entityId: inserted.rows[0].id,
            details: { reportType, division, periodStart: options.periodStart, periodEnd: options.periodEnd, riskCount: report.summary.total_risks }
        });
        res.status(201).json({ success: true, snapshot: { ...inserted.rows[0], commentary: req.body.commentary || '', report_data: report } });
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to generate the governed report.' });
    }
};

exports.versions = async (req, res) => {
    try {
        const requestedType = String(req.query.report_type || (req.user.role === 'Risk Champion' ? CHAMPION_REPORT : CHAIRMAN_REPORT));
        const division = permittedScope(req, requestedType, req.query.division);
        const result = await pool.query(
            `SELECT s.id,s.report_type,s.division,s.period_start,s.period_end,s.status,s.commentary,
                    s.created_at,s.finalised_at,u.full_name created_by_name,f.full_name finalised_by_name,
                    s.report_data->'summary' summary
             FROM ai_report_snapshots s
             LEFT JOIN users u ON u.id=s.created_by
             LEFT JOIN users f ON f.id=s.finalised_by
             WHERE s.report_type=$1 AND s.division IS NOT DISTINCT FROM $2
             ORDER BY s.created_at DESC LIMIT 50`,
            [requestedType, division]
        );
        res.json({ success: true, versions: result.rows });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message || 'Unable to load report versions.' });
    }
};

exports.getSnapshot = async (req, res) => {
    try {
        const snapshot = (await pool.query('SELECT * FROM ai_report_snapshots WHERE id=$1', [req.params.id])).rows[0];
        if (!snapshot) return res.status(404).json({ success: false, message: 'Report version not found.' });
        permittedScope(req, snapshot.report_type, snapshot.division);
        res.json({ success: true, snapshot });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message || 'Unable to load the report.' });
    }
};

exports.updateDraft = async (req, res) => {
    try {
        const existing = (await pool.query('SELECT * FROM ai_report_snapshots WHERE id=$1', [req.params.id])).rows[0];
        if (!existing) return res.status(404).json({ success: false, message: 'Report version not found.' });
        permittedScope(req, existing.report_type, existing.division);
        if (existing.status === 'Finalised') return res.status(409).json({ success: false, message: 'Finalised report versions are immutable.' });
        const result = await pool.query(
            'UPDATE ai_report_snapshots SET commentary=$1 WHERE id=$2 RETURNING *',
            [String(req.body.commentary || '').trim() || null, existing.id]
        );
        await logAudit({ req, action: 'AI_REPORT_COMMENTARY_UPDATED', entityType: 'AIReport', entityId: existing.id });
        res.json({ success: true, snapshot: result.rows[0] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message || 'Unable to update report commentary.' });
    }
};

exports.finalise = async (req, res) => {
    try {
        const existing = (await pool.query('SELECT * FROM ai_report_snapshots WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
        if (!existing) return res.status(404).json({ success: false, message: 'Report version not found.' });
        permittedScope(req, existing.report_type, existing.division);
        if (existing.status === 'Finalised') return res.status(409).json({ success: false, message: 'This report version is already finalised.' });
        const result = await pool.query(
            `UPDATE ai_report_snapshots SET status='Finalised',finalised_by=$1,finalised_at=NOW(),
             commentary=COALESCE($2,commentary) WHERE id=$3 RETURNING *`,
            [req.user.id, String(req.body.commentary || '').trim() || null, existing.id]
        );
        await logAudit({ req, action: 'AI_REPORT_FINALISED', entityType: 'AIReport', entityId: existing.id, details: { reportType: existing.report_type, division: existing.division } });
        res.json({ success: true, snapshot: result.rows[0] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message || 'Unable to finalise the report.' });
    }
};

exports.emailSnapshot = async (req, res) => {
    try {
        const snapshot = (await pool.query('SELECT * FROM ai_report_snapshots WHERE id=$1', [req.params.id])).rows[0];
        if (!snapshot) return res.status(404).json({ success: false, message: 'Report version not found.' });
        permittedScope(req, snapshot.report_type, snapshot.division);
        const recipient = String(req.body.recipient_email || req.user.email || '').trim();
        const report = snapshot.report_data;
        await sendEmail({
            to: recipient,
            subject: `NCA GRC: ${report.title}`,
            text: `${report.title}\n\n${report.narrative}\n\nGenerated: ${report.generated_at}\nReport version: ${snapshot.id}`,
            html: `<h2>${escapeHtml(report.title)}</h2><p>${escapeHtml(report.narrative)}</p><p><strong>Risks:</strong> ${report.summary.total_risks}<br><strong>Average treatment progress:</strong> ${report.summary.average_treatment_progress}%<br><strong>Overdue treatments:</strong> ${report.summary.overdue_treatments}</p><p>Open the NCA GRC Reports workspace to view governed evidence and details. Report version ${snapshot.id}.</p>`,
            emailType: 'Governed AI Report',
            userId: req.user.id,
            role: req.user.role,
            directorate: snapshot.division,
            sentBy: req.user.id
        });
        await logAudit({ req, action: 'AI_REPORT_EMAILED', entityType: 'AIReport', entityId: snapshot.id, details: { recipient } });
        res.json({ success: true, message: 'The report summary has been queued for delivery.' });
    } catch (error) {
        res.status(error.status || 400).json({ success: false, message: error.message || 'Unable to email the report.' });
    }
};

exports.getSchedules = async (req, res) => {
    const params = [req.user.id];
    const ownOnly = req.user.role !== 'System Administrator' ? 'WHERE s.created_by=$1' : '';
    const result = await pool.query(
        `SELECT s.* FROM ai_report_schedules s ${ownOnly} ORDER BY s.created_at DESC`,
        req.user.role !== 'System Administrator' ? params : []
    );
    res.json({ success: true, schedules: result.rows });
};

exports.createSchedule = async (req, res) => {
    try {
        const reportType = String(req.body.report_type || '');
        const division = permittedScope(req, reportType, req.body.division);
        const frequency = String(req.body.frequency || '');
        if (!FREQUENCIES.includes(frequency)) return res.status(400).json({ success: false, message: 'Select a valid report frequency.' });
        const recipient = String(req.body.recipient_email || '').trim() || null;
        const nextRun = new Date(req.body.next_run_at);
        if (Number.isNaN(nextRun.getTime()) || nextRun <= new Date()) {
            return res.status(400).json({ success: false, message: 'Select a future first delivery date and time.' });
        }
        const result = await pool.query(
            `INSERT INTO ai_report_schedules(report_type,division,frequency,recipient_email,next_run_at,created_by)
             VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
            [reportType, division, frequency, recipient, nextRun, req.user.id]
        );
        await logAudit({ req, action: 'AI_REPORT_SCHEDULE_CREATED', entityType: 'AIReportSchedule', entityId: result.rows[0].id, details: { reportType, division, frequency, recipient } });
        res.status(201).json({ success: true, schedule: result.rows[0] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message || 'Unable to schedule the report.' });
    }
};

exports.toggleSchedule = async (req, res) => {
    const conditions = ['id=$1'];
    const params = [req.params.id, req.body.enabled === true];
    if (req.user.role !== 'System Administrator') {
        params.push(req.user.id);
        conditions.push(`created_by=$${params.length}`);
    }
    const result = await pool.query(
        `UPDATE ai_report_schedules SET enabled=$2,updated_at=NOW() WHERE ${conditions.join(' AND ')} RETURNING *`,
        params
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Report schedule not found.' });
    await logAudit({ req, action: 'AI_REPORT_SCHEDULE_UPDATED', entityType: 'AIReportSchedule', entityId: req.params.id, details: { enabled: req.body.enabled === true } });
    res.json({ success: true, schedule: result.rows[0] });
};

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
