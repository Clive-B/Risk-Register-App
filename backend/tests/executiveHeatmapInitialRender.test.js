const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.join(__dirname,'..','..','frontend');
const script = fs.readFileSync(path.join(frontend,'js','executive-analytics.js'),'utf8');
const styles = fs.readFileSync(path.join(frontend,'css','executive-analytics-performance.css'),'utf8');
const page = fs.readFileSync(path.join(frontend,'pages','executive-analytics.html'),'utf8');
const repository = fs.readFileSync(path.join(__dirname,'..','repositories','executiveAnalyticsRepository.js'),'utf8');

test('enterprise heat map creates its complete grid before awaiting API data',() => {
    assert.match(script,/async function heatmap\(\)\{const request=\+\+heatmapRequest;renderHeatmap\(heatCells\);const result=await api/);
    assert.match(script,/for\(let impact=5;impact>=1;impact--\)for\(let likelihood=1;likelihood<=5;likelihood\+\+\)/);
});

test('heat map layout stylesheet is available before dashboard scripts execute',() => {
    const stylesheetPosition = page.indexOf('executive-analytics-performance.css');
    const scriptPosition = page.indexOf('executive-analytics.js');
    assert.ok(stylesheetPosition > -1);
    assert.ok(scriptPosition > stylesheetPosition);
    assert.match(styles,/grid-template-rows:repeat\(5,minmax\(96px,auto\)\)/);
    assert.match(styles,/align-content:start/);
});

test('executive preview follows governed programme aggregation and score presentation',() => {
    assert.match(repository,/COUNT\(DISTINCT CASE[\s\S]*programme:[\s\S]*unassigned:/);
    assert.match(repository,/'programme_project',NULLIF\(TRIM\(r\.programme_project\),''\)/);
    assert.match(script,/score>=17\?'high':score>=11\?'medium':'low'/);
    assert.match(script,/<small><b>\$\{programmeCount\}<\/b><em>[\s\S]*<span>L\$\{likelihood\} × I\$\{impact\}<\/span><strong>\$\{score\}<\/strong>/);
    assert.match(page,/Open Full Enterprise Heat Map/);
    assert.match(page,/Likelihood → · Impact ↑/);
});

test('executive filters use governed options even when the risk register is empty',() => {
    assert.match(repository,/RISK_CATEGORIES/);
    assert.match(repository,/DIVISIONS/);
    assert.match(repository,/RISK_LIFECYCLE_STATUSES/);
    assert.match(repository,/role IN\('Risk Focal Person','Risk Champion'\)/);
    assert.match(page,/Lifecycle Status<select id="status">/);
    assert.match(script,/\['status','statuses'\]/);
});

test('executive analytics uses Division as its single organisational scope',() => {
    assert.doesNotMatch(page,/id="directorate"/);
    assert.doesNotMatch(page,/Directorate Scorecard/);
    assert.match(page,/Division Scorecard/);
    assert.match(script,/\['dateFrom','dateTo','division','category','owner','status','level'\]/);
    assert.match(script,/d\.divisions/);
    assert.doesNotMatch(script,/d\.directorates/);
});

test('dashboard personalization explains its effect and has explicit close controls',() => {
    assert.match(page,/These settings affect only your account and do not alter risk, treatment or compliance data/);
    assert.match(page,/Default dashboard after your next sign-in/);
    assert.match(page,/id="closePersonalize"/);
    assert.match(page,/id="cancelPersonalize"/);
    assert.match(script,/\$\('closePersonalize'\)\.onclick=closePersonalization/);
    assert.match(script,/\$\('cancelPersonalize'\)\.onclick=closePersonalization/);
});
