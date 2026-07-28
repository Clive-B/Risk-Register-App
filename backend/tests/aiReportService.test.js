const test = require('node:test');
const assert = require('node:assert/strict');
const {
    effectiveAssessment,
    isCriticalHeatCell,
    treatmentConfidence,
    riskDataQuality
} = require('../services/aiReportService');

test('Chairman critical scope includes exactly the governed 25/20/20 heat-map cells', () => {
    assert.equal(isCriticalHeatCell({ likelihood: 5, impact: 5, score: 25 }), true);
    assert.equal(isCriticalHeatCell({ likelihood: 5, impact: 4, score: 20 }), true);
    assert.equal(isCriticalHeatCell({ likelihood: 4, impact: 5, score: 20 }), true);
    assert.equal(isCriticalHeatCell({ likelihood: 4, impact: 4, score: 16 }), false);
    assert.equal(isCriticalHeatCell({ likelihood: 3, impact: 5, score: 15 }), false);
});

test('Chairman effective assessment does not fall back to the Focal assessment', () => {
    const risk = {
        system_likelihood: 4, system_impact: 5, system_score: 20,
        focal_likelihood: 5, focal_impact: 5, focal_score: 25
    };
    assert.deepEqual(effectiveAssessment(risk, false), {
        source: 'System', likelihood: 4, impact: 5, score: 20
    });
});

test('Committee and Champion values take governed precedence', () => {
    const risk = {
        system_likelihood: 4, system_impact: 5, system_score: 20,
        champion_likelihood: 5, champion_impact: 4, champion_score: 20,
        chairman_likelihood: 5, chairman_impact: 5, chairman_score: 25
    };
    assert.equal(effectiveAssessment(risk, false).source, 'Committee');
    delete risk.chairman_score;
    assert.equal(effectiveAssessment(risk, false).source, 'Champion');
});

test('Treatment confidence and data-quality rules expose incomplete evidence', () => {
    const confidence = treatmentConfidence({
        treatment_actions: '',
        action_owner: '',
        progress_percent: 0,
        updated_at: new Date().toISOString()
    });
    assert.equal(confidence.label, 'Weak');
    const issues = riskDataQuality({ risk_owner: '', risk_description: '', next_review_date: null }, [{
        id: 3, treatment_actions: '', action_owner: '', due_date: null
    }]);
    assert.ok(issues.some(issue => issue.includes('Risk owner')));
    assert.ok(issues.some(issue => issue.includes('no evidence')));
});
