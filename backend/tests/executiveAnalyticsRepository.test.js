const test = require('node:test');
const assert = require('node:assert/strict');
const {
    levelFor,
    buildExecutiveSummary
} = require('../repositories/executiveAnalyticsRepository');

test('Board Dashboard uses the authoritative ERM score bands', () => {
    assert.equal(levelFor(10), 'Low');
    assert.equal(levelFor(11), 'Medium');
    assert.equal(levelFor(16), 'Medium');
    assert.equal(levelFor(17), 'High');
    assert.equal(levelFor(25), 'High');
});

test('Board Dashboard empty summary is explicit and does not imply a loading failure', () => {
    const summary = buildExecutiveSummary({
        totalRisks: 0,
        highRisks: 0,
        mediumRisks: 0,
        overdueTreatments: 0,
        pendingApprovals: 0,
        complianceIssues: 0,
        auditFindings: 0
    });
    assert.match(summary, /no enterprise risks or open audit findings/i);
});

test('Board Dashboard summary is generated from recorded governance counts', () => {
    const summary = buildExecutiveSummary({
        totalRisks: 8,
        highRisks: 2,
        mediumRisks: 3,
        overdueTreatments: 1,
        pendingApprovals: 4,
        complianceIssues: 2,
        auditFindings: 1
    });
    for (const phrase of ['8 enterprise risks', '2 High', '1 overdue treatment', '4 pending governance approvals', '2 open regulatory compliance issues', '1 open audit finding']) {
        assert.ok(summary.includes(phrase), phrase);
    }
});
