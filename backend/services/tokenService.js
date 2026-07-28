const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PASSWORD_POLICY } = require('../config/security');

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

function createOpaqueToken() {
    const token = crypto.randomBytes(48).toString('base64url');
    return { token, hash: hashToken(token) };
}

function createAccessToken(user, sessionId) {
    return jwt.sign({
        id: user.id,
        role: user.role,
        email: user.email,
        directorate: user.directorate,
        division: user.division,
        sid: sessionId,
        tokenVersion: user.token_version
    }, process.env.JWT_SECRET, { expiresIn: `${PASSWORD_POLICY.accessTokenMinutes}m` });
}

module.exports = { createOpaqueToken, createAccessToken, hashToken };
