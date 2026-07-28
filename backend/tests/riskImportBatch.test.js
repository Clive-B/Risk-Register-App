const test = require('node:test');
const assert = require('node:assert/strict');
const {
    isChampionReviewComplete,
    canApproveImportBatch
} = require('../utils/riskImportBatch');

test('imported register requires a saved Champion decision for every risk', () => {
    assert.equal(isChampionReviewComplete({
        review_stage:'Awaiting Champion Review',
        champion_decision:'Focal',
        champion_score:20
    }), true);
    assert.equal(isChampionReviewComplete({
        review_stage:'Awaiting Champion Review',
        champion_decision:null,
        champion_score:null
    }), false);
    assert.equal(isChampionReviewComplete({
        review_stage:'Awaiting Chairman Review',
        champion_decision:'Adjusted',
        champion_score:25
    }), false);
});

test('only the assigned Division Champion can approve a complete imported register', () => {
    const batch = {
        division:'RIPS',
        status:'Champion Review',
        risk_count:7,
        champion_reviewed_count:7
    };
    assert.equal(canApproveImportBatch(batch,{role:'Risk Champion',division:'RIPS'}), true);
    assert.equal(canApproveImportBatch(batch,{role:'Risk Champion',division:'Legal'}), false);
    assert.equal(canApproveImportBatch({...batch,champion_reviewed_count:6},{role:'Risk Champion',division:'RIPS'}), false);
    assert.equal(canApproveImportBatch(batch,{role:'Risk Focal Person',division:'RIPS'}), false);
});
