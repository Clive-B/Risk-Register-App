(async () => {
    const app = window.NCAGRC;
    const token = app.getToken();
    const user = app.getUser();
    const pageKey = app.getPageKey();
    const isAccessDeniedPage = pageKey === "accessDenied";

    window.NCAGRC_ACCESS_DENIED = false;

    if (!token || !user) {
        window.NCAGRC_ACCESS_DENIED = true;
        app.redirectToLogin();
        return;
    }

    if (!app.isKnownRole(user.role)) {
        window.NCAGRC_ACCESS_DENIED = true;
        app.redirectToLogin();
        return;
    }

    if (user.must_change_password && !window.location.pathname.endsWith('/change-password.html')) {
        window.location.replace(app.resolvePath('change-password.html'));
        return;
    }

    if (!app.canAccess(pageKey, user.role)) {
        window.NCAGRC_ACCESS_DENIED = true;

        if (isAccessDeniedPage) {
            return;
        }

        await app.auditClientEvent({
            action: "FRONTEND_ACCESS_DENIED",
            entity_type: "Page",
            entity_id: window.location.pathname,
            status: "Denied",
            details: {
                page: pageKey,
                role: user.role
            }
        });

        window.location.replace(app.resolvePath("pages/access-denied.html"));
    }
})();
