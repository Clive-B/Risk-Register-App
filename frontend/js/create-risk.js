const app = window.NCAGRC;
const currentUser = app.getUser();

if (window.NCAGRC_ACCESS_DENIED) {
    throw new Error("Access denied.");
}

const DIRECTORATES = [
    "RIPS",
    "Legal",
    "Regulatory Administration",
    "Consumer Affairs",
    "Corporate Affairs",
    "Finance",
    "Engineering",
    "Information Technology",
    "Procurement and Protocol",
    "Internal Audit",
    "Human Resource",
    "ROD",
    "Administration",
    "Cybersecurity",
    "International Affairs"
];

const CATEGORIES = [
    "Strategic",
    "Financial",
    "Operational",
    "Reputational",
    "Human Capital",
    "Regulatory Compliance",
    "Supervision"
];

const RESPONSES = ["Terminate", "Treat", "Transfer", "Tolerate"];
const CONTROL_EFFECTIVENESS = ["Not Assessed", "Effective", "Partially Effective", "Ineffective"];
const TREATMENT_STATUSES = ["Not Started", "In Progress", "Completed", "Deferred"];
const SCORE_LABELS = ["1", "2", "3", "4", "5"];
const LIKELIHOOD_LABELS = {"1":"Rare (Very Low)","2":"Unlikely (Low)","3":"Possible (Medium)","4":"Likely (High)","5":"Almost Certain (Very High)"};
const IMPACT_LABELS = {"1":"Insignificant (Very Low)","2":"Minor (Low)","3":"Moderate (Medium)","4":"Major (High)","5":"Catastrophic (Very High)"};

const params = new URLSearchParams(window.location.search);
const editingRiskId = params.get("id");
let loadedRisk = null;
const draftStorageKey = `nca-risk-form-draft:${currentUser.id}:${editingRiskId || "new"}`;
let draftSaveTimer = null;
let historyLoaded = false;
const riskBatch = [];

const elements = {
    pageTitle: document.getElementById("pageTitle"),
    userInfo: document.getElementById("userInfo"),
    toastContainer: document.getElementById("toastContainer"),
    workflowBadge: document.getElementById("workflowBadge"),
    riskRatingBadge: document.getElementById("riskRatingBadge"),
    residualBadge: document.getElementById("residualBadge"),
    monitoringSection: document.getElementById("monitoringSection"),
    closureSection: document.getElementById("closureSection"),
    attachmentList: document.getElementById("attachmentList"),
    saveDraftBtn: document.getElementById("saveDraftBtn"),
    submitBtn: document.getElementById("submitBtn"),
    saveMonitoringBtn: document.getElementById("saveMonitoringBtn"),
    closeRiskBtn: document.getElementById("closeRiskBtn"),
    cancelBtn: document.getElementById("cancelBtn"),
    historyTab: document.getElementById("historyTab"),
    riskHistorySection: document.getElementById("riskHistorySection"),
    riskHistoryContent: document.getElementById("riskHistoryContent")
};
elements.riskBatchSection = document.getElementById("riskBatchSection");
elements.riskBatchList = document.getElementById("riskBatchList");
elements.riskBatchCount = document.getElementById("riskBatchCount");
elements.addToBatchBtn = document.getElementById("addToBatchBtn");
elements.submitBatchBtn = document.getElementById("submitBatchBtn");
elements.riskResponseGuidance = document.getElementById("riskResponseGuidance");
elements.controlEffectivenessGuidance = document.getElementById("controlEffectivenessGuidance");

const fields = [
    "risk_id",
    "date_identified",
    "assessment_year",
    "focal_visibility",
    "risk_title",
    "risk_description",
    "directorate",
    "business_unit",
    "programme_project",
    "risk_category",
    "risk_owner",
    "impact",
    "likelihood",
    "inherent_risk_score",
    "risk_level",
    "existing_controls",
    "control_effectiveness",
    "risk_treatment",
    "initial_mitigation_plan",
    "responsible_officer",
    "target_completion_date",
    "current_impact",
    "current_likelihood",
    "current_risk_score",
    "treatment_status",
    "review_date",
    "residual_impact",
    "residual_likelihood",
    "residual_score",
    "progress_notes",
    "attachments",
    "closure_date",
    "closure_comments"
].reduce((map, id) => ({ ...map, [id]: document.getElementById(id) }), {});

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function setUserCard() {
    app.renderUserProfile(elements.userInfo, currentUser);
}

function fillSelect(select, options, placeholder = "Select") {
    select.innerHTML = `<option value="">${placeholder}</option>${options.map(option => `<option>${escapeHtml(option)}</option>`).join("")}`;
}

function fillScoreSelect(select, placeholder, labels) {
    select.innerHTML = `<option value="">${placeholder}</option>${SCORE_LABELS.map(value => `<option value="${value}">${value} - ${labels[value]}</option>`).join("")}`;
}

function setupOptions() {
    fillSelect(fields.directorate, DIRECTORATES, "Select Division");
    fillSelect(fields.risk_category, CATEGORIES, "Select Category");
    fillSelect(fields.control_effectiveness, CONTROL_EFFECTIVENESS, "Select Effectiveness");
    fillSelect(fields.risk_treatment, RESPONSES, "Select Response");
    fillSelect(fields.treatment_status, TREATMENT_STATUSES, "Select Treatment Status");

    [fields.impact,fields.current_impact,fields.residual_impact].forEach(select => fillScoreSelect(select, "Select impact", IMPACT_LABELS));
    [fields.likelihood,fields.current_likelihood,fields.residual_likelihood].forEach(select => fillScoreSelect(select, "Select likelihood", LIKELIHOOD_LABELS));
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
    return app.apiRequest(path, options);
}

function formatDate(value) {
    return value ? String(value).slice(0, 10) : "";
}

function formatDateTime(value) {
    if (!value) return "Date unavailable";
    return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(value));
}

function renderRiskHistory(data) {
    const events = [
        ...(data.history || []).map(item => ({
            at: item.changed_at,
            title: item.action || "Workflow Update",
            actor: item.changed_by_name || "System",
            description: item.comment || [item.from_status, item.to_status].filter(Boolean).join(" → ") || "Workflow activity recorded."
        })),
        ...(data.reviews || []).map(item => ({
            at: item.reviewed_at,
            title: `Review: ${item.decision}`,
            actor: item.reviewed_by_name || "System",
            description: item.review_comment || "Review decision recorded."
        })),
        ...(data.treatment_updates || []).map(item => ({
            at: item.created_at,
            title: `Monitoring Update: ${item.treatment_status}`,
            actor: item.updated_by_name || "System",
            description: item.progress_notes || [
                item.current_risk_score ? `Current score ${item.current_risk_score}` : "",
                item.residual_score ? `Residual score ${item.residual_score}` : ""
            ].filter(Boolean).join("; ") || "Monitoring values recorded."
        }))
    ].sort((a, b) => new Date(b.at) - new Date(a.at));

    elements.riskHistoryContent.innerHTML = events.length
        ? `<div class="history-list">${events.map(event => `
            <article class="history-entry">
                <time class="history-time" datetime="${escapeHtml(event.at)}">${escapeHtml(formatDateTime(event.at))}</time>
                <div>
                    <h3>${escapeHtml(event.title)}</h3>
                    <p>${escapeHtml(event.description)}</p>
                    <div class="history-actor">By ${escapeHtml(event.actor)}</div>
                </div>
            </article>
        `).join("")}</div>`
        : '<p class="history-empty">No history has been recorded for this risk.</p>';
}

async function openRiskHistory() {
    if (!editingRiskId) return;
    elements.riskHistorySection.classList.remove("hidden");
    elements.historyTab.classList.add("active");
    elements.riskHistorySection.scrollIntoView({behavior:"smooth", block:"start"});
    if (historyLoaded) return;

    elements.riskHistoryContent.innerHTML = '<p class="history-empty">Loading risk history...</p>';
    try {
        const data = await apiRequest(`/risks/${editingRiskId}/history`);
        renderRiskHistory(data);
        historyLoaded = true;
    } catch (error) {
        elements.riskHistoryContent.innerHTML = `<p class="history-empty">${escapeHtml(error.message || "Unable to load risk history.")}</p>`;
        showToast(error.message || "Unable to load risk history.", "error");
    }
}

function calculateLevel(score) {
    return app.riskMatrix.calculateLevel(score);
}

function setBadge(badge, label, level) {
    badge.className = `level-badge ${String(level).toLowerCase()}`;
    badge.textContent = label;
}

function updateInherentScore() {
    const score = (Number(fields.impact.value) || 0) * (Number(fields.likelihood.value) || 0);
    const level = calculateLevel(score || 1);
    fields.inherent_risk_score.value = score || 0;
    fields.risk_level.value = level;
    setBadge(elements.riskRatingBadge, level, level);
    recommendRiskResponse();
}

function determineControlEffectiveness() {
    const description = fields.risk_description.value.trim().toLowerCase();
    const controls = fields.existing_controls.value.trim().toLowerCase();
    const combined = `${description} ${controls}`;
    const ineffectiveSignals = ["no control", "no existing", "none in place", "absent", "not implemented", "ineffective", "failed control", "controls have failed"];
    const partialSignals = ["weak", "inconsistent", "gap", "partially", "outdated", "inadequate", "limited", "dormant", "not always", "not consistently"];
    let effectiveness;
    let reason;
    if (!controls) {
        effectiveness = "Not Assessed";
        reason = "No control description or operating evidence has been recorded.";
    } else if (ineffectiveSignals.some(signal => combined.includes(signal))) {
        effectiveness = "Ineffective";
        reason = "The description explicitly indicates missing, failed, or unimplemented controls.";
    } else if (partialSignals.some(signal => combined.includes(signal))) {
        effectiveness = "Partially Effective";
        reason = "The description identifies weaknesses, inconsistency, or control gaps.";
    } else {
        effectiveness = "Not Assessed";
        reason = "Controls are described, but effectiveness requires adequate design, evidence, and a dated test in the Consolidated Risk Register.";
    }
    fields.control_effectiveness.value = effectiveness;
    elements.controlEffectivenessGuidance.textContent = `System selected: ${effectiveness}. ${reason}`;
    elements.controlEffectivenessGuidance.classList.add("recommended");
}

function recommendRiskResponse() {
    const impact = Number(fields.impact.value) || 0;
    const likelihood = Number(fields.likelihood.value) || 0;
    if (!impact || !likelihood) {
        elements.riskResponseGuidance.textContent = "Select impact and likelihood to receive a recommended response.";
        elements.riskResponseGuidance.classList.remove("recommended");
        return;
    }
    const score = impact * likelihood;
    let response;
    let reason;
    const category = fields.risk_category.value;
    if (score === 25) {
        response = "Terminate";
        reason = "The maximum exposure should be avoided by stopping or redesigning the activity where practicable.";
    } else if (["Reputational", "Regulatory Compliance"].includes(category) || score >= 11) {
        response = "Treat";
        reason = "This exposure requires controls that reduce its likelihood, consequence, or both.";
    } else if (impact >= 4 && likelihood <= 2) {
        response = "Transfer";
        reason = "The lower-likelihood but high-consequence exposure may be shared through insurance, contract, or another party.";
    } else if (score >= 6) {
        response = "Treat";
        reason = "The exposure should be reduced through proportionate controls.";
    } else {
        response = "Tolerate";
        reason = "The low exposure may be retained with clear ownership and periodic monitoring.";
    }
    fields.risk_treatment.value = response;
    elements.riskResponseGuidance.textContent = `Recommended: ${response}. ${reason}`;
    elements.riskResponseGuidance.classList.add("recommended");
}

function collectDraft() {
    const values = {};
    Object.entries(fields).forEach(([key, field]) => {
        if (!field || field.type === "file" || ["risk_id", "inherent_risk_score", "risk_level", "current_risk_score", "residual_score"].includes(key)) return;
        values[key] = field.value;
    });
    return { savedAt: new Date().toISOString(), values };
}

function saveLocalDraft() {
    localStorage.setItem(draftStorageKey, JSON.stringify(collectDraft()));
}

function queueLocalDraftSave() {
    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = window.setTimeout(saveLocalDraft, 350);
}

function restoreLocalDraft() {
    if (editingRiskId) return false;
    try {
        const draft = JSON.parse(localStorage.getItem(draftStorageKey) || "null");
        if (!draft?.values) return false;
        if (!draft.savedAt || Date.now() - new Date(draft.savedAt).getTime() > 7 * 86400000) {
            clearLocalDraft();
            return false;
        }
        Object.entries(draft.values).forEach(([key, value]) => {
            const field = fields[key];
            if (field && field.type !== "file") field.value = value;
        });
        updateInherentScore();
        determineControlEffectiveness();
        updateMonitoringScores();
        showToast(`Your automatically saved form was restored from ${new Date(draft.savedAt).toLocaleString()}. Re-select any attachments before submitting.`);
        return true;
    } catch (_) { return false; }
}

function clearLocalDraft() {
    localStorage.removeItem(draftStorageKey);
}

function batchEnabled() {
    return !editingRiskId && ["Risk Focal Person", "Risk Champion"].includes(currentUser.role);
}

function renderRiskBatch() {
    const count = riskBatch.length;
    elements.riskBatchCount.textContent = `${count} risk${count === 1 ? "" : "s"}`;
    elements.submitBatchBtn.textContent = `Submit Batch (${count})`;
    elements.submitBatchBtn.disabled = count === 0;
    elements.riskBatchList.innerHTML = count
        ? riskBatch.map((item, index) => `<article class="risk-batch-item"><div><strong>${escapeHtml(item.payload.risk_title)}</strong><span>${escapeHtml(item.payload.risk_category)} · L${item.payload.likelihood} × I${item.payload.impact} · ${escapeHtml(item.payload.risk_treatment)}</span></div><button type="button" data-remove-batch="${index}" aria-label="Remove ${escapeHtml(item.payload.risk_title)} from batch">Remove</button></article>`).join("")
        : '<p class="history-empty">No risks have been added to this batch.</p>';
}

function resetForNextRisk() {
    document.getElementById("riskForm").reset();
    fields.attachments.value = "";
    renderAttachmentSelection();
    applyRoleDefaults();
    fields.impact.value = "";
    fields.likelihood.value = "";
    fields.risk_category.value = "";
    fields.control_effectiveness.value = "Not Assessed";
    fields.risk_treatment.value = "";
    updateInherentScore();
    determineControlEffectiveness();
    clearLocalDraft();
    window.scrollTo({top: 0, behavior: "smooth"});
}

function addCurrentRiskToBatch() {
    const payload = getRiskPayload("Submitted");
    const validationError = validateRiskPayload(payload);
    if (validationError) return showToast(validationError, "error");
    riskBatch.push({payload, files: Array.from(fields.attachments.files || [])});
    renderRiskBatch();
    resetForNextRisk();
    showToast("Risk added to the batch. Complete the next risk or submit the batch.");
}

async function submitRiskBatch() {
    if (!riskBatch.length) return;
    elements.submitBatchBtn.disabled = true;
    elements.addToBatchBtn.disabled = true;
    const submitted = [];
    try {
        while (riskBatch.length) {
            const item = riskBatch[0];
            const data = await apiRequest("/risks", {method: "POST", body: JSON.stringify(item.payload)});
            for (const file of item.files) {
                const dataUrl = await readFileAsDataUrl(file);
                await apiRequest(`/risks/${data.risk.id}/attachments`, {method: "POST", body: JSON.stringify({file_name:file.name,file_type:file.type,file_size:file.size,file_data:dataUrl})});
            }
            submitted.push(data.risk);
            riskBatch.shift();
            renderRiskBatch();
        }
        localStorage.setItem("ncaRiskDataVersion", String(Date.now()));
        showToast(`${submitted.length} risks submitted successfully.`);
        window.setTimeout(() => { window.location.href = "risks.html"; }, 700);
    } catch (error) {
        showToast(`${submitted.length} risks were submitted. ${error.message || "The remaining batch could not be submitted."}`, "error");
        renderRiskBatch();
    } finally {
        elements.addToBatchBtn.disabled = false;
        elements.submitBatchBtn.disabled = riskBatch.length === 0;
    }
}

function updateMonitoringScores() {
    const currentScore = (Number(fields.current_impact.value) || 0) * (Number(fields.current_likelihood.value) || 0);
    const residualScore = (Number(fields.residual_impact.value) || 0) * (Number(fields.residual_likelihood.value) || 0);
    const residualLevel = calculateLevel(residualScore || 1);
    fields.current_risk_score.value = currentScore || 0;
    fields.residual_score.value = residualScore || 0;
    setBadge(elements.residualBadge, `Residual ${residualScore || 0}`, residualLevel);
}

function applyRoleDefaults() {
    const today = new Date().toISOString().slice(0, 10);
    fields.date_identified.value = today;
    fields.closure_date.value = today;
    fields.review_date.value = today;
    fields.assessment_year.value = new Date().getFullYear();

    if (["Risk Focal Person","Risk Champion"].includes(currentUser.role)) {
        fields.directorate.value = currentUser.division || currentUser.directorate || "";
        fields.directorate.disabled = true;
        fields.risk_owner.value = currentUser.full_name || "";
        fields.risk_owner.disabled = true;
    }
    const championCreating = currentUser.role === "Risk Champion";
    document.getElementById("focalVisibilityGroup").classList.toggle("hidden", !championCreating);
    elements.submitBtn.textContent = championCreating ? "Add to Annual Register" : "Submit for Approval";
}

function setWorkflowBadge(status) {
    const workflowStatus = status || "Draft";
    elements.workflowBadge.className = `status ${workflowStatus.toLowerCase().replaceAll(" ", "-")}`;
    elements.workflowBadge.textContent = workflowStatus;
}

function applyLifecycleMode(risk) {
    const approved = ["Accepted","Treatment In Progress","Monitoring"].includes(risk?.workflow_status);
    const closed = risk?.workflow_status === "Closed" || risk?.status === "Closed";
    const mayClose = ["System Administrator", "Risk Champion", "Risk Committee Chairman"].includes(currentUser.role);

    elements.monitoringSection.classList.toggle("hidden", !approved && !closed);
    elements.closureSection.classList.toggle("hidden", !mayClose || (!(approved && risk?.treatment_status === "Completed") && !closed));
    elements.saveMonitoringBtn.classList.toggle("hidden", !approved);
    elements.closeRiskBtn.classList.toggle("hidden", !mayClose || !(approved && risk?.treatment_status === "Completed"));

    elements.saveDraftBtn.classList.toggle("hidden", approved || closed);
    elements.submitBtn.classList.toggle("hidden", approved || closed);

    if (currentUser.role === "Risk Focal Person" && (approved || closed)) {
        [
            "date_identified", "risk_title", "risk_description", "directorate",
            "business_unit", "programme_project", "risk_category", "risk_owner",
            "impact", "likelihood", "inherent_risk_score", "risk_level",
            "existing_controls", "control_effectiveness", "risk_treatment",
            "initial_mitigation_plan", "responsible_officer", "target_completion_date"
        ].forEach(key => {
            if (fields[key]) fields[key].disabled = true;
        });
    }

    if (closed) {
        document.querySelectorAll("input, select, textarea, button").forEach(control => {
            if (!["cancelBtn", "historyTab"].includes(control.id)) control.disabled = true;
        });
    }
}

function populateRisk(risk) {
    loadedRisk = risk;
    elements.pageTitle.textContent = "Edit Risk";
    elements.historyTab.disabled = false;
    setWorkflowBadge(risk.workflow_status);

    Object.keys(fields).forEach(key => {
        if (!fields[key] || fields[key].type === "file") return;
        if (risk[key] !== undefined && risk[key] !== null) {
            fields[key].value = key.includes("date") ? formatDate(risk[key]) : risk[key];
        }
    });

    fields.review_date.value = formatDate(risk.next_review_date) || fields.review_date.value;
    fields.residual_score.value = risk.residual_score || risk.residual_risk_score || 0;
    updateInherentScore();
    determineControlEffectiveness();
    updateMonitoringScores();
    applyLifecycleMode(risk);
    if (editingRiskId) {
        elements.pageTitle.textContent = "Risk Details (Read Only)";
        Object.values(fields).forEach(field => {
            if (field) field.disabled = true;
        });
        elements.saveDraftBtn.classList.add("hidden");
        elements.submitBtn.classList.add("hidden");
        elements.saveMonitoringBtn.classList.add("hidden");
        elements.closeRiskBtn.classList.add("hidden");
        elements.cancelBtn.textContent = "Back to Consolidated Register";
        elements.cancelBtn.title = "All risk amendments are made from the Consolidated Risk Register.";
    }
}

function getRiskPayload(workflowStatus) {
    return {
        risk_title: fields.risk_title.value.trim(),
        risk_description: fields.risk_description.value.trim(),
        directorate: fields.directorate.value,
        business_unit: fields.business_unit.value.trim(),
        programme_project: fields.programme_project.value.trim(),
        risk_category: fields.risk_category.value,
        risk_owner: fields.risk_owner.value.trim(),
        date_identified: fields.date_identified.value,
        impact: Number(fields.impact.value),
        likelihood: Number(fields.likelihood.value),
        existing_controls: fields.existing_controls.value.trim(),
        control_effectiveness: fields.control_effectiveness.value,
        risk_treatment: fields.risk_treatment.value,
        initial_mitigation_plan: fields.initial_mitigation_plan.value.trim(),
        responsible_officer: fields.responsible_officer.value.trim(),
        target_completion_date: fields.target_completion_date.value,
        assessment_year: Number(fields.assessment_year.value),
        focal_visibility: fields.focal_visibility.value === "true",
        workflow_status: workflowStatus
    };
}

function validateRiskPayload(payload) {
    if (!payload.risk_title) return "Risk title is required.";
    if (!payload.risk_description) return "Risk description is required.";
    if (!DIRECTORATES.includes(payload.directorate)) return "Select a valid division.";
    if (!CATEGORIES.includes(payload.risk_category)) return "Select a valid risk category.";
    if (!payload.risk_owner) return "Risk owner is required.";
    if (!payload.impact || !payload.likelihood) return "Impact and likelihood are required.";
    if (!payload.existing_controls) return "Existing controls are required.";
    if (!CONTROL_EFFECTIVENESS.includes(payload.control_effectiveness)) return "Select a valid control effectiveness.";
    if (!RESPONSES.includes(payload.risk_treatment)) return "Select a valid risk response.";
    if (!payload.initial_mitigation_plan) return "Initial mitigation plan is required.";
    if (!payload.responsible_officer) return "Responsible officer is required.";
    if (!payload.target_completion_date) return "Target completion date is required.";
    if (!Number.isInteger(payload.assessment_year) || payload.assessment_year < 2020 || payload.assessment_year > 2100) return "Enter a valid annual register year.";
    return "";
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

async function uploadAttachments(riskId) {
    const files = Array.from(fields.attachments.files || []);
    for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        await apiRequest(`/risks/${riskId}/attachments`, {
            method: "POST",
            body: JSON.stringify({
                file_name: file.name,
                file_type: file.type,
                file_size: file.size,
                file_data: dataUrl
            })
        });
    }
}

async function saveRisk(workflowStatus) {
    saveLocalDraft();
    const payload = getRiskPayload(workflowStatus);
    const validationError = validateRiskPayload(payload);
    if (validationError) {
        showToast(validationError, "error");
        return;
    }

    const method = editingRiskId ? "PUT" : "POST";
    const path = editingRiskId ? `/risks/${editingRiskId}` : "/risks";

    try {
        const data = await apiRequest(path, {
            method,
            body: JSON.stringify(payload)
        });
        await uploadAttachments(data.risk.id);
        clearLocalDraft();
        showToast(workflowStatus === "Submitted" ? (currentUser.role === "Risk Champion" ? "Risk added to the annual register." : "Risk submitted to the Risk Champion for approval.") : "Risk draft saved.");
        window.location.href = "risks.html";
    } catch (error) {
        console.error(error);
        showToast(error.message || "Unable to save risk.", "error");
    }
}

async function saveMonitoringUpdate() {
    const payload = {
        current_impact: Number(fields.current_impact.value) || null,
        current_likelihood: Number(fields.current_likelihood.value) || null,
        progress_notes: fields.progress_notes.value.trim(),
        treatment_status: fields.treatment_status.value,
        review_date: fields.review_date.value,
        residual_impact: Number(fields.residual_impact.value) || null,
        residual_likelihood: Number(fields.residual_likelihood.value) || null
    };

    if (!TREATMENT_STATUSES.includes(payload.treatment_status)) {
        showToast("Select a valid treatment status.", "error");
        return;
    }

    try {
        const data = await apiRequest(`/risks/${editingRiskId}/treatment-updates`, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        showToast("Monitoring update saved.");
        populateRisk(data.risk);
    } catch (error) {
        console.error(error);
        showToast(error.message || "Unable to save monitoring update.", "error");
    }
}

async function closeRisk() {
    if (!fields.closure_comments.value.trim()) {
        showToast("Closure comments are required.", "error");
        return;
    }

    try {
        await apiRequest(`/risks/${editingRiskId}/close`, {
            method: "PATCH",
            body: JSON.stringify({
                closure_date: fields.closure_date.value,
                closure_comments: fields.closure_comments.value.trim()
            })
        });
        localStorage.setItem("ncaRiskDataVersion", String(Date.now()));
        showToast("Risk closed successfully.");
        window.location.href = "risks.html";
    } catch (error) {
        console.error(error);
        showToast(error.message || "Unable to close risk.", "error");
    }
}

async function loadRisk() {
    if (!editingRiskId) {
        setWorkflowBadge("Draft");
        return;
    }

    const data = await apiRequest("/risks");
    const risk = (data.risks || []).find(item => Number(item.id) === Number(editingRiskId));
    if (!risk) {
        showToast("Risk not found or not accessible.", "error");
        return;
    }
    populateRisk(risk);
}

function renderAttachmentSelection() {
    const files = Array.from(fields.attachments.files || []);
    elements.attachmentList.innerHTML = files.length
        ? files.map(file => `<div>${escapeHtml(file.name)} <small>${Math.ceil(file.size / 1024)} KB</small></div>`).join("")
        : "No attachments selected.";
}

function bindEvents() {
    [fields.impact, fields.likelihood].forEach(field => field.addEventListener("change", updateInherentScore));
    [fields.current_impact, fields.current_likelihood, fields.residual_impact, fields.residual_likelihood].forEach(field => {
        field.addEventListener("change", updateMonitoringScores);
    });
    fields.attachments.addEventListener("change", renderAttachmentSelection);
    [fields.risk_description, fields.existing_controls].forEach(field => field.addEventListener("input", determineControlEffectiveness));
    document.getElementById("riskForm").addEventListener("input", queueLocalDraftSave);
    document.getElementById("riskForm").addEventListener("change", queueLocalDraftSave);
    fields.treatment_status.addEventListener("change", () => {
        if (loadedRisk) {
            loadedRisk.treatment_status = fields.treatment_status.value;
            applyLifecycleMode(loadedRisk);
        }
    });

    elements.saveDraftBtn.addEventListener("click", () => saveRisk("Draft"));
    elements.submitBtn.addEventListener("click", () => saveRisk("Submitted"));
    elements.addToBatchBtn.addEventListener("click", addCurrentRiskToBatch);
    elements.submitBatchBtn.addEventListener("click", submitRiskBatch);
    elements.riskBatchList.addEventListener("click", event => {
        const button = event.target.closest("[data-remove-batch]");
        if (!button) return;
        riskBatch.splice(Number(button.dataset.removeBatch), 1);
        renderRiskBatch();
    });
    elements.saveMonitoringBtn.addEventListener("click", saveMonitoringUpdate);
    elements.closeRiskBtn.addEventListener("click", closeRisk);
    elements.historyTab.addEventListener("click", openRiskHistory);
    elements.cancelBtn.addEventListener("click", () => {
        window.location.href = "risks.html";
    });
}

setUserCard();
setupOptions();
applyRoleDefaults();
elements.riskBatchSection.classList.toggle("hidden", !batchEnabled());
elements.addToBatchBtn.classList.toggle("hidden", !batchEnabled());
elements.submitBatchBtn.classList.toggle("hidden", !batchEnabled());
renderRiskBatch();
determineControlEffectiveness();
bindEvents();
document.getElementById('assessmentRules').addEventListener('click', () => document.getElementById('rulesDialog').showModal());
document.getElementById('closeRulesDialog').addEventListener('click', () => document.getElementById('rulesDialog').close());
restoreLocalDraft();
loadRisk().catch(error => {
    console.error(error);
    showToast(error.message || "Unable to load risk.", "error");
});
