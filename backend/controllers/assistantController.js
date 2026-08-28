const pool=require('../config/db');
const manual=require('../knowledge/systemManual');
const {logAudit}=require('../utils/auditLogger');

function pageKey(value){
  const file=String(value||'').split('?')[0].split('/').pop();
  return ({'nca-grc-risk-register.html':'dashboard','risks.html':'risks','risk-register.html':'riskRegister','admin-division-risk-uploads.html':'adminDivisionRiskUploads','admin-focal-submissions.html':'adminFocalSubmissions','focal-risk-admissions.html':'focalRiskAdmissions','account-mapping.html':'accountMapping','system-manual.html':'systemManual','users.html':'users','workplans.html':'workplans','my-approvals.html':'approvals','pending-approvals.html':'approvals','treatment.html':'treatment','compliance.html':'compliance','executive-analytics.html':'executiveAnalytics','board-dashboard.html':'boardDashboard','reports.html':'reports'})[file]||'dashboard';
}

async function identity(user){
  const row=(await pool.query(`SELECT identity_type,role_email FROM users WHERE id=$1`,[user.id])).rows[0]||{};
  return {...user,...row};
}

exports.context=async(req,res)=>{
  try{
    const user=await identity(req.user);const key=pageKey(req.query.page);
    res.json({success:true,context:{manual_version:manual.MANUAL_VERSION,greeting:manual.greeting(user),role_label:manual.roleLabel(user),page_key:key,page:manual.pages[key],human_authority_notice:'Assistant guidance is advisory. Authorised NCA officers remain responsible for decisions and approvals.'}});
  }catch(error){console.error(error);res.status(500).json({success:false,message:'Unable to load assistant context.'})}
};

async function riskAnalysis(user){
  const params=[];let scope='';
  if(['Risk Focal Person','Risk Champion'].includes(user.role)){params.push(user.division||user.directorate);scope=' AND COALESCE(NULLIF(BTRIM(r.division),\'\'),r.directorate)=$1';}
  const summary=(await pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER(WHERE COALESCE(g.chairman_score,g.champion_score,g.focal_score,g.system_score,r.inherent_risk_score)>=17)::int AS high,
      COUNT(*) FILTER(WHERE g.review_stage='Awaiting Focal Review')::int AS awaiting_focal,
      COUNT(*) FILTER(WHERE g.review_stage='Awaiting Champion Review')::int AS awaiting_champion,
      COUNT(*) FILTER(WHERE g.review_stage='Awaiting Chairman Review')::int AS awaiting_chairman,
      COUNT(*) FILTER(WHERE r.target_completion_date<CURRENT_DATE AND r.status NOT IN('Closed','Accepted'))::int AS overdue
    FROM risks r LEFT JOIN risk_assessment_governance g ON g.risk_id=r.id WHERE TRUE${scope}`,params)).rows[0];
  const top=(await pool.query(`SELECT r.risk_id,r.risk_title,COALESCE(NULLIF(BTRIM(r.division),''),r.directorate) AS division,
      COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score) AS governed_score,
      COALESCE(g.review_stage,r.workflow_status) AS stage
    FROM risks r LEFT JOIN risk_assessment_governance g ON g.risk_id=r.id WHERE TRUE${scope}
    ORDER BY COALESCE(g.chairman_score,g.champion_score,g.system_score,r.inherent_risk_score) DESC NULLS LAST,r.updated_at DESC LIMIT 5`,params)).rows;
  const recommendations=[];
  if(summary.high>0)recommendations.push(`Prioritise the ${summary.high} high-rated risk${summary.high===1?'':'s'} for treatment-owner and due-date verification.`);
  if(summary.overdue>0)recommendations.push(`Escalate evidence review for ${summary.overdue} overdue open risk${summary.overdue===1?'':'s'}.`);
  if(summary.awaiting_chairman>0&&user.role==='Risk Committee Chairman')recommendations.push(`Review the ${summary.awaiting_chairman} risk${summary.awaiting_chairman===1?'':'s'} awaiting Chairman decision, beginning with the highest governed score.`);
  if(summary.awaiting_champion>0&&user.role==='Risk Champion')recommendations.push(`Complete the ${summary.awaiting_champion} Champion assessment${summary.awaiting_champion===1?'':'s'} in your division.`);
  if(!recommendations.length)recommendations.push('No rule-based escalation is indicated by the current summary. Continue routine review and verify individual source records before deciding.');
  return {summary,top_risks:top,recommendations};
}

exports.query=async(req,res)=>{
  try{
    const question=String(req.body.question||'').trim();if(!question)return res.status(400).json({success:false,message:'Enter a question.'});
    const user=await identity(req.user);const key=pageKey(req.body.page);
    const wantsAnalysis=/analyse|analyze|recommend|priority|prioritise|prioritize|trend|highest|high risk|overdue|chair/.test(question.toLowerCase());
    let answer;let evidence=null;
    if(wantsAnalysis){
      evidence=await riskAnalysis(user);
      const top=evidence.top_risks.length?` Highest recorded items: ${evidence.top_risks.map(r=>`${r.risk_id} (${r.governed_score||'unscored'}, ${r.stage})`).join('; ')}.`:' No risks are currently recorded in your authorised scope.';
      answer=`In your authorised scope there are ${evidence.summary.total} risks, ${evidence.summary.high} high-rated and ${evidence.summary.overdue} overdue open risks.${top} Recommendation: ${evidence.recommendations.join(' ')} This is advisory analysis of current NCA GRC records; open the source risks and apply authorised human judgment before action.`;
    }else answer=manual.findManualAnswer(question,key);
    await logAudit({req,action:'ASSISTANT_QUERY',entityType:'AI Assistant',details:{page:key,manual_version:manual.MANUAL_VERSION,analysis:wantsAnalysis,question_length:question.length}});
    res.json({success:true,answer,manual_version:manual.MANUAL_VERSION,page_context:manual.pages[key],evidence});
  }catch(error){console.error(error);res.status(500).json({success:false,message:'The assistant could not complete this governed query.'})}
};
