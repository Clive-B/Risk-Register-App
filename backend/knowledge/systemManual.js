const MANUAL_VERSION='2026.10.06';
const navigation=require('./navigationCatalog');

const pages={
  systemManual:{title:'System Manual',summary:'The authoritative in-system guide to identity, secure onboarding, email delivery, risk intake, assessment provenance, approvals, treatments, assistant behavior and secure operation.',actions:['Open System Manual from the navigation menu whenever guidance is needed.']},
  dashboard:{title:'Dashboard',summary:'Shows the signed-in user’s authorised risk posture, work queue, alerts and recent activity.',actions:['Open Action Centre for assigned work.','Voice conversation remains active until the user turns it off, and speech may interrupt the assistant.']},
  createRisk:{title:'Create Risk',summary:'Guides an authorised officer through identification, inherent assessment, existing controls, treatment, attachments and governed submission. Focal Persons and Champions may add several completed forms to a review batch and submit them together.',actions:['Complete every required field.','Use Save Draft until the record is ready for submission.','Use Add Risk to Batch and review the queue before Submit Batch when entering multiple risks.']},
  risks:{title:'Consolidated Risk Register',summary:'Shows governed risks and separate System, Focal, Champion and Chairman assessment stages. A displayed value must retain its recorded source.',actions:['Filter by division, level, workflow state or source.','Open a risk to review its assessment evidence and history.']},
  riskRegister:{title:'Focal Risk Register Upload',summary:'Allows a Risk Focal Person to upload an approved workbook, review explainable corrections and submit the confirmed register into governance.',actions:['Download the approved template.','Confirm every correction before admission.']},
  adminDivisionRiskUploads:{title:'Admin Multi-Division Uploads',summary:'Allows an Administrator to stage several Focal-supplied division workbooks in one governed submission. Workbook figures remain attributable to the assigned Focal Person and await confirmation.',actions:['Add one row per division.','Assign the active Focal Person.','Upload and confirm every correction, then send all.']},
  adminFocalSubmissions:{title:'Division Focal Submissions',summary:'Read-only Administrator oversight of every staged, Focal-submitted and downstream division register.',actions:['Track review progress without replacing the Focal decision.']},
  focalRiskAdmissions:{title:'Administrator-Staged Risks',summary:'The assigned Focal Person reviews or edits all assessments supplied in their workbook and uses one Submit All button to send the complete register to the Risk Champion.',actions:['Review every row.','Explain material changes.','Submit the complete register once.']},
  accountMapping:{title:'Organizational Account Mapping',summary:'Maps permanent organizational role accounts to current employees using effective-dated assignments. Replacements or Clear Holder revoke prior access without rewriting historic actions.',actions:['Enter the new holder’s official NCA email.','Record an effective date and reason.','Defer delivery when filling several accounts, then use Send Group Onboarding.','Confirm onboarding email status.']},
  users:{title:'User Management',summary:'Creates and governs NCA GRC users, administrators, activation, passwords, status and organizational role mappings.',actions:['Use Create Administrator only for a confirmed authority-wide need.','Use Map NCA Accounts for promotion, transfer, retirement or replacement.']},
  workplans:{title:'Work Plan Risks',summary:'Uploads approved work plans, applies governed corrections and routes derived risks through role-based assessment.',actions:['Focal Persons retain direct upload access.']},
  approvals:{title:'Approvals',summary:'Shows decisions awaiting the signed-in role. Focal, Champion and Chairman decisions are recorded separately.',actions:['Review evidence before deciding.','Record a reason for adjustments or returns.']},
  treatment:{title:'Treatment Plans',summary:'Tracks approved responses, owners, dates, progress, recorded completion order and completion evidence.',actions:['Filter overdue treatments and order them by due date, progress or completion time.','Escalate overdue high-risk actions.','Do not mark complete without required evidence.']},
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

function isSystemQuestion(question){
  const q=String(question||'').toLowerCase();
  return isPageContextQuestion(q)||Boolean(navigation.resolveNavigationItem(question))||/\b(nca|grc|system|platform|application|app|dashboard|navigation|menu|button|screen|page|workflow|workbook|upload|risk|treatment|compliance|audit|approval|report|password|login|account|user|role|focal|champion|chairman|what can you do|how (?:do|can|does)|where (?:do|can|is))\b/.test(q);
}

function isPageContextQuestion(question){
  const q=String(question||'').toLowerCase().replace(/\s+/g,' ').trim();
  return /\b(?:what (?:do|should|can) i do (?:here|with (?:this|it))|what is this (?:page|screen)|how (?:do|can) i use (?:this|it|this page|this screen)|what(?:'s| is) next|what next|help me (?:here|with (?:this|it))|guide me (?:here|on this page))\b/.test(q);
}

function isSystemFollowUp(question,history=[]){
  const q=String(question||'').toLowerCase().replace(/\s+/g,' ').trim();
  const isFollowUp=/\b(more|detail|details|continue|clarify|explain further|expand|elaborate|how so|what about that|go on)\b/.test(q)
    || /^why(?:\?|$|\s+(?:is|does|would|should)\s+(?:that|it|this)\b)/.test(q);
  if(!isFollowUp)return false;
  return history.slice(-6).some(item=>{
    const role=String(item?.role||'').toLowerCase();
    const text=String(item?.text||'');
    return role==='user'?isSystemQuestion(text):role==='assistant'&&/Source: NCA GRC System Manual/i.test(text);
  });
}

function findNavigationAnswer(question,user={}){
  const q=String(question||'').toLowerCase();
  if(/\b(all|every|list|which|what)\b.*\b(navigation|menu|button|sidebar)\b|\bwhat can i (?:access|see|open)\b/.test(q)){
    const answer=navigation.navigationOverview(user.role);
    return answer?{title:`${user.role} navigation`,answer}:null;
  }
  return navigation.answerNavigationQuestion(question,user.role);
}

function findManualAnswer(question,pageKey,history=[],user={}){
  const q=String(question||'').toLowerCase();
  const navigationAnswer=findNavigationAnswer(question,user);
  if(navigationAnswer)return navigationAnswer.answer;
  if(isPageContextQuestion(question)){
    const priorOpening=history.slice(-8).reverse().map(item=>String(item?.text||'')).find(text=>/\bOpening\s+(.+?)\./i.test(text));
    const openedLabel=priorOpening?.match(/\bOpening\s+(.+?)\./i)?.[1]||'';
    const currentPage=navigation.answerCurrentPage(pageKey,user.role,openedLabel);
    if(currentPage)return currentPage.answer;
  }
  const priorSystemOverview=history.slice(-6).some(item=>/NCA Enterprise GRC Platform is a secure, role-aware workspace/i.test(String(item?.text||''))||/tell me about.*(?:system|platform|nca grc)/i.test(String(item?.text||'')));
  if(isSystemFollowUp(question,history)&&priorSystemOverview)return `The platform has five connected governance layers. First, identity and role controls restrict each person to authorised screens and records. Second, risk intake accepts approved registers and work plans while preserving who supplied each assessment. Third, the assessment workflow keeps System, Focal, Champion and Chairman values separately attributed instead of silently replacing one with another. Fourth, treatment and compliance modules track accountable owners, dates, progress, evidence and verification. Fifth, dashboards, reports and the Action Centre turn those governed records into role-appropriate work and oversight. The assistant sits across these layers as a read-only guide: it may explain, summarise, compare and recommend, but authorised officers retain every approval, submission and official decision. Source: NCA GRC System Manual, Platform architecture and governance workflow.`;
  if(/\b(tell me about|describe|explain|overview|what is)\b.*\b(system|platform|application|app|nca grc)\b|\bwhat can you do\b/.test(q))return `The NCA Enterprise GRC Platform is a secure, role-aware workspace for governance, risk and compliance. It supports risk intake, attributed System, Focal, Champion and Chairman assessments, approvals, treatment plans, compliance assurance, reporting, executive analytics, organisational account management and an authorised Action Centre. The assistant can explain these workflows, summarise work you are permitted to see and identify supporting records, but it cannot approve, submit or change official records. Source: NCA GRC System Manual, Platform overview.`;
  if(/upload|workbook|excel|focal figure|system figure|provenance/.test(q))return `${workflow.join(' ')} Source: NCA GRC System Manual, Risk intake and assessment workflow.`;
  if(/administrator|admin account|delegate/.test(q))return 'An existing System Administrator can use Create Administrator in User Management to delegate authority-wide administration. Confirm the person’s identity, official NCA email and business need before creating the account. The new administrator must change the temporary password at first login. Source: NCA GRC System Manual, Administrator delegation.';
  if(/group onboarding|send group|defer/.test(q))return 'While mapping role accounts, an Administrator may defer each onboarding message, review the completed holders and use Send Group Onboarding. Each selected person receives a separate temporary password, the current manual PDF and a link to the live manual. Source: NCA GRC System Manual, Deferred and grouped onboarding.';
  if(/clear holder|unassign/.test(q))return 'Use Clear Holder to remove a current employee’s active access and revoke sessions without deleting the permanent role account or rewriting historic actions. Use the replacement workflow when the successor is known. Source: NCA GRC System Manual, Identity lifecycle.';
  if(/promotion|retire|retirement|transfer|replace|mapping|new person|personnel|email/.test(q))return 'Use Organizational Account Mapping from User Management. Select the permanent role account, assign the employee’s official NCA email, effective date and reason. The former holder is deactivated, sessions are revoked, history is preserved, unfinished assigned actions transfer, and the new holder receives a temporary password that must be changed. Source: NCA GRC System Manual, Identity lifecycle.';
  if(/password|onboard|first login|temporary|manual/.test(q))return 'New role holders receive a system-generated temporary password, the manual PDF and a link to the current in-system manual through the configured service email. They must change the password at first login. The change screen shows the active server policy and Show controls. After sign-in, System Manual remains available from the navigation menu. Source: NCA GRC System Manual, Secure onboarding.';
  if(/score|matrix|likelihood|impact/.test(q))return 'Risk score is likelihood multiplied by impact on the approved 5×5 matrix. Scores 1–10 are Low, 11–16 Medium and 17–25 High. System, Focal, Champion and Chairman values must be shown as separate attributed assessments. Source: NCA GRC System Manual, Assessment governance.';
  const page=pages[pageKey];
  if(page)return `${page.title}: ${page.summary} ${page.actions.join(' ')} Source: NCA GRC System Manual, ${page.title}.`;
  return `NCA GRC routes risk intake through Focal, Champion and, where required, Chairman governance while preserving provenance and audit history. ${workflow.join(' ')} Source: NCA GRC System Manual.`;
}

module.exports={MANUAL_VERSION,pages,workflow,roleLabel,greeting,isSystemQuestion,isPageContextQuestion,isSystemFollowUp,findNavigationAnswer,findManualAnswer,navigation};
