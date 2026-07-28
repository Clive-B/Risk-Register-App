const API_URL = window.NCAGRC.API_URL;

const ROLES = [
    "System Administrator",
    "Risk Committee Chairman",
    "Risk Champion",
    "Risk Focal Person"
];
const GLOBAL_ROLES = ["System Administrator","Risk Committee Chairman"];

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

const NCA_EMAIL_PATTERN = /^[a-z0-9]+(?:[._%+-][a-z0-9]+)*@nca\.org\.gh$/i;
const NCA_PHONE_PATTERN = /^(?:020|024|025|026|027|050|053|054|055|056|057|059)\d{7}$/;

const state = {
    users: [],
    filteredUsers: [],
    editingUserId: null,
    resettingUserId: null,
    bulk: {
        mode: "manual",
        request: null,
        preview: null,
        workbook: null,
        confirmed: new Set()
    },
    currentPage: 1,
    pageSize: 12,
    isLoading: false
};

const token = localStorage.getItem("token");

if (!token) {
    window.location.href = "../index.html";
}

if (window.NCAGRC_ACCESS_DENIED) {
    throw new Error("Access denied.");
}

const elements = {
    addUserBtn: document.getElementById("addUserBtn"),
    bulkUserBtn: document.getElementById("bulkUserBtn"),
    closeModal: document.getElementById("closeModal"),
    closeModalBtn: document.getElementById("closeModalBtn"),
    emptyState: document.getElementById("emptyState"),
    loadingState: document.getElementById("loadingState"),
    modal: document.getElementById("userModal"),
    modalTitle: document.getElementById("modalTitle"),
    nextPage: document.getElementById("nextPage"),
    pageInfo: document.getElementById("pageInfo"),
    paginationSummary: document.getElementById("paginationSummary"),
    prevPage: document.getElementById("prevPage"),
    saveUser: document.getElementById("saveUser"),
    searchInput: document.getElementById("searchInput"),
    statusGroup: document.getElementById("statusGroup"),
    divisionGroup: document.getElementById("divisionGroup"),
    globalScopeGroup: document.getElementById("globalScopeGroup"),
    table: document.getElementById("usersTable"),
    toastContainer: document.getElementById("toastContainer"),
    userInfo: document.getElementById("userInfo")
};

const fields = {
    staff_id: document.getElementById("staff_id"),
    full_name: document.getElementById("full_name"),
    email: document.getElementById("email"),
    phone: document.getElementById("phone"),
    role: document.getElementById("role"),
    directorate: document.getElementById("directorate"),
    position: document.getElementById("position"),
    password: document.getElementById("password"),
    force_password_change: document.getElementById("force_password_change"),
    status: document.getElementById("status")
};

function setLoggedInUser() {
    const currentUser = JSON.parse(localStorage.getItem("user"));

    if (!currentUser || !elements.userInfo) return;

    elements.userInfo.innerHTML = `
        <strong>${escapeHtml(currentUser.full_name)}</strong>
        <br>
        <small>${escapeHtml(currentUser.role)}</small>
    `;
}

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

function setLoading(isLoading) {
    state.isLoading = isLoading;
    elements.loadingState.style.display = isLoading ? "block" : "none";
    elements.saveUser.disabled = isLoading;
    elements.addUserBtn.disabled = isLoading;
    if (elements.bulkUserBtn) elements.bulkUserBtn.disabled = isLoading;
}

async function loadUsers() {
    try {
        setLoading(true);

        const data = await apiRequest("/users");
        state.users = data.users || [];

        applySearch();
        updateStats();
    } catch (error) {
        console.error(error);
        showToast(error.message || "Unable to load users.", "error");
    } finally {
        setLoading(false);
        renderUsers();
    }
}

function updateStats() {
    document.getElementById("totalUsers").textContent = state.users.length;
    document.getElementById("totalAdmins").textContent =
        state.users.filter(user => user.role === "System Administrator").length;
    document.getElementById("totalChampions").textContent =
        state.users.filter(user => user.role === "Risk Champion").length;
    document.getElementById("totalFocals").textContent =
        state.users.filter(user => user.role === "Risk Focal Person").length;
}

function applySearch() {
    const keyword = elements.searchInput.value.trim().toLowerCase();

    state.filteredUsers = state.users.filter(user => {
        const values = [
            user.staff_id,
            user.full_name,
            user.email,
            user.role,
            user.directorate,
            user.status
        ];

        return values.some(value => String(value || "").toLowerCase().includes(keyword));
    });

    state.currentPage = 1;
    renderUsers();
}

function getPaginatedUsers() {
    const start = (state.currentPage - 1) * state.pageSize;
    return state.filteredUsers.slice(start, start + state.pageSize);
}

function getTotalPages() {
    return Math.max(Math.ceil(state.filteredUsers.length / state.pageSize), 1);
}

function renderUsers() {
    const totalPages = getTotalPages();

    if (state.currentPage > totalPages) {
        state.currentPage = totalPages;
    }

    const paginatedUsers = getPaginatedUsers();
    elements.table.innerHTML = "";

    paginatedUsers.forEach(user => {
        const row = document.createElement("tr");
        const roleClass = getRoleClass(user.role);
        const statusClass = String(user.status).toLowerCase() === "active" ? "active" : "inactive";
        const divisionLabel = GLOBAL_ROLES.includes(user.role)
            ? "All Divisions"
            : (user.division || user.directorate || "—");

        row.innerHTML = `
            <td>${escapeHtml(user.staff_id || "—")}</td>
            <td>${escapeHtml(user.full_name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(divisionLabel)}</td>
            <td>${escapeHtml(user.position || "—")}</td>
            <td><span class="role-badge ${roleClass}">${escapeHtml(user.role)}</span></td>
            <td>
                <span class="status ${statusClass}">
                    ${escapeHtml(user.activation_status || user.status)}
                </span>
            </td>
            <td>${escapeHtml(user.email_status || "Queued")}</td>
            <td>${user.last_login ? new Date(user.last_login).toLocaleString() : "Never"}</td>
            <td>${escapeHtml(user.password_status)}</td>
            <td>${escapeHtml(user.force_password_change || (user.must_change_password ? "Yes" : "No"))}</td>
            <td>
                <div class="row-actions">
                    <button class="compact-action-btn" type="button" data-action="view" data-id="${user.id}">View</button>
                    <button class="compact-action-btn" type="button" data-action="edit" data-id="${user.id}">Edit</button>
                    <button class="edit-btn" type="button" data-action="reset" data-id="${user.id}">Reset Password</button>
                    <select class="more-actions-select" data-more-actions data-id="${user.id}" aria-label="More actions for ${escapeHtml(user.full_name)}">
                        <option value="">More Actions</option>
                        <option value="generate">Generate Temporary Password</option>
                        <option value="resend">Resend Welcome Email</option>
                        <option value="activate">Activate</option>
                        <option value="lock">Lock</option>
                        <option value="unlock" ${user.locked_until ? "" : "disabled"}>Unlock</option>
                        <option value="audit">Audit History</option>
                        <option value="delete">Deactivate</option>
                    </select>
                </div>
            </td>
        `;

        elements.table.appendChild(row);
    });

    renderPagination();
    elements.emptyState.style.display = !state.isLoading && state.filteredUsers.length === 0 ? "block" : "none";
}

function renderPagination() {
    const total = state.filteredUsers.length;
    const totalPages = getTotalPages();
    const start = total === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
    const end = Math.min(state.currentPage * state.pageSize, total);

    elements.paginationSummary.textContent = total === 0
        ? "Showing 0 users"
        : `Showing ${start}-${end} of ${total} users`;

    elements.pageInfo.textContent = `Page ${state.currentPage} of ${totalPages}`;
    elements.prevPage.disabled = state.currentPage <= 1;
    elements.nextPage.disabled = state.currentPage >= totalPages;
}

function getInitials(fullName) {
    return String(fullName || "")
        .split(" ")
        .filter(Boolean)
        .map(name => name[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
}

function getRoleClass(role) {
    if (role === "System Administrator") return "admin-role";
    if (role === "Risk Champion") return "champion-role";
    if (role === "Risk Focal Person") return "focal-role";
    return "";
}

function resetForm() {
    Object.values(fields).forEach(field => {
        if (field.tagName === "SELECT") {
            field.selectedIndex = 0;
        } else {
            field.value = "";
        }
    });

    fields.password.value = "";
    fields.force_password_change.value = "true";
    fields.status.value = "Active";
    updateRoleScope();
}

function updateRoleScope() {
    const isSystemAdministrator = GLOBAL_ROLES.includes(fields.role.value);
    elements.divisionGroup.hidden = isSystemAdministrator;
    elements.globalScopeGroup.hidden = !isSystemAdministrator;
    fields.directorate.disabled = isSystemAdministrator;
    fields.directorate.required = !isSystemAdministrator;

    if (isSystemAdministrator) fields.directorate.value = "";
}

function openModal(user = null) {
    resetForm();
    state.editingUserId = user ? user.id : null;

    if (user) {
        fields.staff_id.value = user.staff_id || "";
        fields.full_name.value = user.full_name || "";
        fields.email.value = user.email || "";
        fields.phone.value = user.phone || "";
        fields.role.value = user.role || "";
        fields.directorate.value = user.directorate || "";
        fields.position.value = user.position || "";
        fields.status.value = user.status === "Disabled" ? "Inactive" : (user.status || "Active");
        fields.password.value = "";
        updateRoleScope();
        elements.modalTitle.textContent = "Edit User";
        elements.saveUser.textContent = "Update User";
        elements.statusGroup.style.display = "flex";
    } else {
        elements.modalTitle.textContent = "Add New User";
        elements.saveUser.textContent = "Save User";
        elements.statusGroup.style.display = "none";
    }

    elements.modal.style.display = "flex";
    elements.modal.setAttribute("aria-hidden", "false");
    fields.full_name.focus();
}

function closeModal() {
    elements.modal.style.display = "none";
    elements.modal.setAttribute("aria-hidden", "true");
    state.editingUserId = null;
    resetForm();
}

function getFormPayload() {
    const isSystemAdministrator = GLOBAL_ROLES.includes(fields.role.value);
    const division = isSystemAdministrator ? null : fields.directorate.value;

    return {
        staff_id: fields.staff_id.value.trim() || null,
        full_name: fields.full_name.value.trim(),
        email: fields.email.value.trim().toLowerCase(),
        phone: fields.phone.value.trim(),
        role: fields.role.value,
        directorate: division,
        position: fields.position.value.trim(),
        division,
        status: fields.status.value || "Active",
        force_password_change: true
    };
}

function validateForm(payload) {
    if (!payload.full_name) return "Full name is required.";
    if (!payload.email) return "Email is required.";
    if (!NCA_EMAIL_PATTERN.test(payload.email)) return "Only official NCA email addresses (@nca.org.gh) are permitted.";
    if (!ROLES.includes(payload.role)) return "Select a valid role.";
    if (!GLOBAL_ROLES.includes(payload.role) && !DIRECTORATES.includes(payload.directorate)) return "Select a valid division.";
    if (payload.phone && !NCA_PHONE_PATTERN.test(payload.phone)) return "Phone number must be exactly 10 digits and start with an approved network code.";
    if (payload.staff_id && payload.staff_id.length > 50) return "Staff ID cannot exceed 50 characters.";

    return "";
}

function openResetModal(id){const user=state.users.find(item=>Number(item.id)===Number(id));if(!user)return;state.resettingUserId=id;document.getElementById('resetUserName').textContent=user.full_name;document.getElementById('resetUserDetails').textContent=`${user.email} · ${user.role}`;document.getElementById('resetModal').style.display='flex';}
function closeResetModal(){document.getElementById('resetModal').style.display='none';state.resettingUserId=null;document.getElementById('adminNewPassword').value='';document.getElementById('adminConfirmPassword').value='';}
async function adminReset(){try{setLoading(true);const data=await apiRequest(`/users/${state.resettingUserId}/reset-password`,{method:'PUT',body:JSON.stringify({newPassword:document.getElementById('adminNewPassword').value,confirmPassword:document.getElementById('adminConfirmPassword').value,forceChange:document.getElementById('forceChange').checked})});showToast(data.message);closeResetModal();await loadUsers();}catch(e){showToast(e.message,'error')}finally{setLoading(false)}}
async function unlockUser(id){try{const data=await apiRequest(`/users/${id}/unlock`,{method:'PUT'});showToast(data.message);await loadUsers()}catch(e){showToast(e.message,'error')}}
async function accountAction(id,action){try{const data=await apiRequest(`/users/${id}/account/${action}`,{method:'PUT'});showToast(data.message);await loadUsers()}catch(e){showToast(e.message,'error')}}
async function viewAuditHistory(id){try{const data=await apiRequest(`/users/${id}/audit-history`);const lines=(data.auditLogs||[]).map(log=>`${new Date(log.created_at).toLocaleString()} — ${log.action} (${log.status})`);window.alert(lines.length?lines.join('\n'):'No audit history found.')}catch(e){showToast(e.message,'error')}}
async function generateTemporaryPassword(id,confirmed=false){if(!confirmed&&!window.confirm('Generate a new temporary password and email it to this user? Existing sessions will be revoked.'))return;try{const data=await apiRequest(`/users/${id}/generate-temporary-password`,{method:'POST'});showToast(data.message);await loadUsers()}catch(e){showToast(e.message,'error')}}
function viewUser(id){const user=state.users.find(item=>Number(item.id)===Number(id));if(!user)return;window.alert([`Name: ${user.full_name}`,`Email: ${user.email}`,`Division: ${user.division||user.directorate||'All Divisions'}`,`Role: ${user.role}`,`Activation: ${user.activation_status||user.status}`,`Password: ${user.password_status}`,`Email: ${user.email_status}`,`Last Login: ${user.last_login?new Date(user.last_login).toLocaleString():'Never'}`].join('\n'))}
async function resendWelcomeEmail(id){if(!window.confirm('For security, resending creates a new temporary password, revokes existing sessions, and emails the new credential. Continue?'))return;await generateTemporaryPassword(id,true)}

async function saveUser() {
    const payload = getFormPayload();
    const validationError = validateForm(payload);

    if (validationError) {
        showToast(validationError, "error");
        return;
    }

    const isEditing = Boolean(state.editingUserId);
    const path = isEditing ? `/users/${state.editingUserId}` : "/users";
    const method = isEditing ? "PUT" : "POST";

    try {
        setLoading(true);

        const data = await apiRequest(path, {
            method,
            body: JSON.stringify(payload)
        });

        showToast(data.message || "User saved successfully.");
        closeModal();
        await loadUsers();
    } catch (error) {
        console.error(error);
        showToast(error.message || "Unable to save user.", "error");
    } finally {
        setLoading(false);
    }
}

function editUser(id) {
    const user = state.users.find(item => Number(item.id) === Number(id));

    if (!user) {
        showToast("User not found.", "error");
        return;
    }

    openModal(user);
}

async function deleteUser(id) {
    const user = state.users.find(item => Number(item.id) === Number(id));

    if (!user) {
        showToast("User not found.", "error");
        return;
    }

    const confirmed = window.confirm(`Deactivate ${user.full_name}?`);

    if (!confirmed) return;

    try {
        setLoading(true);

        const data = await apiRequest(`/users/${id}`, {
            method: "DELETE"
        });

        showToast(data.message || "User deactivated successfully.");
        await loadUsers();
    } catch (error) {
        console.error(error);
        showToast(error.message || "Unable to deactivate user.", "error");
    } finally {
        setLoading(false);
    }
}

const BULK_FIELDS = [
    ["full_name", "Full Name"],
    ["email", "Official Email"],
    ["role", "Role"],
    ["division", "Division"],
    ["position", "Position (optional)"],
    ["staff_id", "Staff ID (optional)"],
    ["phone", "Phone (optional)"],
    ["status", "Status"]
];

function approvedOptions(values, selected, placeholder) {
    return `<option value="">${escapeHtml(placeholder)}</option>${values.map(value =>
        `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`
    ).join("")}`;
}

function addBulkManualRow(values = {}) {
    const tbody = document.getElementById("bulkUserRows");
    const row = document.createElement("tr");
    row.innerHTML = `
        <td><input data-field="full_name" value="${escapeHtml(values.full_name || "")}" placeholder="Full name"></td>
        <td><input data-field="email" type="email" value="${escapeHtml(values.email || "")}" placeholder="name@nca.org.gh"></td>
        <td><select data-field="role">${approvedOptions(ROLES, values.role || "", "Select role")}</select></td>
        <td><select data-field="division">${approvedOptions(DIRECTORATES, values.division || "", "Select division")}</select></td>
        <td><input data-field="position" value="${escapeHtml(values.position || "")}" placeholder="Optional"></td>
        <td><input data-field="staff_id" maxlength="50" value="${escapeHtml(values.staff_id || "")}" placeholder="Leave blank"></td>
        <td><input data-field="phone" maxlength="10" value="${escapeHtml(values.phone || "")}" placeholder="Leave blank"></td>
        <td><select data-field="status">${approvedOptions(["Active", "Inactive"], values.status || "Active", "Select status")}</select></td>
        <td><button class="remove-row-btn" type="button" aria-label="Remove row">&times;</button></td>
    `;
    tbody.appendChild(row);
    updateManualDivisionScope(row);
}

function updateManualDivisionScope(row) {
    const role = row.querySelector('[data-field="role"]').value;
    const division = row.querySelector('[data-field="division"]');
    const global = GLOBAL_ROLES.includes(role);
    division.disabled = global;
    if (global) division.value = "";
}

function collectManualBulkRows() {
    return [...document.querySelectorAll("#bulkUserRows tr")].map((row, index) => {
        const values = { row_key: `manual-${index + 1}` };
        row.querySelectorAll("[data-field]").forEach(input => {
            values[input.dataset.field] = input.value.trim() || null;
        });
        return values;
    }).filter(row => Object.entries(row).some(([key, value]) => key !== "row_key" && value));
}

function resetBulkUserFlow() {
    state.bulk = { mode: "manual", request: null, preview: null, workbook: null, confirmed: new Set() };
    document.getElementById("bulkUserRows").innerHTML = "";
    addBulkManualRow();
    addBulkManualRow();
    document.getElementById("bulkUserWorkbook").value = "";
    document.getElementById("bulkWorkbookFileName").textContent = "No workbook selected.";
    document.getElementById("bulkUserSource").hidden = false;
    document.getElementById("bulkUserReview").hidden = true;
    switchBulkMode("manual");
}

function openBulkUserModal() {
    resetBulkUserFlow();
    const modal = document.getElementById("bulkUserModal");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
}

function closeBulkUserModal() {
    const modal = document.getElementById("bulkUserModal");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    resetBulkUserFlow();
}

function switchBulkMode(mode) {
    state.bulk.mode = mode;
    document.getElementById("manualBulkTab").classList.toggle("active", mode === "manual");
    document.getElementById("workbookBulkTab").classList.toggle("active", mode === "workbook");
    document.getElementById("manualBulkPanel").hidden = mode !== "manual";
    document.getElementById("workbookBulkPanel").hidden = mode !== "workbook";
}

function fileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Unable to read the selected workbook."));
        reader.readAsDataURL(file);
    });
}

async function previewBulkUsers(mode) {
    let request;
    if (mode === "manual") {
        const rows = collectManualBulkRows();
        if (!rows.length) return showToast("Add at least one user before review.", "error");
        request = { mode: "manual", rows };
    } else {
        const file = state.bulk.workbook;
        if (!file) return showToast("Choose an Excel workbook first.", "error");
        if (file.size > 8 * 1024 * 1024) return showToast("The workbook cannot exceed 8 MB.", "error");
        request = { mode: "workbook", file_name: file.name, file_data: await fileAsDataUrl(file) };
    }

    try {
        setLoading(true);
        const data = await apiRequest("/users/bulk/preview", {
            method: "POST",
            body: JSON.stringify(request)
        });
        state.bulk.request = request;
        state.bulk.preview = data.preview;
        state.bulk.confirmed = new Set();
        data.preview.rows.forEach(row => {
            row.initial_values = { ...row.values };
            row.initial_errors = [...(row.errors || [])];
        });
        renderBulkReview();
        document.getElementById("bulkUserSource").hidden = true;
        document.getElementById("bulkUserReview").hidden = false;
    } catch (error) {
        showToast(error.message || "Unable to analyse the proposed users.", "error");
    } finally {
        setLoading(false);
    }
}

function validateBulkReviewRow(row) {
    const values = row.values;
    const errors = [];
    if (!String(values.full_name || "").trim()) errors.push("Full Name is required.");
    if (!NCA_EMAIL_PATTERN.test(String(values.email || "").trim())) errors.push("Enter a valid official @nca.org.gh email.");
    if (!ROLES.includes(values.role)) errors.push("Select an approved role.");
    if (GLOBAL_ROLES.includes(values.role)) {
        if (values.division) errors.push("Division must remain blank for a global role.");
    } else if (!DIRECTORATES.includes(values.division)) {
        errors.push("Select an approved division.");
    }
    if (values.phone && !NCA_PHONE_PATTERN.test(values.phone)) errors.push("A supplied phone must be a valid 10-digit Ghana mobile number.");
    if (values.staff_id && String(values.staff_id).length > 50) errors.push("Staff ID cannot exceed 50 characters.");
    if (!["Active", "Inactive"].includes(values.status)) errors.push("Select Active or Inactive.");

    const rows = state.bulk.preview.rows;
    const email = String(values.email || "").toLowerCase();
    const staffId = String(values.staff_id || "").toLowerCase();
    if (email && rows.filter(item => String(item.values.email || "").toLowerCase() === email).length > 1) errors.push("Email is duplicated within this batch.");
    if (staffId && rows.filter(item => String(item.values.staff_id || "").toLowerCase() === staffId).length > 1) errors.push("Staff ID is duplicated within this batch.");
    if (row.initial_errors.includes("An account with this email already exists.") &&
        email === String(row.initial_values.email || "").toLowerCase()) errors.push("An account with this email already exists.");
    if (row.initial_errors.includes("An account with this Staff ID already exists.") &&
        staffId && staffId === String(row.initial_values.staff_id || "").toLowerCase()) errors.push("An account with this Staff ID already exists.");
    return [...new Set(errors)];
}

function correctionRuleHtml(rule) {
    return `
        <div class="correction-rule">
            <div class="rule-heading">
                <strong>${escapeHtml(rule.mistake_type)}</strong>
                <span class="confidence confidence-${String(rule.confidence_level || "").toLowerCase()}">${escapeHtml(rule.confidence_level)} confidence</span>
            </div>
            <p><b>Detected:</b> ${escapeHtml(rule.detection_rule)}</p>
            <p><b>Proposed:</b> ${escapeHtml(rule.proposed_correction ?? "Blank")}</p>
            <p><b>Why:</b> ${escapeHtml(rule.explanation)}</p>
            <p><b>Validation:</b> ${escapeHtml(rule.validation_rule)}</p>
            <p><b>Audit:</b> ${escapeHtml(rule.audit_record)}</p>
        </div>
    `;
}

function reviewFieldHtml(row, field, label) {
    const value = row.values[field] ?? "";
    let control;
    if (field === "role") control = `<select data-review-field="${field}">${approvedOptions(state.bulk.preview.approved_roles, value, "Choose an approved role")}</select>`;
    else if (field === "division") {
        const global = GLOBAL_ROLES.includes(row.values.role);
        control = `<select data-review-field="${field}" ${global ? "disabled" : ""}>${approvedOptions(state.bulk.preview.approved_divisions, value, global ? "All Divisions" : "Choose an approved division")}</select>`;
    } else if (field === "status") control = `<select data-review-field="${field}">${approvedOptions(state.bulk.preview.approved_statuses, value, "Choose status")}</select>`;
    else control = `<input data-review-field="${field}" value="${escapeHtml(value)}" ${field === "staff_id" ? 'maxlength="50"' : ""} placeholder="${field === "staff_id" || field === "phone" || field === "position" ? "Optional — leave blank" : ""}">`;
    return `<label class="review-field"><span>${escapeHtml(label)}</span>${control}</label>`;
}

function renderBulkReview() {
    const preview = state.bulk.preview;
    if (!preview) return;
    document.getElementById("bulkReviewSource").textContent = preview.sheet_name
        ? `${preview.source} · Sheet: ${preview.sheet_name} · Header row: ${preview.header_row}`
        : preview.source;
    document.getElementById("bulkEducationSteps").innerHTML =
        `<strong>${escapeHtml(preview.education.title)}</strong><ol>${preview.education.steps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`;
    document.getElementById("bulkTotalRows").textContent = preview.summary.total_rows;
    document.getElementById("bulkValidRows").textContent = preview.summary.valid_rows;
    document.getElementById("bulkFailedRows").textContent = preview.summary.failed_rows;

    const container = document.getElementById("bulkCorrectionRows");
    container.innerHTML = preview.rows.map((row, index) => {
        const errors = validateBulkReviewRow(row);
        if (errors.length) state.bulk.confirmed.delete(row.row_key);
        const confirmed = state.bulk.confirmed.has(row.row_key);
        return `
            <article class="bulk-correction-card ${confirmed ? "confirmed" : ""}" data-row-key="${escapeHtml(row.row_key)}">
                <div class="correction-card-header">
                    <div><span>Source row ${escapeHtml(row.source_row)}</span><h4>${escapeHtml(row.values.full_name || "Unnamed proposed user")}</h4></div>
                    <span class="validation-badge ${errors.length ? "invalid" : "valid"}">${errors.length ? `${errors.length} issue${errors.length === 1 ? "" : "s"}` : "Valid"}</span>
                </div>
                <div class="review-fields">${BULK_FIELDS.map(([field, label]) => reviewFieldHtml(row, field, label)).join("")}</div>
                ${errors.length ? `<div class="row-errors">${errors.map(error => `<span>${escapeHtml(error)}</span>`).join("")}</div>` : ""}
                <details class="rule-details" ${row.corrections.length ? "" : "hidden"}>
                    <summary>View ${row.corrections.length} correction rule${row.corrections.length === 1 ? "" : "s"} and explanations</summary>
                    <div class="correction-rules">${row.corrections.map(correctionRuleHtml).join("")}</div>
                </details>
                <div class="row-confirmation">
                    <span>${confirmed ? "Confirmed for account creation" : "Review the values, then confirm this account."}</span>
                    <button class="${confirmed ? "confirmed-btn" : "save-btn"}" data-confirm-row type="button" ${errors.length ? "disabled" : ""}>${confirmed ? "Confirmed ✓" : "Confirm Account"}</button>
                </div>
            </article>
        `;
    }).join("");
    updateBulkConfirmationSummary();
}

function updateBulkConfirmationSummary() {
    const preview = state.bulk.preview;
    const count = state.bulk.confirmed.size;
    document.getElementById("bulkConfirmedRows").textContent = count;
    document.getElementById("createBulkUsers").disabled = !preview || count !== preview.rows.length ||
        preview.rows.some(row => validateBulkReviewRow(row).length);
}

function updateBulkReviewValue(card, input) {
    const row = state.bulk.preview.rows.find(item => item.row_key === card.dataset.rowKey);
    if (!row) return;
    row.values[input.dataset.reviewField] = input.value.trim() || null;
    if (input.dataset.reviewField === "email") row.values.email = String(row.values.email || "").toLowerCase().replace(/\s/g, "");
    if (input.dataset.reviewField === "phone" && row.values.phone) row.values.phone = String(row.values.phone).replace(/\D/g, "");
    if (input.dataset.reviewField === "role" && GLOBAL_ROLES.includes(row.values.role)) row.values.division = null;
    state.bulk.confirmed.delete(row.row_key);
    renderBulkReview();
}

async function createConfirmedBulkUsers() {
    const preview = state.bulk.preview;
    if (!preview || state.bulk.confirmed.size !== preview.rows.length) return;
    const confirmedRows = preview.rows.map(row => ({
        row_key: row.row_key,
        confirmed: true,
        values: Object.fromEntries(BULK_FIELDS.map(([field]) => [field, row.values[field] ?? null]))
    }));
    try {
        setLoading(true);
        const data = await apiRequest("/users/bulk", {
            method: "POST",
            body: JSON.stringify({ ...state.bulk.request, confirmed_rows: confirmedRows })
        });
        showToast(data.message || `${confirmedRows.length} accounts created.`);
        closeBulkUserModal();
        await loadUsers();
    } catch (error) {
        showToast(error.message || "Unable to create the user accounts.", "error");
    } finally {
        setLoading(false);
    }
}

function bindEvents() {
    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "../index.html";
    });

    elements.addUserBtn.addEventListener("click", () => openModal());
    elements.bulkUserBtn.addEventListener("click", openBulkUserModal);
    document.getElementById("closeBulkUserModal").addEventListener("click", closeBulkUserModal);
    document.getElementById("manualBulkTab").addEventListener("click", () => switchBulkMode("manual"));
    document.getElementById("workbookBulkTab").addEventListener("click", () => switchBulkMode("workbook"));
    document.getElementById("addBulkUserRow").addEventListener("click", () => addBulkManualRow());
    document.getElementById("reviewManualUsers").addEventListener("click", () => previewBulkUsers("manual"));
    document.getElementById("reviewWorkbookUsers").addEventListener("click", () => previewBulkUsers("workbook"));
    document.getElementById("returnToBulkSource").addEventListener("click", () => {
        document.getElementById("bulkUserReview").hidden = true;
        document.getElementById("bulkUserSource").hidden = false;
    });
    document.getElementById("bulkUserWorkbook").addEventListener("change", event => {
        state.bulk.workbook = event.target.files[0] || null;
        document.getElementById("bulkWorkbookFileName").textContent = state.bulk.workbook
            ? `${state.bulk.workbook.name} · ${(state.bulk.workbook.size / 1024).toFixed(1)} KB`
            : "No workbook selected.";
    });
    document.getElementById("bulkUserRows").addEventListener("change", event => {
        const row = event.target.closest("tr");
        if (row && event.target.dataset.field === "role") updateManualDivisionScope(row);
    });
    document.getElementById("bulkUserRows").addEventListener("click", event => {
        const button = event.target.closest(".remove-row-btn");
        if (!button) return;
        const rows = document.querySelectorAll("#bulkUserRows tr");
        if (rows.length === 1) return showToast("Keep at least one entry row.", "error");
        button.closest("tr").remove();
    });
    document.getElementById("bulkCorrectionRows").addEventListener("change", event => {
        const input = event.target.closest("[data-review-field]");
        const card = event.target.closest("[data-row-key]");
        if (input && card) updateBulkReviewValue(card, input);
    });
    document.getElementById("bulkCorrectionRows").addEventListener("click", event => {
        const button = event.target.closest("[data-confirm-row]");
        const card = event.target.closest("[data-row-key]");
        if (!button || !card) return;
        const row = state.bulk.preview.rows.find(item => item.row_key === card.dataset.rowKey);
        if (!row || validateBulkReviewRow(row).length) return;
        if (state.bulk.confirmed.has(row.row_key)) state.bulk.confirmed.delete(row.row_key);
        else state.bulk.confirmed.add(row.row_key);
        renderBulkReview();
    });
    document.getElementById("confirmAllBulkUsers").addEventListener("click", () => {
        state.bulk.preview.rows.forEach(row => {
            if (!validateBulkReviewRow(row).length) state.bulk.confirmed.add(row.row_key);
        });
        renderBulkReview();
    });
    document.getElementById("createBulkUsers").addEventListener("click", createConfirmedBulkUsers);
    document.getElementById("bulkUserModal").addEventListener("click", event => {
        if (event.target.id === "bulkUserModal") closeBulkUserModal();
    });
    elements.closeModal.addEventListener("click", closeModal);
    elements.closeModalBtn.addEventListener("click", closeModal);
    elements.saveUser.addEventListener("click", saveUser);
    fields.role.addEventListener("change", updateRoleScope);
    elements.searchInput.addEventListener("input", applySearch);
    document.getElementById('closeResetModal').addEventListener('click',closeResetModal);
    document.getElementById('cancelAdminReset').addEventListener('click',closeResetModal);
    document.getElementById('confirmAdminReset').addEventListener('click',adminReset);

    elements.prevPage.addEventListener("click", () => {
        if (state.currentPage > 1) {
            state.currentPage -= 1;
            renderUsers();
        }
    });

    elements.nextPage.addEventListener("click", () => {
        if (state.currentPage < getTotalPages()) {
            state.currentPage += 1;
            renderUsers();
        }
    });

    elements.table.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");

        if (!button) return;

        const id = button.dataset.id;

        if (button.dataset.action === "edit") {
            editUser(id);
        }

        if (button.dataset.action === "delete") {
            deleteUser(id);
        }
        if(button.dataset.action==='reset')openResetModal(id);
        if(button.dataset.action==='unlock')unlockUser(id);
        if(['activate','lock'].includes(button.dataset.action))accountAction(id,button.dataset.action);
        if(button.dataset.action==='audit')viewAuditHistory(id);
        if(button.dataset.action==='generate')generateTemporaryPassword(id);
        if(button.dataset.action==='view')viewUser(id);
        if(button.dataset.action==='resend')resendWelcomeEmail(id);
    });

    elements.table.addEventListener("change", event => {
        const select = event.target.closest("[data-more-actions]");
        if (!select || !select.value) return;
        const id = select.dataset.id;
        const action = select.value;
        select.value = "";
        if (action === "delete") deleteUser(id);
        if (action === "unlock") unlockUser(id);
        if (["activate", "lock"].includes(action)) accountAction(id, action);
        if (action === "audit") viewAuditHistory(id);
        if (action === "generate") generateTemporaryPassword(id);
        if (action === "resend") resendWelcomeEmail(id);
    });

    elements.modal.addEventListener("click", event => {
        if (event.target === elements.modal) {
            closeModal();
        }
    });
}

setLoggedInUser();
bindEvents();
loadUsers();
