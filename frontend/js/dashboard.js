const API_URL=window.NCAGRC.API_URL,token=localStorage.getItem('token'),storedUser=JSON.parse(localStorage.getItem('user')||'null');if(!token)location.replace('index.html');
const $=id=>document.getElementById(id),escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const labels={total_risks:'Annual Register Risks',my_risks:'My Risks',draft_risks:'Draft Risks',submitted_risks:'Submitted Risks',accepted_risks:'Accepted Risks',returned_risks:'Returned Risks',high_risks:'High Risks',medium_risks:'Medium Risks',open_treatments:'Treatment Tasks',completed_treatments:'Completed Treatments',overdue_treatments:'Overdue Treatments',pending_approvals:'Pending Reviews',users:'Total Users',active_users:'Active Users',locked_accounts:'Locked Accounts',new_users:'New Users',failed_logins:'Failed Logins'};
const quickActions={'Risk Focal Person':[['Create Risk','pages/create-risk.html'],['Upload Evidence','pages/risks.html'],['View Treatments','pages/treatment.html']], 'Risk Champion':[['Create Risk','pages/create-risk.html'],['Pending Reviews','pages/pending-approvals.html'],['Division Reports','pages/reports.html'],['Division Heat Map','pages/assessment.html']], 'Risk Committee Chairman':[['Enterprise Dashboard','pages/executive-analytics.html'],['High Risks','pages/risks.html'],['Executive Reports','pages/reports.html']], 'System Administrator':[['Create User','pages/users.html'],['Audit Logs','pages/audit-logs.html'],['System Settings','pages/system-settings.html']]};
const activityLabels={
 'ACTION_CREATED':'Action assigned',
 'ACTION_COMPLETED':'Action completed',
 'ACTION_CANCELLED':'Action cancelled',
 'ACTION_RETURNED':'Action returned',
 'ACTION_UPDATED':'Action updated',
 'ANNOUNCEMENT_PUBLISHED':'Announcement published',
 'APPROVAL_APPROVE':'Approval completed',
 'APPROVAL_REJECT':'Approval rejected',
 'APPROVAL_RETURN':'Item returned for correction',
 'APPROVAL_ESCALATED':'Approval escalated',
 'AI_REPORT_GENERATED':'Governed report generated',
 'AI_REPORT_FINALISED':'Governed report finalised',
 'COMPLIANCE_ASSESSED':'Compliance obligation assessed',
 'COMPLIANCE_EVIDENCE_VERIFIED':'Compliance evidence verified',
 'RISK_CREATED':'Risk created',
 'RISK_SUBMITTED':'Risk submitted for review',
 'RISK_UPDATED':'Risk updated',
 'TREATMENT_PLAN_CREATED':'Treatment plan created',
 'TREATMENT_PLAN_UPDATED':'Treatment plan updated',
 'TREATMENT_PLAN_APPROVED':'Treatment plan approved',
 'WORKPLAN_UPLOADED':'Work plan uploaded',
 'WORKPLAN_SUBMITTED':'Work plan risks submitted',
 'WORKPLAN_BATCH_APPROVED':'Work plan risks approved',
 'WORKPLAN_CHAIRMAN_BATCH_APPROVED':'Work plan risks finally approved'
};
const api=(path,options={})=>window.NCAGRC.apiRequest(path,options);
function activityLabel(action){
 const key=String(action||'ACTIVITY').trim().toUpperCase();
 if(activityLabels[key])return activityLabels[key];
 return key.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
}
function activityModule(module){
 const value=String(module||'Governance').replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ');
 return value.replace(/\b\w/g,letter=>letter.toUpperCase());
}
function render(data){
 document.querySelector('.topbar h1').textContent=`${data.role} Dashboard`;document.querySelector('.topbar p').textContent=data.scope.division?`Live GRC overview · ${data.scope.division} Division`:'Enterprise platform and risk overview';
 window.NCAGRC.renderUserProfile($('userInfo'), data.profile);
 $('statisticsCards').classList.remove('loading-skeleton');$('statisticsCards').innerHTML=Object.entries(data.statistics).filter(([k])=>labels[k]).map(([k,v])=>`<div class="card"><h3>${k==='total_risks'&&data.role==='Risk Committee Chairman'?'Enterprise Risks':labels[k]}</h3><h2>${Number(v||0)}</h2></div>`).join('');
 const unread=data.notifications.filter(n=>!n.is_read);$('unreadCount').textContent=unread.length;$('notificationList').innerHTML=data.notifications.length?data.notifications.map(n=>`<button class="list-row ${n.is_read?'':'unread'}" data-notification="${n.id}"><strong>${escapeHtml(n.title)}</strong><small>${escapeHtml(n.message)}</small><time>${formatDate(n.created_at)}</time></button>`).join(''):'<p class="empty-state">No notifications.</p>';
 $('taskList').classList.remove('loading-skeleton');$('taskList').innerHTML=data.tasks.length?data.tasks.map(t=>`<div class="list-row"><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.detail||t.module)} · ${escapeHtml(t.status)}</small><time>${formatDate(t.due_date)}</time></div>`).join(''):'<p class="empty-state">No pending tasks.</p>';$('taskSummary').textContent=`${data.tasks.filter(t=>t.status==='Pending').length} pending · ${data.tasks.filter(t=>t.status==='Overdue').length} overdue`;
 $('recentActivities').innerHTML=data.activities.length?data.activities.slice(0,5).map(a=>`<div class="activity-item"><div class="activity-copy"><span>${escapeHtml(activityModule(a.module))}</span><strong>${escapeHtml(activityLabel(a.action))}</strong><small>${escapeHtml(a.user||'System')}${a.role?` · ${escapeHtml(a.role)}`:''}</small></div><time datetime="${escapeHtml(a.timestamp||'')}">${formatDate(a.timestamp)}</time></div>`).join(''):'<p class="empty-state">No recent governed activity.</p>';
 $('allActivityLink').href=data.role==='System Administrator'?'pages/audit-logs.html':'pages/action-history.html';
 $('announcementArea').innerHTML=data.announcements.map(a=>`<article class="announcement ${a.priority.toLowerCase()}"><strong>${escapeHtml(a.title)}</strong><p>${escapeHtml(a.message)}</p></article>`).join('');
 $('quickActions').innerHTML=(quickActions[data.role]||[]).map(([label,url])=>`<a href="${url}">${label}</a>`).join('');
 const dated=data.tasks.filter(t=>t.due_date).slice(0,8);$('calendarList').innerHTML=dated.length?dated.map(t=>`<div class="list-row"><strong>${escapeHtml(t.title)}</strong><time>${formatDate(t.due_date)}</time></div>`).join(''):'<p class="empty-state">No upcoming dates.</p>';
 $('messageCount').textContent=`${data.messages.filter(m=>!m.is_read).length} unread`;$('messageList').innerHTML=data.messages.length?data.messages.map(m=>`<div class="list-row"><strong>${escapeHtml(m.subject)}</strong><small>${escapeHtml(m.body)}</small><time>${formatDate(m.created_at)}</time></div>`).join(''):'<p class="empty-state">Inbox is empty.</p>';
 $('profileCard').innerHTML=Object.entries({Name:data.profile.full_name,Role:data.profile.role,Division:data.profile.division||data.profile.directorate||'Not assigned',Email:data.profile.email,Phone:data.profile.phone||'Not provided','Last Login':formatDate(data.profile.last_login),Status:data.profile.status}).map(([k,v])=>`<div><small>${k}</small><strong>${escapeHtml(v)}</strong></div>`).join('');
}
function formatDate(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.valueOf())?'—':new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:value.toString().includes('T')?'2-digit':undefined,minute:value.toString().includes('T')?'2-digit':undefined}).format(d)}
function renderFailure(message){const friendly=`<p class="empty-state">Unable to load live data. ${escapeHtml(message)}</p>`;$('statisticsCards').classList.remove('loading-skeleton');$('statisticsCards').innerHTML=friendly;['taskList','recentActivities','calendarList','messageList','profileCard','notificationList'].forEach(id=>{const element=$(id);if(element)element.innerHTML=friendly});$('quickActions').innerHTML='<p class="empty-state">Quick actions are temporarily unavailable.</p>'}
async function load(){try{render(await api('/dashboard'))}catch(e){console.error('Dashboard refresh failed:',e);renderFailure(e.message)}}
const notificationBell=$('notificationBell'),notificationDropdown=$('notificationDropdown'),notificationHeader=notificationDropdown.querySelector('.panel-header');
const notificationClose=document.createElement('button');
notificationClose.id='closeNotifications';
notificationClose.type='button';
notificationClose.className='notification-close';
notificationClose.setAttribute('aria-label','Close notifications');
notificationClose.innerHTML='&times;';
notificationHeader.appendChild(notificationClose);
notificationBell.setAttribute('aria-haspopup','true');
notificationBell.setAttribute('aria-expanded','false');
const notificationStyles=document.createElement('style');
notificationStyles.id='notificationCloseStyles';
notificationStyles.textContent='.notification-dropdown .panel-header{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:12px}.notification-dropdown .panel-header h2{margin:0}.notification-dropdown .notification-close{display:grid;place-items:center;width:36px;height:36px;padding:0;border:1px solid #d8e2ee;border-radius:50%;background:#fff;color:#003a70;font-size:25px;font-weight:500;line-height:1}.notification-dropdown .notification-close:hover{background:#eaf4fc;color:#003a70}.notification-dropdown .notification-close:focus-visible{outline:3px solid #ffc72c;outline-offset:2px}';
document.head.appendChild(notificationStyles);
function setNotificationsOpen(open,returnFocus=false){
 notificationDropdown.classList.toggle('open',open);
 notificationBell.setAttribute('aria-expanded',String(open));
 if(open)notificationClose.focus();
 else if(returnFocus)notificationBell.focus();
}
notificationBell.addEventListener('click',event=>{event.stopPropagation();setNotificationsOpen(!notificationDropdown.classList.contains('open'))});
notificationClose.addEventListener('click',()=>setNotificationsOpen(false,true));
document.addEventListener('click',event=>{if(notificationDropdown.classList.contains('open')&&!notificationDropdown.contains(event.target)&&event.target!==notificationBell)setNotificationsOpen(false)});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&notificationDropdown.classList.contains('open'))setNotificationsOpen(false,true)});
$('markAllRead').addEventListener('click',async()=>{await api('/notifications/read-all',{method:'PUT'});load()});$('notificationList').addEventListener('click',async e=>{const row=e.target.closest('[data-notification]');if(row){await api('/notifications/read',{method:'PUT',body:JSON.stringify({id:Number(row.dataset.notification)})});load()}});$('logoutBtn').addEventListener('click',()=>window.NCAGRC.logout('index.html'));load();setInterval(load,30000);
