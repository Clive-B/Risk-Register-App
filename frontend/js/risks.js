const API_URL = window.NCAGRC.API_URL;

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

const TREATMENTS = ["Terminate", "Treat", "Transfer", "Tolerate"];
const STATUSES = ["Draft","Submitted","Under Review","Accepted","Returned","Treatment In Progress","Monitoring","Closed"];

const state = {
    risks: [],
    filteredRisks: [],
    editingRiskId: null,
    currentPage: 1,
    pageSize: 8,
    isLoading: false,
    sortKey: "updated_at",
    sortDirection: "desc",
    closingRiskId: null,
    approvalRiskId: null,
    approvalDecision: null,
    assessmentRiskId: null,
    importBatches: [],
    selectedImportBatchId: new URLSearchParams(window.location.search).get("import_batch_id") || "",
    requestedRiskId: Number(new URLSearchParams(window.location.search).get("risk_id")) || null,
    requestedRiskMode: new URLSearchParams(window.location.search).get("mode") || "assessment",
    requestedRiskOpened: false,
    committeeSummary: {eligibleCount:0,highCount:0,divisions:[]}
};
state.selectedWorkplanUploadId = "";

const importState = {
    file: null,
    fileData: null,
    preview: null,
    isProcessing: false
};

const token = localStorage.getItem("token");
const currentUser = JSON.parse(localStorage.getItem("user"));

if (!token) {
    window.location.href = "../index.html";
}

if (window.NCAGRC_ACCESS_DENIED) {
    throw new Error("Access denied.");
}

const elements = {
    importRiskBtn: document.getElementById("importRiskBtn"),
    moreFiltersBtn: document.getElementById("moreFiltersBtn"),
    clearFiltersBtn: document.getElementById("clearFiltersBtn"),
    activeFiltersCount: document.getElementById("activeFiltersCount"),
    savedFiltersBtn: document.getElementById("savedFiltersBtn"),
    importRiskModal: document.getElementById("importRiskModal"),
    closeImportModal: document.getElementById("closeImportModal"),
    cancelImportBtn: document.getElementById("cancelImportBtn"),
    chooseWorkbookBtn: document.getElementById("chooseWorkbookBtn"),
    riskWorkbookInput: document.getElementById("riskWorkbookInput"),
    importFileName: document.getElementById("importFileName"),
    importFileHelp: document.getElementById("importFileHelp"),
    importProgress: document.getElementById("importProgress"),
    importProgressLabel: document.getElementById("importProgressLabel"),
    importProgressValue: document.getElementById("importProgressValue"),
    importProgressBar: document.getElementById("importProgressBar"),
    importPreview: document.getElementById("importPreview"),
    previewTableWrap: document.getElementById("previewTableWrap"),
    correctionEducation: document.getElementById("correctionEducation"),
    correctionEducationTitle: document.getElementById("correctionEducationTitle"),
    correctionEducationSteps: document.getElementById("correctionEducationSteps"),
    correctionWorkspace: document.getElementById("correctionWorkspace"),
    confirmAllCorrections: document.getElementById("confirmAllCorrections"),
    importSheetMeta: document.getElementById("importSheetMeta"),
    importPreviewHead: document.getElementById("importPreviewHead"),
    importPreviewBody: document.getElementById("importPreviewBody"),
    importValidationErrors: document.getElementById("importValidationErrors"),
    importErrorList: document.getElementById("importErrorList"),
    previewTotal: document.getElementById("previewTotal"),
    previewValid: document.getElementById("previewValid"),
    previewFailed: document.getElementById("previewFailed"),
    importResult: document.getElementById("importResult"),
    confirmImportBtn: document.getElementById("confirmImportBtn"),
    closeModal: document.getElementById("closeModal"),
    closeModalBtn: document.getElementById("closeModalBtn"),
    mediumRisks: document.getElementById("mediumRisks"),
    directorateFilter: document.getElementById("directorateFilter"),
    emptyState: document.getElementById("emptyState"),
    highRisks: document.getElementById("highRisks"),
    levelFilter: document.getElementById("levelFilter"),
    loadingState: document.getElementById("loadingState"),
    modal: document.getElementById("riskModal"),
    modalTitle: document.getElementById("modalTitle"),
    nextPage: document.getElementById("nextPage"),
    openRisks: document.getElementById("openRisks"),
    pageInfo: document.getElementById("pageInfo"),
    paginationSummary: document.getElementById("paginationSummary"),
    prevPage: document.getElementById("prevPage"),
    saveRisk: document.getElementById("saveRisk"),
    searchInput: document.getElementById("searchInput"),
    statusFilter: document.getElementById("statusFilter"),
    submitRisk: document.getElementById("submitRisk"),
    table: document.getElementById("risksTable"),
    toastContainer: document.getElementById("toastContainer"),
    totalRisks: document.getElementById("totalRisks"),
    userInfo: document.getElementById("userInfo"),
    workflowFilter: document.getElementById("workflowFilter")
};
elements.closureModal = document.getElementById("closureModal");
elements.closureRiskSummary = document.getElementById("closureRiskSummary");
elements.closureDateInput = document.getElementById("closureDateInput");
elements.closureCommentsInput = document.getElementById("closureCommentsInput");
elements.dismissClosureModal = document.getElementById("dismissClosureModal");
elements.cancelClosureBtn = document.getElementById("cancelClosureBtn");
elements.confirmClosureBtn = document.getElementById("confirmClosureBtn");
elements.riskApprovalDialog = document.getElementById("riskApprovalDialog");
elements.riskApprovalTitle = document.getElementById("riskApprovalTitle");
elements.riskApprovalRisk = document.getElementById("riskApprovalRisk");
elements.riskApprovalRating = document.getElementById("riskApprovalRating");
elements.riskApprovalOutcome = document.getElementById("riskApprovalOutcome");
elements.riskApprovalComments = document.getElementById("riskApprovalComments");
elements.riskApprovalIcon = document.getElementById("riskApprovalIcon");
elements.confirmRiskApproval = document.getElementById("confirmRiskApproval");
elements.cancelRiskApproval = document.getElementById("cancelRiskApproval");
elements.lowRisks = document.getElementById("lowRisks");
elements.sourceFilter = document.getElementById("sourceFilter");
elements.reviewStageFilter = document.getElementById("reviewStageFilter");
elements.assessmentDecisionDialog = document.getElementById("assessmentDecisionDialog");
elements.assessmentDecisionTitle = document.getElementById("assessmentDecisionTitle");
elements.assessmentDecisionRisk = document.getElementById("assessmentDecisionRisk");
elements.assessmentBaselineCards = document.getElementById("assessmentBaselineCards");
elements.assessmentSelection = document.getElementById("assessmentSelection");
elements.assessmentAdjustedFields = document.getElementById("assessmentAdjustedFields");
elements.assessmentLikelihood = document.getElementById("assessmentLikelihood");
elements.assessmentImpact = document.getElementById("assessmentImpact");
elements.assessmentCategoryField = document.getElementById("assessmentCategoryField");
elements.assessmentCategory = document.getElementById("assessmentCategory");
elements.assessmentReason = document.getElementById("assessmentReason");
elements.assessmentReasonRequirement = document.getElementById("assessmentReasonRequirement");
elements.closeAssessmentDecision = document.getElementById("closeAssessmentDecision");
elements.cancelAssessmentDecision = document.getElementById("cancelAssessmentDecision");
elements.saveAssessmentDecision = document.getElementById("saveAssessmentDecision");
elements.importBatchBar = document.getElementById("importBatchBar");
elements.importBatchFilter = document.getElementById("importBatchFilter");
elements.importBatchTitle = document.getElementById("importBatchTitle");
elements.importBatchProgress = document.getElementById("importBatchProgress");
elements.approveImportBatch = document.getElementById("approveImportBatch");
elements.importBatchApprovalDialog = document.getElementById("importBatchApprovalDialog");
elements.importBatchApprovalDescription = document.getElementById("importBatchApprovalDescription");
elements.importBatchApprovalCount = document.getElementById("importBatchApprovalCount");
elements.importBatchReviewedCount = document.getElementById("importBatchReviewedCount");
elements.importBatchComments = document.getElementById("importBatchComments");
elements.cancelImportBatchApproval = document.getElementById("cancelImportBatchApproval");
elements.confirmImportBatchApproval = document.getElementById("confirmImportBatchApproval");
elements.committeeBulkBar = document.getElementById("committeeBulkBar");
elements.committeeBulkTitle = document.getElementById("committeeBulkTitle");
elements.committeeBulkProgress = document.getElementById("committeeBulkProgress");
elements.committeeApproveRisks = document.getElementById("committeeApproveRisks");
elements.committeeBulkApprovalDialog = document.getElementById("committeeBulkApprovalDialog");
elements.riskViewDialog = document.getElementById("riskViewDialog");
elements.riskViewTitle = document.getElementById("riskViewTitle");
elements.riskViewIdentity = document.getElementById("riskViewIdentity");
elements.riskViewDivision = document.getElementById("riskViewDivision");
elements.riskViewOwner = document.getElementById("riskViewOwner");
elements.riskViewCategory = document.getElementById("riskViewCategory");
elements.riskViewRating = document.getElementById("riskViewRating");
elements.riskViewWorkflow = document.getElementById("riskViewWorkflow");
elements.riskViewSource = document.getElementById("riskViewSource");
elements.riskViewDescription = document.getElementById("riskViewDescription");
elements.riskViewRiskSource = document.getElementById("riskViewRiskSource");
elements.riskViewRiskCause = document.getElementById("riskViewRiskCause");
elements.riskViewControls = document.getElementById("riskViewControls");
elements.riskViewControlEffectiveness = document.getElementById("riskViewControlEffectiveness");
elements.riskViewControlType = document.getElementById("riskViewControlType");
elements.riskViewControlOwner = document.getElementById("riskViewControlOwner");
elements.riskViewControlDesign = document.getElementById("riskViewControlDesign");
elements.riskViewControlTested = document.getElementById("riskViewControlTested");
elements.riskViewControlReview = document.getElementById("riskViewControlReview");
elements.riskViewControlEvidence = document.getElementById("riskViewControlEvidence");
elements.riskViewControlBasis = document.getElementById("riskViewControlBasis");
elements.closeRiskView = document.getElementById("closeRiskView");
elements.riskHistoryDialog = document.getElementById("riskHistoryDialog");
elements.riskHistoryTitle = document.getElementById("riskHistoryTitle");
elements.riskHistoryIdentity = document.getElementById("riskHistoryIdentity");
elements.riskHistoryList = document.getElementById("riskHistoryList");
elements.closeRiskHistory = document.getElementById("closeRiskHistory");
elements.dismissRiskHistory = document.getElementById("dismissRiskHistory");
elements.riskAttachmentsDialog = document.getElementById("riskAttachmentsDialog");
elements.riskAttachmentsTitle = document.getElementById("riskAttachmentsTitle");
elements.riskAttachmentsIdentity = document.getElementById("riskAttachmentsIdentity");
elements.riskAttachmentsList = document.getElementById("riskAttachmentsList");
elements.riskAttachmentUpload = document.getElementById("riskAttachmentUpload");
elements.riskAttachmentInput = document.getElementById("riskAttachmentInput");
elements.uploadRiskAttachment = document.getElementById("uploadRiskAttachment");
elements.closeRiskAttachments = document.getElementById("closeRiskAttachments");
elements.dismissRiskAttachments = document.getElementById("dismissRiskAttachments");
elements.workplanFocalBulkBar = document.getElementById("workplanFocalBulkBar");
elements.workplanFocalBulkTitle = document.getElementById("workplanFocalBulkTitle");
elements.workplanFocalBulkProgress = document.getElementById("workplanFocalBulkProgress");
elements.workplanFocalBulkFilter = document.getElementById("workplanFocalBulkFilter");
elements.openWorkplanFocalBulk = document.getElementById("openWorkplanFocalBulk");
elements.workplanFocalBulkDialog = document.getElementById("workplanFocalBulkDialog");
elements.workplanFocalBulkDescription = document.getElementById("workplanFocalBulkDescription");
elements.workplanFocalBulkCount = document.getElementById("workplanFocalBulkCount");
elements.workplanFocalBulkComments = document.getElementById("workplanFocalBulkComments");
elements.cancelWorkplanFocalBulk = document.getElementById("cancelWorkplanFocalBulk");
elements.confirmWorkplanFocalBulk = document.getElementById("confirmWorkplanFocalBulk");
elements.championBulkBar = document.getElementById("championBulkBar");
elements.championBulkTitle = document.getElementById("championBulkTitle");
elements.championBulkProgress = document.getElementById("championBulkProgress");
elements.openChampionBulk = document.getElementById("openChampionBulk");
elements.championBulkDialog = document.getElementById("championBulkDialog");
elements.championBulkDescription = document.getElementById("championBulkDescription");
elements.championBulkCount = document.getElementById("championBulkCount");
elements.championBulkSavedCount = document.getElementById("championBulkSavedCount");
elements.championBulkFocalCount = document.getElementById("championBulkFocalCount");
elements.championBulkSystemCount = document.getElementById("championBulkSystemCount");
elements.championBulkComments = document.getElementById("championBulkComments");
elements.cancelChampionBulk = document.getElementById("cancelChampionBulk");
elements.confirmChampionBulk = document.getElementById("confirmChampionBulk");
state.attachmentRiskId = null;

const fields = {
    risk_title: document.getElementById("risk_title"),
    risk_description: document.getElementById("risk_description"),
    risk_source: document.getElementById("risk_source"),
    risk_cause: document.getElementById("risk_cause"),
    risk_category: document.getElementById("risk_category"),
    directorate: document.getElementById("directorate"),
    business_unit: document.getElementById("business_unit"),
    programme_project: document.getElementById("programme_project"),
    source_action_point: document.getElementById("source_action_point"),
    risk_owner: document.getElementById("risk_owner"),
    date_identified: document.getElementById("date_identified"),
    assessment_year: document.getElementById("assessment_year"),
    risk_treatment: document.getElementById("risk_treatment"),
    likelihood: document.getElementById("likelihood"),
    impact: document.getElementById("impact"),
    inherent_risk_score: document.getElementById("inherent_risk_score"),
    risk_level: document.getElementById("risk_level"),
    residual_risk_score: document.getElementById("residual_risk_score"),
    status: document.getElementById("status"),
    existing_controls: document.getElementById("existing_controls"),
    control_effectiveness: document.getElementById("control_effectiveness"),
    control_type: document.getElementById("control_type"),
    control_owner: document.getElementById("control_owner"),
    control_design_adequacy: document.getElementById("control_design_adequacy"),
    control_evidence: document.getElementById("control_evidence"),
    control_last_tested_date: document.getElementById("control_last_tested_date"),
    control_exceptions: document.getElementById("control_exceptions"),
    control_next_review_date: document.getElementById("control_next_review_date"),
    control_assessment_basis: document.getElementById("control_assessment_basis"),
    initial_mitigation_plan: document.getElementById("initial_mitigation_plan"),
    responsible_officer: document.getElementById("responsible_officer"),
    target_completion_date: document.getElementById("target_completion_date")
};

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function setLoggedInUser() {
    if (!currentUser || !elements.userInfo) return;
    const normalizedRole = String(currentUser.role || "").trim().toLowerCase();

    elements.userInfo.innerHTML = `
        <strong>${escapeHtml(currentUser.full_name)}</strong>
        <br>
        <small>${escapeHtml(currentUser.role)}</small>
    `;

    if (!["System Administrator","Risk Committee Chairman"].includes(currentUser.role)) {
        fields.directorate.value = currentUser.directorate || "";
        fields.directorate.disabled = true;
        elements.directorateFilter.value = currentUser.directorate || "";
        elements.directorateFilter.disabled = true;
    } else {
        const requestedDirectorate = new URLSearchParams(window.location.search).get("directorate");
        if (requestedDirectorate && DIRECTORATES.includes(requestedDirectorate)) {
            elements.directorateFilter.value = requestedDirectorate;
        }
    }

    if (elements.importRiskBtn) elements.importRiskBtn.hidden = true;
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

function updateActiveFilterCount() {
    const activeFilters = [
        !elements.directorateFilter.disabled && elements.directorateFilter.value,
        elements.levelFilter.value,
        elements.statusFilter.value,
        elements.workflowFilter.value,
        elements.sourceFilter.value,
        elements.reviewStageFilter.value,
        state.selectedImportBatchId
    ].filter(Boolean).length;

    elements.activeFiltersCount.textContent = activeFilters;
}

function clearAllFilters() {
    elements.searchInput.value = "";
    if (!elements.directorateFilter.disabled) elements.directorateFilter.value = "";
    elements.levelFilter.value = "";
    elements.statusFilter.value = "";
    elements.workflowFilter.value = "";
    elements.sourceFilter.value = "";
    elements.reviewStageFilter.value = "";
    state.selectedImportBatchId = "";
    renderImportBatches();
    state.currentPage = 1;
    updateActiveFilterCount();
    loadRisks();
}

async function apiRequest(path, options = {}) {
    return window.NCAGRC.apiRequest(path, options);
}

function resetImportDialog() {
    importState.file = null;
    importState.fileData = null;
    importState.preview = null;
    importState.isProcessing = false;
    elements.riskWorkbookInput.value = "";
    elements.importFileName.textContent = "Choose the official NCA Excel template";
    elements.importFileHelp.textContent = "Accepted formats: .xlsx and .xls. Maximum file size: 8 MB.";
    elements.importProgress.hidden = true;
    elements.importPreview.hidden = true;
    elements.correctionEducation.hidden = true;
    elements.correctionWorkspace.hidden = true;
    elements.previewTableWrap.hidden = false;
    elements.importResult.hidden = true;
    elements.importResult.innerHTML = "";
    elements.confirmImportBtn.disabled = true;
    elements.confirmImportBtn.textContent = "Import Valid Records";
}

function openImportDialog() {
    resetImportDialog();
    elements.importRiskModal.style.display = "flex";
    elements.importRiskModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
}

function closeImportDialog() {
    if (importState.isProcessing) return;
    elements.importRiskModal.style.display = "none";
    elements.importRiskModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
}

function setImportProgress(isVisible, label = "Reading workbook...", percent = 0) {
    elements.importProgress.hidden = !isVisible;
    elements.importProgressLabel.textContent = label;
    elements.importProgressValue.textContent = `${percent}%`;
    elements.importProgressBar.style.width = `${percent}%`;
}

function readWorkbook(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("The selected workbook could not be read."));
        reader.readAsDataURL(file);
    });
}

function validateWorkbookFile(file) {
    if (!file || !/\.(xlsx|xls)$/i.test(file.name)) return "Only .xlsx and .xls files are allowed.";
    if (file.size > 8 * 1024 * 1024) return "The workbook must be smaller than 8 MB.";
    if (!file.size) return "The selected workbook is empty.";
    return "";
}

function getScoreLevel(score) {
    const value = Number(score);
    if (!Number.isFinite(value) || value < 1) return "";
    if (value >= 17) return "High";
    if (value >= 11) return "Medium";
    return "Low";
}

function getScoreFillClass(score) {
    const level = getScoreLevel(score);
    return level ? `risk-score-${level.toLowerCase()}` : "risk-score-unavailable";
}

function getPreviewScoreStage(header) {
    const normalized = String(header || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!normalized.includes("score") && !normalized.includes("rating")) return "";
    if (normalized.includes("current")) return "current";
    if (normalized.includes("post mitigation") || normalized.includes("residual")) return "residual";
    if (normalized.includes("pre mitigation") || normalized.includes("inherent") || normalized.includes("initial")) return "inherent";
    return normalized === "score" || normalized === "risk score" ? "inherent" : "";
}

function renderPreviewCell(row, header) {
    const scoreStage = getPreviewScoreStage(header);
    if (!scoreStage) return `<td>${escapeHtml(row.values[header])}</td>`;
    const detail = row.calculated_scores?.[scoreStage];
    if (!detail) {
        return `<td class="risk-score-cell risk-score-unavailable" title="A score requires both likelihood and impact.">—</td>`;
    }
    const title = `App-calculated: Likelihood ${detail.likelihood} × Impact ${detail.impact} = ${detail.score} (${detail.level})`;
    return `<td class="risk-score-cell ${getScoreFillClass(detail.score)}" title="${escapeHtml(title)}"><strong>${detail.score}</strong><span>${escapeHtml(detail.level)}</span></td>`;
}

const CORRECTION_LABELS = {
    risk_id:"Unique Risk ID",
    programme_project:"Program",
    risk_title:"Risk Name",
    risk_description:"Risk Description",
    risk_source:"Risk Source",
    risk_cause:"Risk Cause",
    risk_category:"Risk Category",
    date_identified:"Date Identified",
    risk_owner:"Risk Owner",
    likelihood:"Likelihood",
    impact:"Impact",
    current_likelihood:"Current Likelihood",
    current_impact:"Current Impact",
    residual_likelihood:"Post-Mitigation Likelihood",
    residual_impact:"Post-Mitigation Impact",
    risk_treatment:"Risk Response",
    existing_controls:"Existing Controls",
    control_type:"Control Type",
    control_owner:"Control Owner",
    control_design_adequacy:"Control Design Adequacy",
    control_evidence:"Control Evidence / Reference",
    control_last_tested_date:"Control Last Tested Date",
    control_exceptions:"Control Exceptions or Gaps",
    control_next_review_date:"Next Control Review Date",
    control_effectiveness:"Control Effectiveness",
    control_assessment_basis:"Control Assessment Basis",
    initial_mitigation_plan:"Mitigation Plan / Actions",
    responsible_officer:"Responsible Officer",
    target_completion_date:"Target Completion Date"
};

function validCorrectionDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value;
}

function serverCorrectionErrorStillApplies(error,row,rows) {
    const value = row.edited || {};
    const message = String(error || "");
    const editedId = String(value.risk_id || "").trim().toLowerCase();
    const proposedId = String(row.initial_proposed?.risk_id || "").trim().toLowerCase();
    const duplicateId = editedId && rows.filter(item => String(item.edited?.risk_id || "").trim().toLowerCase() === editedId).length > 1;
    const has = field => Boolean(String(value[field] ?? "").trim());
    const ratingFields = ["likelihood","impact","current_likelihood","current_impact","residual_likelihood","residual_impact"];
    const ratingsValid = ratingFields.every(field => Number.isInteger(Number(value[field])) && Number(value[field]) >= 1 && Number(value[field]) <= 5);
    if (/already exists/i.test(message)) return !editedId || editedId === proposedId;
    if (/(duplicated within the workbook|unique in this upload)/i.test(message)) return duplicateId;
    if (/risk id is required/i.test(message)) return !has("risk_id");
    if (/risk (?:title|name) is required/i.test(message)) return !has("risk_title");
    if (/risk description is required/i.test(message)) return !has("risk_description");
    if (/(program|programme).+required/i.test(message)) return !has("programme_project");
    if (/risk source is required/i.test(message)) return !has("risk_source");
    if (/risk cause is required/i.test(message)) return !has("risk_cause");
    if (/risk owner is required/i.test(message)) return !has("risk_owner");
    if (/existing controls.+required/i.test(message)) return !has("existing_controls");
    if (/mitigation plan.+required/i.test(message)) return !has("initial_mitigation_plan");
    if (/responsible officer.+required/i.test(message)) return !has("responsible_officer");
    if (/target completion date.+required/i.test(message)) return !has("target_completion_date");
    if (/risk category/i.test(message)) return !CATEGORIES.includes(value.risk_category);
    if (/risk (?:response|treatment)/i.test(message)) return !TREATMENTS.includes(value.risk_treatment);
    if (/control effectiveness/i.test(message)) return !["Effective","Partially Effective","Ineffective","Not Assessed"].includes(value.control_effectiveness);
    if (/control type/i.test(message)) return !["Preventive","Detective","Corrective","Mixed","Not Assessed"].includes(value.control_type);
    if (/control design adequacy/i.test(message)) return !["Adequate","Partially Adequate","Inadequate","Not Assessed"].includes(value.control_design_adequacy);
    if (/date identified/i.test(message)) return !validCorrectionDate(value.date_identified);
    if (/target completion date/i.test(message)) return !validCorrectionDate(value.target_completion_date);
    if (/control last tested date/i.test(message)) return Boolean(value.control_last_tested_date) && !validCorrectionDate(value.control_last_tested_date);
    if (/control next review date/i.test(message)) return Boolean(value.control_next_review_date) && !validCorrectionDate(value.control_next_review_date);
    if (/(likelihood|impact|risk score|residual score)/i.test(message)) return !ratingsValid;
    return true;
}

function correctionErrors(row, rows) {
    const value = row.edited || {};
    const errors = [];
    const editedRiskId = String(value.risk_id || "").trim().toLowerCase();
    (row.errors || []).forEach(error => {
        if (serverCorrectionErrorStillApplies(error,row,rows)) errors.push(error);
    });
    const required = [
        "risk_id","risk_title","risk_description","risk_category",
        "date_identified","risk_owner","risk_treatment","existing_controls",
        "initial_mitigation_plan","responsible_officer","target_completion_date"
    ];
    if (row.require_program) required.push("programme_project");
    if (row.require_legal_context) required.push("risk_source","risk_cause");
    required.forEach(field => {
        if (!String(value[field] ?? "").trim()) errors.push(`${CORRECTION_LABELS[field]} is required.`);
    });
    if (String(value.risk_id || "").length > 30) errors.push("Risk ID cannot exceed 30 characters.");
    if (editedRiskId && rows.filter(item => String(item.edited?.risk_id || "").trim().toLowerCase() === editedRiskId).length > 1) {
        errors.push("Risk ID must be unique in this upload.");
    }
    if (!CATEGORIES.includes(value.risk_category)) errors.push("Select an ERM-approved risk category.");
    if (!TREATMENTS.includes(value.risk_treatment)) errors.push("Select an ERM-approved risk response.");
    if (!["Effective","Partially Effective","Ineffective","Not Assessed"].includes(value.control_effectiveness)) errors.push("Select a governed control-effectiveness value.");
    if (!["Preventive","Detective","Corrective","Mixed","Not Assessed"].includes(value.control_type)) errors.push("Select a governed control type.");
    if (!["Adequate","Partially Adequate","Inadequate","Not Assessed"].includes(value.control_design_adequacy)) errors.push("Select a governed control design adequacy.");
    const ratingFields = [
        "likelihood","impact","current_likelihood","current_impact",
        "residual_likelihood","residual_impact"
    ];
    if (!ratingFields.every(field => Number.isInteger(Number(value[field])) && Number(value[field]) >= 1 && Number(value[field]) <= 5)) {
        errors.push("All Pre-, Current- and Post-Mitigation Likelihood and Impact values must be between 1 and 5.");
    }
    if (!validCorrectionDate(value.date_identified)) errors.push("Enter a valid Date Identified.");
    if (!validCorrectionDate(value.target_completion_date)) errors.push("Enter a valid Target Completion Date.");
    if (value.control_last_tested_date && !validCorrectionDate(value.control_last_tested_date)) errors.push("Enter a valid Control Last Tested Date.");
    if (value.control_next_review_date && !validCorrectionDate(value.control_next_review_date)) errors.push("Enter a valid Next Control Review Date.");
    return errors;
}

function correctionInput(row,index,field) {
    const value = row.edited?.[field] ?? "";
    const original = row.original?.[field];
    const originalText = original === null || original === undefined || String(original).trim() === ""
        ? "Blank in workbook"
        : `Original: ${escapeHtml(original)}`;
    const attributes = `data-correction-row="${index}" data-correction-field="${field}"`;
    let control;
    if (field === "risk_category") {
        control = `<select ${attributes}>${CATEGORIES.map(option => `<option${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
    } else if (field === "risk_treatment") {
        control = `<select ${attributes}><option value=""${TREATMENTS.includes(value) ? "" : " selected"}>Choose an ERM response</option>${TREATMENTS.map(option => `<option${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
    } else if (field === "control_effectiveness") {
        control = `<select ${attributes}>${["Effective","Partially Effective","Ineffective","Not Assessed"].map(option => `<option${option === value ? " selected" : ""}>${option}</option>`).join("")}</select>`;
    } else if (field === "control_type") {
        control = `<select ${attributes}>${["Preventive","Detective","Corrective","Mixed","Not Assessed"].map(option => `<option${option === value ? " selected" : ""}>${option}</option>`).join("")}</select>`;
    } else if (field === "control_design_adequacy") {
        control = `<select ${attributes}>${["Adequate","Partially Adequate","Inadequate","Not Assessed"].map(option => `<option${option === value ? " selected" : ""}>${option}</option>`).join("")}</select>`;
    } else if (["likelihood","impact","current_likelihood","current_impact","residual_likelihood","residual_impact"].includes(field)) {
        control = `<select ${attributes}>${[1,2,3,4,5].map(option => `<option value="${option}"${Number(option) === Number(value) ? " selected" : ""}>${option}</option>`).join("")}</select>`;
    } else if (["risk_description","risk_source","risk_cause","existing_controls","control_evidence","control_exceptions","control_assessment_basis","initial_mitigation_plan"].includes(field)) {
        control = `<textarea rows="${field === "risk_description" ? 4 : 3}" ${attributes}>${escapeHtml(value)}</textarea>`;
    } else {
        const type = ["date_identified","target_completion_date","control_last_tested_date","control_next_review_date"].includes(field) ? "date" : "text";
        control = `<input type="${type}" value="${escapeHtml(value)}" ${attributes}>`;
    }
    return `<label class="correction-field ${["risk_description","risk_source","risk_cause","existing_controls","control_evidence","control_exceptions","control_assessment_basis","initial_mitigation_plan"].includes(field) ? "wide" : ""}">
        <span>${CORRECTION_LABELS[field]}</span>${control}<small>${originalText}</small>
    </label>`;
}

function captureCorrectionView() {
    const active = document.activeElement;
    return {
        pageX:window.scrollX,pageY:window.scrollY,scrollTop:elements.correctionWorkspace.scrollTop,
        openRows:[...elements.correctionWorkspace.querySelectorAll('.correction-card details[open]')].map(details => details.closest('.correction-card')?.dataset.rowIndex),
        focusRow:active?.dataset?.correctionRow || '',focusField:active?.dataset?.correctionField || '',focusConfirm:active?.dataset?.correctionConfirm || '',
        selectionStart:typeof active?.selectionStart === 'number' ? active.selectionStart : null,
        selectionEnd:typeof active?.selectionEnd === 'number' ? active.selectionEnd : null
    };
}

function restoreCorrectionView(view) {
    if (!view) return;
    const restore = () => {
        elements.correctionWorkspace.querySelectorAll('.correction-card details').forEach(details => {
            details.open = view.openRows.includes(details.closest('.correction-card')?.dataset.rowIndex);
        });
        const controls = [...elements.correctionWorkspace.querySelectorAll('[data-correction-field],[data-correction-confirm]')];
        const focusTarget = controls.find(control => (view.focusField && control.dataset.correctionRow === view.focusRow && control.dataset.correctionField === view.focusField) || (view.focusConfirm && control.dataset.correctionConfirm === view.focusConfirm));
        if (focusTarget) {
            focusTarget.focus({preventScroll:true});
            if (view.selectionStart !== null && typeof focusTarget.setSelectionRange === 'function') focusTarget.setSelectionRange(view.selectionStart,view.selectionEnd);
        }
        elements.correctionWorkspace.scrollTop = view.scrollTop;
        window.scrollTo(view.pageX,view.pageY);
    };
    restore();
    window.requestAnimationFrame(restore);
}

function renderCorrectionWorkspace(preview,{preserveView=false}={}) {
    const view = preserveView ? captureCorrectionView() : null;
    const rows = preview.rows;
    rows.forEach(row => {
        row.require_program = ["Risk Register Tracking Template","Legal Legacy Risk Register"].includes(preview.template_type);
        row.require_legal_context = preview.template_type === "Legal Legacy Risk Register";
        if (!row.initial_proposed) {
            row.initial_proposed = {
                control_type:"Not Assessed",
                control_owner:"",
                control_design_adequacy:"Not Assessed",
                control_evidence:"",
                control_last_tested_date:"",
                control_exceptions:"",
                control_next_review_date:"",
                control_effectiveness:"Not Assessed",
                control_assessment_basis:"Control effectiveness has not yet been assessed against verified design and operating evidence.",
                ...row.proposed_correction.values
            };
        }
        if (!row.edited) row.edited = {...row.initial_proposed};
        if (row.confirmed !== true) row.confirmed = false;
        row.client_errors = correctionErrors(row,rows);
        if (row.client_errors.length) row.confirmed = false;
    });
    const validRows = rows.filter(row => row.client_errors.length === 0);
    const confirmedRows = validRows.filter(row => row.confirmed);
    elements.previewTotal.textContent = rows.length;
    elements.previewValid.textContent = validRows.length;
    elements.previewFailed.textContent = rows.length - validRows.length;
    elements.correctionEducation.hidden = false;
    elements.correctionWorkspace.hidden = false;
    elements.previewTableWrap.hidden = true;
    elements.importValidationErrors.hidden = true;
    elements.correctionEducationTitle.textContent = preview.education?.title || "How guided correction works";
    elements.correctionEducationSteps.innerHTML = (preview.education?.steps || []).map(step => `<li>${escapeHtml(step)}</li>`).join("");
    elements.confirmAllCorrections.disabled = validRows.length !== rows.length;
    elements.confirmAllCorrections.textContent = confirmedRows.length === rows.length
        ? "All Corrections Confirmed"
        : `Confirm All ${validRows.length} Valid Corrections`;
    elements.correctionWorkspace.innerHTML = rows.map((row,index) => {
        const preScore = Number(row.edited.likelihood) * Number(row.edited.impact);
        const currentScore = Number(row.edited.current_likelihood) * Number(row.edited.current_impact);
        const postScore = Number(row.edited.residual_likelihood) * Number(row.edited.residual_impact);
        const valid = row.client_errors.length === 0;
        const explanations = row.proposed_correction.corrections || [];
        return `<article class="correction-card ${valid ? "ready" : "needs-attention"}" data-row-index="${index}">
            <header>
                <div>
                    <span class="correction-row-label">Excel row ${row.excel_row}${row.proposed_correction.parent_risk_id ? ` · Parent ${escapeHtml(row.proposed_correction.parent_risk_id)}` : ""}</span>
                    <h4>${escapeHtml(row.edited.risk_id)} · ${escapeHtml(row.edited.risk_title)}</h4>
                </div>
                <span class="preview-status ${valid ? "valid" : "invalid"}">${valid ? (row.confirmed ? "Confirmed" : "Ready to confirm") : `${row.client_errors.length} issue${row.client_errors.length === 1 ? "" : "s"}`}</span>
            </header>
            <details${!valid || index === 0 ? " open" : ""}>
                <summary>Review the proposed correction and explanation <strong>Pre ${preScore || "—"} · Current ${currentScore || "—"} · Post ${postScore || "—"}</strong></summary>
                <div class="correction-reasons">
                    <h5>Why the system changed this row</h5>
                    <ul>${explanations.map(item => `<li><strong>${escapeHtml(CORRECTION_LABELS[item.field] || item.field)}:</strong> ${escapeHtml(item.explanation || item.reason)} <em class="confidence confidence-${String(item.confidence_level || "high").toLowerCase()}">${escapeHtml(item.confidence_level || "High")} confidence</em><small>Detection: ${escapeHtml(item.detection_rule || item.reason)} · Validation: ${escapeHtml(item.validation_rule || item.rule)} · Audit: ${escapeHtml(item.audit_record || "Original, proposed and confirmed values are retained.")}</small></li>`).join("")}</ul>
                </div>
                ${row.client_errors.length ? `<div class="correction-errors">${row.client_errors.map(error => `<span>${escapeHtml(error)}</span>`).join("")}</div>` : ""}
                <div class="correction-grid">${Object.keys(CORRECTION_LABELS).map(field => correctionInput(row,index,field)).join("")}</div>
                <label class="correction-confirm">
                    <input type="checkbox" data-correction-confirm="${index}"${row.confirmed ? " checked" : ""}${valid ? "" : " disabled"}>
                    <span>I have reviewed this proposed risk and confirm it is ready for upload.</span>
                </label>
            </details>
        </article>`;
    }).join("");
    const allReady = rows.length > 0 && validRows.length === rows.length && confirmedRows.length === rows.length;
    elements.confirmImportBtn.disabled = !allReady;
    elements.confirmImportBtn.textContent = allReady
        ? `Confirm Corrections and Upload ${rows.length} Risks`
        : `Confirm ${rows.length - confirmedRows.length} Remaining Correction${rows.length - confirmedRows.length === 1 ? "" : "s"}`;
    restoreCorrectionView(view);
}

function renderImportPreview(preview) {
    const summary = preview.summary;
    const ignored = preview.ignored_headers?.length
        ? ` • Excluded: ${preview.ignored_headers.join(", ")}`
        : "";
    elements.importSheetMeta.textContent = `${preview.file_name} • ${preview.template_type || "Risk Register"} • Sheet: ${preview.sheet_name} • Header row: ${preview.header_row}${ignored}`;
    elements.previewTotal.textContent = summary.total_rows;
    elements.previewValid.textContent = summary.valid_rows;
    elements.previewFailed.textContent = summary.failed_rows;
    if (preview.correction_mode === "guided") {
        renderCorrectionWorkspace(preview);
        elements.importPreview.hidden = false;
        return;
    }
    elements.correctionEducation.hidden = true;
    elements.correctionWorkspace.hidden = true;
    elements.previewTableWrap.hidden = false;
    elements.importPreviewHead.innerHTML = `<tr><th>Excel Row</th><th>Validation</th>${preview.headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}<th>Treatment Proposal</th></tr>`;
    elements.importPreviewBody.innerHTML = preview.rows.map(row => `
        <tr class="${row.valid ? "preview-valid-row" : "preview-invalid-row"}">
            <td>${row.excel_row}</td>
            <td><span class="preview-status ${row.valid ? "valid" : "invalid"}">${row.valid ? "Valid" : `${row.errors.length} error${row.errors.length === 1 ? "" : "s"}`}</span></td>
            ${preview.headers.map(header => renderPreviewCell(row, header)).join("")}
            <td><strong>${escapeHtml(row.treatment_proposal?.strategy || "")}</strong><br><small>${escapeHtml(row.treatment_proposal?.original_plan ? "Uploaded plan retained; improvements suggested separately." : row.treatment_proposal?.system_improvements || "")}</small></td>
        </tr>
    `).join("");

    elements.importErrorList.innerHTML = summary.validation_errors
        .map(error => `<li><strong>Excel row ${error.excel_row}:</strong> ${escapeHtml(error.message)}</li>`)
        .join("");
    elements.importValidationErrors.hidden = summary.validation_errors.length === 0;
    elements.importPreview.hidden = false;
    elements.confirmImportBtn.disabled = summary.valid_rows === 0;
    elements.confirmImportBtn.textContent = `Import ${summary.valid_rows} Valid Record${summary.valid_rows === 1 ? "" : "s"}`;
}

function handleCorrectionWorkspaceChange(event) {
    if (!importState.preview || importState.preview.correction_mode !== "guided") return;
    const fieldControl = event.target.closest("[data-correction-field]");
    if (fieldControl) {
        const index = Number(fieldControl.dataset.correctionRow);
        const field = fieldControl.dataset.correctionField;
        const row = importState.preview.rows[index];
        if (!row) return;
        row.edited[field] = [
            "likelihood","impact","current_likelihood","current_impact",
            "residual_likelihood","residual_impact"
        ].includes(field)
            ? Number(fieldControl.value)
            : fieldControl.value;
        row.confirmed = false;
        renderCorrectionWorkspace(importState.preview,{preserveView:true});
        return;
    }
    const confirmation = event.target.closest("[data-correction-confirm]");
    if (confirmation) {
        const index = Number(confirmation.dataset.correctionConfirm);
        const row = importState.preview.rows[index];
        if (!row) return;
        row.confirmed = confirmation.checked && correctionErrors(row,importState.preview.rows).length === 0;
        renderCorrectionWorkspace(importState.preview,{preserveView:true});
    }
}

function confirmAllValidCorrections() {
    if (!importState.preview || importState.preview.correction_mode !== "guided") return;
    const rows = importState.preview.rows;
    const allValid = rows.every(row => correctionErrors(row,rows).length === 0);
    if (!allValid) {
        showToast("Correct the remaining issues before confirming all risks.", "error");
        return;
    }
    rows.forEach(row => { row.confirmed = true; });
    renderCorrectionWorkspace(importState.preview,{preserveView:true});
}

async function previewWorkbook(file) {
    const fileError = validateWorkbookFile(file);
    if (fileError) {
        showToast(fileError, "error");
        elements.riskWorkbookInput.value = "";
        return;
    }

    importState.isProcessing = true;
    elements.importFileName.textContent = file.name;
    elements.importFileHelp.textContent = `${Math.ceil(file.size / 1024)} KB • Validating the template and populated rows`;
    elements.importPreview.hidden = true;
    elements.importResult.hidden = true;
    elements.confirmImportBtn.disabled = true;
    setImportProgress(true, "Reading workbook...", 20);

    try {
        importState.file = file;
        importState.fileData = await readWorkbook(file);
        setImportProgress(true, "Detecting headers and validating rows...", 65);
        const data = await apiRequest("/risks/import/preview", {
            method: "POST",
            body: JSON.stringify({ file_name: file.name, file_data: importState.fileData })
        });
        importState.preview = data.preview;
        setImportProgress(true, "Preview ready", 100);
        renderImportPreview(data.preview);
        window.setTimeout(() => setImportProgress(false), 350);
    } catch (error) {
        importState.file = null;
        importState.fileData = null;
        setImportProgress(false);
        showToast(error.message || "Unable to preview the workbook.", "error");
        elements.importFileHelp.textContent = error.message || "The workbook could not be validated.";
    } finally {
        importState.isProcessing = false;
    }
}

function renderImportResult(summary) {
    elements.importResult.innerHTML = `
        <h3>Import Summary</h3>
        <div class="result-summary">
            <span>Total rows <strong>${summary.total_rows}</strong></span>
            <span>Imported rows <strong>${summary.imported_rows}</strong></span>
            <span>Failed rows <strong>${summary.failed_rows}</strong></span>
            <span>Validation errors <strong>${summary.validation_errors.length}</strong></span>
        </div>
        ${summary.validation_errors.length ? `<ul>${summary.validation_errors.map(error => `<li><strong>Excel row ${error.excel_row}:</strong> ${escapeHtml(error.message)}</li>`).join("")}</ul>` : ""}
    `;
    elements.importResult.hidden = false;
}

async function importValidatedWorkbook() {
    if (!importState.file || !importState.fileData || !importState.preview) return;

    importState.isProcessing = true;
    elements.confirmImportBtn.disabled = true;
    elements.cancelImportBtn.disabled = true;
    elements.chooseWorkbookBtn.disabled = true;
    setImportProgress(true, "Importing valid risk records...", 35);

    try {
        const response = await window.NCAGRC.authorizedFetch("/risks/import", {
            method: "POST",
            body: JSON.stringify({
                file_name:importState.file.name,
                file_data:importState.fileData,
                corrected_rows:importState.preview.correction_mode === "guided"
                    ? importState.preview.rows.map(row => ({
                        excel_row:row.excel_row,
                        confirmed:row.confirmed === true,
                        values:row.edited
                    }))
                    : undefined
            })
        });
        const data = await response.json().catch(() => ({ success: false, message: "Unexpected server response." }));
        if (!data.summary) throw new Error(data.message || "Unable to import the workbook.");

        setImportProgress(true, "Import complete", 100);
        renderImportResult(data.summary);
        elements.importPreview.hidden = true;
        elements.confirmImportBtn.textContent = "Import Complete";
        showToast(data.message || `${data.summary.imported_rows} risks imported.`, data.summary.imported_rows ? "success" : "error");
        if (data.summary.imported_rows) {
            state.selectedImportBatchId = String(data.summary.import_batch_id || "");
            await Promise.all([loadImportBatches(),loadRisks()]);
        }
    } catch (error) {
        setImportProgress(false);
        elements.confirmImportBtn.disabled = false;
        showToast(error.message || "Unable to import the workbook.", "error");
    } finally {
        importState.isProcessing = false;
        elements.cancelImportBtn.disabled = false;
        elements.chooseWorkbookBtn.disabled = false;
    }
}

function setLoading(isLoading) {
    state.isLoading = isLoading;
    elements.loadingState.style.display = isLoading ? "block" : "none";
    elements.saveRisk.disabled = isLoading;
    if (elements.importRiskBtn) elements.importRiskBtn.disabled = isLoading;
}

function buildQueryString() {
    const params = new URLSearchParams();
    const search = elements.searchInput.value.trim();
    const directorate = elements.directorateFilter.value;
    const riskLevel = elements.levelFilter.value;
    const status = elements.statusFilter.value;
    const workflowStatus = elements.workflowFilter.value;
    const entrySource = elements.sourceFilter.value;
    const reviewStage = elements.reviewStageFilter.value;
    const importBatchId = state.selectedImportBatchId;

    if (search) params.set("search", search);
    if (directorate) params.set("directorate", directorate);
    if (riskLevel) params.set("risk_level", riskLevel);
    if (status) params.set("status", status);
    if (workflowStatus) params.set("workflow_status", workflowStatus);
    if (entrySource) params.set("entry_source", entrySource);
    if (reviewStage) params.set("review_stage", reviewStage);
    if (importBatchId) params.set("import_batch_id", importBatchId);

    const query = params.toString();
    return query ? `?${query}` : "";
}

let riskLoadSequence = 0;
let riskSearchTimer = null;

async function loadRisks(options = {}) {
    const preservePage = options?.preservePage === true;
    const previousPage = state.currentPage;
    const sequence = ++riskLoadSequence;
    try {
        setLoading(true);

        const data = await apiRequest(`/risks${buildQueryString()}`);
        if (sequence !== riskLoadSequence) return;
        state.risks = data.risks || [];
        state.filteredRisks = state.risks;
        state.currentPage = preservePage ? previousPage : 1;

        updateStats();
        renderWorkplanFocalBulk();
        renderChampionBulk();
        if (state.requestedRiskId && !state.requestedRiskOpened
            && state.risks.some(risk => Number(risk.id) === state.requestedRiskId)) {
            state.requestedRiskOpened = true;
            window.setTimeout(() => state.requestedRiskMode === "edit"
                ? editRisk(state.requestedRiskId)
                : openAssessmentDecision(state.requestedRiskId), 0);
        }
    } catch (error) {
        if (sequence !== riskLoadSequence) return;
        console.error(error);
        showToast(error.message || "Unable to load risks.", "error");
    } finally {
        if (sequence === riskLoadSequence) {
            setLoading(false);
            renderRisks();
            refreshCommitteeSummary();
        }
    }
}

function workplanFocalGroups() {
    const groups = new Map();
    state.risks
        .filter(risk => risk.entry_source === "Work Plan"
            && ["Awaiting Focal Review","Returned"].includes(risk.review_stage)
            && risk.workplan_upload_id)
        .forEach(risk => {
            const key = String(risk.workplan_upload_id);
            const group = groups.get(key) || {
                id:key,
                fileName:risk.workplan_file_name || `Work plan ${key}`,
                year:risk.workplan_plan_year,
                count:0
            };
            group.count += 1;
            groups.set(key,group);
        });
    return [...groups.values()];
}

function selectedWorkplanFocalGroup() {
    return workplanFocalGroups().find(group => group.id === String(state.selectedWorkplanUploadId));
}

function renderWorkplanFocalBulk() {
    const permitted = ["Risk Focal Person","System Administrator"].includes(currentUser.role);
    const groups = permitted ? workplanFocalGroups() : [];
    elements.workplanFocalBulkBar.hidden = !groups.length;
    if (!groups.length) {
        state.selectedWorkplanUploadId = "";
        return;
    }
    if (!groups.some(group => group.id === String(state.selectedWorkplanUploadId))) {
        state.selectedWorkplanUploadId = groups[0].id;
    }
    elements.workplanFocalBulkFilter.innerHTML = groups.map(group =>
        `<option value="${escapeHtml(group.id)}"${group.id === String(state.selectedWorkplanUploadId) ? " selected" : ""}>${escapeHtml(group.fileName)}${group.year ? ` · ${escapeHtml(group.year)}` : ""}</option>`
    ).join("");
    const group = selectedWorkplanFocalGroup();
    elements.workplanFocalBulkTitle.textContent = group.fileName;
    elements.workplanFocalBulkProgress.textContent = `${group.count} assessment${group.count === 1 ? "" : "s"} still awaiting Focal Person submission.`;
    elements.openWorkplanFocalBulk.disabled = !group.count;
}

function openWorkplanFocalBulkDialog() {
    const group = selectedWorkplanFocalGroup();
    if (!group) return;
    elements.workplanFocalBulkDescription.textContent = `${group.fileName}${group.year ? ` · ${group.year}` : ""}`;
    elements.workplanFocalBulkCount.textContent = group.count;
    elements.workplanFocalBulkComments.value = "";
    elements.workplanFocalBulkDialog.showModal();
}

async function submitAllWorkplanFocalAssessments() {
    const group = selectedWorkplanFocalGroup();
    if (!group) return;
    try {
        elements.confirmWorkplanFocalBulk.disabled = true;
        const data = await apiRequest("/risks/workplan-focal-submit-all", {
            method:"POST",
            body:JSON.stringify({
                workplan_upload_id:Number(group.id),
                comments:elements.workplanFocalBulkComments.value.trim()
            })
        });
        elements.workplanFocalBulkDialog.close();
        showToast(data.message || "Work-plan assessments submitted.");
        await loadRisks({preservePage:true});
    } catch (error) {
        showToast(error.message || "Unable to submit the work-plan assessments.", "error");
    } finally {
        elements.confirmWorkplanFocalBulk.disabled = false;
    }
}

function championBulkRisks() {
    if (!["Risk Champion","System Administrator"].includes(currentUser.role)) return [];
    return state.risks.filter(risk => risk.review_stage === "Awaiting Champion Review");
}

function championBulkBreakdown() {
    return championBulkRisks().reduce((summary,risk) => {
        if (risk.champion_score) summary.saved += 1;
        else if (risk.focal_score) summary.focal += 1;
        else summary.system += 1;
        return summary;
    },{saved:0,focal:0,system:0});
}

function renderChampionBulk() {
    const risks = championBulkRisks();
    elements.championBulkBar.hidden = !risks.length;
    if (!risks.length) return;
    const scope = elements.sourceFilter.value
        || (state.selectedImportBatchId ? "Selected uploaded register" : "Current consolidated selection");
    elements.championBulkTitle.textContent = scope;
    elements.championBulkProgress.textContent = `${risks.length} risk${risks.length === 1 ? "" : "s"} awaiting Champion review in this selection.`;
    elements.openChampionBulk.disabled = !risks.length;
}

function openChampionBulkDialog() {
    const risks = championBulkRisks();
    if (!risks.length) return;
    const breakdown = championBulkBreakdown();
    elements.championBulkDescription.textContent = `${currentUser.division || currentUser.directorate || "Selected scope"} · Current consolidated selection`;
    elements.championBulkCount.textContent = risks.length;
    elements.championBulkSavedCount.textContent = breakdown.saved;
    elements.championBulkFocalCount.textContent = breakdown.focal;
    elements.championBulkSystemCount.textContent = breakdown.system;
    elements.championBulkComments.value = "";
    elements.championBulkDialog.showModal();
}

async function submitChampionReviewsBulk() {
    const risks = championBulkRisks();
    if (!risks.length) return;
    try {
        elements.confirmChampionBulk.disabled = true;
        const data = await apiRequest("/risks/champion-reviews-submit-all",{
            method:"POST",
            body:JSON.stringify({
                risk_ids:risks.map(risk => risk.id),
                comments:elements.championBulkComments.value.trim()
            })
        });
        elements.championBulkDialog.close();
        showToast(data.message || "Champion reviews submitted.");
        await Promise.all([loadImportBatches(),loadRisks({preservePage:true})]);
    } catch (error) {
        showToast(error.message || "Unable to submit the Champion reviews.", "error");
    } finally {
        elements.confirmChampionBulk.disabled = false;
    }
}

async function refreshCommitteeSummary(){
    const permitted=["Risk Committee Chairman","System Administrator"].includes(currentUser.role);
    elements.committeeBulkBar.hidden=!permitted;
    if(!permitted)return;
    try{
        const division=elements.directorateFilter.value;
        const query=division?`?division=${encodeURIComponent(division)}`:"";
        const data=await apiRequest(`/risks/committee-bulk-summary${query}`);
        state.committeeSummary=data;
        const scope=division||"All Divisions";
        elements.committeeBulkTitle.textContent=`${scope} · Committee-ready risks`;
        elements.committeeBulkProgress.textContent=`${data.eligibleCount} eligible risk${data.eligibleCount===1?"":"s"} · ${data.highCount} high · ${data.divisions.length} division${data.divisions.length===1?"":"s"}`;
        elements.committeeApproveRisks.disabled=!data.eligibleCount;
    }catch(error){
        console.error(error);
        elements.committeeBulkProgress.textContent="Unable to load the Committee approval summary.";
        elements.committeeApproveRisks.disabled=true;
    }
}

function openCommitteeBulkApproval(){
    const summary=state.committeeSummary;
    if(!summary.eligibleCount)return;
    const division=elements.directorateFilter.value;
    document.getElementById("committeeBulkDescription").textContent=division
        ? `Final approval for all Champion-reviewed risks in ${division}.`
        : "Final approval for all Champion-reviewed risks across all divisions.";
    document.getElementById("committeeBulkCount").textContent=summary.eligibleCount;
    document.getElementById("committeeBulkHighCount").textContent=summary.highCount;
    document.getElementById("committeeBulkDivisionCount").textContent=summary.divisions.length;
    document.getElementById("committeeBulkComments").value="";
    elements.committeeBulkApprovalDialog.showModal();
}

async function confirmCommitteeBulkApproval(){
    const button=document.getElementById("confirmCommitteeBulk");
    try{
        button.disabled=true;
        const data=await apiRequest("/risks/committee-bulk-approve",{
            method:"POST",
            body:JSON.stringify({
                division:elements.directorateFilter.value,
                comments:document.getElementById("committeeBulkComments").value.trim()
            })
        });
        elements.committeeBulkApprovalDialog.close();
        showToast(data.message||"Final Committee risk approvals recorded.");
        await Promise.all([loadImportBatches(),loadRisks({preservePage:true})]);
    }catch(error){showToast(error.message||"Unable to approve the Committee risk scope.","error");}
    finally{button.disabled=false;}
}

function selectedImportBatch() {
    return state.importBatches.find(batch => String(batch.id) === String(state.selectedImportBatchId));
}

function renderImportBatches() {
    const batches = state.importBatches;
    elements.importBatchBar.hidden = batches.length === 0;
    elements.importBatchFilter.innerHTML = [
        '<option value="">All uploaded registers</option>',
        ...batches.map(batch => `<option value="${batch.id}">${escapeHtml(batch.file_name)} · ${escapeHtml(batch.division)} · ${escapeHtml(batch.status)}</option>`)
    ].join("");
    elements.importBatchFilter.value = state.selectedImportBatchId;
    const batch = selectedImportBatch();
    if (!batch) {
        elements.importBatchTitle.textContent = "Uploaded risk registers";
        elements.importBatchProgress.textContent = "Select a register to review its risks and batch-approval progress.";
        elements.approveImportBatch.hidden = true;
        return;
    }
    elements.importBatchTitle.textContent = `${batch.file_name} · ${batch.division}`;
    elements.importBatchProgress.textContent = `${batch.champion_reviewed_count} of ${batch.risk_count} risks reviewed by the Champion · ${batch.status}`;
    const mayApprove = ["Risk Champion","System Administrator"].includes(currentUser.role)
        && batch.status === "Champion Review";
    elements.approveImportBatch.hidden = !mayApprove;
    elements.approveImportBatch.disabled = !batch.can_batch_approve;
    elements.approveImportBatch.title = batch.can_batch_approve
        ? "Approve the complete imported register"
        : `Review ${Math.max(Number(batch.risk_count) - Number(batch.champion_reviewed_count),0)} remaining risk(s) first`;
}

async function loadImportBatches() {
    try {
        const data = await apiRequest("/risks/import-batches");
        state.importBatches = data.batches || [];
        if (state.selectedImportBatchId
            && !state.importBatches.some(batch => String(batch.id) === String(state.selectedImportBatchId))) {
            state.selectedImportBatchId = "";
        }
        renderImportBatches();
    } catch (error) {
        console.error(error);
        elements.importBatchBar.hidden = true;
    }
}

function openImportBatchApproval() {
    const batch = selectedImportBatch();
    if (!batch || !batch.can_batch_approve) return;
    elements.importBatchApprovalDescription.textContent = `${batch.file_name} · ${batch.division} · ${batch.template_type}`;
    elements.importBatchApprovalCount.textContent = batch.risk_count;
    elements.importBatchReviewedCount.textContent = batch.champion_reviewed_count;
    elements.importBatchComments.value = "";
    elements.importBatchApprovalDialog.showModal();
}

async function approveSelectedImportBatch() {
    const batch = selectedImportBatch();
    if (!batch) return;
    try {
        elements.confirmImportBatchApproval.disabled = true;
        const data = await apiRequest(`/risks/import-batches/${batch.id}/champion-approve`, {
            method: "POST",
            body: JSON.stringify({comments: elements.importBatchComments.value.trim()})
        });
        elements.importBatchApprovalDialog.close();
        showToast(data.message || "Imported risk register approved.");
        await Promise.all([loadImportBatches(),loadRisks({preservePage:true})]);
    } catch (error) {
        showToast(error.message || "Unable to approve the imported risk register.", "error");
    } finally {
        elements.confirmImportBatchApproval.disabled = false;
    }
}

function scheduleRiskSearch() {
    window.clearTimeout(riskSearchTimer);
    riskSearchTimer = window.setTimeout(loadRisks, 250);
}

function updateStats() {
    elements.totalRisks.textContent = state.risks.length;
    elements.openRisks.textContent = state.risks.filter(risk => risk.status !== "Closed").length;
    elements.highRisks.textContent = state.risks.filter(risk => risk.risk_level === "High").length;
    elements.mediumRisks.textContent = state.risks.filter(risk => risk.risk_level === "Medium").length;
    elements.lowRisks.textContent = state.risks.filter(risk => risk.risk_level === "Low").length;
}

function getTotalPages() {
    return Math.max(Math.ceil(state.filteredRisks.length / state.pageSize), 1);
}

function getPaginatedRisks() {
    const start = (state.currentPage - 1) * state.pageSize;
    return state.filteredRisks.slice(start, start + state.pageSize);
}

function sortRisks() {
    const direction = state.sortDirection === "asc" ? 1 : -1;
    const numericKeys = ["id", "inherent_risk_score", "residual_risk_score"];

    state.filteredRisks.sort((first, second) => {
        const firstValue = first[state.sortKey] ?? "";
        const secondValue = second[state.sortKey] ?? "";

        if (numericKeys.includes(state.sortKey)) {
            return ((Number(firstValue) || 0) - (Number(secondValue) || 0)) * direction;
        }

        return String(firstValue).localeCompare(String(secondValue)) * direction;
    });
}

function sourcePresentation(source) {
    const value = String(source || "Unknown");
    if (value === "Work Plan") return {label:"Work Plan", className:"work-plan"};
    if (value === "Risk Register Tracking Template") return {label:"Register Tracker", className:"tracker"};
    if (value === "Legal Legacy Risk Register") return {label:"Legal Register", className:"tracker"};
    if (value.startsWith("Manual")) return {label:value.includes("Champion") ? "Manual · Champion" : "Manual · Focal", className:"manual"};
    return {label:value, className:""};
}

function assessmentValues(risk) {
    return [
        ["System", risk.system_score],
        ...(currentUser.role === "Risk Committee Chairman" ? [] : [[risk.focal_assessment_status === "Pending Confirmation" ? "Focal · Pending" : "Focal", risk.focal_score]]),
        ["Champion", risk.champion_score],
        ...(risk.chairman_score ? [["Chairman", risk.chairman_score]] : [])
    ];
}

function renderRisks() {
    const totalPages = getTotalPages();

    if (state.currentPage > totalPages) {
        state.currentPage = totalPages;
    }

    sortRisks();
    elements.table.innerHTML = "";

    getPaginatedRisks().forEach(risk => {
        const row = document.createElement("tr");
        const likelihoodLabels = {1:"Rare (Very Low)",2:"Unlikely (Low)",3:"Possible (Medium)",4:"Likely (High)",5:"Almost Certain (Very High)"};
        const impactLabels = {1:"Insignificant (Very Low)",2:"Minor (Low)",3:"Moderate (Medium)",4:"Major (High)",5:"Catastrophic (Very High)"};
        const manualExplanation = `Manual assessment: likelihood ${risk.likelihood} (${likelihoodLabels[risk.likelihood]}) × impact ${risk.impact} (${impactLabels[risk.impact]}) = ${risk.inherent_risk_score}, producing a ${risk.risk_level} rating and ${risk.risk_treatment} response.`;
        const keywords = Array.isArray(risk.matched_keywords) && risk.matched_keywords.length ? risk.matched_keywords.join(", ") : "No workbook keywords";
        const reviewTrail = [
            risk.focal_score ? `Focal proposal: L${risk.focal_likelihood} (${likelihoodLabels[risk.focal_likelihood]}) × I${risk.focal_impact} (${impactLabels[risk.focal_impact]}) = ${risk.focal_score}${risk.focal_reason ? ` — ${risk.focal_reason}` : ""}` : "",
            risk.champion_score ? `Champion review: L${risk.champion_likelihood} (${likelihoodLabels[risk.champion_likelihood]}) × I${risk.champion_impact} (${impactLabels[risk.champion_impact]}) = ${risk.champion_score}${risk.champion_reason ? ` — ${risk.champion_reason}` : ""}` : "",
            risk.chairman_score ? `Chairman final: L${risk.chairman_likelihood} (${likelihoodLabels[risk.chairman_likelihood]}) × I${risk.chairman_impact} (${impactLabels[risk.chairman_impact]}) = ${risk.chairman_score}${risk.chairman_reason ? ` — ${risk.chairman_reason}` : ""}` : ""
        ].filter(Boolean);
        const explanation = risk.assessment_explanation || manualExplanation;
        const source = sourcePresentation(risk.entry_source);
        const treatmentStatus = risk.treatment_plan_status || "Missing";
        const treatmentClass = treatmentStatus.toLowerCase().replaceAll(" ", "-");
        row.innerHTML = `
            <td>
                <strong>${escapeHtml(risk.risk_id)}</strong>
                <br>
                <small>${formatDate(risk.created_at)}</small>
            </td>
            <td>
                <strong>${escapeHtml(risk.risk_title)}</strong>
                <br>
                <small>${escapeHtml(risk.risk_category)}</small>
            </td>
            <td>${escapeHtml(risk.directorate)}</td>
            <td><strong>${escapeHtml(risk.assessment_year)}</strong></td>
            <td><span class="source-badge ${source.className}">${escapeHtml(source.label)}</span></td>
            <td>${escapeHtml(risk.risk_owner)}</td>
            <td class="risk-score-column">
                <div class="assessment-comparison">
                    ${assessmentValues(risk).map(([label, score]) => score
                        ? `<span class="assessment-value ${getScoreFillClass(score)}" title="${escapeHtml(`${label} score ${score} (${getScoreLevel(score)})`)}"><small>${label}</small><strong>${escapeHtml(score)}</strong></span>`
                        : `<span class="assessment-value missing"><small>${label}</small><strong>—</strong></span>`
                    ).join("")}
                </div>
                <span class="review-stage-badge">${escapeHtml(risk.review_stage || "Awaiting assessment")}</span>
            </td>
            <td>
                <span class="level-badge ${getLevelClass(risk.risk_level)}">
                    ${escapeHtml(risk.risk_level)}
                </span>
            </td>
            <td><details class="risk-explanation"><summary>View reasoning</summary><p>${escapeHtml(explanation)}</p>${risk.assessment_explanation ? `<p><strong>Keywords:</strong> ${escapeHtml(keywords)}</p>` : ""}${reviewTrail.map(item => `<p>${escapeHtml(item)}</p>`).join("")}</details></td>
            <td><span class="treatment-badge ${treatmentClass}">${escapeHtml(treatmentStatus)}</span><br><small>${escapeHtml(risk.treatment_plan_count || 0)} plan${Number(risk.treatment_plan_count) === 1 ? "" : "s"}</small></td>
            <td>
                <span class="status ${getStatusClass(risk.status)}">
                    ${escapeHtml(risk.status)}
                </span>
            </td>
            <td>
                <span class="status ${getStatusClass(risk.workflow_status || "Draft")}">
                    ${escapeHtml(risk.workflow_status || "Draft")}
                </span>
            </td>
            <td><span class="status ${risk.admission_status === "Admitted" ? "accepted" : getStatusClass(risk.workflow_status || "Draft")}">${escapeHtml(risk.admission_status || "Draft")}</span></td>
            <td>
                <div class="row-actions">
                    ${getRiskActionButtons(risk)}
                </div>
            </td>
        `;
        elements.table.appendChild(row);
    });

    renderPagination();
    elements.emptyState.style.display = !state.isLoading && state.filteredRisks.length === 0 ? "block" : "none";
}

function getRiskActionButtons(risk) {
    const buttons = [`<button class="edit-btn" type="button" data-action="view" data-id="${risk.id}">View</button>`];
    const workflowStatus = risk.workflow_status || "Draft";

    if (canEditRisk(risk)) {
        buttons.push(`<button class="edit-btn" type="button" data-action="edit" data-id="${risk.id}" aria-label="Edit ${escapeHtml(risk.risk_id)}">Edit</button>`);
    } else if (canMonitorRisk(risk)) {
        buttons.push(`<button class="edit-btn" type="button" data-action="edit" data-id="${risk.id}">Update</button>`);
    }

    if (canRecordAssessment(risk)) {
        const label = currentUser.role === "Risk Focal Person"
            ? "Submit Assessment"
            : currentUser.role === "Risk Champion" ? "Champion Review" : "Final Review";
        buttons.push(`<button class="assessment-btn" type="button" data-action="assessment" data-id="${risk.id}">${label}</button>`);
    }

    if (["System Administrator","Risk Champion","Risk Committee Chairman"].includes(currentUser.role) && workflowStatus === "Monitoring" && risk.status !== "Closed") {
        buttons.push(`<button class="delete-btn" type="button" data-action="delete" data-id="${risk.id}">Close</button>`);
    }

    buttons.push(`<button class="edit-btn" type="button" data-action="history" data-id="${risk.id}">History</button>`);
    buttons.push(`<button class="edit-btn" type="button" data-action="attachments" data-id="${risk.id}">Attachments</button>`);

    return buttons.join("");
}

function canEditRisk(risk) {
    if (currentUser.role === "System Administrator") return true;
    if (currentUser.role === "Risk Committee Chairman") return risk.review_stage === "Awaiting Chairman Review";
    const sameDivision = (currentUser.division || currentUser.directorate) === (risk.division || risk.directorate);
    if (currentUser.role === "Risk Champion") {
        return sameDivision && risk.review_stage === "Awaiting Champion Review";
    }
    if (currentUser.role === "Risk Focal Person") {
        return sameDivision && ["Awaiting Focal Review","Returned"].includes(risk.review_stage);
    }
    return false;
}

function canMonitorRisk(risk) {
    const workflowStatus = risk.workflow_status || "Draft";

    if (!["Accepted","Treatment In Progress","Monitoring"].includes(workflowStatus)) return false;
    if (currentUser.role === "System Administrator") return true;

    return currentUser.role === "Risk Focal Person" && Number(risk.created_by) === Number(currentUser.id);
}

function canReviewRisk(risk) {
    const workflowStatus = risk.workflow_status || "Draft";

    if (workflowStatus !== "Submitted") return false;
    if (currentUser.role === "System Administrator") return true;

    return currentUser.role === "Risk Champion" && currentUser.directorate === risk.directorate;
}

function canRecordAssessment(risk) {
    const expectedStage = {
        "Risk Focal Person": "Awaiting Focal Review",
        "Risk Champion": "Awaiting Champion Review",
        "Risk Committee Chairman": "Awaiting Chairman Review"
    }[currentUser.role];
    if (currentUser.role === "System Administrator") {
        return ["Awaiting Focal Review","Awaiting Champion Review","Awaiting Chairman Review","Returned"].includes(risk.review_stage);
    }
    return risk.review_stage === expectedStage
        || (currentUser.role === "Risk Focal Person" && risk.review_stage === "Returned");
}

function renderPagination() {
    const total = state.filteredRisks.length;
    const totalPages = getTotalPages();
    const start = total === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
    const end = Math.min(state.currentPage * state.pageSize, total);

    elements.paginationSummary.textContent = total === 0
        ? "Showing 0 risks"
        : `Showing ${start}-${end} of ${total} risks`;
    elements.pageInfo.textContent = `Page ${state.currentPage} of ${totalPages}`;
    elements.prevPage.disabled = state.currentPage <= 1;
    elements.nextPage.disabled = state.currentPage >= totalPages;
}

function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(new Date(value));
}

function getLevelClass(level) {
    return String(level || "").toLowerCase();
}

function getStatusClass(status) {
    return String(status || "").toLowerCase().replaceAll(" ", "-");
}

function calculateRiskLevel(score) {
    return window.NCAGRC.riskMatrix.calculateLevel(score);
}

function updateCalculatedFields() {
    const likelihood = Number(fields.likelihood.value) || 0;
    const impact = Number(fields.impact.value) || 0;
    const score = likelihood * impact;

    fields.inherent_risk_score.value = score || 0;
    fields.risk_level.value = calculateRiskLevel(score || 1);

    if (!fields.residual_risk_score.value || Number(fields.residual_risk_score.value) < 1) {
        fields.residual_risk_score.value = score || 1;
    }
}

function resetForm() {
    Object.values(fields).forEach(field => {
        if (!field) return;
        if (field.tagName === "SELECT") {
            field.selectedIndex = 0;
        } else {
            field.value = "";
        }
    });

    fields.inherent_risk_score.value = "0";
    fields.risk_level.value = "Low";
    fields.residual_risk_score.value = "1";
    fields.status.value = "Draft";

    if (currentUser?.role !== "System Administrator") {
        fields.directorate.value = currentUser.directorate || "";
        fields.directorate.disabled = true;
    }
}

function openModal(risk = null) {
    resetForm();
    state.editingRiskId = risk ? risk.id : null;

    if (risk) {
        Object.keys(fields).forEach(key => {
            if (risk[key] !== undefined && fields[key]) {
                fields[key].value = fields[key].type === "date" && risk[key]
                    ? String(risk[key]).slice(0, 10)
                    : risk[key] ?? "";
            }
        });
        fields.inherent_risk_score.value = risk.inherent_risk_score || 0;
        fields.risk_level.value = risk.risk_level || "Low";
        fields.source_action_point.value = risk.source_action_point || "";
        document.getElementById("sourceActionPointGroup").hidden = !risk.source_workplan_action_id;
        elements.modalTitle.textContent = "Edit Risk";
        elements.saveRisk.textContent = "Save Consolidated Amendments";
        elements.submitRisk.style.display = "none";
        fields.directorate.disabled=currentUser.role!=="System Administrator";
        fields.likelihood.disabled=true;
        fields.impact.disabled=true;
        fields.residual_risk_score.disabled=true;
        fields.status.disabled=true;
    } else {
        document.getElementById("sourceActionPointGroup").hidden = true;
        elements.modalTitle.textContent = "Add Risk";
        elements.saveRisk.textContent = "Save Draft";
        elements.submitRisk.style.display = currentUser.role === "Risk Focal Person" || currentUser.role === "System Administrator" ? "inline-flex" : "none";
    }

    updateCalculatedFields();
    elements.modal.style.display = "flex";
    elements.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    fields.risk_title.focus();
}

function closeModal() {
    elements.modal.style.display = "none";
    elements.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    state.editingRiskId = null;
    fields.likelihood.disabled=false;
    fields.impact.disabled=false;
    fields.residual_risk_score.disabled=false;
    fields.status.disabled=false;
    fields.directorate.disabled=false;
    resetForm();
}

function getFormPayload(workflowStatus = "Draft") {
    return {
        risk_title: fields.risk_title.value.trim(),
        risk_description: fields.risk_description.value.trim(),
        risk_source: fields.risk_source.value.trim(),
        risk_cause: fields.risk_cause.value.trim(),
        risk_category: fields.risk_category.value,
        directorate: fields.directorate.value,
        business_unit: fields.business_unit.value.trim(),
        programme_project: fields.programme_project.value.trim(),
        source_action_point: fields.source_action_point.value.trim(),
        risk_owner: fields.risk_owner.value.trim(),
        date_identified: fields.date_identified.value,
        assessment_year: Number(fields.assessment_year.value),
        likelihood: Number(fields.likelihood.value),
        impact: Number(fields.impact.value),
        residual_risk_score: Number(fields.residual_risk_score.value),
        existing_controls: fields.existing_controls.value.trim(),
        control_effectiveness: fields.control_effectiveness.value,
        control_type: fields.control_type.value,
        control_owner: fields.control_owner.value.trim(),
        control_design_adequacy: fields.control_design_adequacy.value,
        control_evidence: fields.control_evidence.value.trim(),
        control_last_tested_date: fields.control_last_tested_date.value || null,
        control_exceptions: fields.control_exceptions.value.trim(),
        control_next_review_date: fields.control_next_review_date.value || null,
        control_assessment_basis: fields.control_assessment_basis.value.trim(),
        risk_treatment: fields.risk_treatment.value,
        initial_mitigation_plan: fields.initial_mitigation_plan.value.trim(),
        responsible_officer: fields.responsible_officer.value.trim(),
        target_completion_date: fields.target_completion_date.value,
        status: fields.status.value,
        workflow_status: workflowStatus
    };
}

function validateForm(payload) {
    if (!payload.risk_title) return "Risk title is required.";
    if (!payload.risk_description) return "Risk description is required.";
    if (!CATEGORIES.includes(payload.risk_category)) return "Select a valid risk category.";
    if (!DIRECTORATES.includes(payload.directorate)) return "Select a valid division.";
    if (!payload.risk_owner) return "Risk owner is required.";
    if (!Number.isInteger(payload.likelihood) || payload.likelihood < 1 || payload.likelihood > 5) return "Likelihood must be between 1 and 5.";
    if (!Number.isInteger(payload.impact) || payload.impact < 1 || payload.impact > 5) return "Impact must be between 1 and 5.";
    if (!Number.isInteger(payload.residual_risk_score) || payload.residual_risk_score < 1 || payload.residual_risk_score > 25) return "Residual risk score must be between 1 and 25.";
    if (!TREATMENTS.includes(payload.risk_treatment)) return "Select a valid risk treatment.";
    if (!["Effective","Partially Effective","Ineffective","Not Assessed"].includes(payload.control_effectiveness)) return "Select valid control effectiveness.";
    if (!["Preventive","Detective","Corrective","Mixed","Not Assessed"].includes(payload.control_type)) return "Select a valid control type.";
    if (!["Adequate","Partially Adequate","Inadequate","Not Assessed"].includes(payload.control_design_adequacy)) return "Select a valid control design adequacy.";
    if (!Number.isInteger(payload.assessment_year) || payload.assessment_year < 2020 || payload.assessment_year > 2100) return "Enter a valid assessment year.";
    if (!STATUSES.includes(payload.status)) return "Select a valid status.";

    return "";
}

async function saveRisk(workflowStatus = "Draft") {
    const payload = getFormPayload(workflowStatus);
    const validationError = validateForm(payload);

    if (validationError) {
        showToast(validationError, "error");
        return;
    }

    const isEditing = Boolean(state.editingRiskId);
    const path = isEditing ? `/risks/${state.editingRiskId}/consolidated-edit` : "/risks";
    const method = isEditing ? "PATCH" : "POST";

    try {
        setLoading(true);

        const data = await apiRequest(path, {
            method,
            body: JSON.stringify(payload)
        });

        showToast(data.message || (workflowStatus === "Submitted" ? "Risk submitted successfully." : "Risk saved successfully."));
        closeModal();
        await Promise.all([loadImportBatches(),loadRisks()]);
    } catch (error) {
        console.error(error);
        showToast(error.message || "Unable to save risk.", "error");
    } finally {
        setLoading(false);
    }
}

function reviewRisk(id, decision) {
    const risk = state.risks.find(item => Number(item.id) === Number(id));
    if (!risk) return showToast("Risk not found.", "error");
    const labels = { approve:"Approve", return:"Return", reject:"Reject" };
    const outcomes = { approve:"Accepted", return:"Returned for rework", reject:"Returned" };
    state.approvalRiskId = Number(id);
    state.approvalDecision = decision;
    elements.riskApprovalTitle.textContent = `${labels[decision] || "Review"} this risk?`;
    elements.riskApprovalRisk.textContent = `${risk.risk_id} · ${risk.risk_title}`;
    elements.riskApprovalRating.textContent = `${risk.risk_level} (${risk.inherent_risk_score})`;
    elements.riskApprovalOutcome.textContent = outcomes[decision] || "Reviewed";
    elements.riskApprovalComments.value = "";
    elements.riskApprovalIcon.textContent = decision === "approve" ? "✓" : "!";
    elements.confirmRiskApproval.textContent = `Confirm ${labels[decision] || "Decision"}`;
    elements.confirmRiskApproval.className = `confirm ${decision}`;
    elements.riskApprovalDialog.showModal();
    elements.riskApprovalComments.focus();
}

async function confirmRiskReview() {
    const id = state.approvalRiskId;
    const decision = state.approvalDecision;
    if (!id || !decision) return;
    const comments = elements.riskApprovalComments.value.trim();
    if (decision !== "approve" && !comments) {
        showToast("Review comments are required when returning or rejecting a risk.", "error");
        elements.riskApprovalComments.focus();
        return;
    }
    try {
        setLoading(true);
        elements.confirmRiskApproval.disabled = true;

        const data = await apiRequest(`/risks/${id}/review`, {
            method: "PATCH",
            body: JSON.stringify({
                decision,
                review_comments: comments
            })
        });

        showToast(data.message || "Risk reviewed successfully.");
        elements.riskApprovalDialog.close();
        await Promise.all([loadImportBatches(),loadRisks()]);
    } catch (error) {
        console.error(error);
        showToast(error.message || "Unable to review risk.", "error");
    } finally {
        setLoading(false);
        elements.confirmRiskApproval.disabled = false;
    }
}

function editRisk(id) {
    const risk = state.risks.find(item => Number(item.id) === Number(id));
    if (!risk) return showToast("Risk not found.", "error");
    if (!canEditRisk(risk)) return showToast("This risk is not editable at your current review stage.", "error");
    openModal(risk);
}

function viewRisk(id) {
    const risk = state.risks.find(item => Number(item.id) === Number(id));
    if (!risk) {
        showToast("Risk not found.", "error");
        return;
    }

    const source = sourcePresentation(risk.entry_source);
    elements.riskViewTitle.textContent = risk.risk_title || "Risk details";
    elements.riskViewIdentity.textContent = `${risk.risk_id} · ${risk.assessment_year || "Current register"}`;
    elements.riskViewDivision.textContent = risk.division || risk.directorate || "Unassigned";
    elements.riskViewOwner.textContent = risk.risk_owner || "Unassigned";
    elements.riskViewCategory.textContent = risk.risk_category || "Unassigned";
    elements.riskViewRating.textContent = `${risk.inherent_risk_score || "—"} (${risk.risk_level || "Unrated"})`;
    elements.riskViewWorkflow.textContent = risk.workflow_status || "Draft";
    elements.riskViewSource.textContent = source.label;
    elements.riskViewDescription.textContent = risk.risk_description || "No risk description recorded.";
    elements.riskViewRiskSource.textContent = risk.risk_source || "No separate risk source recorded.";
    elements.riskViewRiskCause.textContent = risk.risk_cause || "No separate risk cause recorded.";
    elements.riskViewControls.textContent = risk.existing_controls || "No existing controls recorded.";
    elements.riskViewControlEffectiveness.textContent = risk.control_effectiveness || "Not Assessed";
    elements.riskViewControlType.textContent = risk.control_type || "Not Assessed";
    elements.riskViewControlOwner.textContent = risk.control_owner || "Not recorded";
    elements.riskViewControlDesign.textContent = risk.control_design_adequacy || "Not Assessed";
    elements.riskViewControlTested.textContent = risk.control_last_tested_date ? formatDate(risk.control_last_tested_date) : "Not recorded";
    elements.riskViewControlReview.textContent = risk.control_next_review_date ? formatDate(risk.control_next_review_date) : "Not recorded";
    elements.riskViewControlEvidence.textContent = risk.control_evidence || "No control evidence recorded.";
    elements.riskViewControlBasis.textContent = risk.control_assessment_basis || "No control-effectiveness basis recorded.";
    elements.riskViewDialog.showModal();
}

async function showHistory(id) {
    const risk = state.risks.find(item => Number(item.id) === Number(id));
    if (!risk) return showToast("Risk not found.", "error");
    elements.riskHistoryTitle.textContent = "Risk history";
    elements.riskHistoryIdentity.textContent = `${risk.risk_id} · ${risk.risk_title}`;
    elements.riskHistoryList.innerHTML = '<div class="nca-record-empty">Loading the governed audit trail…</div>';
    elements.riskHistoryDialog.showModal();
    try {
        const data = await apiRequest(`/risks/${id}/history`);
        const events = [
            ...(data.history || []).map(item => ({date:item.changed_at,title:item.action,note:item.comment,actor:item.changed_by_name || "System",status:item.to_status || item.from_status,type:"Risk record"})),
            ...(data.reviews || []).map(item => ({date:item.reviewed_at,title:`Review · ${item.decision}`,note:item.review_comment,actor:item.reviewed_by_name || "Reviewer",status:item.status,type:"Governance review"})),
            ...(data.treatment_updates || []).map(item => ({date:item.created_at,title:`Treatment · ${item.treatment_status}`,note:item.progress_notes,actor:item.updated_by_name || "System",status:item.progress_percent === null || item.progress_percent === undefined ? "" : `${item.progress_percent}% complete`,type:"Treatment update"}))
        ].sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));
        elements.riskHistoryList.innerHTML = events.length ? events.map(item => `<article class="nca-record-item">
            <div class="nca-record-marker" aria-hidden="true"></div><div><span>${escapeHtml(item.type)}</span><h3>${escapeHtml(item.title || "Risk updated")}</h3>
            ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}<small>${escapeHtml(item.actor)} · ${escapeHtml(formatDateTime(item.date))}${item.status ? ` · ${escapeHtml(item.status)}` : ""}</small></div>
        </article>`).join("") : '<div class="nca-record-empty"><strong>No history recorded</strong><span>This risk does not yet have additional audit events.</span></div>';
    } catch (error) {
        console.error(error);
        elements.riskHistoryDialog.close();
        showToast(error.message || "Unable to load history.", "error");
    }
}

function formatDateTime(value) {
    if (!value) return "Date not recorded";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date not recorded" : date.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}

async function loadAttachments(id) {
    try {
        const data = await apiRequest(`/risks/${id}/attachments`);
        const attachments = data.attachments || [];
        elements.riskAttachmentsList.innerHTML = attachments.length ? attachments.map(item => `<article class="nca-attachment-item">
            <div class="nca-attachment-icon" aria-hidden="true">${/image/i.test(item.file_type || "") ? "IMG" : /pdf/i.test(item.file_type || "") ? "PDF" : /sheet|excel/i.test(item.file_type || "") ? "XLS" : "DOC"}</div>
            <div><h3>${escapeHtml(item.file_name)}</h3><p>${Math.max(1,Math.ceil(Number(item.file_size || 0) / 1024))} KB · Uploaded ${escapeHtml(formatDateTime(item.uploaded_at))}</p></div>
        </article>`).join("") : '<div class="nca-record-empty"><strong>No attachments uploaded</strong><span>Add supporting evidence using the upload control above.</span></div>';
    } catch (error) {
        console.error(error);
        elements.riskAttachmentsDialog.close();
        showToast(error.message || "Unable to load attachments.", "error");
    }
}

async function showAttachments(id) {
    const risk = state.risks.find(item => Number(item.id) === Number(id));
    if (!risk) return showToast("Risk not found.", "error");
    state.attachmentRiskId = Number(id);
    elements.riskAttachmentsTitle.textContent = "Risk attachments";
    elements.riskAttachmentsIdentity.textContent = `${risk.risk_id} · ${risk.risk_title}`;
    elements.riskAttachmentInput.value = "";
    elements.riskAttachmentUpload.hidden = !["System Administrator","Risk Champion","Risk Focal Person"].includes(currentUser.role);
    elements.riskAttachmentsList.innerHTML = '<div class="nca-record-empty">Loading attachments…</div>';
    elements.riskAttachmentsDialog.showModal();
    await loadAttachments(id);
}

function readAttachment(file) {
    return new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("The attachment could not be read."));
        reader.readAsDataURL(file);
    });
}

async function uploadRiskAttachment() {
    const file = elements.riskAttachmentInput.files?.[0];
    if (!file) return showToast("Choose an attachment first.", "error");
    if (file.size > 8 * 1024 * 1024) return showToast("The attachment must be 8 MB or smaller.", "error");
    const allowed = ["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","image/png","image/jpeg","image/gif","image/webp"];
    if (file.type && !allowed.includes(file.type)) return showToast("Only PDF, Word, Excel, and image attachments are allowed.", "error");
    try {
        elements.uploadRiskAttachment.disabled = true;
        const data = await readAttachment(file);
        const response = await apiRequest(`/risks/${state.attachmentRiskId}/attachments`,{method:"POST",body:JSON.stringify({file_name:file.name,file_type:file.type,file_size:file.size,file_data:data})});
        showToast(response.message || "Attachment uploaded successfully.");
        elements.riskAttachmentInput.value = "";
        await loadAttachments(state.attachmentRiskId);
    } catch (error) {
        showToast(error.message || "Unable to upload attachment.", "error");
    } finally {
        elements.uploadRiskAttachment.disabled = false;
    }
}

function closeClosureDialog() {
    elements.closureModal.style.display = "none";
    elements.closureModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    state.closingRiskId = null;
}

function closeRisk(id) {
    const risk = state.risks.find(item => Number(item.id) === Number(id));

    if (!risk) {
        showToast("Risk not found.", "error");
        return;
    }

    state.closingRiskId = risk.id;
    elements.closureRiskSummary.textContent = `${risk.risk_id} — ${risk.risk_title}`;
    elements.closureDateInput.value = new Date().toISOString().slice(0, 10);
    elements.closureCommentsInput.value = "";
    elements.closureModal.style.display = "flex";
    elements.closureModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    window.setTimeout(() => elements.closureCommentsInput.focus(), 50);
}

async function confirmRiskClosure() {
    const comments = elements.closureCommentsInput.value.trim();
    if (!comments) {
        showToast("Closure rationale and evidence summary are required.", "error");
        elements.closureCommentsInput.focus();
        return;
    }

    try {
        elements.confirmClosureBtn.disabled = true;

        const data = await apiRequest(`/risks/${state.closingRiskId}/close`, {
            method: "PATCH",
            body: JSON.stringify({
                closure_date: elements.closureDateInput.value,
                closure_comments: comments
            })
        });

        closeClosureDialog();
        localStorage.setItem("ncaRiskDataVersion", String(Date.now()));
        showToast(data.message || "Risk closed successfully.");
        await loadRisks();
    } catch (error) {
        console.error(error);
        showToast(error.message || "Unable to close risk.", "error");
    } finally {
        elements.confirmClosureBtn.disabled = false;
    }
}

function effectiveAssessmentRole(risk) {
    if (currentUser.role !== "System Administrator") return currentUser.role;
    if (risk.review_stage === "Awaiting Champion Review") return "Risk Champion";
    if (risk.review_stage === "Awaiting Chairman Review") return "Risk Committee Chairman";
    return "Risk Focal Person";
}

function openAssessmentDecision(id) {
    const risk = state.risks.find(item => Number(item.id) === Number(id));
    if (!risk) return showToast("Risk not found.", "error");
    state.assessmentRiskId = risk.id;
    const role = effectiveAssessmentRole(risk);
    const roleLabel = role === "Risk Committee Chairman" ? "Chairman Final Review" : role.replace("Risk ", "");
    elements.assessmentDecisionTitle.textContent = roleLabel;
    elements.assessmentDecisionRisk.textContent = `${risk.risk_id} · ${risk.risk_title}`;

    const baseline = [
        ["System",risk.system_likelihood,risk.system_impact,risk.system_score,risk.assessment_explanation],
        ...(role === "Risk Committee Chairman" ? [] : [["Focal Person",risk.focal_likelihood,risk.focal_impact,risk.focal_score,risk.focal_reason]]),
        ["Risk Champion",risk.champion_likelihood,risk.champion_impact,risk.champion_score,risk.champion_reason]
    ];
    elements.assessmentBaselineCards.innerHTML = baseline.map(([label,likelihood,impact,score,reason]) => `
        <article class="assessment-baseline-card ${score ? getScoreFillClass(score) : "risk-score-unavailable"}">
            <span>${escapeHtml(label)}</span>
            <strong>${score ? `L${likelihood} × I${impact} = ${score}` : "Awaiting assessment"}</strong>
            <p>${escapeHtml(reason || "No decision has been recorded.")}</p>
        </article>
    `).join("");

    const options = role === "Risk Focal Person"
        ? [["System","Accept System Assessment"],["Adjusted","Submit My Assessment"]]
        : role === "Risk Champion"
            ? [["System","Accept System Assessment"],...(risk.focal_score ? [["Focal","Accept Focal Person Assessment"]] : []),["Adjusted","Record Champion Assessment"]]
            : [["System","Use System Assessment"],...(risk.champion_score ? [["Champion","Use Champion Assessment"]] : []),["Adjusted","Record Final Chairman Assessment"]];
    elements.assessmentSelection.innerHTML = options.map(([value,label]) => `<option value="${value}">${label}</option>`).join("");
    const savedBatchDecision = role === "Risk Champion" && risk.import_batch_id && risk.champion_decision;
    elements.assessmentSelection.value = savedBatchDecision
        ? risk.champion_decision
        : role === "Risk Champion" && risk.focal_score
            ? "Focal"
            : role === "Risk Committee Chairman" && risk.champion_score ? "Champion" : "System";
    elements.assessmentLikelihood.value = savedBatchDecision && risk.champion_decision === "Adjusted" ? risk.champion_likelihood : "";
    elements.assessmentImpact.value = savedBatchDecision && risk.champion_decision === "Adjusted" ? risk.champion_impact : "";
    elements.assessmentReason.value = savedBatchDecision ? (risk.champion_reason || "") : "";
    elements.saveAssessmentDecision.textContent = role === "Risk Champion" && risk.import_batch_id
        ? "Save Champion Review"
        : "Record Decision";
    elements.assessmentReasonRequirement.textContent = role === "Risk Committee Chairman" ? "(required for an adjusted final assessment)" : "(optional)";
    elements.assessmentCategoryField.hidden = role !== "Risk Focal Person";
    elements.assessmentCategory.innerHTML = CATEGORIES.map(category => `<option${category === risk.risk_category ? " selected" : ""}>${escapeHtml(category)}</option>`).join("");
    updateAssessmentSelection();
    elements.assessmentDecisionDialog.showModal();
}

function updateAssessmentSelection() {
    const adjusted = elements.assessmentSelection.value === "Adjusted";
    elements.assessmentAdjustedFields.hidden = !adjusted;
}

async function saveAssessmentDecision() {
    const risk = state.risks.find(item => Number(item.id) === Number(state.assessmentRiskId));
    if (!risk) return;
    const role = effectiveAssessmentRole(risk);
    const payload = {
        selection: elements.assessmentSelection.value,
        likelihood: Number(elements.assessmentLikelihood.value) || null,
        impact: Number(elements.assessmentImpact.value) || null,
        reason: elements.assessmentReason.value.trim(),
        risk_category: role === "Risk Focal Person" ? elements.assessmentCategory.value : undefined,
        review_role: currentUser.role === "System Administrator" ? role : undefined
    };
    try {
        elements.saveAssessmentDecision.disabled = true;
        const data = await apiRequest(`/risks/${risk.id}/assessment-decision`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
        elements.assessmentDecisionDialog.close();
        state.assessmentRiskId = null;
        showToast(data.message || "Assessment decision recorded.");
        await Promise.all([loadImportBatches(),loadRisks({preservePage:true})]);
    } catch (error) {
        showToast(error.message || "Unable to record the assessment decision.", "error");
    } finally {
        elements.saveAssessmentDecision.disabled = false;
    }
}

function bindEvents() {
    document.getElementById("assessmentRules").addEventListener("click", () => document.getElementById("rulesDialog").showModal());
    document.getElementById("closeRulesDialog").addEventListener("click", () => document.getElementById("rulesDialog").close());
    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "../index.html";
    });

    if (elements.importRiskBtn) {
        elements.importRiskBtn.addEventListener("click", () => {
            openImportDialog();
            elements.riskWorkbookInput.click();
        });
    }
    elements.chooseWorkbookBtn.addEventListener("click", () => elements.riskWorkbookInput.click());
    elements.riskWorkbookInput.addEventListener("change", event => {
        const file = event.target.files && event.target.files[0];
        if (file) previewWorkbook(file);
    });
    elements.closeImportModal.addEventListener("click", closeImportDialog);
    elements.cancelImportBtn.addEventListener("click", closeImportDialog);
    elements.confirmImportBtn.addEventListener("click", importValidatedWorkbook);
    elements.correctionWorkspace.addEventListener("change", handleCorrectionWorkspaceChange);
    elements.confirmAllCorrections.addEventListener("click", confirmAllValidCorrections);
    elements.importRiskModal.addEventListener("click", event => {
        if (event.target === elements.importRiskModal) closeImportDialog();
    });
    elements.importBatchFilter.addEventListener("change", () => {
        state.selectedImportBatchId = elements.importBatchFilter.value;
        renderImportBatches();
        loadRisks();
    });
    elements.approveImportBatch.addEventListener("click", openImportBatchApproval);
    elements.cancelImportBatchApproval.addEventListener("click", () => elements.importBatchApprovalDialog.close());
    elements.confirmImportBatchApproval.addEventListener("click", approveSelectedImportBatch);
    elements.workplanFocalBulkFilter.addEventListener("change", () => {
        state.selectedWorkplanUploadId = elements.workplanFocalBulkFilter.value;
        renderWorkplanFocalBulk();
    });
    elements.openWorkplanFocalBulk.addEventListener("click", openWorkplanFocalBulkDialog);
    elements.cancelWorkplanFocalBulk.addEventListener("click", () => elements.workplanFocalBulkDialog.close());
    elements.confirmWorkplanFocalBulk.addEventListener("click", submitAllWorkplanFocalAssessments);
    elements.openChampionBulk.addEventListener("click", openChampionBulkDialog);
    elements.cancelChampionBulk.addEventListener("click", () => elements.championBulkDialog.close());
    elements.confirmChampionBulk.addEventListener("click", submitChampionReviewsBulk);
    elements.committeeApproveRisks.addEventListener("click",openCommitteeBulkApproval);
    document.getElementById("cancelCommitteeBulk").addEventListener("click",()=>elements.committeeBulkApprovalDialog.close());
    document.getElementById("confirmCommitteeBulk").addEventListener("click",confirmCommitteeBulkApproval);
    elements.clearFiltersBtn.addEventListener("click", clearAllFilters);
    elements.closeModal.addEventListener("click", closeModal);
    elements.closeModalBtn.addEventListener("click", closeModal);
    elements.saveRisk.addEventListener("click", () => saveRisk("Draft"));
    elements.submitRisk.addEventListener("click", () => saveRisk("Submitted"));
    elements.dismissClosureModal.addEventListener("click", closeClosureDialog);
    elements.cancelClosureBtn.addEventListener("click", closeClosureDialog);
    elements.confirmClosureBtn.addEventListener("click", confirmRiskClosure);
    elements.confirmRiskApproval.addEventListener("click", confirmRiskReview);
    elements.cancelRiskApproval.addEventListener("click", () => elements.riskApprovalDialog.close());
    elements.closeRiskView.addEventListener("click", () => elements.riskViewDialog.close());
    elements.riskViewDialog.addEventListener("click", event => {
        if (event.target === elements.riskViewDialog) elements.riskViewDialog.close();
    });
    [elements.closeRiskHistory,elements.dismissRiskHistory].forEach(button => button.addEventListener("click",() => elements.riskHistoryDialog.close()));
    elements.riskHistoryDialog.addEventListener("click",event => {
        if (event.target === elements.riskHistoryDialog) elements.riskHistoryDialog.close();
    });
    [elements.closeRiskAttachments,elements.dismissRiskAttachments].forEach(button => button.addEventListener("click",() => elements.riskAttachmentsDialog.close()));
    elements.riskAttachmentsDialog.addEventListener("click",event => {
        if (event.target === elements.riskAttachmentsDialog) elements.riskAttachmentsDialog.close();
    });
    elements.riskAttachmentsDialog.addEventListener("close",() => { state.attachmentRiskId = null; elements.riskAttachmentInput.value = ""; });
    elements.uploadRiskAttachment.addEventListener("click",uploadRiskAttachment);
    elements.riskApprovalDialog.addEventListener("click", event => {
        if (event.target === elements.riskApprovalDialog) elements.riskApprovalDialog.close();
    });
    elements.assessmentSelection.addEventListener("change", updateAssessmentSelection);
    elements.closeAssessmentDecision.addEventListener("click", () => elements.assessmentDecisionDialog.close());
    elements.cancelAssessmentDecision.addEventListener("click", () => elements.assessmentDecisionDialog.close());
    elements.saveAssessmentDecision.addEventListener("click", saveAssessmentDecision);
    elements.closureModal.addEventListener("click", event => {
        if (event.target === elements.closureModal) closeClosureDialog();
    });

    [fields.likelihood, fields.impact].forEach(field => {
        field.addEventListener("change", updateCalculatedFields);
    });

    elements.searchInput.addEventListener("input", scheduleRiskSearch);
    elements.searchInput.addEventListener("input", updateActiveFilterCount);

    [
        elements.directorateFilter,
        elements.levelFilter,
        elements.statusFilter,
        elements.workflowFilter,
        elements.sourceFilter,
        elements.reviewStageFilter
    ].forEach(field => {
        field.addEventListener("change", loadRisks);
        field.addEventListener("change", updateActiveFilterCount);
    });

    elements.prevPage.addEventListener("click", () => {
        if (state.currentPage > 1) {
            state.currentPage -= 1;
            renderRisks();
        }
    });

    elements.nextPage.addEventListener("click", () => {
        if (state.currentPage < getTotalPages()) {
            state.currentPage += 1;
            renderRisks();
        }
    });

    elements.table.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");

        if (!button) return;

        if (button.dataset.action === "view") {
            viewRisk(button.dataset.id);
        }

        if (button.dataset.action === "edit") {
            editRisk(button.dataset.id);
        }

        if (button.dataset.action === "history") {
            showHistory(button.dataset.id);
        }

        if (button.dataset.action === "attachments") {
            showAttachments(button.dataset.id);
        }

        if (button.dataset.action === "assessment") {
            openAssessmentDecision(button.dataset.id);
        }

        if (button.dataset.action === "delete") {
            closeRisk(button.dataset.id);
        }

        if (["approve", "reject", "return"].includes(button.dataset.action)) {
            reviewRisk(button.dataset.id, button.dataset.action);
        }
    });

    document.querySelectorAll("th[data-sort]").forEach(header => {
        header.addEventListener("click", () => {
            const key = header.dataset.sort;

            if (state.sortKey === key) {
                state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
            } else {
                state.sortKey = key;
                state.sortDirection = "asc";
            }

            renderRisks();
        });
    });

    elements.modal.addEventListener("click", event => {
        if (event.target === elements.modal) {
            closeModal();
        }
    });
}

setLoggedInUser();
updateActiveFilterCount();
bindEvents();
Promise.all([loadImportBatches(),loadRisks()]);
