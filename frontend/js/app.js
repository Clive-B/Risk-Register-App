window.NCAGRC = (() => {
    const SESSION_WARNING_MINUTES = 5;
    let refreshPromise = null;
    let sessionWarningTimer = null;
    const configuredApiUrl = window.NCAGRC_API_URL
        || document.querySelector('meta[name="nca-api-url"]')?.content;
    const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const API_URL = String(
        configuredApiUrl
        || (isLocalDevelopment ? 'http://localhost:3000/api' : `${window.location.origin}/api`)
    ).replace(/\/$/, '');

    const roles = {
    ADMIN: "System Administrator",
    CHAIRMAN: "Risk Committee Chairman",
    CHAMPION: "Risk Champion",
    FOCAL: "Risk Focal Person"
};

    const riskMatrix = Object.freeze({
        levels: Object.freeze(["Low", "Medium", "High"]),
        calculateLevel(score) {
            const value = Number(score);
            if (value >= 17) return "High";
            if (value >= 11) return "Medium";
            return "Low";
        }
    });

    const pageAccess = {
        dashboard: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION,roles.FOCAL],
        users: [roles.ADMIN],
        risks: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION,roles.FOCAL],
        createRisk: [roles.ADMIN, roles.CHAMPION, roles.FOCAL],
        pendingApprovals: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION],
        myApprovals: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION,roles.FOCAL],
        actionCentre: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION,roles.FOCAL],
        actionHistory: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION,roles.FOCAL],
        approvalDetails: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION,roles.FOCAL],
        assessment: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION],
        treatment: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION,roles.FOCAL],
        reports: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION],
        communication: [roles.ADMIN],
        auditLogs: [roles.ADMIN],
        systemSettings: [roles.ADMIN],
        executiveAnalytics: [roles.ADMIN,roles.CHAIRMAN],
        boardDashboard: [roles.ADMIN,roles.CHAIRMAN],
        workplans: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION,roles.FOCAL],
        compliance: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION,roles.FOCAL],
        accessDenied: [roles.ADMIN,roles.CHAIRMAN,roles.CHAMPION,roles.FOCAL]
    };

    const sidebars = {
        [roles.ADMIN]: [
            ["Dashboard", "nca-grc-risk-register.html", "dashboard"],
            ["Action Centre", "pages/action-centre.html", "actionCentre"],
            ["User Management", "pages/users.html", "users"],
            ["Audit Logs", "pages/audit-logs.html", "auditLogs"],
            ["System Settings", "pages/system-settings.html", "systemSettings"],
            ["Administration · Communication Centre", "pages/communication-centre.html", "communication"],
            ["Executive Analytics", "pages/executive-analytics.html", "executiveAnalytics"],
            ["Board Dashboard", "pages/board-dashboard.html", "boardDashboard"],
            ["Consolidated Risk Register", "pages/risks.html", "risks"],
            ["Work Plan Risks", "pages/workplans.html", "workplans"],
            ["Create Risk", "pages/create-risk.html", "createRisk"],
            ["Pending Approvals", "pages/pending-approvals.html", "pendingApprovals"],
            ["My Approvals", "pages/my-approvals.html", "myApprovals"],
            ["Analytics", "pages/assessment.html", "assessment"],
            ["Treatment Plans", "pages/treatment.html", "treatment"],
            ["Compliance Assurance", "pages/compliance.html", "compliance"],
            ["Reports", "pages/reports.html", "reports"]
        ],
        [roles.CHAMPION]: [
            ["Dashboard", "nca-grc-risk-register.html", "dashboard"],
            ["Action Centre", "pages/action-centre.html", "actionCentre"],
            ["Consolidated Risk Register", "pages/risks.html", "risks"],
            ["Work Plan Risks", "pages/workplans.html", "workplans"],
            ["Create Risk", "pages/create-risk.html", "createRisk"],
            ["Pending Approvals", "pages/pending-approvals.html", "pendingApprovals"],
            ["My Approvals", "pages/my-approvals.html", "myApprovals"],
            ["Risk Heat Map", "pages/assessment.html", "assessment"],
            ["Treatment Plans", "pages/treatment.html", "treatment"],
            ["Compliance Assurance", "pages/compliance.html", "compliance"],
            ["Reports", "pages/reports.html", "reports"]
        ],
        [roles.FOCAL]: [
            ["Dashboard", "nca-grc-risk-register.html", "dashboard"],
            ["Action Centre", "pages/action-centre.html", "actionCentre"],
            ["Consolidated Risk Register", "pages/risks.html", "risks"],
            ["Work Plan Upload", "pages/workplans.html", "workplans"],
            ["Create Risk", "pages/create-risk.html", "createRisk"],
            ["My Approvals", "pages/my-approvals.html", "myApprovals"],
            ["Treatment Plans", "pages/treatment.html", "treatment"]
            ,["Compliance Assurance", "pages/compliance.html", "compliance"]
        ],
        [roles.CHAIRMAN]: [["Enterprise Dashboard","pages/executive-analytics.html","executiveAnalytics"],["Board Dashboard","pages/board-dashboard.html","boardDashboard"],["Action Centre","pages/action-centre.html","actionCentre"],["Consolidated Risk Register","pages/risks.html","risks"],["Work Plan Risk Escalations","pages/workplans.html","workplans"],["High Risk Reviews","pages/pending-approvals.html","pendingApprovals"],["Treatment Plans","pages/treatment.html","treatment"],["Compliance Assurance","pages/compliance.html","compliance"],["Enterprise Heat Map","pages/assessment.html","assessment"],["Executive Reports","pages/reports.html","reports"]]
    };

    function getToken() {
        return localStorage.getItem("token");
    }

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem("user"));
        } catch (error) {
            return null;
        }
    }

    function clearSession() {
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("sessionExpiresAt");
        localStorage.removeItem("user");
    }

    function loginPathWithReturn() {
        const prefix = getPathPrefix();
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        return `${prefix}index.html?returnTo=${encodeURIComponent(returnTo)}`;
    }

    function redirectToLogin() {
        clearSession();
        window.location.replace(loginPathWithReturn());
    }

    function showSessionWarning() {
        if (document.getElementById("ncaSessionWarning")) return;
        const warning = document.createElement("div");
        warning.id = "ncaSessionWarning";
        warning.setAttribute("role", "alert");
        warning.innerHTML = `<strong>Your session will expire soon.</strong><span>Save your work or continue working to renew access.</span><button type="button" aria-label="Dismiss session warning">&times;</button>`;
        Object.assign(warning.style, {position:"fixed",right:"24px",bottom:"24px",zIndex:"10000",display:"grid",gridTemplateColumns:"1fr auto",gap:"4px 16px",maxWidth:"420px",padding:"16px 18px",borderRadius:"10px",background:"#7a2e0e",color:"#fff",boxShadow:"0 16px 40px rgba(16,24,40,.25)",fontFamily:'Inter, "Segoe UI", Arial, sans-serif'});
        warning.querySelector("span").style.gridColumn = "1";
        warning.querySelector("span").style.fontSize = "13px";
        Object.assign(warning.querySelector("button").style, {gridColumn:"2",gridRow:"1 / span 2",alignSelf:"center",border:"0",background:"transparent",color:"#fff",fontSize:"24px",cursor:"pointer"});
        warning.querySelector("button").addEventListener("click", () => warning.remove());
        document.body.appendChild(warning);
    }

    function scheduleSessionWarning() {
        if (sessionWarningTimer) window.clearTimeout(sessionWarningTimer);
        const expiresAt = new Date(localStorage.getItem("sessionExpiresAt") || 0).getTime();
        if (!expiresAt) return;
        const delay = expiresAt - Date.now() - SESSION_WARNING_MINUTES * 60 * 1000;
        if (delay <= 0) showSessionWarning();
        else sessionWarningTimer = window.setTimeout(showSessionWarning, delay);
    }

    function saveSession(payload) {
        localStorage.setItem("token", payload.token);
        localStorage.setItem("refreshToken", payload.refreshToken);
        if (payload.sessionExpiresAt) localStorage.setItem("sessionExpiresAt", payload.sessionExpiresAt);
        scheduleSessionWarning();
    }

    async function refreshAccessToken() {
        if (refreshPromise) return refreshPromise;
        const refreshToken = localStorage.getItem("refreshToken");
        if (!refreshToken) {
            const error = new Error("Session expired.");
            error.sessionEnded = true;
            throw error;
        }
        refreshPromise = (async () => {
            const response = await fetch(`${API_URL}/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken })
            });
            const payload = await response.json().catch(() => ({ success: false, message: "Session expired." }));
            if (!response.ok || payload.success !== true) {
                const error = new Error(payload.message || "Unable to renew the session.");
                error.sessionEnded = response.status === 401 || response.status === 403;
                throw error;
            }
            saveSession(payload);
            return payload.token;
        })().finally(() => { refreshPromise = null; });
        return refreshPromise;
    }

    async function logout(loginPath = "index.html") {
        const token = getToken();
        if (token) { try { await fetch(`${API_URL}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }); } catch (_) {} }
        clearSession();
        window.location.href = loginPath;
    }

    function getPageKey() {
        const file = window.location.pathname.split("/").pop() || "nca-grc-risk-register.html";

        if (file === "nca-grc-risk-register.html") return "dashboard";
        if (file === "users.html") return "users";
        if (file === "risks.html") return "risks";
        if (file === "create-risk.html") return "createRisk";
        if (file === "pending-approvals.html") return "pendingApprovals";
        if (file === "my-approvals.html") return "myApprovals";
        if (file === "action-centre.html") return "actionCentre";
        if (file === "action-history.html") return "actionHistory";
        if (file === "approval-details.html") return "approvalDetails";
        if (file === "assessment.html") return "assessment";
        if (file === "treatment.html") return "treatment";
        if (file === "reports.html") return "reports";
        if (file === "communication-centre.html") return "communication";
        if (file === "audit-logs.html") return "auditLogs";
        if (file === "system-settings.html") return "systemSettings";
        if (file === "executive-analytics.html") return "executiveAnalytics";
        if (file === "board-dashboard.html") return "boardDashboard";
        if (file === "workplans.html") return "workplans";
        if (file === "compliance.html") return "compliance";
        if (file === "access-denied.html") return "accessDenied";
        return "dashboard";
    }

    function getPathPrefix() {
        return window.location.pathname.includes("/pages/") ? "../" : "";
    }

    function resolvePath(path) {
        return `${getPathPrefix()}${path}`;
    }

    function dashboardPath() {
        const user = getUser();
        if (user?.role === roles.CHAIRMAN) {
            return resolvePath("pages/executive-analytics.html");
        }
        return resolvePath("nca-grc-risk-register.html");
    }

    function canAccess(pageKey, role) {
        return Boolean(pageAccess[pageKey]?.includes(role));
    }

    function isKnownRole(role) {
        return Object.values(roles).includes(role);
    }

    async function authorizedFetch(path, options = {}, hasRetried = false) {
        const url = /^https?:\/\//i.test(path) ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
                ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
                ...(options.headers || {})
            }
        });
        if (response.status === 401 && !hasRetried && !path.includes('/auth/refresh')) {
            try {
                await refreshAccessToken();
                return authorizedFetch(path, options, true);
            } catch (refreshError) {
                if (refreshError.sessionEnded) redirectToLogin();
                throw refreshError;
            }
        }
        return response;
    }

    async function apiRequest(path, options = {}) {
        const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
        let response;
        let body = '';
        try {
            response = await authorizedFetch(path, options);
            body = await response.text();
            const type = response.headers.get('content-type') || '';
            if (!type.toLowerCase().includes('application/json')) {
                console.error('API request failed', { url, status: response.status, contentType: type, responseBody: body });
                throw new Error(`API returned ${type || 'an unknown content type'} instead of JSON for ${path}. Verify that the Express API is running on port 3000.`);
            }
            let payload;
            try { payload = JSON.parse(body); }
            catch (error) {
                console.error('API JSON parsing failed', { url, status: response.status, contentType: type, responseBody: body });
                throw new Error(`API returned malformed JSON for ${path}.`);
            }
            if (!response.ok || payload.success !== true) {
                console.error('API request failed', { url, status: response.status, contentType: type, responseBody: body });
                throw new Error(payload.message || `Request failed with status ${response.status}.`);
            }
            return payload.data !== undefined ? payload.data : payload;
        } catch (error) {
            if (!response) console.error('API connection failed', { url, status: 0, contentType: '', responseBody: '', error: error.message });
            throw error;
        }
    }

    function renderUserProfile(container, user = getUser()) {
        if (!container || !user) return;
        const escape = value => String(value || '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
        const nameParts = String(user.full_name || "User").trim().split(/\s+/).filter(Boolean);
        const initials = `${nameParts[0]?.[0] || "U"}${nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : ""}`.toUpperCase();
        container.classList.add("nca-profile-card");
        container.innerHTML = `<span class="nca-profile-avatar" aria-hidden="true">${escape(initials)}</span><span class="nca-profile-copy"><strong>${escape(user.full_name)}</strong><small>${escape(user.email)}</small><small>${escape(user.role)}</small></span>`;
        if (!document.getElementById("ncaProfileStyles")) {
            const style = document.createElement("style");
            style.id = "ncaProfileStyles";
            style.textContent = `.nca-profile-card{display:flex!important;align-items:center;gap:11px;text-align:left!important}.nca-profile-avatar{width:48px;height:48px;flex:0 0 48px;border-radius:50%;display:grid;place-items:center;background:#e8eef6;color:#003a70;border:2px solid #d3dfec;font-weight:800}.nca-profile-copy{display:grid;gap:2px;min-width:0}.nca-profile-copy strong,.nca-profile-copy small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nca-profile-copy small{color:#667085;font-size:12px}`;
            document.head.appendChild(style);
        }
    }

    scheduleSessionWarning();

    async function auditClientEvent(payload) {
        const token = getToken();

        if (!token) return;

        try {
            await fetch(`${API_URL}/audit-logs/client`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            console.error("Client audit failed:", error);
        }
    }

    return {
        API_URL,
        roles,
        riskMatrix,
        sidebars,
        getToken,
        getUser,
        saveSession,
        refreshAccessToken,
        renderUserProfile,
        authorizedFetch,
        redirectToLogin,
        logout,
        getPageKey,
        getPathPrefix,
        resolvePath,
        dashboardPath,
        canAccess,
        isKnownRole,
        apiRequest,
        auditClientEvent
    };
})();
