const app = window.NCAGRC;
const api = (path, options = {}) => app.apiRequest(path, options);
const element = id => document.getElementById(id);
const user = app.getUser();

let page = 1;
let notificationPage = 1;
let searchTimer = null;
let loadSequence = 0;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    }[character]));
}

function formatDate(value) {
    return value
        ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value))
        : 'No due date';
}

function buildQuery() {
    const params = new URLSearchParams({page,limit:12});
    [['search',element('search').value],['status',element('status').value],['priority',element('priority').value],['module',element('module').value]]
        .forEach(([key,value]) => value && params.set(key,value));
    return params;
}

function iconSvg(theme) {
    const paths = {
        blue:'<path d="M6 12.5 10 16l8-9"></path>',
        orange:'<circle cx="12" cy="12" r="8"></circle><path d="M12 7v5l3 2"></path>',
        red:'<path d="M12 4v10M12 18h.01"></path>',
        green:'<path d="M5 13l4 4L19 7"></path>'
    };
    return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[theme]}</svg>`;
}

function kpi(label,value,theme,subtext) {
    return `<article class="kpi ${theme}"><span class="kpi-icon">${iconSvg(theme)}</span><div><small>${label}</small><strong>${value}</strong><em>${subtext}</em></div></article>`;
}

function renderPriorityOverview(actions) {
    const totals = {High:0,Medium:0,Low:0};
    actions.forEach(action => {
        if (action.priority in totals) totals[action.priority] += 1;
    });
    const total = Object.values(totals).reduce((sum,value) => sum + value,0);
    const colors = {High:'#d92d20',Medium:'#f79009',Low:'#079455'};
    let cursor = 0;
    const stops = Object.entries(totals).map(([key,value]) => {
        const start = cursor;
        cursor += total ? value / total * 100 : 0;
        return `${colors[key]} ${start}% ${cursor}%`;
    }).join(',');
    element('priorityDonut').style.background = total ? `conic-gradient(${stops})` : '#d0d5dd';
    element('priorityTotal').textContent = total;
    element('priorityLegend').innerHTML = Object.entries(totals).map(([key,value]) => `
        <div><span style="--legend-color:${colors[key]}">${key}</span><strong>${value}</strong></div>
    `).join('');
}

function renderSummary(data,history) {
    const actions = data.actions || [];
    const completedThisWeek = (history || []).filter(action =>
        action.completed_at && Date.now() - new Date(action.completed_at).getTime() < 604800000
    ).length;
    const totals = actions.reduce((summary,action) => {
        summary[action.status] = (summary[action.status] || 0) + 1;
        return summary;
    },{});
    element('summary').innerHTML = [
        kpi('Pending actions',actions.length,'blue','Assigned work'),
        kpi('Due today',totals['Due Today'] || 0,'orange','Needs attention'),
        kpi('Overdue',totals.Overdue || 0,'red','Priority queue'),
        kpi('Completed this week',completedThisWeek,'green','Recently closed')
    ].join('');
    renderPriorityOverview(actions);
}

function actionCommands(action) {
    if (Array.isArray(action.available_actions)) return action.available_actions.map(value => String(value).toLowerCase());
    try {
        const parsed = JSON.parse(action.available_actions || '[]');
        return Array.isArray(parsed) ? parsed.map(value => String(value).toLowerCase()) : [];
    } catch (_) {
        return [];
    }
}

function renderActionControls(action) {
    const commands = actionCommands(action);
    return [
        action.action_url ? `<a href="../${escapeHtml(action.action_url)}" class="button">View details</a>` : '',
        commands.includes('complete') ? `<button data-complete="${action.id}" class="complete" type="button">Complete</button>` : '',
        commands.includes('dismiss') ? `<button data-cancel="${action.id}" type="button">Dismiss</button>` : ''
    ].join('');
}

function renderActions(data) {
    let actions = [...(data.actions || [])];
    if (element('sort').value === 'newest') actions.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    if (element('sort').value === 'due') actions.sort((a,b) => new Date(a.due_at || '2999') - new Date(b.due_at || '2999'));

    element('count').textContent = `${data.pagination.total} open`;
    element('actions').innerHTML = actions.length ? actions.map(action => `
        <article class="action-card ${String(action.priority).toLowerCase()} ${action.status === 'Overdue' ? 'overdue' : ''}" tabindex="0">
            <div class="action-top"><span class="priority">${escapeHtml(action.priority)}</span><span class="status">${escapeHtml(action.status)}</span></div>
            <h3>${escapeHtml(action.title)}</h3>
            <p>${escapeHtml(action.description || 'No additional details.')}</p>
            <dl>
                <div><dt>Assigned by</dt><dd>${escapeHtml(action.assigned_by_name || 'System')}</dd></div>
                <div><dt>Module</dt><dd>${escapeHtml(action.module)}</dd></div>
                <div><dt>Division</dt><dd>${escapeHtml(action.division || 'Enterprise')}</dd></div>
                <div><dt>Due date</dt><dd>${formatDate(action.due_at)}</dd></div>
            </dl>
            <div class="actions">
                ${renderActionControls(action)}
            </div>
        </article>
    `).join('') : '<div class="empty"><strong>No pending actions.</strong><p>You are up to date. New assignments will appear here automatically.</p><button id="emptyRefresh" class="secondary" type="button">Refresh</button></div>';

    element('pager').innerHTML = data.pagination.totalPages > 1
        ? `<button id="prev" ${page === 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${data.pagination.totalPages}</span><button id="next" ${page === data.pagination.totalPages ? 'disabled' : ''}>Next</button>`
        : '';
    element('emptyRefresh')?.addEventListener('click',() => load());
}

function renderActivity(data) {
    const rows = data?.activities || data?.activity || [];
    element('activity').innerHTML = rows.length ? rows.slice(0,6).map(activity => `
        <div class="activity-item"><div><strong>${escapeHtml(String(activity.action || activity.title || 'Activity').replaceAll('_',' '))}</strong><small>${escapeHtml(activity.user || activity.user_name || 'System')}</small></div><time>${formatDate(activity.timestamp || activity.created_at)}</time></div>
    `).join('') : '<p class="muted">No recent activity recorded.</p>';
}

function renderLoading() {
    element('actions').innerHTML = '<div class="loading-card" aria-busy="true"></div>'.repeat(3);
}

function renderError(message) {
    console.error('Action Centre load failed:',message);
    element('actions').innerHTML = `<div class="error-card"><strong>Unable to load your actions</strong><p>${escapeHtml(message || 'The request could not be completed. Your existing data remains safe.')}</p><button id="retry" type="button">Retry</button></div>`;
    element('retry').addEventListener('click',() => load());
}

async function load({silent=false} = {}) {
    const sequence = ++loadSequence;
    if (!silent) renderLoading();
    try {
        const [main,history,activity] = await Promise.all([
            api(`/actions/my?${buildQuery()}`),
            api('/actions/history?limit=100'),
            api('/activity')
        ]);
        if (sequence !== loadSequence) return;
        renderSummary(main,history.actions || []);
        renderActions(main);
        renderActivity(activity);
    } catch (error) {
        if (sequence === loadSequence && !silent) renderError(error.message);
    }
}

function renderQuickActions(role) {
    const options = {
        'System Administrator':[['Create User','users.html'],['Create Announcement','communication-centre.html'],['View Audit Logs','audit-logs.html'],['System Settings','system-settings.html']],
        'Risk Committee Chairman':[['Enterprise Dashboard','executive-analytics.html'],['Executive Reports','reports.html'],['Escalated Risks','risks.html']],
        'Risk Champion':[['Review Submitted Risks','pending-approvals.html'],['Approve Treatments','treatment.html']],
        'Risk Focal Person':[['Create Risk','create-risk.html'],['Update Treatment','treatment.html'],['Upload Evidence','risks.html']]
    };
    element('quickActions').innerHTML = (options[role] || []).map(([label,path]) => `<a href="${path}">${label}<span aria-hidden="true">→</span></a>`).join('');
}

function setUnreadCount(value) {
    const count = Math.max(0,Number(value) || 0);
    const badge = element('unreadCount');
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
    element('notificationBell').setAttribute('aria-label',count ? `Open notifications. ${count} unread.` : 'Open notifications. None unread.');
}

async function loadUnreadCount() {
    try {
        const data = await api('/notifications/unread-count');
        setUnreadCount(data.unreadCount);
    } catch (error) {
        console.warn('Unable to refresh notification count:',error.message);
    }
}

async function sendActionCommand(path) {
    const response = await app.authorizedFetch(path,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({comments:'Updated from Action Centre'})
    });
    const payload = await response.json().catch(() => ({success:false,message:'The action could not be updated.'}));
    if (!response.ok || payload.success !== true) {
        const error = new Error(payload.message || 'The action could not be updated.');
        error.code = payload.code;
        error.data = payload.data;
        throw error;
    }
    return payload;
}

function showTreatmentCompletionCheck(error) {
    const details = error.data || {};
    const treatment = details.treatment || {};
    element('treatmentCompletionMessage').textContent = error.message;
    element('treatmentCompletionProgress').textContent = `${Number(treatment.progressPercent) || 0}%`;
    element('treatmentCompletionStatus').textContent = treatment.status || 'Not recorded';
    element('treatmentCompletionDue').textContent = treatment.dueDate ? formatDate(treatment.dueDate) : 'Not recorded';
    const requirements = Array.isArray(details.requirements) ? details.requirements : ['Open the linked treatment plan and complete the outstanding work.'];
    element('treatmentCompletionRequirements').replaceChildren(...requirements.map(requirement => {
        const item = document.createElement('li');
        item.textContent = requirement;
        return item;
    }));
    const actionUrl = /^pages\/[A-Za-z0-9_./-]+$/.test(String(details.actionUrl || ''))
        ? details.actionUrl
        : 'pages/treatment.html';
    element('openTreatmentPlan').href = `../${actionUrl}`;
    element('treatmentCompletionDialog').showModal();
}

function notificationDestination(item) {
    const type = String(item.entity_type || item.category || '').toLowerCase();
    const id = encodeURIComponent(item.entity_id || '');
    if (type.includes('treatment')) return `treatment.html${id ? `?planId=${id}` : ''}`;
    if (type.includes('risk')) return `risks.html${id ? `?riskId=${id}` : ''}`;
    if (type.includes('workplan')) return `workplans.html${id ? `?workplanId=${id}` : ''}`;
    if (type.includes('approval')) return `my-approvals.html${id ? `?approvalId=${id}` : ''}`;
    if (type.includes('action')) return `action-centre.html${id ? `?actionId=${id}` : ''}`;
    return '';
}

function notificationTime(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}

function notificationItem(item,compact=false) {
    const destination = notificationDestination(item);
    const priority = String(item.priority || 'Normal');
    return `<article class="notification-item ${item.is_read ? '' : 'is-unread'} ${compact ? 'is-compact' : ''}">
        <button class="notification-open" type="button" data-notification-id="${escapeHtml(item.id)}" data-destination="${escapeHtml(destination)}">
            <span class="notification-item-top"><strong>${escapeHtml(item.title || 'Notification')}</strong><em>${escapeHtml(priority)}</em></span>
            <span class="notification-message">${escapeHtml(item.message || 'No additional details.')}</span>
            <small>${escapeHtml(notificationTime(item.created_at))}${destination ? ' · Open related record' : ''}</small>
        </button>
        ${item.is_read ? '' : `<button class="notification-mark-read" type="button" data-read-notification="${escapeHtml(item.id)}">Mark read</button>`}
    </article>`;
}

function renderRecentNotifications(notifications) {
    element('notificationList').innerHTML = notifications.length
        ? notifications.slice(0,5).map(item => notificationItem(item,true)).join('')
        : '<div class="notification-empty"><strong>You are up to date</strong><p>No operational notifications are waiting.</p></div>';
}

async function markNotificationRead(id) {
    await api(`/notifications/${encodeURIComponent(id)}/read`,{method:'PATCH'});
    await loadUnreadCount();
}

async function loadRecentNotifications() {
    const data = await api('/notifications?page=1&limit=5');
    setUnreadCount(data.unreadCount);
    renderRecentNotifications(data.notifications || []);
}

async function loadAllNotifications(requestedPage=1) {
    notificationPage = requestedPage;
    const unreadOnly = element('unreadNotificationsOnly').checked;
    const list = element('allNotificationsList');
    list.innerHTML = '<div class="notification-loading">Loading notifications…</div>';
    try {
        const data = await api(`/notifications?page=${notificationPage}&limit=20&unreadOnly=${unreadOnly}`);
        setUnreadCount(data.unreadCount);
        const notifications = data.notifications || [];
        list.innerHTML = notifications.length
            ? notifications.map(item => notificationItem(item)).join('')
            : '<div class="notification-empty"><strong>No matching notifications</strong><p>There are no notifications in this view.</p></div>';
        const pagination = data.pagination || {};
        element('notificationPager').innerHTML = pagination.totalPages > 1
            ? `<button type="button" data-notification-page="${notificationPage - 1}" ${notificationPage <= 1 ? 'disabled' : ''}>Previous</button>
               <span>Page ${notificationPage} of ${pagination.totalPages}</span>
               <button type="button" data-notification-page="${notificationPage + 1}" ${notificationPage >= pagination.totalPages ? 'disabled' : ''}>Next</button>`
            : `<span>${pagination.totalCount || 0} notification${pagination.totalCount === 1 ? '' : 's'}</span>`;
    } catch (error) {
        list.innerHTML = `<div class="notification-empty is-error"><strong>Unable to load notifications</strong><p>${escapeHtml(error.message)}</p></div>`;
    }
}

async function markAllNotificationsRead() {
    await api('/notifications/read-all',{method:'PATCH'});
    setUnreadCount(0);
    await Promise.all([loadRecentNotifications(),loadAllNotifications(notificationPage)]);
}

async function toggleNotifications() {
    const panel = element('notificationPanel');
    panel.hidden = !panel.hidden;
    element('notificationBell').setAttribute('aria-expanded',String(!panel.hidden));
    if (panel.hidden) return;
    try {
        element('notificationList').innerHTML = '<div class="notification-loading">Loading notifications…</div>';
        await loadRecentNotifications();
    } catch (error) {
        element('notificationList').innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
}

function openAllNotifications() {
    element('notificationPanel').hidden = true;
    element('notificationBell').setAttribute('aria-expanded','false');
    element('allNotificationsDialog').showModal();
    loadAllNotifications(1);
}

async function handleNotificationClick(event) {
    const readButton = event.target.closest('[data-read-notification]');
    const openButton = event.target.closest('[data-notification-id]');
    const target = readButton || openButton;
    if (!target) return;
    target.disabled = true;
    try {
        const id = readButton?.dataset.readNotification || openButton.dataset.notificationId;
        await markNotificationRead(id);
        if (openButton?.dataset.destination) {
            window.location.href = openButton.dataset.destination;
            return;
        }
        await Promise.all([loadRecentNotifications(),loadAllNotifications(notificationPage)]);
    } catch (error) {
        console.error('Unable to update notification:',error.message);
        target.disabled = false;
    }
}

function initialize() {
    if (user) {
        const firstName = String(user.full_name || '').split(' ')[0] || 'there';
        element('welcomeTitle').textContent = `Good morning, ${firstName}`;
        app.renderUserProfile(element('userInfo'),user);
        renderQuickActions(user.role);
    }
    const updateClock = () => {
        const now = new Date();
        element('todayDate').textContent = new Intl.DateTimeFormat('en-GB',{dateStyle:'full'}).format(now);
        element('todayTime').textContent = new Intl.DateTimeFormat('en-GB',{timeStyle:'short'}).format(now);
    };
    updateClock();
    window.setInterval(updateClock,60000);

    const requestedModule = new URLSearchParams(window.location.search).get('module');
    if (requestedModule && [...element('module').options].some(option => option.value === requestedModule)) {
        element('module').value = requestedModule;
    }

    element('notificationBell').addEventListener('click',toggleNotifications);
    element('notificationList').addEventListener('click',handleNotificationClick);
    element('allNotificationsList').addEventListener('click',handleNotificationClick);
    element('markAllNotificationsRead').addEventListener('click',async event => {
        event.currentTarget.disabled = true;
        try { await markAllNotificationsRead(); } finally { event.currentTarget.disabled = false; }
    });
    element('dialogMarkAllRead').addEventListener('click',async event => {
        event.currentTarget.disabled = true;
        try { await markAllNotificationsRead(); } finally { event.currentTarget.disabled = false; }
    });
    element('viewAllNotifications').addEventListener('click',openAllNotifications);
    element('closeNotifications').addEventListener('click',() => element('allNotificationsDialog').close());
    element('allNotificationsDialog').addEventListener('click',event => {
        if (event.target === element('allNotificationsDialog')) element('allNotificationsDialog').close();
    });
    element('closeTreatmentCompletion').addEventListener('click',() => element('treatmentCompletionDialog').close());
    element('continueActionReview').addEventListener('click',() => element('treatmentCompletionDialog').close());
    element('treatmentCompletionDialog').addEventListener('click',event => {
        if (event.target === element('treatmentCompletionDialog')) element('treatmentCompletionDialog').close();
    });
    element('unreadNotificationsOnly').addEventListener('change',() => loadAllNotifications(1));
    element('notificationPager').addEventListener('click',event => {
        const button = event.target.closest('[data-notification-page]');
        if (button && !button.disabled) loadAllNotifications(Number(button.dataset.notificationPage));
    });
    element('search').addEventListener('input',() => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => { page=1; load(); },300);
    });
    ['status','priority','module'].forEach(id => element(id).addEventListener('change',() => { page=1; load(); }));
    element('sort').addEventListener('change',() => load());
    element('refresh').addEventListener('click',() => load());
    element('pager').addEventListener('click',event => {
        if (event.target.id === 'prev') { page -= 1; load(); }
        if (event.target.id === 'next') { page += 1; load(); }
    });
    element('actions').addEventListener('click',async event => {
        const button = event.target.closest('button[data-complete],button[data-cancel]');
        if (!button) return;
        button.disabled = true;
        try {
            const path = button.dataset.complete ? `/actions/${button.dataset.complete}/complete` : `/actions/${button.dataset.cancel}/dismiss`;
            await sendActionCommand(path);
            await load({silent:true});
        } catch (error) {
            if (['TREATMENT_INCOMPLETE','TREATMENT_UNAVAILABLE'].includes(error.code)) {
                showTreatmentCompletionCheck(error);
            } else {
                renderError(error.message);
            }
        } finally {
            button.disabled = false;
        }
    });

    load();
    loadUnreadCount();
    window.setInterval(() => {
        if (document.visibilityState === 'visible') {
            load({silent:true});
            loadUnreadCount();
        }
    },300000);
}

initialize();
