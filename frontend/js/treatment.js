const API_URL = window.NCAGRC.API_URL;

const token = localStorage.getItem("token");
const currentUser = JSON.parse(localStorage.getItem("user"));

if (!token) {
    window.location.href = "../index.html";
}

if (window.NCAGRC_ACCESS_DENIED) {
    throw new Error("Access denied.");
}

const STRATEGIES = ["Terminate", "Treat", "Transfer", "Tolerate"];
const STATUSES = ["Not Started", "In Progress", "Completed", "Overdue"];

const state = {
    risks: [],
    treatmentPlans: [],
    editingPlanId: null,
    currentPage: 1,
    pageSize: 8,
    isLoading: false,
    decisionPlanId: null,
    decisionAction: null,
    requestedPlanId: Number(new URLSearchParams(window.location.search).get("plan_id")) || null,
    requestedPlanOpened: false,
    controlBaseline: null
};

const elements = {
    addTreatmentBtn: document.getElementById("addTreatmentBtn"),
    approveAllPlans: document.getElementById("approveAllPlans"),
    approveAllDialog: document.getElementById("approveAllDialog"),
    closeModal: document.getElementById("closeModal"),
    closeModalBtn: document.getElementById("closeModalBtn"),
    completedPlans: document.getElementById("completedPlans"),
    controlReassessmentSection: document.getElementById("controlReassessmentSection"),
    directorateFilter: document.getElementById("directorateFilter"),
    emptyState: document.getElementById("emptyState"),
    inProgressPlans: document.getElementById("inProgressPlans"),
    loadingState: document.getElementById("loadingState"),
    modal: document.getElementById("treatmentModal"),
    modalTitle: document.getElementById("modalTitle"),
    nextPage: document.getElementById("nextPage"),
    overduePlans: document.getElementById("overduePlans"),
    pageInfo: document.getElementById("pageInfo"),
    paginationSummary: document.getElementById("paginationSummary"),
    prevPage: document.getElementById("prevPage"),
    saveTreatment: document.getElementById("saveTreatment"),
    searchInput: document.getElementById("searchInput"),
    statusFilter: document.getElementById("statusFilter"),
    table: document.getElementById("treatmentTable"),
    toastContainer: document.getElementById("toastContainer"),
    treatmentViewBody: document.getElementById("treatmentViewBody"),
    treatmentViewDialog: document.getElementById("treatmentViewDialog"),
    treatmentViewRisk: document.getElementById("treatmentViewRisk"),
    treatmentViewTitle: document.getElementById("treatmentViewTitle"),
    totalPlans: document.getElementById("totalPlans"),
    userInfo: document.getElementById("userInfo")
};

const fields = {
    risk_id: document.getElementById("risk_id"),
    plan_title: document.getElementById("plan_title"),
    treatment_strategy: document.getElementById("treatment_strategy"),
    action_owner: document.getElementById("action_owner"),
    due_date: document.getElementById("due_date"),
    progress_percent: document.getElementById("progress_percent"),
    progress_value: document.getElementById("progress_value"),
    status: document.getElementById("status"),
    evidence_file_name: document.getElementById("evidence_file_name"),
    evidence_url: document.getElementById("evidence_url"),
    evidence_notes: document.getElementById("evidence_notes"),
    uploaded_plan: document.getElementById("uploaded_plan"),
    system_improvements: document.getElementById("system_improvements"),
    treatment_objective: document.getElementById("treatment_objective"),
    treatment_actions: document.getElementById("treatment_actions"),
    evidence_required: document.getElementById("evidence_required"),
    monitoring_frequency: document.getElementById("monitoring_frequency"),
    review_date: document.getElementById("review_date"),
    target_residual_likelihood: document.getElementById("target_residual_likelihood"),
    target_residual_impact: document.getElementById("target_residual_impact"),
    control_existing_controls: document.getElementById("control_existing_controls"),
    control_effectiveness: document.getElementById("control_effectiveness"),
    control_type: document.getElementById("control_type"),
    control_owner: document.getElementById("control_owner"),
    control_design_adequacy: document.getElementById("control_design_adequacy"),
    control_last_tested_date: document.getElementById("control_last_tested_date"),
    control_next_review_date: document.getElementById("control_next_review_date"),
    control_evidence: document.getElementById("control_evidence"),
    control_exceptions: document.getElementById("control_exceptions"),
    control_assessment_basis: document.getElementById("control_assessment_basis")
};

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);

    window.setTimeout(() => {
        toast.classList.add("hide");
        toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, 3200);
}

async function apiRequest(path, options = {}) {
    return window.NCAGRC.apiRequest(path, options);
}

function setLoggedInUser() {
    if (!currentUser) return;

    elements.userInfo.innerHTML = `
        <strong>${escapeHtml(currentUser.full_name)}</strong>
        <br>
        <small>${escapeHtml(currentUser.role)}</small>
    `;

    if (!["System Administrator","Risk Committee Chairman"].includes(currentUser.role)) {
        elements.directorateFilter.value = currentUser.directorate || "";
        elements.directorateFilter.disabled = true;
    } else {
        const requestedDirectorate = new URLSearchParams(window.location.search).get("directorate");
        if (requestedDirectorate) elements.directorateFilter.value = requestedDirectorate;
    }
    elements.addTreatmentBtn.hidden = !["System Administrator","Risk Champion"].includes(currentUser.role);
    elements.approveAllPlans.hidden = !["System Administrator","Risk Champion","Risk Committee Chairman"].includes(currentUser.role);
    if (currentUser.role === "Risk Committee Chairman") elements.approveAllPlans.textContent = "Committee Approve All";
}

function setLoading(isLoading) {
    state.isLoading = isLoading;
    elements.loadingState.style.display = isLoading ? "block" : "none";
    elements.saveTreatment.disabled = isLoading;
    elements.addTreatmentBtn.disabled = isLoading;
}

function buildTreatmentQuery() {
    const params = new URLSearchParams();
    const search = elements.searchInput.value.trim();
    const directorate = elements.directorateFilter.value;
    const status = elements.statusFilter.value;

    if (search) params.set("search", search);
    if (directorate) params.set("directorate", directorate);
    if (status) params.set("status", status);

    const query = params.toString();
    return query ? `?${query}` : "";
}

async function loadPageData() {
    try {
        setLoading(true);

        const [risksData, treatmentData] = await Promise.all([
            apiRequest("/risks"),
            apiRequest(`/treatments${buildTreatmentQuery()}`)
        ]);

        state.risks = risksData.risks || [];
        state.treatmentPlans = treatmentData.treatmentPlans || [];
        state.currentPage = 1;

        populateRiskOptions();
        updateStats();
        renderTreatmentPlans();
        if (state.requestedPlanId && !state.requestedPlanOpened
            && state.treatmentPlans.some(plan => Number(plan.id) === state.requestedPlanId)) {
            state.requestedPlanOpened = true;
            const plan = state.treatmentPlans.find(item => Number(item.id) === state.requestedPlanId);
            window.setTimeout(() => {
                if (isPlanEligibleForCurrentApproval(plan)) openTreatmentDecision(plan.id, "approve");
                else editTreatmentPlan(plan.id);
            }, 0);
        }
    } catch (error) {
        console.error(error);
        showToast(error.message || "Unable to load treatment data.", "error");
    } finally {
        setLoading(false);
        renderTreatmentPlans();
    }
}

function populateRiskOptions() {
    const selectedValue = fields.risk_id.value;

    fields.risk_id.innerHTML = '<option value="">Select Risk</option>';

    state.risks.forEach(risk => {
        const option = document.createElement("option");
        option.value = risk.id;
        option.textContent = `${risk.risk_id} - ${risk.risk_title}`;
        fields.risk_id.appendChild(option);
    });

    fields.risk_id.value = selectedValue;
    syncTreatmentStrategy();
}

function syncTreatmentStrategy(fallback = "") {
    const selectedRisk = state.risks.find(risk => Number(risk.id) === Number(fields.risk_id.value));
    if (!fields.treatment_strategy.value) fields.treatment_strategy.value = fallback || selectedRisk?.risk_treatment || "";
    fields.treatment_strategy.disabled = false;
    const visibilityHelp = document.getElementById("treatmentVisibilityHelp");
    if (visibilityHelp) {
        visibilityHelp.textContent = selectedRisk?.entry_source === "Manual - Risk Champion" && selectedRisk?.focal_visibility === false
            ? "Governance: hidden from the Risk Focal Person; always visible to the Risk Champion and Chairman."
            : "Governance: visible within the linked risk's permitted scope; the Chairman always has access.";
    }
}

function updateStats() {
    elements.totalPlans.textContent = state.treatmentPlans.length;
    elements.inProgressPlans.textContent = state.treatmentPlans.filter(plan => plan.status === "In Progress").length;
    elements.completedPlans.textContent = state.treatmentPlans.filter(plan => plan.status === "Completed").length;
    elements.overduePlans.textContent = state.treatmentPlans.filter(plan => plan.is_overdue || plan.status === "Overdue").length;
}

function getTotalPages() {
    return Math.max(Math.ceil(state.treatmentPlans.length / state.pageSize), 1);
}

function getPaginatedPlans() {
    const start = (state.currentPage - 1) * state.pageSize;
    return state.treatmentPlans.slice(start, start + state.pageSize);
}

function renderTreatmentPlans() {
    const totalPages = getTotalPages();

    if (state.currentPage > totalPages) {
        state.currentPage = totalPages;
    }

    elements.table.innerHTML = "";

    getPaginatedPlans().forEach(plan => {
        const row = document.createElement("tr");
        const statusClass = getStatusClass(plan.status, plan.is_overdue);
        const evidenceLabel = plan.evidence_file_name || plan.evidence_url ? "Attached" : "Pending";
        const evidenceHref = /^https?:\/\//i.test(String(plan.evidence_url || "")) ? plan.evidence_url : "";

        row.innerHTML = `
            <td>
                <strong>${escapeHtml(plan.risk_code)}</strong>
                <br>
                <small>${escapeHtml(plan.risk_title)}</small>
            </td>
            <td>
                <strong>${escapeHtml(plan.plan_title)}</strong>
                <br>
                <small>${escapeHtml(plan.treatment_strategy)} · ${escapeHtml(plan.directorate)}</small>
            </td>
            <td><strong>${escapeHtml(plan.plan_origin || "Manual")}</strong><br><span class="lifecycle-badge">${escapeHtml(plan.lifecycle_status || "Active Monitoring")}</span><br><span class="approval-badge ${plan.approval_status === "Approved" ? "approved" : ""}">${escapeHtml(plan.approval_status || "Pending Approval")}</span></td>
            <td>${escapeHtml(plan.action_owner)}</td>
            <td>
                <strong>${formatDate(plan.due_date)}</strong>
                ${plan.is_overdue ? '<br><small class="overdue-text">Overdue</small>' : ''}
            </td>
            <td>
                <div class="progress-cell">
                    <div class="progress-bar ${getProgressClass(plan.progress_percent)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Number(plan.progress_percent || 0)}">
                        <span style="width:${Number(plan.progress_percent || 0)}%"></span>
                    </div>
                    <small>${escapeHtml(plan.progress_percent)}%</small>
                </div>
            </td>
            <td>
                <span class="status ${statusClass}">
                    ${escapeHtml(plan.is_overdue && plan.status !== "Completed" ? "Overdue" : plan.status)}
                </span>
            </td>
            <td>
                <span class="evidence-badge ${evidenceLabel === "Attached" ? "attached" : "pending"}">
                    ${evidenceLabel}
                </span>
                ${evidenceHref ? `<br><a class="evidence-link" href="${escapeHtml(evidenceHref)}" target="_blank" rel="noopener noreferrer">View evidence</a>` : ""}
            </td>
            <td>
                <div class="row-actions">
                    <button class="view-btn" type="button" data-action="view" data-id="${plan.id}">View</button>
                    ${["System Administrator","Risk Champion","Risk Focal Person","Risk Committee Chairman"].includes(currentUser.role)?`<button class="edit-btn" type="button" data-action="edit" data-id="${plan.id}">Edit</button>`:''}
                    ${canDecidePlan(plan)?`<button class="edit-btn" type="button" data-action="approve" data-id="${plan.id}">Approve</button><button class="delete-btn" type="button" data-action="return" data-id="${plan.id}">Return</button>`:''}
                    ${currentUser.role==="System Administrator"?`<button class="delete-btn" type="button" data-action="delete" data-id="${plan.id}">Delete</button>`:''}
                </div>
            </td>
        `;

        elements.table.appendChild(row);
    });

    renderPagination();
    const eligibleCount=state.treatmentPlans.filter(isPlanEligibleForCurrentApproval).length;
    elements.approveAllPlans.disabled=eligibleCount===0;
    elements.approveAllPlans.title=eligibleCount?`Approve ${eligibleCount} eligible plan(s) in the current scope`:"No plans are awaiting your approval in this scope";
    elements.emptyState.style.display = !state.isLoading && state.treatmentPlans.length === 0 ? "block" : "none";
}

function expectedApprovalStatus() {
    return ["Risk Committee Chairman","System Administrator"].includes(currentUser.role)
        ? "Pending Committee Approval"
        : "Pending Champion Approval";
}

function isPlanEligibleForCurrentApproval(plan) {
    return plan.approval_status === expectedApprovalStatus()
        && !["Completed","Deferred"].includes(plan.lifecycle_status)
        && Boolean(plan.treatment_actions)
        && Boolean(plan.action_owner)
        && Boolean(plan.due_date);
}

function canDecidePlan(plan) {
    return ["Risk Champion","Risk Committee Chairman","System Administrator"].includes(currentUser.role)
        && isPlanEligibleForCurrentApproval(plan);
}

function renderPagination() {
    const total = state.treatmentPlans.length;
    const totalPages = getTotalPages();
    const start = total === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
    const end = Math.min(state.currentPage * state.pageSize, total);

    elements.paginationSummary.textContent = total === 0
        ? "Showing 0 plans"
        : `Showing ${start}-${end} of ${total} plans`;
    elements.pageInfo.textContent = `Page ${state.currentPage} of ${totalPages}`;
    elements.prevPage.disabled = state.currentPage <= 1;
    elements.nextPage.disabled = state.currentPage >= totalPages;
}

function getStatusClass(status, isOverdue) {
    if (isOverdue && status !== "Completed") return "overdue";
    return String(status || "").toLowerCase().replaceAll(" ", "-");
}

function getProgressClass(value) {
    const progress = Number(value) || 0;
    if (progress >= 100) return "progress-complete";
    if (progress >= 75) return "progress-near-complete";
    if (progress >= 40) return "progress-active";
    if (progress > 0) return "progress-started";
    return "progress-not-started";
}

function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(new Date(value));
}

function normalizeDateInput(value) {
    if (!value) return "";
    return new Date(value).toISOString().slice(0, 10);
}

function viewValue(value) {
    return value === null || value === undefined || String(value).trim() === ""
        ? '<span class="not-recorded">Not recorded</span>'
        : escapeHtml(value);
}

function viewDate(value) {
    return value ? escapeHtml(formatDate(value)) : '<span class="not-recorded">Not recorded</span>';
}

function viewDateTime(value) {
    if (!value) return '<span class="not-recorded">Not recorded</span>';
    return escapeHtml(new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(value)));
}

function viewField(label, value, options = {}) {
    return `
        <div class="treatment-view-field${options.wide ? " wide" : ""}">
            <span>${escapeHtml(label)}</span>
            <div${options.multiline ? ' class="multiline"' : ""}>${value}</div>
        </div>
    `;
}

function approvalRecord(status, person, date, comments) {
    return `
        <div class="treatment-approval-record">
            <strong>${viewValue(status)}</strong>
            <span>${viewValue(person)}</span>
            <small>${viewDateTime(date)}</small>
            ${comments ? `<p>${escapeHtml(comments)}</p>` : ""}
        </div>
    `;
}

function openTreatmentView(id) {
    const plan = state.treatmentPlans.find(item => Number(item.id) === Number(id));
    if (!plan) {
        showToast("Treatment plan not found.", "error");
        return;
    }

    const progress = Math.max(0, Math.min(100, Number(plan.progress_percent) || 0));
    const targetScore = Number(plan.target_residual_score)
        || (Number(plan.target_residual_likelihood) * Number(plan.target_residual_impact))
        || null;
    elements.treatmentViewTitle.textContent = plan.plan_title || "Treatment plan";
    elements.treatmentViewRisk.textContent = `${plan.risk_code || "Risk"} · ${plan.risk_title || "Untitled risk"} · ${plan.division || plan.directorate || "Unassigned"}`;
    elements.treatmentViewBody.innerHTML = `
        <section class="treatment-view-summary" aria-label="Treatment summary">
            <div><span>Strategy</span><strong>${viewValue(plan.treatment_strategy)}</strong></div>
            <div><span>Status</span><strong>${viewValue(plan.is_overdue && plan.status !== "Completed" ? "Overdue" : plan.status)}</strong></div>
            <div><span>Progress</span><strong>${progress}%</strong></div>
            <div><span>Approval</span><strong>${viewValue(plan.approval_status)}</strong></div>
        </section>
        <section class="treatment-view-section">
            <h3>Plan and ownership</h3>
            <div class="treatment-view-grid">
                ${viewField("Treatment objective", viewValue(plan.treatment_objective), { wide: true, multiline: true })}
                ${viewField("Current treatment actions", viewValue(plan.treatment_actions), { wide: true, multiline: true })}
                ${viewField("Action owner", viewValue(plan.action_owner))}
                ${viewField("Division", viewValue(plan.division || plan.directorate))}
                ${viewField("Due date", viewDate(plan.due_date))}
                ${viewField("Next review date", viewDate(plan.review_date))}
                ${viewField("Monitoring frequency", viewValue(plan.monitoring_frequency))}
                ${viewField("Lifecycle", viewValue(plan.lifecycle_status))}
            </div>
        </section>
        <section class="treatment-view-section">
            <h3>Control assurance supporting this treatment</h3>
            ${plan.control_score_consistency_warning
                ? `<div class="control-consistency-warning"><strong>Assessment consistency check</strong><span>${escapeHtml(plan.control_score_consistency_warning)}</span></div>`
                : ""}
            <div class="treatment-view-grid">
                ${viewField("Existing controls", viewValue(plan.existing_controls), { wide: true, multiline: true })}
                ${viewField("Control effectiveness", viewValue(plan.control_effectiveness))}
                ${viewField("Reason for effectiveness rating", viewValue(plan.control_assessment_basis), { wide: true, multiline: true })}
                ${viewField("Control type", viewValue(plan.control_type))}
                ${viewField("Control owner", viewValue(plan.control_owner))}
                ${viewField("Design adequacy", viewValue(plan.control_design_adequacy))}
                ${viewField("Last tested date", viewDate(plan.control_last_tested_date))}
                ${viewField("Next control review", viewDate(plan.control_next_review_date))}
                ${viewField("Assessment confidence", viewValue(plan.control_assessment_confidence))}
                ${viewField("Last assessed by", viewValue(plan.control_assessed_by_name))}
                ${viewField("Last assessed at", viewDateTime(plan.control_assessed_at))}
                ${viewField("Control evidence", viewValue(plan.control_evidence), { wide: true, multiline: true })}
                ${viewField("Exceptions or gaps", viewValue(plan.control_exceptions), { wide: true, multiline: true })}
            </div>
        </section>
        <section class="treatment-view-section">
            <h3>Source and system guidance</h3>
            <div class="treatment-view-grid">
                ${viewField("Plan origin", viewValue(plan.plan_origin))}
                ${viewField("Source workbook", viewValue(plan.source_file_name))}
                ${viewField("Source Excel row", viewValue(plan.source_excel_row))}
                ${viewField("System-proposed strategy", viewValue(plan.system_proposed_strategy))}
                ${viewField("Original uploaded treatment", viewValue(plan.uploaded_plan), { wide: true, multiline: true })}
                ${viewField("System-suggested improvements", viewValue(plan.system_improvements), { wide: true, multiline: true })}
            </div>
        </section>
        <section class="treatment-view-section">
            <h3>Monitoring and evidence</h3>
            <div class="treatment-progress-view">
                <div><span style="width:${progress}%"></span></div><strong>${progress}% complete</strong>
            </div>
            <div class="treatment-view-grid">
                ${viewField("Target residual likelihood", viewValue(plan.target_residual_likelihood))}
                ${viewField("Target residual impact", viewValue(plan.target_residual_impact))}
                ${viewField("Target residual score", viewValue(targetScore))}
                ${viewField("Evidence file", viewValue(plan.evidence_file_name))}
                ${viewField("Evidence required", viewValue(plan.evidence_required), { wide: true, multiline: true })}
                ${viewField("Evidence reference", plan.evidence_url && /^https?:\/\//i.test(plan.evidence_url)
                    ? `<a href="${escapeHtml(plan.evidence_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(plan.evidence_url)}</a>`
                    : viewValue(plan.evidence_url), { wide: true })}
                ${viewField("Evidence notes", viewValue(plan.evidence_notes), { wide: true, multiline: true })}
            </div>
        </section>
        <section class="treatment-view-section">
            <h3>Governance decisions</h3>
            <div class="treatment-approval-grid">
                ${approvalRecord(
                    plan.focal_reviewed_at ? "Focal reviewed" : "Awaiting Focal review",
                    plan.focal_reviewed_by_name,
                    plan.focal_reviewed_at,
                    ""
                )}
                ${approvalRecord(
                    plan.champion_approved_at ? "Champion approved" : "Awaiting Champion approval",
                    plan.champion_approved_by_name,
                    plan.champion_approved_at,
                    plan.champion_approval_comments
                )}
                ${approvalRecord(
                    plan.approval_status === "Approved" ? "Committee approved" : plan.approval_status,
                    plan.committee_approved_by_name || plan.committee_returned_by_name,
                    plan.approved_at || plan.committee_returned_at,
                    plan.committee_return_comments || plan.approval_comments
                )}
            </div>
        </section>
    `;
    elements.treatmentViewDialog.showModal();
}

function closeTreatmentView() {
    if (elements.treatmentViewDialog.open) elements.treatmentViewDialog.close();
}

function syncProgress(value) {
    const progress = Math.max(0, Math.min(100, Number(value) || 0));
    fields.progress_percent.value = progress;
    fields.progress_value.value = progress;

    if (progress === 100) {
        fields.status.value = "Completed";
    } else if (progress > 0 && fields.status.value === "Not Started") {
        fields.status.value = "In Progress";
    }
}

function resetForm() {
    Object.values(fields).forEach(field => {
        if (field.tagName === "SELECT") {
            field.selectedIndex = 0;
        } else {
            field.value = "";
        }
    });

    fields.progress_percent.value = "0";
    fields.progress_value.value = "0";
    fields.status.value = "Not Started";
    fields.treatment_strategy.disabled = false;
    document.getElementById("proposalContext").hidden = true;
    document.getElementById("uploadedPlanGroup").hidden = true;
    document.getElementById("systemImprovementsGroup").hidden = true;
    elements.controlReassessmentSection.hidden = true;
    state.controlBaseline = null;
}

function openModal(plan = null) {
    resetForm();
    populateRiskOptions();
    state.editingPlanId = plan ? plan.id : null;

    if (plan) {
        fields.risk_id.value = plan.risk_id || "";
        fields.risk_id.disabled = true;
        fields.plan_title.value = plan.plan_title || "";
        syncTreatmentStrategy(plan.treatment_strategy || "");
        fields.action_owner.value = plan.action_owner || "";
        fields.due_date.value = normalizeDateInput(plan.due_date);
        syncProgress(plan.progress_percent || 0);
        fields.status.value = plan.status || "Not Started";
        fields.evidence_file_name.value = plan.evidence_file_name || "";
        fields.evidence_url.value = plan.evidence_url || "";
        fields.evidence_notes.value = plan.evidence_notes || "";
        fields.uploaded_plan.value = plan.uploaded_plan || "";
        fields.system_improvements.value = plan.system_improvements || "";
        fields.treatment_objective.value = plan.treatment_objective || "";
        fields.treatment_actions.value = plan.treatment_actions || "";
        fields.evidence_required.value = plan.evidence_required || "";
        fields.monitoring_frequency.value = plan.monitoring_frequency || "";
        fields.review_date.value = normalizeDateInput(plan.review_date);
        fields.target_residual_likelihood.value = plan.target_residual_likelihood || "";
        fields.target_residual_impact.value = plan.target_residual_impact || "";
        document.getElementById("proposalContext").hidden = false;
        document.getElementById("proposalOrigin").textContent = `Source: ${plan.plan_origin || "Manual"}`;
        document.getElementById("proposalLifecycle").textContent = plan.lifecycle_status || "Active Monitoring";
        document.getElementById("uploadedPlanGroup").hidden = !plan.uploaded_plan;
        document.getElementById("systemImprovementsGroup").hidden = !plan.system_improvements;
        const canReassessControls = ["Risk Champion","System Administrator"].includes(currentUser.role)
            && !["Completed","Deferred"].includes(plan.lifecycle_status);
        elements.controlReassessmentSection.hidden = !canReassessControls;
        if (canReassessControls) {
            fields.control_existing_controls.value = plan.existing_controls || "";
            fields.control_effectiveness.value = plan.control_effectiveness || "Not Assessed";
            fields.control_type.value = plan.control_type || "Not Assessed";
            fields.control_owner.value = plan.control_owner || "";
            fields.control_design_adequacy.value = plan.control_design_adequacy || "Not Assessed";
            fields.control_last_tested_date.value = normalizeDateInput(plan.control_last_tested_date);
            fields.control_next_review_date.value = normalizeDateInput(plan.control_next_review_date);
            fields.control_evidence.value = plan.control_evidence || "";
            fields.control_exceptions.value = plan.control_exceptions || "";
            fields.control_assessment_basis.value = plan.control_assessment_basis || "";
            state.controlBaseline = {
                control_effectiveness:fields.control_effectiveness.value,
                control_type:fields.control_type.value,
                control_owner:fields.control_owner.value.trim(),
                control_design_adequacy:fields.control_design_adequacy.value,
                control_last_tested_date:fields.control_last_tested_date.value,
                control_next_review_date:fields.control_next_review_date.value,
                control_evidence:fields.control_evidence.value.trim(),
                control_exceptions:fields.control_exceptions.value.trim(),
                control_assessment_basis:fields.control_assessment_basis.value.trim()
            };
        }
        elements.modalTitle.textContent = "Edit Treatment Plan";
        elements.saveTreatment.textContent = "Update Plan";
    } else {
        syncTreatmentStrategy();
        elements.modalTitle.textContent = "Add Treatment Plan";
        elements.saveTreatment.textContent = "Save Plan";
    }

    elements.modal.style.display = "flex";
    elements.modal.setAttribute("aria-hidden", "false");
    fields.risk_id.focus();
}

function closeModal() {
    elements.modal.style.display = "none";
    elements.modal.setAttribute("aria-hidden", "true");
    state.editingPlanId = null;
    fields.risk_id.disabled=false;
    resetForm();
}

function getFormPayload() {
    const payload = {
        risk_id: Number(fields.risk_id.value),
        plan_title: fields.plan_title.value.trim(),
        treatment_strategy: fields.treatment_strategy.value,
        action_owner: fields.action_owner.value.trim(),
        due_date: fields.due_date.value,
        progress_percent: Number(fields.progress_value.value),
        status: fields.status.value,
        evidence_file_name: fields.evidence_file_name.value.trim(),
        evidence_url: fields.evidence_url.value.trim(),
        evidence_notes: fields.evidence_notes.value.trim(),
        treatment_objective: fields.treatment_objective.value.trim(),
        treatment_actions: fields.treatment_actions.value.trim(),
        evidence_required: fields.evidence_required.value.trim(),
        monitoring_frequency: fields.monitoring_frequency.value,
        review_date: fields.review_date.value,
        target_residual_likelihood: Number(fields.target_residual_likelihood.value),
        target_residual_impact: Number(fields.target_residual_impact.value)
    };
    if (!elements.controlReassessmentSection.hidden) {
        const currentControl = {
            control_effectiveness:fields.control_effectiveness.value,
            control_type:fields.control_type.value,
            control_owner:fields.control_owner.value.trim(),
            control_design_adequacy:fields.control_design_adequacy.value,
            control_last_tested_date:fields.control_last_tested_date.value,
            control_next_review_date:fields.control_next_review_date.value,
            control_evidence:fields.control_evidence.value.trim(),
            control_exceptions:fields.control_exceptions.value.trim(),
            control_assessment_basis:fields.control_assessment_basis.value.trim()
        };
        if (JSON.stringify(currentControl) !== JSON.stringify(state.controlBaseline)) {
            Object.assign(payload,currentControl,{control_reassessment:true});
        }
    }
    return payload;
}

function validateForm(payload) {
    if (!Number.isInteger(payload.risk_id)) return "Select a valid risk.";
    if (!payload.plan_title) return "Treatment plan title is required.";
    if (!STRATEGIES.includes(payload.treatment_strategy)) return "Select a valid treatment strategy.";
    if (!payload.action_owner) return "Action owner is required.";
    if (!payload.treatment_actions) return "Treatment actions are required.";
    if (!payload.due_date) return "Due date is required.";
    if (!payload.monitoring_frequency) return "Monitoring frequency is required.";
    if (!payload.review_date) return "Next review date is required.";
    if (![payload.target_residual_likelihood,payload.target_residual_impact].every(value => Number.isInteger(value) && value >= 1 && value <= 5)) return "Select valid target residual values.";
    if (!Number.isInteger(payload.progress_percent) || payload.progress_percent < 0 || payload.progress_percent > 100) return "Progress must be between 0 and 100.";
    if (!STATUSES.includes(payload.status)) return "Select a valid status.";
    if (payload.control_reassessment) {
        if (!["Effective","Partially Effective","Ineffective","Not Assessed"].includes(payload.control_effectiveness)) return "Select a valid control effectiveness.";
        if (!["Preventive","Detective","Corrective","Mixed","Not Assessed"].includes(payload.control_type)) return "Select a valid control type.";
        if (!["Adequate","Partially Adequate","Inadequate","Not Assessed"].includes(payload.control_design_adequacy)) return "Select a valid control design adequacy.";
        if (!payload.control_assessment_basis) return "Record the reason for the control-effectiveness rating.";
        if (payload.control_effectiveness === "Effective"
            && (payload.control_design_adequacy !== "Adequate"
                || !payload.control_last_tested_date
                || !payload.control_evidence
                || payload.control_exceptions)) {
            return "An Effective rating requires adequate design, a test date, supporting evidence and no unresolved exceptions.";
        }
    }
    return "";
}

async function saveTreatmentPlan() {
    const payload = getFormPayload();
    const validationError = validateForm(payload);

    if (validationError) {
        showToast(validationError, "error");
        return;
    }

    const isEditing = Boolean(state.editingPlanId);
    const path = isEditing ? `/treatments/${state.editingPlanId}` : "/treatments";
    const method = isEditing ? "PUT" : "POST";

    try {
        setLoading(true);

        const data = await apiRequest(path, {
            method,
            body: JSON.stringify(payload)
        });

        showToast(data.message || "Treatment plan saved successfully.",data.controlWarning ? "warning" : "success");
        closeModal();
        await loadPageData();
    } catch (error) {
        console.error(error);
        showToast(error.message || "Unable to save treatment plan.", "error");
    } finally {
        setLoading(false);
    }
}

function editTreatmentPlan(id) {
    const plan = state.treatmentPlans.find(item => Number(item.id) === Number(id));

    if (!plan) {
        showToast("Treatment plan not found.", "error");
        return;
    }

    openModal(plan);
}

async function deleteTreatmentPlan(id) {
    const plan = state.treatmentPlans.find(item => Number(item.id) === Number(id));

    if (!plan) {
        showToast("Treatment plan not found.", "error");
        return;
    }

    const confirmed = window.confirm(`Delete treatment plan "${plan.plan_title}"?`);

    if (!confirmed) return;

    try {
        setLoading(true);

        const data = await apiRequest(`/treatments/${id}`, {
            method: "DELETE"
        });

        showToast(data.message || "Treatment plan deleted successfully.");
        await loadPageData();
    } catch (error) {
        console.error(error);
        showToast(error.message || "Unable to delete treatment plan.", "error");
    } finally {
        setLoading(false);
    }
}

function openApproveAllDialog() {
    const pending = state.treatmentPlans.filter(isPlanEligibleForCurrentApproval);
    if (!pending.length) {
        showToast("No eligible treatment plans are awaiting approval.", "error");
        return;
    }
    document.getElementById("approveAllCount").textContent = pending.length;
    const committeeDecision=currentUser.role==="Risk Committee Chairman"||currentUser.role==="System Administrator";
    document.getElementById("approveAllDescription").textContent = currentUser.role === "Risk Champion"
        ? `Approve all eligible treatment plans in ${currentUser.division || currentUser.directorate} and send them to the Committee.`
        : `Record final Committee approval for all eligible treatment plans${elements.directorateFilter.value ? ` in ${elements.directorateFilter.value}` : " across all divisions"}.`;
    document.querySelector("#approveAllDialog h2").textContent=committeeDecision?"Approve all treatments as the Committee’s final decision?":"Approve all eligible treatment plans?";
    document.querySelector("#approveAllDialog .nca-approval-eyebrow").textContent=committeeDecision?"Risk Committee final treatment decision":"NCA treatment governance decision";
    document.getElementById("confirmApproveAll").textContent=committeeDecision?"Confirm Final Approval":"Approve & Send to Committee";
    document.getElementById("approveAllComments").value = "";
    elements.approveAllDialog.showModal();
}

async function approveAllTreatmentPlans() {
    const button = document.getElementById("confirmApproveAll");
    button.disabled = true;
    try {
        const data = await apiRequest("/treatments/approve-all", {
            method: "POST",
            body: JSON.stringify({
                division: ["System Administrator","Risk Committee Chairman"].includes(currentUser.role) ? elements.directorateFilter.value : "",
                plan_ids: state.treatmentPlans.filter(isPlanEligibleForCurrentApproval).map(plan => plan.id),
                comments: document.getElementById("approveAllComments").value.trim()
            })
        });
        elements.approveAllDialog.close();
        showToast(data.message || "Treatment plans approved.");
        await loadPageData();
    } catch (error) {
        showToast(error.message || "Unable to approve treatment plans.", "error");
    } finally {
        button.disabled = false;
    }
}

function openTreatmentDecision(id,action){
    const plan=state.treatmentPlans.find(item=>Number(item.id)===Number(id));
    if(!plan||!canDecidePlan(plan))return showToast("This treatment plan is not awaiting your decision.","error");
    state.decisionPlanId=plan.id;
    state.decisionAction=action;
    document.getElementById("treatmentDecisionTitle").textContent=action==="approve"?"Approve this treatment plan?":"Return this treatment plan?";
    document.getElementById("treatmentDecisionDescription").textContent=`${plan.risk_code} · ${plan.plan_title} · ${plan.division||plan.directorate}`;
    document.getElementById("treatmentDecisionComments").value="";
    document.getElementById("treatmentDecisionCommentLabel").innerHTML=action==="return"?"Return reason <small>(required)</small>":"Committee comments <small>(optional)</small>";
    document.getElementById("confirmTreatmentDecision").textContent=action==="approve"?"Confirm Approval":"Return for Rework";
    document.getElementById("treatmentDecisionDialog").showModal();
}

async function confirmTreatmentDecision(){
    const comments=document.getElementById("treatmentDecisionComments").value.trim();
    if(state.decisionAction==="return"&&!comments)return showToast("Enter the reason for returning this treatment plan.","error");
    const button=document.getElementById("confirmTreatmentDecision");
    try{
        button.disabled=true;
        const data=await apiRequest(`/treatments/${state.decisionPlanId}/decision`,{
            method:"POST",body:JSON.stringify({action:state.decisionAction,comments})
        });
        document.getElementById("treatmentDecisionDialog").close();
        showToast(data.message||"Treatment decision recorded.");
        await loadPageData();
    }catch(error){showToast(error.message||"Unable to record the treatment decision.","error");}
    finally{button.disabled=false;}
}

function bindEvents() {
    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "../index.html";
    });

    elements.addTreatmentBtn.addEventListener("click", () => openModal());
    elements.approveAllPlans.addEventListener("click", openApproveAllDialog);
    document.getElementById("cancelApproveAll").addEventListener("click", () => elements.approveAllDialog.close());
    document.getElementById("confirmApproveAll").addEventListener("click", approveAllTreatmentPlans);
    document.getElementById("cancelTreatmentDecision").addEventListener("click",()=>document.getElementById("treatmentDecisionDialog").close());
    document.getElementById("confirmTreatmentDecision").addEventListener("click",confirmTreatmentDecision);
    document.getElementById("closeTreatmentViewIcon").addEventListener("click", closeTreatmentView);
    document.getElementById("closeTreatmentView").addEventListener("click", closeTreatmentView);
    elements.closeModal.addEventListener("click", closeModal);
    elements.closeModalBtn.addEventListener("click", closeModal);
    elements.saveTreatment.addEventListener("click", saveTreatmentPlan);

    fields.progress_percent.addEventListener("input", event => syncProgress(event.target.value));
    fields.progress_value.addEventListener("input", event => syncProgress(event.target.value));
    fields.risk_id.addEventListener("change", () => syncTreatmentStrategy());

    [
        elements.searchInput,
        elements.directorateFilter,
        elements.statusFilter
    ].forEach(field => {
        field.addEventListener("input", loadPageData);
        field.addEventListener("change", loadPageData);
    });

    elements.prevPage.addEventListener("click", () => {
        if (state.currentPage > 1) {
            state.currentPage -= 1;
            renderTreatmentPlans();
        }
    });

    elements.nextPage.addEventListener("click", () => {
        if (state.currentPage < getTotalPages()) {
            state.currentPage += 1;
            renderTreatmentPlans();
        }
    });

    elements.table.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");

        if (!button) return;

        if (button.dataset.action === "view") {
            openTreatmentView(button.dataset.id);
        }

        if (button.dataset.action === "edit") {
            editTreatmentPlan(button.dataset.id);
        }

        if (button.dataset.action === "delete") {
            deleteTreatmentPlan(button.dataset.id);
        }
        if (["approve","return"].includes(button.dataset.action)) {
            openTreatmentDecision(button.dataset.id,button.dataset.action);
        }
    });

    elements.modal.addEventListener("click", event => {
        if (event.target === elements.modal) {
            closeModal();
        }
    });
    elements.treatmentViewDialog.addEventListener("click", event => {
        if (event.target === elements.treatmentViewDialog) closeTreatmentView();
    });
}

setLoggedInUser();
bindEvents();
loadPageData();
