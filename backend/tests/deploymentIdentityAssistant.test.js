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
  assert.match(controller,/status='Ended'/);
  assert.match(controller,/assignment_status='Former'/);
  assert.match(controller,/UPDATE user_sessions SET revoked_at=NOW\(\)/);
  assert.match(controller,/deliverWelcomeEmail/);
  assert.match(page,/This replaces access, not history/);
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
