const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..','..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('deployment migration removes legacy prefixes and separates role slots from holders',()=>{
  const sql=read('backend/migrations/050_deployment_identity_lifecycle.sql');
  assert.match(sql,/REGEXP_REPLACE\(email, '\^test\\\.'/i);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS organizational_role_slots/i);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS role_slot_assignments/i);
  assert.match(sql,/identity_type IN \('Role Placeholder','Named Employee'\)/);
  assert.match(sql,/role_slot_assignments_one_current/);
});

test('administrator account mapping preserves history and revokes former access',()=>{
  const controller=read('backend/controllers/userController.js');
  const routes=read('backend/routes/userRoutes.js');
  const page=read('frontend/pages/account-mapping.html');
  assert.match(routes,/role-slots\/:id\/map/);
  assert.match(routes,/role-slots\/:id\/clear/);
  assert.match(routes,/role-slots\/onboarding\/send-deferred/);
  assert.match(controller,/status='Ended'/);
  assert.match(controller,/assignment_status='Former'/);
  assert.match(controller,/UPDATE user_sessions SET revoked_at=NOW\(\)/);
  assert.match(controller,/deliverWelcomeEmail/);
  assert.match(page,/This replaces access, not history/);
  assert.match(page,/Send Deferred Onboarding/);
  assert.match(controller,/ROLE_HOLDER_CLEARED/);
  assert.match(controller,/GROUP_ROLE_HOLDER_ONBOARDING/);
  assert.match(controller,/email_status='Deferred'/);
  assert.match(controller,/current_holder_user_id=NULL/);
});

test('account mapping renders rows before optional onboarding controls and exposes retry state',()=>{
  const script=read('frontend/js/account-mapping.js');
  const rowRender=script.indexOf('rows.innerHTML = filtered.map');
  const optionalControl=script.indexOf('if (sendDeferred)');
  assert.ok(rowRender>=0&&optionalControl>rowRender);
  assert.match(script,/sendDeferred\?\.addEventListener/);
  assert.match(script,/Account mappings could not be loaded/);
  assert.match(script,/retryMappingLoad/);
});

test('test deployment allowlists only the approved Gmail service identity',()=>{
  const deployment=read('deploy/linux-test/deploy-release.sh');
  assert.match(deployment,/smtp_test_sender="ncariskmanagementsystem@gmail\.com"/);
  assert.match(deployment,/set_env_value SMTP_ALLOWED_EXTERNAL_SENDERS "\$smtp_test_sender"/);
  assert.doesNotMatch(deployment,/SMTP_ALLOWED_EXTERNAL_SENDERS=\*|@gmail\.com,|gmail\.com\s*$/m);
});

test('first-login and expired-password changes are enforced by the API',()=>{
  const middleware=read('backend/middleware/authMiddleware.js');
  const login=read('frontend/js/login.js');
  const change=read('frontend/js/change-password.js');
  assert.match(middleware,/u\.password_changed_at/);
  assert.match(middleware,/PASSWORD_POLICY\.expiryDays/);
  assert.match(middleware,/PASSWORD_CHANGE_REQUIRED/);
  assert.match(login,/data\.mustChangePassword/);
  assert.match(change,/dashboardPath\(\)/);
});

test('administrators can explicitly create another fully warned administrator',()=>{
  const page=read('frontend/pages/users.html');
  const script=read('frontend/js/users.js');
  const routes=read('backend/routes/userRoutes.js');
  assert.match(page,/id="createAdminBtn"/);
  assert.match(page,/Full administrative authority/);
  assert.match(script,/openAdministratorModal/);
  assert.match(script,/fields\.role\.value = "System Administrator"/);
  assert.match(routes,/roleMiddleware\('System Administrator'\)/);
});

test('Admin-assisted workbook figures are provisional Focal assessments',()=>{
  const controller=read('backend/controllers/riskController.js');
  const migration=read('backend/migrations/052_backfill_admin_uploaded_focal_figures.sql');
  const register=read('frontend/js/risks.js');
  assert.match(controller,/hasProvisionalFocalAssessment/);
  assert.match(controller,/focal_assessment_status='Confirmed'/);
  assert.match(migration,/focal_assessment_status = 'Pending Confirmation'/);
  assert.match(register,/Focal · Pending/);
});

test('assistant is grounded in the manual, page context and authorised live risk data',()=>{
  const manual=read('docs/NCA_GRC_SYSTEM_USER_MANUAL.md');
  const knowledge=read('backend/knowledge/systemManual.js');
  const controller=read('backend/controllers/assistantController.js');
  const assistant=read('frontend/js/assistant.js');
  assert.match(manual,/Recommendations are advisory/);
  assert.match(knowledge,/provisional Focal figures/);
  assert.match(controller,/ASSISTANT_QUERY/);
  assert.match(controller,/supporting risk IDs|top_risks/);
  assert.match(controller,/authorised scope/);
  assert.match(assistant,/\/assistant\/query/);
  assert.match(assistant,/System manual/);
});

test('deployment readiness allows model cold start without relaxing interactive response limits',()=>{
  const verifier=read('backend/scripts/verify-local-ai.js');
  const deploy=read('deploy/linux-test/deploy-release.sh');
  assert.match(verifier,/AI_READINESS_TIMEOUT_MS/);
  assert.match(verifier,/Math\.max\(Number\(process\.env\.AI_READINESS_TIMEOUT_MS\) \|\| 60000, config\.timeoutMs\)/);
  assert.match(deploy,/set_env_value AI_TIMEOUT_MS 20000/);
  assert.match(deploy,/set_env_value AI_ROUTER_TIMEOUT_MS 400/);
  assert.match(deploy,/set_env_value AI_READINESS_TIMEOUT_MS 60000/);
});
