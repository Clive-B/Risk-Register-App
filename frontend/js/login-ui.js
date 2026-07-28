(() => {
    const password = document.getElementById('password');
    const togglePassword = document.getElementById('togglePassword');
    const forgotModal = document.getElementById('forgotModal');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const cancelReset = document.getElementById('cancelReset');

    togglePassword.addEventListener('click', () => {
        const willShowPassword = password.type === 'password';
        password.type = willShowPassword ? 'text' : 'password';
        togglePassword.classList.toggle('is-visible', willShowPassword);
        togglePassword.setAttribute('aria-pressed', String(willShowPassword));
        togglePassword.setAttribute('aria-label', willShowPassword ? 'Hide password' : 'Show password');
        password.focus({ preventScroll: true });
    });

    forgotPasswordLink.addEventListener('click', () => {
        forgotModal.setAttribute('aria-hidden', 'false');
    });

    cancelReset.addEventListener('click', () => {
        forgotModal.setAttribute('aria-hidden', 'true');
        forgotPasswordLink.focus({ preventScroll: true });
    });

    forgotModal.addEventListener('click', event => {
        if (event.target !== forgotModal) return;
        forgotModal.style.display = 'none';
        forgotModal.setAttribute('aria-hidden', 'true');
        forgotPasswordLink.focus({ preventScroll: true });
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || forgotModal.getAttribute('aria-hidden') !== 'false') return;
        forgotModal.style.display = 'none';
        forgotModal.setAttribute('aria-hidden', 'true');
        forgotPasswordLink.focus({ preventScroll: true });
    });
})();
