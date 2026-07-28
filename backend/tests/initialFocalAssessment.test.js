const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveInitialFocalAssessment } = require('../utils/initialFocalAssessment');

test('tracker imports initialise the Focal assessment from confirmed current ratings', () => {
    assert.deepEqual(deriveInitialFocalAssessment({
        likelihood: 4,
        impact: 4,
        current_likelihood: 3,
        current_impact: 2
    }, 'Risk Register Tracking Template'), {
        likelihood: 3,
        impact: 2,
        score: 6
    });
});

test('other Focal entry sources retain their submitted assessment ratings', () => {
    assert.deepEqual(deriveInitialFocalAssessment({
        likelihood: 4,
        impact: 5,
        current_likelihood: 2,
        current_impact: 2
    }, 'Work Plan'), {
        likelihood: 4,
        impact: 5,
        score: 20
    });
});

test('explicit Focal ratings override source-derived ratings and are recalculated', () => {
    assert.deepEqual(deriveInitialFocalAssessment({
        likelihood: 4,
        impact: 4,
        current_likelihood: 3,
        current_impact: 2
    }, 'Risk Register Tracking Template', {
        likelihood: 2,
        impact: 5
    }), {
        likelihood: 2,
        impact: 5,
        score: 10
    });
});
