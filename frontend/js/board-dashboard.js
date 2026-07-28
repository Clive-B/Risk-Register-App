(() => {
const app=window.NCAGRC,$=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>value?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):'Not recorded';
async function api(path){return app.apiRequest(path)}
function riskItem(risk,note=''){return `<a class="risk-item" href="risks.html?risk=${risk.id}"><strong>${esc(risk.risk_id)} · ${esc(risk.risk_title)}</strong><span>${esc(risk.division)} · Score ${risk.effective_score} (${esc(risk.risk_level)})${note?` · ${esc(note)}`:''}</span></a>`}
function actionItem(finding){return `<a class="risk-item" href="action-centre.html?module=Audit"><strong>${esc(finding.title)}</strong><span>${esc(finding.division||'Enterprise')} · ${esc(finding.priority)} · ${esc(finding.status)}${finding.due_at?` · Due ${fmt(finding.due_at)}`:''}</span></a>`}
function treatmentItem(plan){const overdue=plan.due_date&&new Date(plan.due_date)<new Date();return `<a class="risk-item" href="treatment.html?plan_id=${plan.id}"><strong>${esc(plan.risk_id)} · ${esc(plan.plan_title)}</strong><span>${esc(plan.division)} · Risk score ${plan.effective_score} · ${esc(plan.action_owner)} · ${overdue?'Overdue':'Due'} ${fmt(plan.due_date)} · ${plan.progress_percent}%</span></a>`}
function empty(message){return `<p class="board-empty">${esc(message)}</p>`}
function render(board,kpis){
    const cards=[['High Risks',kpis.high_risks],['Medium Risks',kpis.medium_risks],['Overdue Treatments',kpis.overdue_treatments],['Pending Approvals',kpis.pending_approvals],['Closed This Month',kpis.risks_closed_month]];
    $('boardKpis').innerHTML=cards.map(([label,value])=>`<article class="card kpi"><span>${label}</span><strong>${value}</strong></article>`).join('');
    $('topRisks').innerHTML=board.topRisks.map(risk=>`<tr><td><a href="risks.html?risk=${risk.id}"><strong>${esc(risk.risk_id)}</strong><br>${esc(risk.risk_title)}</a></td><td>${esc(risk.division)}</td><td>${esc(risk.risk_owner)}</td><td><span class="level ${risk.risk_level.toLowerCase()}">${esc(risk.risk_level)}</span></td><td><strong>${risk.effective_score}</strong><small>${esc(risk.assessment_source)}</small></td></tr>`).join('');
    $('topRisksEmpty').hidden=board.topRisks.length>0;
    const appetite=board.riskAppetite;
    $('appetite').dataset.label=appetite.total?`${appetite.high} of ${appetite.total} High`:'No risks recorded';
    $('appetiteLegend').innerHTML=`<span class="high">High <strong>${appetite.high}</strong></span><span class="medium">Medium <strong>${appetite.medium}</strong></span><span class="low">Low <strong>${appetite.low}</strong></span>`;
    $('summary').textContent=board.executiveSummary;
    $('emerging').innerHTML=board.emergingRisks.length?board.emergingRisks.map(risk=>riskItem(risk,`Added ${fmt(risk.created_at)}`)).join(''):empty('No risks have emerged during the last 90 days.');
    $('strategic').innerHTML=board.strategicRisks.length?board.strategicRisks.map(risk=>riskItem(risk)).join(''):empty('No open strategic risks are currently recorded.');
    $('complianceIssues').innerHTML=board.complianceIssues.length?board.complianceIssues.map(risk=>riskItem(risk)).join(''):empty('No open regulatory compliance risks are currently recorded.');
    $('auditFindings').innerHTML=board.auditFindings.length?board.auditFindings.map(actionItem).join(''):empty('No open audit findings are currently recorded in the Action Centre.');
    $('treatments').innerHTML=board.highPriorityTreatments.length?board.highPriorityTreatments.map(treatmentItem).join(''):empty('No overdue treatments or treatments linked to High risks are currently open.');
}
async function load(){
    $('boardLoading').hidden=false;$('boardContent').hidden=true;$('boardError').hidden=true;
    try{const [board,kpiData]=await Promise.all([api('/executive-analytics/board'),api('/executive-analytics/kpis')]);render(board,kpiData.kpis);$('boardContent').hidden=false}
    catch(error){$('boardErrorMessage').textContent=error.message||'Please retry or contact the System Administrator.';$('boardError').hidden=false}
    finally{$('boardLoading').hidden=true}
}
$('boardReport').onclick=()=>{window.location.href='reports.html'};
$('retryBoard').onclick=load;
load();
})();
