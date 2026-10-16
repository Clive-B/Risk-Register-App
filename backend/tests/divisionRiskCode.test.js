const test = require('node:test');
const assert = require('node:assert/strict');
const { divisionRiskCode } = require('../utils/divisionRiskCode');

test('risk IDs use the first four letters of the division', () => {
    assert.equal(divisionRiskCode('Corporate Affairs'), 'CORP');
    assert.equal(divisionRiskCode('Consumer Affairs'), 'CONS');
    assert.equal(divisionRiskCode('Information Technology'), 'INFO');
    assert.equal(divisionRiskCode('Engineering'), 'ENGI');
    assert.equal(divisionRiskCode('RIPS'), 'RIPS');
});

test('division Risk ID codes ignore spacing and punctuation deterministically', () => {
    assert.equal(divisionRiskCode('  Corporate-Affairs  '), 'CORP');
    assert.equal(divisionRiskCode('N.C.A.'), 'NCA');
    assert.equal(divisionRiskCode(''), 'NCA');
});

test('all Risk ID generation paths use the shared division-code rule', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.resolve(__dirname, '..');
    const files = [
        'controllers/riskController.js',
        'utils/riskWorkbook.js',
        'utils/workbookCorrectionEngine.js'
    ];

    for (const file of files) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        assert.match(source, /divisionRiskCode/);
    }
});
