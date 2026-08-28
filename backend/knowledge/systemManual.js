const MANUAL_VERSION='2026.08.28';

const pages={
  systemManual:{title:'System Manual',summary:'The authoritative in-system guide to identity, risk intake, assessment provenance, approvals, treatments, assistant behavior and secure operation.',actions:['Use the contents to open the relevant governed page.']},
  dashboard:{title:'Dashboard',summary:'Shows the signed-in user’s authorised risk posture, work queue, alerts and recent activity.',actions:['Open Action Centre for assigned work.','Use Talk only when you want the assistant to listen.']},
  risks:{title:'Consolidated Risk Register',summary:'Shows governed risks and separate System, Focal, Champion and Chairman assessment stages. A displayed value must retain its recorded source.',actions:['Filter by division, level, workflow state or source.','Open a risk to review its assessment evidence and history.']},
  riskRegister:{title:'Focal Risk Register Upload',summary:'Allows a Risk Focal Person to upload an approved workbook, review explainable corrections and submit the confirmed register into governance.',actions:['Download the approved template.','Confirm every correction before admission.']},
  adminDivisionRiskUploads:{title:'Admin Multi-Division Uploads',summary:'Allows an Administrator to stage several Focal-supplied division workbooks in one governed submission. Workbook figures remain attributable to the assigned Focal Person and await confirmation.',actions:['Add one row per division.','Assign the active Focal Person.','Upload and confirm every correction, then send all.']},
  adminFocalSubmissions:{title:'Division Focal Submissions',summary:'Read-only Administrator oversight of every staged, Focal-submitted and downstream division register.',actions:['Track review progress without replacing the Focal decision.']},
  focalRiskAdmissions:{title:'Administrator-Staged Risks',summary:'The assigned Focal Person reviews or edits all assessments supplied in their workbook and uses one Submit All button to send the complete register to the Risk Champion.',actions:['Review every row.','Explain material changes.','Submit the complete register once.']},
  accountMapping:{title:'Organizational Account Mapping',summary:'Maps permanent organizational role accounts to current employees using effective-dated assignments. Replacements revoke prior access without rewriting historic actions.',actions:['Enter the new holder’s official NCA email.','Record an effective date and reason.','Confirm onboarding email status.']},
  users:{title:'User Management',summary:'Creates and governs NCA GRC users, activation, passwords, status and organizational role mappings.',actions:['Use Map NCA Accounts for promotion, transfer, retirement or replacement.']},
  workplans:{title:'Work Plan Risks',summary:'Uploads approved work plans, applies governed corrections and routes derived risks through role-based assessment.',actions:['Focal Persons retain direct upload access.']},
  approvals:{title:'Approvals',summary:'Shows decisions awaiting the signed-in role. Focal, Champion and Chairman decisions are recorded separately.',actions:['Review evidence before deciding.','Record a reason for adjustments or returns.']},
  treatment:{title:'Treatment Plans',summary:'Tracks approved responses, owners, dates, progress and completion evidence.',actions:['Escalate overdue high-risk actions.','Do not mark complete without required evidence.']},
  compliance:{title:'Compliance Assurance',summary:'Records obligations, evidence and verification status for governed compliance reporting.',actions:['Verify evidence rather than relying on self-attestation alone.']},
  executiveAnalytics:{title:'Executive Analytics',summary:'Provides authority-wide, permission-controlled risk and treatment trends for executive review.',actions:['Use filters before drawing conclusions.','Open supporting risks for evidence.']},
  boardDashboard:{title:'Board Dashboard',summary:'Provides board-level governed indicators and risk trends based on authorised records.',actions:['Treat assistant recommendations as advisory and verify source records.']},
  reports:{title:'Reports',summary:'Creates governed risk, treatment, compliance and executive outputs from recorded data.',actions:['Confirm filters and reporting period before export.']}
};

const workflow=[
  'A Focal Person may upload an approved workbook directly, or an Administrator may stage a workbook received from that Focal Person.',
  'For Administrator-assisted uploads, workbook likelihood, impact and score are provisional Focal figures—not System figures—and remain Pending Confirmation.',
  'The assigned Focal Person reviews or edits every row and submits the complete division register once to the Risk Champion.',
  'The Risk Champion records an independent decision. Where required, the Risk Committee Chairman records the final governed decision.',
  'Only completed governance stages enter the final consolidated and reporting views as approved decisions.'
];

function roleLabel(user){
  const division=user.division||user.directorate;
  if(user.role==='Risk Focal Person')return `${division||'NCA'} Risk Focal Person`;
  if(user.role==='Risk Champion')return `${division||'NCA'} Risk Champion`;
  return user.role||'NCA colleague';
}

function greeting(user){
  const role=roleLabel(user);
  if(user.identity_type==='Named Employee'&&user.full_name)return `Welcome, ${user.full_name}, ${role}.`;
  return `Welcome, ${role}.`;
}

function findManualAnswer(question,pageKey){
  const q=String(question||'').toLowerCase();
  if(/upload|workbook|excel|focal figure|system figure|provenance/.test(q))return `${workflow.join(' ')} Source: NCA GRC System Manual, Risk intake and assessment workflow.`;
  if(/promotion|retire|retirement|transfer|replace|mapping|new person|personnel|email/.test(q))return 'Use Organizational Account Mapping from User Management. Select the permanent role account, assign the employee’s official NCA email, effective date and reason. The former holder is deactivated, sessions are revoked, history is preserved, unfinished assigned actions transfer, and the new holder receives a temporary password that must be changed. Source: NCA GRC System Manual, Identity lifecycle.';
  if(/password|onboard|first login|temporary/.test(q))return 'New role holders receive a system-generated temporary password through the configured NCA service email. They must change it at first login. Administrators can regenerate a temporary password if delivery fails; doing so revokes existing sessions. Source: NCA GRC System Manual, Secure onboarding.';
  if(/score|matrix|likelihood|impact/.test(q))return 'Risk score is likelihood multiplied by impact on the approved 5×5 matrix. Scores 1–10 are Low, 11–16 Medium and 17–25 High. System, Focal, Champion and Chairman values must be shown as separate attributed assessments. Source: NCA GRC System Manual, Assessment governance.';
  const page=pages[pageKey];
  if(page)return `${page.title}: ${page.summary} ${page.actions.join(' ')} Source: NCA GRC System Manual, ${page.title}.`;
  return `NCA GRC routes risk intake through Focal, Champion and, where required, Chairman governance while preserving provenance and audit history. ${workflow.join(' ')} Source: NCA GRC System Manual.`;
}

module.exports={MANUAL_VERSION,pages,workflow,roleLabel,greeting,findManualAnswer};
