const test = require('node:test');
const assert = require('node:assert/strict');
const { programmeEntries } = require('../../frontend/js/assessmentAggregation');

test('programme aggregation counts an assigned programme once per heat-map cell', () => {
    const entries = programmeEntries([
        { id: 1, programme_project: 'Spectrum Management', risk_id: 'R-001' },
        { id: 2, programme_project: ' spectrum management ', risk_id: 'R-002' },
        { id: 3, programme_project: 'Consumer Protection', risk_id: 'R-003' }
    ]);

    assert.equal(entries.length, 2);
    assert.equal(entries[0].label, 'Consumer Protection');
    assert.equal(entries[1].label, 'Spectrum Management');
    assert.equal(entries[1].risks.length, 2);
});

test('risks without a programme remain visible as separate Unassigned entries', () => {
    const entries = programmeEntries([
        { id: 10, programme_project: '', risk_id: 'R-010', risk_title: 'First' },
        { id: 11, programme_project: null, risk_id: 'R-011', risk_title: 'Second' }
    ]);

    assert.equal(entries.length, 2);
    assert.ok(entries.every(entry => entry.label === 'Unassigned'));
    assert.ok(entries.every(entry => entry.unassigned));
});
