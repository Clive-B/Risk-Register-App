const app = window.NCAGRC;
const currentUser = app.getUser();

if (!app.getToken()) window.location.href = "../index.html";
if (window.NCAGRC_ACCESS_DENIED) throw new Error("Access denied.");

const state = {
    risks: [],
    filteredRisks: [],
    isLoading: false,
    selectedRiskId: null,
    lastLoadedAt: 0,
    requestSequence: 0
};

const elements = {
    acceptedRisks: document.getElementById("acceptedRisks"),
    assessedRisks: document.getElementById("assessedRisks"),
    assessmentTable: document.getElementById("assessmentTable"),
    averageScore: document.getElementById("averageScore"),
    closedRisks: document.getElementById("closedRisks"),
    directorateFilter: document.getElementById("directorateFilter"),
    emptyState: document.getElementById("emptyState"),
    escalatedRisks: document.getElementById("escalatedRisks"),
    heatMap: document.getElementById("heatMap"),
    heatMapHint: document.getElementById("heatMapHint"),
    heatMapTotal: document.getElementById("heatMapTotal"),
    highRiskProgrammes: document.getElementById("highRiskProgrammes"),
    levelFilter: document.getElementById("levelFilter"),
    loadingState: document.getElementById("loadingState"),
    scoreView: document.getElementById("scoreView"),
    searchInput: document.getElementById("searchInput"),
    statusFilter: document.getElementById("statusFilter"),
    toastContainer: document.getElementById("toastContainer"),
    userInfo: document.getElementById("userInfo")
};

const likelihoodLabels = { 1: "Rare (Very Low)", 2: "Unlikely (Low)", 3: "Possible (Medium)", 4: "Likely (High)", 5: "Almost Certain (Very High)" };
const impactLabels = { 1: "Insignificant (Very Low)", 2: "Minor (Low)", 3: "Moderate (Medium)", 4: "Major (High)", 5: "Catastrophic (Very High)" };
const highRiskBuckets = [
    { score: 20, likelihood: 4, impact: 5 },
    { score: 20, likelihood: 5, impact: 4 },
    { score: 25, likelihood: 5, impact: 5 }
];
const { programmeEntries } = window.NCAGRCAssessmentAggregation;
const initialOptions = new URLSearchParams(window.location.search);
const requestedRisk = initialOptions.get("risk");

if (["active", "closed", "all"].includes(initialOptions.get("status"))) {
    elements.statusFilter.value = initialOptions.get("status");
}
if (["residual", "inherent"].includes(initialOptions.get("view"))) {
    elements.scoreView.value = initialOptions.get("view");
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);
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

function isClosed(risk) {
    return String(risk.status || risk.workflow_status || "").toLowerCase() === "closed" || Boolean(risk.closure_date);
}

function scoreCoordinates(risk) {
    if (elements.scoreView.value === "residual") {
        const likelihood = Number(risk.residual_likelihood || risk.current_likelihood || risk.likelihood);
        const impact = Number(risk.residual_impact || risk.current_impact || risk.impact);
        return { likelihood, impact, score: likelihood * impact };
    }
    const likelihood = Number(risk.likelihood);
    const impact = Number(risk.impact);
    return { likelihood, impact, score: likelihood * impact };
}

function calculateRiskLevel(score) {
    return app.riskMatrix.calculateLevel(score);
}

function getLevelClass(level) {
    return String(level || "").toLowerCase();
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function setLoggedInUser() {
    if (!currentUser) return;
    app.renderUserProfile(elements.userInfo, currentUser);
    const title = document.getElementById("heatMapPageTitle");
    const subtitle = document.getElementById("heatMapPageSubtitle");
    if (currentUser.role === app.roles.CHAIRMAN) {
        title.textContent = "Enterprise Risk Heat Map";
        subtitle.textContent = "Authority-wide likelihood, impact and residual-risk oversight across every division";
    } else if (currentUser.role === app.roles.CHAMPION) {
        title.textContent = "Division Risk Heat Map";
        subtitle.textContent = "Likelihood, impact and residual-risk oversight for your assigned division";
    }
    if (![app.roles.ADMIN, app.roles.CHAIRMAN].includes(currentUser.role)) {
        elements.directorateFilter.value = currentUser.directorate || currentUser.division || "";
        elements.directorateFilter.disabled = true;
    }
}

function setLoading(isLoading) {
    state.isLoading = isLoading;
    elements.loadingState.style.display = isLoading ? "block" : "none";
}

function buildQueryString() {
    const params = new URLSearchParams();
    const search = elements.searchInput.value.trim();
    const directorate = elements.directorateFilter.value;
    if (search) params.set("search", search);
    if (directorate && [app.roles.ADMIN, app.roles.CHAIRMAN].includes(currentUser.role)) params.set("directorate", directorate);
    const query = params.toString();
    return query ? `?${query}` : "";
}

function applyViewFilters() {
    const statusMode = elements.statusFilter.value;
    const level = elements.levelFilter.value;
    state.filteredRisks = state.risks.filter(risk => {
        const closed = isClosed(risk);
        const matchesStatus = statusMode === "all" || (statusMode === "closed" ? closed : !closed);
        const matchesLevel = !level || calculateRiskLevel(scoreCoordinates(risk).score) === level;
        return matchesStatus && matchesLevel;
    });
    if (!state.selectedRiskId && requestedRisk) {
        const requested = state.filteredRisks.find(risk => String(risk.id) === requestedRisk || String(risk.risk_id) === requestedRisk);
        if (requested) state.selectedRiskId = Number(requested.id);
    }
    if (!state.filteredRisks.some(risk => Number(risk.id) === Number(state.selectedRiskId))) {
        state.selectedRiskId = null;
    }
    renderAssessment();
}

async function loadAssessments({ silent = false } = {}) {
    const sequence = ++state.requestSequence;
    try {
        if (!silent) setLoading(true);
        const data = await app.apiRequest(`/risks${buildQueryString()}`);
        if (sequence !== state.requestSequence) return;
        state.risks = data.risks || [];
        state.lastLoadedAt = Date.now();
        applyViewFilters();
    } catch (error) {
        if (sequence !== state.requestSequence) return;
        console.error(error);
        showToast(error.message || "Unable to load assessments.", "error");
    } finally {
        if (sequence === state.requestSequence) setLoading(false);
    }
}

function renderAssessment() {
    updateStats();
    renderHighRiskProgrammes();
    renderHeatMap();
    renderTable();
}

function updateStats() {
    const visible = state.filteredRisks;
    const scoreTotal = visible.reduce((sum, risk) => sum + scoreCoordinates(risk).score, 0);
    elements.assessedRisks.textContent = visible.length;
    elements.averageScore.textContent = visible.length ? (scoreTotal / visible.length).toFixed(1) : "0";
    elements.acceptedRisks.textContent = visible.filter(isAcceptedRisk).length;
    elements.escalatedRisks.textContent = visible.filter(shouldEscalateRisk).length;
    elements.closedRisks.textContent = state.risks.filter(isClosed).length;
    const label = elements.statusFilter.value === "active" ? "active risks" : elements.statusFilter.value === "closed" ? "closed risks" : "risks";
    const programmeCount = programmeEntries(visible).length;
    elements.heatMapTotal.textContent = `${programmeCount} ${programmeCount === 1 ? "programme" : "programmes"} · ${visible.length} ${label}`;
}

function risksInCell(likelihood, impact) {
    return state.filteredRisks.filter(risk => {
        const coordinates = scoreCoordinates(risk);
        return coordinates.likelihood === likelihood && coordinates.impact === impact;
    });
}

function renderHighRiskProgrammes() {
    elements.highRiskProgrammes.innerHTML = highRiskBuckets.map(bucket => {
        const entries = programmeEntries(risksInCell(bucket.likelihood, bucket.impact));
        const programmes = entries.length
            ? `<ul>${entries.map(entry => {
                const firstRisk = entry.risks[0];
                const detail = entry.unassigned
                    ? [firstRisk?.risk_id, firstRisk?.risk_title].filter(Boolean).join(" · ")
                    : `${entry.risks.length} ${entry.risks.length === 1 ? "risk" : "risks"}`;
                return `<li><button type="button" data-risk-id="${escapeHtml(firstRisk?.id)}"><strong>${escapeHtml(entry.label)}</strong><small>${escapeHtml(detail)}</small></button></li>`;
            }).join("")}</ul>`
            : `<p class="high-risk-empty">No programmes at this score.</p>`;
        return `
            <article class="high-risk-bucket">
                <header>
                    <div><span>Risk score</span><strong>${bucket.score}</strong></div>
                    <small>L${bucket.likelihood} × I${bucket.impact}</small>
                </header>
                ${programmes}
            </article>`;
    }).join("");
    elements.highRiskProgrammes.querySelectorAll("[data-risk-id]").forEach(button => {
        button.addEventListener("click", () => selectRisk(button.dataset.riskId, { focusRow: true }));
    });
}

function renderHeatMap() {
    elements.heatMap.innerHTML = "";
    const selected = state.filteredRisks.find(risk => Number(risk.id) === Number(state.selectedRiskId));
    const selectedCoordinates = selected ? scoreCoordinates(selected) : null;

    for (let impact = 5; impact >= 1; impact -= 1) {
        for (let likelihood = 1; likelihood <= 5; likelihood += 1) {
            const score = likelihood * impact;
            const cellRisks = risksInCell(likelihood, impact);
            const cellProgrammes = programmeEntries(cellRisks);
            const isSelected = selectedCoordinates?.likelihood === likelihood && selectedCoordinates?.impact === impact;
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = `heat-cell ${getLevelClass(calculateRiskLevel(score))}${isSelected ? " selected" : ""}`;
            cell.disabled = cellRisks.length === 0;
            cell.dataset.likelihood = likelihood;
            cell.dataset.impact = impact;
            cell.setAttribute("aria-label", `${cellProgrammes.length} programmes, likelihood ${likelihood}, impact ${impact}, score ${score}${isSelected ? ", selected" : ""}`);
            cell.innerHTML = `<small><b>${cellProgrammes.length}</b><em>${cellProgrammes.length === 1 ? "programme" : "programmes"}</em></small><span>L${likelihood} × I${impact}</span><strong>${score}</strong>`;
            if (cellRisks.length) {
                cell.addEventListener("click", () => {
                    const current = cellRisks.find(risk => Number(risk.id) === Number(state.selectedRiskId));
                    const index = current ? cellRisks.indexOf(current) : -1;
                    selectRisk(cellRisks[(index + 1) % cellRisks.length].id, { focusRow: true });
                });
            }
            elements.heatMap.appendChild(cell);
        }
    }

    elements.heatMapHint.textContent = selected
        ? `${selected.risk_id} is highlighted at ${elements.scoreView.value} score ${selectedCoordinates.score} (L${selectedCoordinates.likelihood} × I${selectedCoordinates.impact}).`
        : "Select a risk row to highlight its position on the heat map.";
}

function selectRisk(id, { focusRow = false } = {}) {
    state.selectedRiskId = Number(id);
    renderHeatMap();
    renderTable();
    if (focusRow) {
        const row = elements.assessmentTable.querySelector(`[data-risk-id="${CSS.escape(String(id))}"]`);
        row?.focus({ preventScroll: false });
    }
}

function renderTable() {
    elements.assessmentTable.innerHTML = "";
    state.filteredRisks.forEach(risk => {
        const row = document.createElement("tr");
        const decision = getDecision(risk);
        const coordinates = scoreCoordinates(risk);
        const closed = isClosed(risk);
        const selected = Number(risk.id) === Number(state.selectedRiskId);
        row.tabIndex = 0;
        row.dataset.riskId = risk.id;
        row.className = selected ? "selected-risk" : "";
        row.setAttribute("aria-selected", String(selected));
        row.innerHTML = `
            <td><strong>${escapeHtml(risk.risk_id)}</strong></td>
            <td><strong>${escapeHtml(risk.risk_title)}</strong><br><small>${escapeHtml(risk.risk_category)}</small></td>
            <td>${escapeHtml(risk.division || risk.directorate)}</td>
            <td>${coordinates.likelihood} - ${escapeHtml(likelihoodLabels[coordinates.likelihood])}</td>
            <td>${coordinates.impact} - ${escapeHtml(impactLabels[coordinates.impact])}</td>
            <td><span class="score-pill">${escapeHtml(risk.inherent_risk_score)}</span></td>
            <td><span class="score-pill muted">${escapeHtml(risk.residual_score || risk.residual_risk_score || "—")}</span></td>
            <td><span class="level-badge ${getLevelClass(calculateRiskLevel(coordinates.score))}">${escapeHtml(calculateRiskLevel(coordinates.score))}</span></td>
            <td><span class="decision-badge ${decision.className}">${escapeHtml(decision.label)}</span></td>
            <td><span class="status-badge ${closed ? "closed" : "active"}">${closed ? "Closed" : "Active"}</span></td>
            <td>${escapeHtml(formatDate(risk.closure_date))}</td>`;
        row.addEventListener("click", () => selectRisk(risk.id));
        row.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectRisk(risk.id);
            }
        });
        elements.assessmentTable.appendChild(row);
    });
    elements.emptyState.style.display = !state.isLoading && !state.filteredRisks.length ? "block" : "none";
}

function isAcceptedRisk(risk) {
    return risk.status === "Accepted" || risk.risk_treatment === "Tolerate";
}

function shouldEscalateRisk(risk) {
    return !isClosed(risk) && calculateRiskLevel(scoreCoordinates(risk).score) === "High";
}

function getDecision(risk) {
    if (isClosed(risk)) return { label: "Closed", className: "closed" };
    if (isAcceptedRisk(risk)) return { label: "Accepted", className: "accepted" };
    if (shouldEscalateRisk(risk)) return { label: "Escalate", className: "escalate" };
    return { label: "Monitor", className: "monitor" };
}

function debounce(callback, delay) {
    let timer;
    return (...args) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => callback(...args), delay);
    };
}

function bindEvents() {
    const search = debounce(() => loadAssessments(), 300);
    elements.searchInput.addEventListener("input", search);
    elements.directorateFilter.addEventListener("change", () => loadAssessments());
    elements.levelFilter.addEventListener("change", applyViewFilters);
    elements.statusFilter.addEventListener("change", applyViewFilters);
    elements.scoreView.addEventListener("change", applyViewFilters);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && Date.now() - state.lastLoadedAt > 5000) loadAssessments({ silent: true });
    });
    window.addEventListener("focus", () => {
        if (Date.now() - state.lastLoadedAt > 5000) loadAssessments({ silent: true });
    });
    window.addEventListener("storage", event => {
        if (event.key === "ncaRiskDataVersion") loadAssessments({ silent: true });
    });
}

setLoggedInUser();
bindEvents();
loadAssessments();
