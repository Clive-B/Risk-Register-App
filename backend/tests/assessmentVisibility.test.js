const test = require('node:test');
const assert = require('node:assert/strict');
const {
    redactFocalAssessment,
    redactFocalAssessments,
    redactRiskHistory
} = require('../utils/assessmentVisibility');

const chairman = 'Risk Committee Chairman';

test('Chairman assessment responses contain system and Champion values but no Focal assessment', () => {
    const source = {
        system_score: 20,
        focal_category: 'Operational',
        focal_likelihood: 4,
        focal_impact: 5,
        focal_score: 20,
        focal_reason: 'Focal explanation',
        focal_at: '2026-07-23T12:00:00Z',
        focal_review_history: [{ proposal: { score: 20 } }],
        champion_focal_decision: 'Approved',
        champion_likelihood: 5,
        champion_impact: 5,
        champion_score: 25,
        champion_reason: 'Optional Champion comment'
    };

    const visible = redactFocalAssessment(source, chairman);

    assert.equal(visible.system_score, 20);
    assert.equal(visible.champion_score, 25);
    assert.equal(visible.champion_reason, 'Optional Champion comment');
    assert.equal('focal_score' in visible, false);
    assert.equal('focal_reason' in visible, false);
    assert.equal('focal_review_history' in visible, false);
    assert.equal('champion_focal_decision' in visible, false);
    assert.equal(source.focal_score, 20);
});

test('non-Chairman assessment responses are unchanged', () => {
    const source = { system_score: 20, focal_score: 16, champion_score: 20 };
    assert.equal(redactFocalAssessment(source, 'Risk Champion'), source);
    assert.deepEqual(redactFocalAssessments([source], 'System Administrator'), [source]);
});

test('Chairman history omits Focal submissions and removes Focal challenge detail', () => {
    const history = [
        { action: 'Focal Assessment Submitted', comment: 'Withheld explanation' },
        {
            action: 'Focal Challenge Rejected',
            comment: 'Optional Champion comment',
            details: { focal: { score: 16 }, champion: { score: 20 }, focal_challenge: true }
        },
        { action: 'Chairman Final Assessment', comment: 'Accepted' }
    ];

    const visible = redactRiskHistory(history, chairman);

    assert.equal(visible.length, 2);
    assert.equal(visible[0].action, 'Champion Assessment Recorded');
    assert.equal(visible[0].comment, 'Optional Champion comment');
    assert.deepEqual(visible[0].details, { champion: { score: 20 } });
});
