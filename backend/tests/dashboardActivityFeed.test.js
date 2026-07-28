const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('dashboard activity feed excludes passive telemetry and is limited to five events',()=>{
    const repository=read('backend/repositories/dashboardRepository.js');
    assert.match(repository,/NOTIFICATION_UNREAD_COUNT_VIEWED/);
    assert.match(repository,/a\.action NOT LIKE 'NOTIFICATION/);
    assert.match(repository,/a\.action NOT LIKE 'DASHBOARD/);
    assert.match(repository,/a\.action NOT LIKE 'PASSWORD/);
    assert.match(repository,/a\.action NOT LIKE 'EMAIL/);
    assert.match(repository,/ORDER BY a\.created_at DESC LIMIT 5/);
});

test('dashboard presents compact governed activity with a role-appropriate history link',()=>{
    const page=read('frontend/nca-grc-risk-register.html');
    const script=read('frontend/js/dashboard.js');
    const styles=read('frontend/css/dashboard.css');
    assert.match(page,/Latest governed business events/);
    assert.match(page,/id="allActivityLink"/);
    assert.match(script,/data\.activities\.slice\(0,5\)/);
    assert.match(script,/System Administrator'.*pages\/audit-logs\.html/);
    assert.match(styles,/min-height:68px/);
});
