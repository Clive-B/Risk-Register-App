const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Focal Person and Champion can review and submit multiple manually entered risks', () => {
    const page = read('frontend/pages/create-risk.html');
    const script = read('frontend/js/create-risk.js');
    assert.match(page, /id="riskBatchSection"/);
    assert.match(page, /id="addToBatchBtn"/);
    assert.match(page, /id="submitBatchBtn"/);
    assert.match(script, /\["Risk Focal Person", "Risk Champion"\]/);
    assert.match(script, /function addCurrentRiskToBatch/);
    assert.match(script, /async function submitRiskBatch/);
    assert.match(script, /data-remove-batch/);
});

test('Chairman dashboard is quarterly and groups governed risks by category', () => {
    const page = read('frontend/pages/board-dashboard.html');
    const script = read('frontend/js/board-dashboard.js');
    const repository = read('backend/repositories/executiveAnalyticsRepository.js');
    assert.match(page, /id="dashboardQuarter"/);
    assert.match(page, /id="dashboardYear"/);
    assert.match(page, /id="categoryGroups"/);
    assert.match(script, /dateFrom=/);
    assert.match(script, /dateTo=/);
    assert.match(script, /window\.print\(\)/);
    assert.match(repository, /categoryGroups: categories\.rows/);
    assert.match(repository, /GROUP BY COALESCE\(NULLIF\(risk_category,''\),'Uncategorised'\)/);
});

test('treatment oversight supports derived overdue filtering and completion ordering', () => {
    const page = read('frontend/pages/treatment.html');
    const controller = read('backend/controllers/treatmentController.js');
    const migration = read('backend/migrations/054_treatment_completion_order.sql');
    assert.match(page, /id="sortFilter"/);
    assert.match(page, /completion_desc/);
    assert.match(controller, /filters\.status === 'Overdue'/);
    assert.match(controller, /tp\.completed_at DESC NULLS LAST/);
    assert.match(controller, /completed_at = CASE WHEN \$7='Completed'/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS completed_at/);
});
