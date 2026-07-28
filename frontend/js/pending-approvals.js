const app = window.NCAGRC;
const currentUser = app.getUser();
const query = new URLSearchParams(window.location.search);

if (window.NCAGRC_ACCESS_DENIED) throw new Error('Access denied.');

const state = {
    risks: [],
    treatments: [],
    queue: query.get('queue') === 'treatments' ? 'treatments' : 'risks'
};

const elements = {
    userInfo: document.getElementById('userInfo'),
    toastContainer: document.getElementById('toastContainer'),
    loadingState: document.getElementById('loadingState'),
    emptyState: document.getElementById('emptyState'),
    riskTable: document.getElementById('approvalTable'),
    treatmentTable: document.getElementById('treatmentApprovalTable'),
    riskTableCard: document.getElementById('riskTableCard'),
    treatmentTableCard: document.getElementById('treatmentTableCard'),
    searchInput: document.getElementById('searchInput'),
    levelFilter: document.getElementById('levelFilter'),
    divisionFilter: document.getElementById('divisionFilter'),
    pendingCount: document.getElementById('pendingCount'),
    highCount: document.getElementById('highCount'),
    mediumCount: document.getElementById('mediumCount'),
    directorateCount: document.getElementById('directorateCount'),
    pendingLabel: document.getElementById('pendingLabel'),
    highLabel: document.getElementById('highLabel'),
    mediumLabel: document.getElementById('mediumLabel'),
    directorateLabel: document.getElementById('directorateLabel'),
    riskQueueTab: document.getElementById('riskQueueTab'),
    treatmentQueueTab: document.getElementById('treatmentQueueTab'),
    openBulkWorkspace: document.getElementById('openBulkWorkspace')
};

const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3400);
}

function formatDate(value) {
    return value ? new Intl.DateTimeFormat('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    }).format(new Date(value)) : '—';
}

function divisionOf(item) {
    return item.division || item.directorate || 'Unassigned';
}

function requestedDivision() {
    return elements.divisionFilter.value;
}

function filtered(items, isTreatment = false) {
    const search = elements.searchInput.value.trim().toLowerCase();
    const level = elements.levelFilter.value;
    const division = requestedDivision();
    return items.filter(item => {
        const values = isTreatment
            ? [item.risk_code, item.risk_title, item.plan_title, item.action_owner]
            : [item.risk_id, item.risk_title, item.risk_owner, item.risk_category];
        return (!search || values.some(value => String(value || '').toLowerCase().includes(search)))
            && (!level || item.risk_level === level)
            && (!division || divisionOf(item) === division);
    });
}

function currentItems() {
    return state.queue === 'risks' ? filtered(state.risks) : filtered(state.treatments, true);
}

function updateStats() {
    const items = currentItems();
    elements.pendingCount.textContent = items.length;
    elements.highCount.textContent = items.filter(item => item.risk_level === 'High').length;
    elements.mediumCount.textContent = items.filter(item =>
        state.queue === 'risks'
            ? item.risk_level === 'Medium'
            : item.due_date && new Date(item.due_date) < new Date() && Number(item.progress_percent) < 100
    ).length;
    elements.directorateCount.textContent = new Set(items.map(divisionOf)).size;
    elements.pendingLabel.textContent = state.queue === 'risks' ? 'Pending Risks' : 'Pending Plans';
    elements.highLabel.textContent = 'High-Risk Items';
    elements.mediumLabel.textContent = state.queue === 'risks' ? 'Medium Risks' : 'Overdue Plans';
    elements.directorateLabel.textContent = 'Divisions';
}

function renderRisks() {
    const risks = filtered(state.risks);
    elements.riskTable.innerHTML = risks.map(risk => `
        <tr>
            <td><strong>${escapeHtml(risk.risk_id)}</strong></td>
            <td><strong>${escapeHtml(risk.risk_title)}</strong><br><small>${escapeHtml(risk.risk_category)}</small></td>
            <td>${escapeHtml(divisionOf(risk))}</td>
            <td>${escapeHtml(risk.risk_owner)}</td>
            <td><span class="score-pill">${escapeHtml(risk.inherent_risk_score)}</span></td>
            <td><span class="level-badge ${String(risk.risk_level || '').toLowerCase()}">${escapeHtml(risk.risk_level)}</span></td>
            <td>${formatDate(risk.submitted_at || risk.updated_at)}</td>
            <td><a class="edit-btn workspace-link" href="risks.html?risk_id=${Number(risk.id)}">Open Assessment</a></td>
        </tr>`).join('');
    elements.emptyState.textContent = 'No risk assessments are pending in this scope.';
    elements.emptyState.style.display = risks.length ? 'none' : 'block';
}

function renderTreatments() {
    const plans = filtered(state.treatments, true);
    elements.treatmentTable.innerHTML = plans.map(plan => `
        <tr>
            <td><strong>${escapeHtml(plan.risk_code)}</strong><br><small>${escapeHtml(plan.risk_title)}</small></td>
            <td><strong>${escapeHtml(plan.plan_title)}</strong><br><small>${escapeHtml(plan.treatment_strategy)}</small></td>
            <td>${escapeHtml(divisionOf(plan))}</td>
            <td>${escapeHtml(plan.action_owner)}</td>
            <td>${formatDate(plan.due_date)}</td>
            <td><span class="badge">${escapeHtml(plan.approval_status)}</span></td>
            <td><a class="edit-btn workspace-link" href="treatment.html?plan_id=${Number(plan.id)}&directorate=${encodeURIComponent(divisionOf(plan))}">Open Treatment</a></td>
        </tr>`).join('');
    elements.emptyState.textContent = 'No treatment decisions are pending in this scope.';
    elements.emptyState.style.display = plans.length ? 'none' : 'block';
}

function updateBulkLink() {
    const division = requestedDivision();
    if (state.queue === 'risks') {
        elements.openBulkWorkspace.href = `risks.html?committee_scope=${division ? 'division' : 'all'}${division ? `&directorate=${encodeURIComponent(division)}` : ''}`;
        elements.openBulkWorkspace.textContent = division ? `Review ${division} Risk Bulk Decision` : 'Review All-Division Risk Decision';
    } else {
        elements.openBulkWorkspace.href = `treatment.html?${division ? `directorate=${encodeURIComponent(division)}` : 'committee_scope=all'}`;
        elements.openBulkWorkspace.textContent = division ? `Review ${division} Treatment Bulk Decision` : 'Review All-Division Treatment Decision';
    }
    elements.openBulkWorkspace.hidden = !['Risk Committee Chairman', 'System Administrator'].includes(currentUser.role)
        && !(state.queue === 'treatments' && currentUser.role === 'Risk Champion');
}

function render() {
    const risksActive = state.queue === 'risks';
    elements.riskQueueTab.classList.toggle('active', risksActive);
    elements.treatmentQueueTab.classList.toggle('active', !risksActive);
    elements.riskTableCard.hidden = !risksActive;
    elements.treatmentTableCard.hidden = risksActive;
    if (risksActive) renderRisks(); else renderTreatments();
    updateStats();
    updateBulkLink();
}

function populateDivisions() {
    const all = [...new Set([...state.risks, ...state.treatments].map(divisionOf))].sort();
    const requested = query.get('division') || query.get('directorate') || '';
    elements.divisionFilter.innerHTML = '<option value="">All divisions</option>'
        + all.map(division => `<option value="${escapeHtml(division)}">${escapeHtml(division)}</option>`).join('');
    if (currentUser.role === 'Risk Champion') {
        elements.divisionFilter.value = currentUser.division || currentUser.directorate || '';
        elements.divisionFilter.disabled = true;
    } else if (requested && all.includes(requested)) {
        elements.divisionFilter.value = requested;
    }
}

async function load() {
    try {
        elements.loadingState.style.display = 'block';
        const reviewStage = currentUser.role === 'Risk Committee Chairman'
            ? 'Awaiting Chairman Review'
            : currentUser.role === 'Risk Champion' ? 'Awaiting Champion Review' : '';
        const treatmentStatus = currentUser.role === 'Risk Committee Chairman'
            ? 'Pending Committee Approval'
            : 'Pending Champion Approval';
        const [riskData, treatmentData] = await Promise.all([
            reviewStage ? app.apiRequest(`/risks?review_stage=${encodeURIComponent(reviewStage)}`) : Promise.resolve({ risks: [] }),
            app.apiRequest('/treatments')
        ]);
        state.risks = riskData.risks || [];
        state.treatments = (treatmentData.treatmentPlans || []).filter(plan => plan.approval_status === treatmentStatus);
        populateDivisions();
        render();
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Unable to load the approval workspace.', 'error');
    } finally {
        elements.loadingState.style.display = 'none';
    }
}

function setQueue(queueName) {
    state.queue = queueName;
    const next = new URLSearchParams(window.location.search);
    next.set('queue', queueName);
    history.replaceState(null, '', `${location.pathname}?${next}`);
    render();
}

elements.userInfo.innerHTML = `<strong>${escapeHtml(currentUser.full_name)}</strong><br><small>${escapeHtml(currentUser.role)}</small>`;
elements.riskQueueTab.onclick = () => setQueue('risks');
elements.treatmentQueueTab.onclick = () => setQueue('treatments');
elements.searchInput.addEventListener('input', render);
elements.levelFilter.addEventListener('change', render);
elements.divisionFilter.addEventListener('change', render);
load();
