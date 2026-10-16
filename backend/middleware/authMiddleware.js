const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { PASSWORD_POLICY } = require('../config/security');

module.exports = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        const token = authHeader.split(' ')[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const session = await pool.query(`SELECT u.full_name,u.email,u.role,COALESCE(NULLIF(BTRIM(u.division),''),u.directorate) AS directorate,COALESCE(NULLIF(BTRIM(u.division),''),u.directorate) AS division,u.phone,u.status,u.last_login,u.must_change_password,u.password_changed_at FROM user_sessions s JOIN users u ON u.id=s.user_id
            WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW()
            AND u.status='Active' AND u.token_version=$3`, [decoded.sid, decoded.id, decoded.tokenVersion]);
        if (!session.rowCount) throw new Error('Session revoked');
        const account = session.rows[0];
        const passwordExpired = !account.password_changed_at
            || Date.now() - new Date(account.password_changed_at).getTime() >= PASSWORD_POLICY.expiryDays * 86400000;
        req.user = { ...decoded, ...account, must_change_password: Boolean(account.must_change_password || passwordExpired) };

        const passwordChangeRoute = (req.baseUrl === '/api/auth' && ['/change-password','/logout'].includes(req.path))
            || (req.baseUrl === '/api/users' && req.path === '/change-password');
        if (req.user.must_change_password && !passwordChangeRoute) {
            return res.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'You must change your temporary password before accessing the platform.' });
        }

        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token.'
        });
    }
};
