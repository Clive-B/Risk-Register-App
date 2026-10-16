const form = document.getElementById('passwordForm');
const password = document.getElementById('newPassword');
const confirmation = document.getElementById('confirmPassword');
const message = document.getElementById('message');
const confirmMessage = document.getElementById('confirmMessage');
const minimumLength = document.getElementById('minimumLength');
let policy = { minLength: 12, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecialCharacter: true };

function checks(value) {
    return { length: value.length >= policy.minLength, uppercase: /[A-Z]/.test(value), lowercase: /[a-z]/.test(value), number: /\d/.test(value), special: /[^A-Za-z0-9]/.test(value) };
}

function updateGuidance() {
    const results = checks(password.value);
    const activeRules = Object.entries(results);
    activeRules.forEach(([rule, passed]) => document.querySelector(`[data-rule="${rule}"]`)?.classList.toggle('is-valid', passed));
    const score = activeRules.filter(([, passed]) => passed).length;
    const bar = document.querySelector('#strength span');
    bar.style.width = `${score * 20}%`;
    bar.style.background = score < 3 ? '#b42318' : score < 5 ? '#b54708' : '#027a48';
    if (!confirmation.value) confirmMessage.textContent = '';
    else if (confirmation.value === password.value) confirmMessage.textContent = 'Passwords match.';
    else confirmMessage.textContent = 'Passwords do not match yet.';
    confirmMessage.classList.toggle('is-valid', Boolean(confirmation.value) && confirmation.value === password.value);
    return activeRules.every(([, passed]) => passed);
}

async function loadPolicy() {
    try {
        const response = await fetch(`${window.NCAGRC.API_URL}/auth/password-policy`, { headers: { Accept: 'application/json' } });
        const data = await response.json();
        if (response.ok && data.policy?.minLength) policy = data.policy;
    } catch (_) {}
    minimumLength.textContent = String(policy.minLength);
    password.minLength = policy.minLength;
    confirmation.minLength = policy.minLength;
    updateGuidance();
}

document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    button.textContent = showing ? 'Show' : 'Hide';
    button.setAttribute('aria-pressed', String(!showing));
    button.setAttribute('aria-label', `${showing ? 'Show' : 'Hide'} ${input.id === 'newPassword' ? 'new' : 'confirmed'} password`);
    input.focus({ preventScroll: true });
}));

password.addEventListener('input', updateGuidance);
confirmation.addEventListener('input', updateGuidance);
form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    if (!updateGuidance()) { message.textContent = 'Complete every password requirement before continuing.'; password.focus(); return; }
    if (password.value !== confirmation.value) { message.textContent = 'New password and confirmation must match.'; confirmation.focus(); return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        const response = await fetch(`${window.NCAGRC.API_URL}/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: new URLSearchParams(location.search).get('token'), newPassword: password.value, confirmPassword: confirmation.value }) });
        const data = await response.json();
        message.textContent = data.message;
        if (data.success) setTimeout(() => location.href = 'index.html', 1200);
    } catch (_) { message.textContent = 'Unable to reset password.'; }
    finally { button.disabled = false; }
});

loadPolicy();
