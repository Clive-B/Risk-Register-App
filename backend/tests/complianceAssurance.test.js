const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=relative=>fs.readFileSync(path.join(__dirname,'..','..',relative),'utf8');

const migration=read('backend/migrations/045_compliance_assurance.sql');
const repository=read('backend/repositories/executiveAnalyticsRepository.js');
const controller=read('backend/controllers/complianceController.js');
const page=read('frontend/pages/compliance.html');

test('compliance rate uses only verified compliant evidence over assessed applicable obligations',()=>{
    assert.match(repository,/assessment_status='Compliant'[\s\S]*evidence_verified[\s\S]*assessment_status<>'Not Assessed'/);
    assert.match(repository,/FROM compliance_obligations WHERE record_status='Active'/);
});

test('compliance assurance retains governed status, evidence and verification history',()=>{
    for(const status of ['Not Assessed','Compliant','Partially Compliant','Non-Compliant']) assert.match(migration,new RegExp(status));
    assert.match(migration,/compliance_assessment_history/);
    assert.match(controller,/Compliant assessments require an evidence reference and summary/);
    assert.match(controller,/Assessment must be verified by a different authorized user/);
    assert.match(controller,/COMPLIANCE_EVIDENCE_VERIFIED/);
    assert.match(page,/Verified Compliant obligations ÷ all assessed, applicable obligations/);
});
