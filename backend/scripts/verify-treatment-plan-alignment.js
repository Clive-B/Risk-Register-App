require('dotenv').config();
const pool = require('../config/db');

async function main() {
    const result = await pool.query(`
        SELECT
            COUNT(DISTINCT r.id)::int AS uploaded_risks,
            COUNT(DISTINCT r.id) FILTER (WHERE tp.id IS NULL)::int AS risks_without_plan,
            COUNT(DISTINCT tp.id) FILTER (
                WHERE tp.id IS NOT NULL AND (
                    NULLIF(BTRIM(tp.treatment_actions),'') IS NULL
                    OR NULLIF(BTRIM(tp.system_improvements),'') IS NULL
                    OR NULLIF(BTRIM(tp.action_owner),'') IS NULL
                    OR tp.due_date IS NULL
                    OR tp.review_date IS NULL
                    OR tp.target_residual_score IS NULL
                )
            )::int AS incomplete_plans,
            COUNT(DISTINCT tp.id) FILTER (
                WHERE r.entry_source IN ('Risk Register Tracking Template','Imported Workbook')
                  AND NULLIF(BTRIM(r.initial_mitigation_plan),'') IS NOT NULL
                  AND BTRIM(COALESCE(tp.uploaded_plan,'')) <> BTRIM(r.initial_mitigation_plan)
            )::int AS uploaded_plans_not_preserved
        FROM risks r
        LEFT JOIN treatment_plans tp ON tp.risk_id=r.id
        WHERE r.entry_source IN ('Risk Register Tracking Template','Imported Workbook','Work Plan')
    `);
    const checks = result.rows[0];
    console.log(JSON.stringify(checks, null, 2));
    if (checks.risks_without_plan || checks.incomplete_plans || checks.uploaded_plans_not_preserved) process.exitCode = 1;
}

main()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
