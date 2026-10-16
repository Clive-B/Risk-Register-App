(() => {
const app=window.NCAGRC,$=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>value?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):'Not recorded';
async function api(path){return app.apiRequest(path)}
const now=new Date(),currentYear=now.getFullYear(),currentQuarter=Math.floor(now.getMonth()/3)+1;
function setupPeriods(){
    $('dashboardYear').innerHTML=Array.from({length:6},(_,index)=>currentYear-index).map(year=>`<option value="${year}">${year}</option>`).join('');
    $('dashboardYear').value=String(currentYear);$('dashboardQuarter').value=String(currentQuarter);
}
function period(){
    const year=Number($('dashboardYear').value),quarter=$('dashboardQuarter').value;
    const startMonth=quarter==='all'?0:(Number(quarter)-1)*3;
    const endMonth=quarter==='all'?11:startMonth+2;
    const lastDay=new Date(year,endMonth+1,0).getDate();
    const pad=value=>String(value).padStart(2,'0');
    return {query:`dateFrom=${year}-${pad(startMonth+1)}-01&dateTo=${year}-${pad(endMonth+1)}-${pad(lastDay)}`,label:quarter==='all'?`Full Year ${year}`:`Quarter ${quarter}, ${year}`};
}
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
    const groups=board.categoryGroups||[];
    $('categoryGroups').innerHTML=groups.map(group=>`<tr><td><a href="executive-analytics.html?category=${encodeURIComponent(group.risk_category)}"><strong>${esc(group.risk_category)}</strong></a></td><td>${group.total}</td><td>${group.high}</td><td>${group.medium}</td><td>${group.low}</td><td>${group.closed}</td></tr>`).join('');
    $('categoryGroupsEmpty').hidden=groups.length>0;
}
async function load(){
    $('boardLoading').hidden=false;$('boardContent').hidden=true;$('boardError').hidden=true;
    try{const selected=period();$('quarterLabel').textContent=selected.label;$('categoryPeriodLabel').textContent=selected.label;const [board,kpiData]=await Promise.all([api(`/executive-analytics/board?${selected.query}`),api(`/executive-analytics/kpis?${selected.query}`)]);render(board,kpiData.kpis);$('boardContent').hidden=false}
    catch(error){$('boardErrorMessage').textContent=error.message||'Please retry or contact the System Administrator.';$('boardError').hidden=false}
    finally{$('boardLoading').hidden=true}
}
$('boardReport').onclick=()=>{window.location.href='reports.html'};
$('applyQuarter').onclick=load;
$('printQuarter').onclick=()=>window.print();
$('retryBoard').onclick=load;
setupPeriods();
load();
})();
