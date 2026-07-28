const PASSWORD_POLICY = Object.freeze({
    minLength: Number(process.env.PASSWORD_MIN_LENGTH || 8),
    historyCount: Number(process.env.PASSWORD_HISTORY_COUNT || 5),
    expiryDays: Number(process.env.PASSWORD_EXPIRY_DAYS || 90),
    warningDays: Number(process.env.PASSWORD_EXPIRY_WARNING_DAYS || 14),
    resetMinutes: Number(process.env.PASSWORD_RESET_MINUTES || 30),
    lockoutAttempts: Number(process.env.ACCOUNT_LOCKOUT_ATTEMPTS || 5),
    lockoutMinutes: Number(process.env.ACCOUNT_LOCKOUT_MINUTES || 30),
    accessTokenMinutes: Number(process.env.ACCESS_TOKEN_MINUTES || 15),
    refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS || 7)
});

function validatePassword(password) {
    const value = String(password || '');
    const errors = [];
    if (value.length < PASSWORD_POLICY.minLength) errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters.`);
    if (!/[A-Z]/.test(value)) errors.push('Password must include an uppercase letter.');
    if (!/[a-z]/.test(value)) errors.push('Password must include a lowercase letter.');
    if (!/[0-9]/.test(value)) errors.push('Password must include a number.');
    if (!/[^A-Za-z0-9]/.test(value)) errors.push('Password must include a special character.');
    return errors;
}

module.exports = { PASSWORD_POLICY, validatePassword };
