const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('readiness reports development mail honestly and requires verified production SMTP',()=>{
    const source=read('backend/scripts/readiness-check.js');
    assert.match(source,/verification\.configured && verification\.verified/);
    assert.match(source,/not configured \(development\)/);
    assert.match(source,/NCA SMTP is not configured or could not be verified/);
});

test('administrator SMTP configuration enforces approved senders and encrypted transport',()=>{
    const controller=read('backend/controllers/communicationAdminController.js');
    const page=read('frontend/pages/communication-centre.html');
    assert.match(controller,/isAllowedServiceSender\(senderEmail\)/);
    assert.match(controller,/validateGmailConfiguration/);
    assert.match(controller,/\['STARTTLS','TLS'\]\.includes\(encryption\)/);
    assert.match(controller,/verifyEmailTransport/);
    assert.match(controller,/retry_count=0/);
    assert.doesNotMatch(page,/<option>None<\/option>/);
    assert.match(page,/smtpPasswordStatus/);
    assert.match(read('frontend/js/communication-centre.js'),/App password saved securely/);
    assert.match(page,/Verify and Send Test/);
});

test('NCA IT receives a mail deployment and acceptance checklist',()=>{
    const guide=read('NCA_IT_MAIL_DEPLOYMENT.md');
    assert.match(guide,/NCA SMTP relay/);
    assert.match(guide,/Dedicated authenticated SMTP account/);
    assert.match(guide,/npm run readiness/);
    assert.match(guide,/Outlook acceptance test/);
    assert.match(guide,/Delivery-status interpretation/);
});
