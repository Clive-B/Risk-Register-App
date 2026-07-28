require('dotenv').config();
const repository = require('../repositories/executiveAnalyticsRepository');
const pool = require('../config/db');

async function verify() {
    const [cells,options,kpis,divisionKpis] = await Promise.all([
        repository.heatmap({}),repository.options(),repository.kpis({}),repository.kpis({division:'RIPS'})
    ]);
    for (const cell of cells) {
        const likelihood = Number(cell.likelihood);
        const impact = Number(cell.impact);
        const programmes = Number(cell.count);
        const risks = Number(cell.risk_count);
        if (![likelihood,impact].every(value => Number.isInteger(value) && value >= 1 && value <= 5)) {
            throw new Error('The executive heat map returned an invalid coordinate.');
        }
        if (!Number.isInteger(programmes) || programmes < 0 || programmes > risks) {
            throw new Error('The executive heat map programme aggregation is invalid.');
        }
    }
    for (const key of ['divisions','categories','statuses','levels']) {
        if (!Array.isArray(options[key]) || options[key].length === 0) {
            throw new Error(`The governed ${key} filter has no available values.`);
        }
    }
    console.log(JSON.stringify({
        valid:true,
        populatedCells:cells.length,
        complianceRate:kpis.compliance_rate,
        divisionComplianceRate:divisionKpis.compliance_rate,
        filterCounts:Object.fromEntries(Object.entries(options).map(([key,values]) => [key,values.length]))
    },null,2));
}

verify()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
