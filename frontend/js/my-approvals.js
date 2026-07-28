const app = window.NCAGRC;
const $ = id => document.getElementById(id);
let currentPage = 1;
let totalPages = 1;
let pendingBulkAction = null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const date = value => value ? new Date(value).toLocaleString() : '—';

function toast(message) {
    $('toast').textContent = message;
    $('toast').style.display = 'block';
    setTimeout(() => { $('toast').style.display = 'none'; }, 3500);
}

async function api(path, options) {
    try {
        return await app.apiRequest(path, options);
    } catch (error) {
        toast(error.message);
        throw error;
    }
}

async function loadKpis() {
    const data = await api('/workflows/kpis');
    const labels = {
        pending_approvals: 'Pending Assignments',
        approved_today: 'Approved Today',
        rejected_today: 'Returned / Rejected Today',
        overdue_approvals: 'Overdue Assignments',
        average_approval_hours: 'Average Workflow Time (Hours)',
        completion_rate: 'Workflow Completion Rate %'
    };
    $('kpis').innerHTML = Object.entries(labels)
        .map(([key, label]) => `<article class="kpi"><span>${label}</span><strong>${esc(data.kpis[key])}</strong></article>`)
        .join('');
}

function selectionCell(item) {
    if (!item.bulk_supported) {
        return '<span title="Use the governed review workspace for this assignment">—</span>';
    }
    return `<input type="checkbox" data-id="${Number(item.id)}" aria-label="Select ${esc(item.item_title)}">`;
}

function dueCell(item) {
    if (!item.due_at) return '<span class="governed-label">Governed decision</span>';
    const overdue = Boolean(item.sla?.overdue);
    const detail = overdue ? 'Overdue' : item.sla?.hours == null ? '' : `${item.sla.hours}h remaining`;
    return `${date(item.due_at)}${detail ? `<br><small>${esc(detail)}</small>` : ''}`;
}

async function load() {
    const query = new URLSearchParams({
        page: currentPage,
        limit: 20,
        search: $('search').value,
        type: $('type').value
    });
    const data = await api(`/workflows/my-approvals?${query}`);
    totalPages = data.pagination.totalPages || 1;
    $('page').textContent = `Page ${currentPage} of ${totalPages}`;
    $('rows').innerHTML = data.approvals.length
        ? data.approvals.map(item => `<tr>
            <td>${selectionCell(item)}</td>
            <td>${esc(item.approval_type)}</td>
            <td>
                <strong>${esc(item.item_title)}</strong>
                ${Number(item.item_count) > 1 ? `<br><small>${esc(item.item_count)} records handled as one assignment</small>` : ''}
            </td>
            <td>${esc(item.submitted_by)}</td>
            <td>${esc(item.current_stage)}</td>
            <td><span class="badge">${esc(item.priority)}</span></td>
            <td>${date(item.submitted_at)}</td>
            <td class="${item.sla?.overdue ? 'overdue' : ''}">${dueCell(item)}</td>
            <td><span class="badge">${esc(item.status)}</span></td>
            <td><a class="review-link" href="${esc(item.action_url)}">${item.bulk_supported ? 'View / Action' : 'Open Review'}</a></td>
        </tr>`).join('')
        : '<tr><td colspan="10">You have no pending approval assignments.</td></tr>';
    $('selectAll').checked = false;
    updateBulkAvailability();
}

function selectedApprovalIds() {
    return [...document.querySelectorAll('[data-id]:checked')].map(element => Number(element.dataset.id));
}

function updateBulkAvailability() {
    const selectable = document.querySelectorAll('[data-id]').length;
    $('selectAll').disabled = !selectable;
    $('bulkApprove').disabled = !selectable;
    $('bulkReject').disabled = !selectable;
    $('legacyBulkNote').hidden = Boolean(selectable);
}

function closeBulkDialog() {
    pendingBulkAction = null;
    $('bulkApprovalDialog').close();
}

function openBulkDialog(action) {
    const ids = selectedApprovalIds();
    if (!ids.length) {
        toast('Select at least one standard workflow approval. Governed items are actioned in their review workspace.');
        return;
    }

    const rejecting = action === 'reject';
    pendingBulkAction = { action, ids };
    $('bulkApprovalDialog').classList.toggle('is-reject', rejecting);
    $('bulkApprovalIcon').textContent = rejecting ? '!' : '✓';
    $('bulkApprovalTitle').textContent = rejecting ? 'Reject selected items?' : 'Approve selected items?';
    $('bulkApprovalDescription').textContent = rejecting
        ? 'Confirm that these standard workflow items should be rejected.'
        : 'Confirm approval of these standard workflow items.';
    $('bulkApprovalCount').textContent = ids.length;
    $('bulkApprovalOutcome').textContent = rejecting ? 'Rejected' : 'Approved';
    $('bulkApprovalCommentLabel').innerHTML = rejecting
        ? 'Rejection reason <small>(required)</small>'
        : 'Approval comment <small>(optional)</small>';
    $('bulkApprovalComments').value = '';
    $('bulkApprovalComments').placeholder = rejecting
        ? 'Record the reason for rejecting these items.'
        : 'Optionally record the basis for this approval.';
    $('bulkApprovalError').hidden = true;
    $('bulkApprovalNote').textContent = 'Governed risk and treatment decisions cannot be bypassed from this dialog.';
    $('confirmBulkApproval').textContent = rejecting ? 'Confirm Rejection' : 'Confirm Approval';
    $('confirmBulkApproval').className = `confirm${rejecting ? ' reject' : ''}`;
    $('bulkApprovalDialog').showModal();
    $('bulkApprovalComments').focus();
}

async function confirmBulkAction() {
    if (!pendingBulkAction) return;
    const comments = $('bulkApprovalComments').value.trim();
    if (pendingBulkAction.action === 'reject' && !comments) {
        $('bulkApprovalError').textContent = 'A rejection reason is required.';
        $('bulkApprovalError').hidden = false;
        $('bulkApprovalComments').focus();
        return;
    }

    const button = $('confirmBulkApproval');
    button.disabled = true;
    try {
        const data = await api('/workflows/bulk-actions', {
            method: 'POST',
            body: JSON.stringify({
                ids: pendingBulkAction.ids,
                action: pendingBulkAction.action,
                comments
            })
        });
        const successful = data.results.filter(result => result.success).length;
        const failed = data.results.length - successful;
        closeBulkDialog();
        toast(failed
            ? `${successful} approvals processed; ${failed} could not be processed.`
            : `${successful} approvals processed.`);
        await Promise.all([load(), loadKpis()]);
    } finally {
        button.disabled = false;
    }
}

$('filter').onclick = () => { currentPage = 1; load(); };
$('prev').onclick = () => { if (currentPage > 1) { currentPage -= 1; load(); } };
$('next').onclick = () => { if (currentPage < totalPages) { currentPage += 1; load(); } };
$('selectAll').onchange = event => document.querySelectorAll('[data-id]').forEach(element => {
    element.checked = event.target.checked;
});
$('bulkApprove').onclick = () => openBulkDialog('approve');
$('bulkReject').onclick = () => openBulkDialog('reject');
$('cancelBulkApproval').onclick = closeBulkDialog;
$('confirmBulkApproval').onclick = confirmBulkAction;
$('bulkApprovalDialog').addEventListener('cancel', () => { pendingBulkAction = null; });

async function download(format, name) {
    const response = await app.authorizedFetch(`/workflows/reports?format=${format}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
}

$('csv').onclick = () => download('csv', 'approval-report.csv');
$('excel').onclick = () => download('xls', 'approval-report.xls');
load();
loadKpis();
