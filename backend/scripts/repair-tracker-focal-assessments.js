require('dotenv').config();
const pool = require('../config/db');

function argument(name) {
    const prefix = `--${name}=`;
    const item = process.argv.find(value => value.startsWith(prefix));
    return item ? item.slice(prefix.length) : null;
}

(async () => {
    const databaseName = String(process.env.DB_NAME || '');
    const batchId = Number(argument('batch'));
    const expectedCount = Number(argument('expected'));

    if (!databaseName.toLowerCase().includes('test')) {
        throw new Error('This repair command is restricted to a test database.');
    }
    if (!Number.isInteger(batchId) || batchId < 1) {
        throw new Error('Provide the exact import batch using --batch=<id>.');
    }
    if (!Number.isInteger(expectedCount) || expectedCount < 1) {
        throw new Error('Provide the expected risk count using --expected=<count>.');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const risks = (await client.query(`
            SELECT r.id,r.risk_id,r.created_by,
                   r.current_likelihood,r.current_impact,r.current_risk_score,
                   g.focal_likelihood,g.focal_impact,g.focal_score,g.review_stage
            FROM risks r
            JOIN risk_assessment_governance g ON g.risk_id=r.id
            WHERE r.import_batch_id=$1
              AND r.entry_source='Risk Register Tracking Template'
            ORDER BY r.id
            FOR UPDATE OF r,g
        `, [batchId])).rows;

        if (risks.length !== expectedCount) {
            throw new Error(`Batch ${batchId} contains ${risks.length} tracker risks; expected ${expectedCount}. No changes were made.`);
        }

        let repaired = 0;
        for (const risk of risks) {
            const likelihood = Number(risk.current_likelihood);
            const impact = Number(risk.current_impact);
            if (![likelihood, impact].every(value => Number.isInteger(value) && value >= 1 && value <= 5)) {
                throw new Error(`${risk.risk_id} has no valid confirmed current assessment. No changes were made.`);
            }
            const score = likelihood * impact;
            if (
                Number(risk.focal_likelihood) === likelihood
                && Number(risk.focal_impact) === impact
                && Number(risk.focal_score) === score
            ) continue;

            const before = {
                likelihood: risk.focal_likelihood,
                impact: risk.focal_impact,
                score: risk.focal_score
            };
            const after = { likelihood, impact, score };

            await client.query(`
                UPDATE risk_assessment_governance
                SET focal_likelihood=$1,
                    focal_impact=$2,
                    focal_score=$3,
                    focal_reason='Confirmed current assessment imported from the Risk Register Tracking Template.',
                    updated_at=NOW()
                WHERE risk_id=$4
            `, [likelihood, impact, score, risk.id]);
            await client.query(`
                INSERT INTO risk_history(risk_id,action,comment,changed_by,details)
                VALUES($1,'Focal Assessment Mapping Corrected',$2,$3,$4::jsonb)
            `, [
                risk.id,
                'Corrected the Focal assessment to the confirmed current workbook ratings; the system-generated assessment was retained separately.',
                risk.created_by,
                JSON.stringify({
                    import_batch_id: batchId,
                    correction: 'tracker_focal_current_assessment_mapping',
                    before,
                    after,
                    system_assessment_unchanged: true
                })
            ]);
            repaired += 1;
        }

        await client.query('COMMIT');
        console.log(JSON.stringify({ batch_id: batchId, total: risks.length, repaired }));
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
})().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(() => pool.end());
