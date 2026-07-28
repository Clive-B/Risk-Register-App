const API_URL = window.NCAGRC.API_URL;

const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("password");
const loginErrorDialog = document.getElementById("loginErrorDialog");
const loginErrorTitle = document.getElementById("loginErrorTitle");
const loginErrorMessage = document.getElementById("loginErrorMessage");
const closeLoginError = document.getElementById("closeLoginError");

function showLoginError(message, connectionFailure = false) {
    loginErrorTitle.textContent = connectionFailure ? "Service temporarily unavailable" : "Unable to sign in";
    loginErrorMessage.textContent = message || (connectionFailure
        ? "The secure sign-in service could not be reached."
        : "The email address or password entered is incorrect.");
    passwordInput.value = "";
    loginErrorDialog.showModal();
    closeLoginError.focus();
}

function dismissLoginError() {
    loginErrorDialog.close();
}

closeLoginError.addEventListener("click", dismissLoginError);
loginErrorDialog.addEventListener("click", event => {
    if (event.target === loginErrorDialog) dismissLoginError();
});
loginErrorDialog.addEventListener("close", () => passwordInput.focus({preventScroll:true}));

localStorage.removeItem("token");
localStorage.removeItem("user");
localStorage.removeItem("refreshToken");
localStorage.removeItem("sessionExpiresAt");

const forgotModal=document.getElementById('forgotModal');
document.getElementById('forgotPasswordLink').addEventListener('click',e=>{e.preventDefault();forgotModal.style.display='flex';document.getElementById('resetEmail').focus();});
document.getElementById('cancelReset').addEventListener('click',()=>{forgotModal.style.display='none';});
document.getElementById('sendReset').addEventListener('click',async()=>{
    const email=document.getElementById('resetEmail').value.trim();const message=document.getElementById('resetMessage');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){message.textContent='Enter a valid email address.';return;}
    const button=document.getElementById('sendReset');button.disabled=true;button.textContent='Sending...';
    try{const response=await fetch(`${API_URL}/auth/forgot-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const data=await response.json();message.textContent=data.message||'If the address is registered, a reset link will be sent.';}catch(_){message.textContent='Unable to process the request. Please try again.';}finally{button.disabled=false;button.textContent='Send Reset Link';}
});

loginForm.addEventListener("submit", async function (e) {

    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {

        const response = await fetch(`${API_URL}/auth/login`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                email,
                password
            })

        });

        const data = await response.json();

        if (!data.success) {

            showLoginError(data.message);
            return;

        }

        // Save token
        window.NCAGRC.saveSession(data);

        // Save user
        localStorage.setItem("user", JSON.stringify(data.user));

        // Redirect to the role-aware, personalized dashboard shell.
        if (data.mustChangePassword) {
            window.location.href = 'change-password.html';
            return;
        }
        let landing = window.NCAGRC.dashboardPath();
        try {
            const preferences = await fetch(`${API_URL}/executive-analytics/preferences`, {
                headers: { Authorization: `Bearer ${data.token}` }
            });
            if (preferences.ok) {
                const payload = await preferences.json();
                if (payload.preferences?.default_dashboard === 'Board') landing = 'pages/board-dashboard.html';
                if (payload.preferences?.default_dashboard === 'Executive') landing = 'pages/executive-analytics.html';
                if (payload.preferences?.default_dashboard === 'Operational') landing = 'nca-grc-risk-register.html';
            }
        } catch (_) {}
        const requestedReturn = new URLSearchParams(window.location.search).get('returnTo');
        if (requestedReturn) {
            const destination = new URL(requestedReturn, window.location.origin);
            if (destination.origin === window.location.origin) landing = `${destination.pathname}${destination.search}${destination.hash}`;
        }
        window.location.href = landing;

    } catch (err) {

        console.error(err);

        showLoginError("The secure sign-in service could not be reached. Please try again shortly.", true);

    }

});
