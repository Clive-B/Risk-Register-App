require('dotenv').config();
const pool = require('../config/db');

async function main() {
    const checks = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS count FROM risks
            WHERE risk_category NOT IN (
                'Strategic','Financial','Operational','Reputational',
                'Human Capital','Regulatory Compliance','Supervision'
            )`),
        pool.query(`SELECT COUNT(*)::int AS count FROM risks
            WHERE risk_level <> CASE
                WHEN inherent_risk_score >= 17 THEN 'High'
                WHEN inherent_risk_score >= 11 THEN 'Medium'
                ELSE 'Low'
            END`),
        pool.query(`SELECT COUNT(*)::int AS count FROM risks
            WHERE risk_treatment NOT IN ('Terminate','Treat','Transfer','Tolerate')`)
    ]);

    const result = {
        invalidCategories: checks[0].rows[0].count,
        invalidLevels: checks[1].rows[0].count,
        invalidTreatments: checks[2].rows[0].count
    };
    console.log(JSON.stringify(result, null, 2));
    if (Object.values(result).some(Boolean)) process.exitCode = 1;
}

main()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
