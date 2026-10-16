const crypto = require('crypto');
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const { logAudit } = require('../utils/auditLogger');
const { PASSWORD_POLICY, validatePassword } = require('../config/security');
const { createOpaqueToken, createAccessToken, hashToken } = require('../services/tokenService');
const { sendPasswordResetEmail, sendPasswordChangedEmail } = require('../services/emailService');
const { createNotification } = require('../services/notificationService');
const { createAction, completeBySource } = require('../services/actionService');

const publicMessage = 'If the address is registered, a password reset link will be sent.';
const normalizeEmail = value => String(value || '').trim().toLowerCase();

exports.passwordPolicy = (_req, res) => res.json({
    success: true,
    policy: {
        minLength: PASSWORD_POLICY.minLength,
        requireUppercase: true,
        requireLowercase: true,
        requireNumber: true,
        requireSpecialCharacter: true
    }
});

async function issueSession(client, user, req) {
    const sessionId = crypto.randomUUID();
    const refresh = createOpaqueToken();
    await client.query(`INSERT INTO user_sessions (id,user_id,refresh_token_hash,ip_address,user_agent,expires_at)
        VALUES ($1,$2,$3,$4,$5,NOW()+($6 || ' days')::interval)`,
        [sessionId, user.id, refresh.hash, req.ip, req.get('user-agent'), PASSWORD_POLICY.refreshTokenDays]);
    return { token: createAccessToken(user, sessionId), refreshToken: refresh.token, sessionExpiresAt: new Date(Date.now() + PASSWORD_POLICY.refreshTokenDays * 86400000).toISOString() };
}

async function passwordWasUsed(client, userId, password) {
    const history = await client.query(`SELECT password_hash FROM password_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [userId, PASSWORD_POLICY.historyCount]);
    for (const row of history.rows) if (await bcrypt.compare(password, row.password_hash)) return true;
    return false;
}

exports.login = async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query('SELECT * FROM users WHERE LOWER(email)=$1 FOR UPDATE', [email]);
        const user = result.rows[0];
        if (!user || user.status !== 'Active') {
            await client.query('ROLLBACK');
            await logAudit({ req, user: user || { email }, action: 'FAILED_LOGIN', entityType: 'Auth', status: 'Failed' });
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            await client.query('ROLLBACK');
            return res.status(423).json({ success: false, message: 'Account is temporarily locked. Contact an administrator or try again later.' });
        }
        if (!await bcrypt.compare(password, user.password_hash)) {
            const attempts = Number(user.failed_login_attempts || 0) + 1;
            const locked = attempts >= PASSWORD_POLICY.lockoutAttempts;
            await client.query(`UPDATE users SET failed_login_attempts=$1,last_failed_login=NOW(),locked_until=CASE WHEN $2 THEN NOW()+($3 || ' minutes')::interval ELSE NULL END WHERE id=$4`,
                [locked ? 0 : attempts, locked, PASSWORD_POLICY.lockoutMinutes, user.id]);
            await client.query('COMMIT');
            await logAudit({ req, user, action: locked ? 'ACCOUNT_LOCK' : 'FAILED_LOGIN', entityType: 'User', entityId: user.id, status: 'Failed', details: { attempts } });
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
        await client.query('UPDATE users SET failed_login_attempts=0,locked_until=NULL,last_login=NOW() WHERE id=$1', [user.id]);
        const expired = !user.password_changed_at || Date.now() - new Date(user.password_changed_at).getTime() >= PASSWORD_POLICY.expiryDays * 86400000;
        const session = await issueSession(client, user, req);
        await client.query('COMMIT');
        await logAudit({ req, user, action: user.must_change_password ? 'FIRST_LOGIN' : 'LOGIN', entityType: 'Auth' });
        res.json({ success: true, ...session, mustChangePassword: Boolean(user.must_change_password || expired), user: {
            id:user.id, staff_id:user.staff_id, full_name:user.full_name, email:user.email, role:user.role, directorate:user.directorate, division:user.division,
            must_change_password:Boolean(user.must_change_password || expired), password_expires_at:user.password_changed_at ? new Date(new Date(user.password_changed_at).getTime()+PASSWORD_POLICY.expiryDays*86400000) : null
        }});
    } catch (error) { await client.query('ROLLBACK'); console.error(error); res.status(500).json({ success:false,message:'Unable to sign in.' }); }
    finally { client.release(); }
};

exports.refresh = async (req, res) => {
    const refreshToken = String(req.body.refreshToken || '');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const found = await client.query(`SELECT s.*,u.email,u.role,u.directorate,u.token_version,u.status FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.refresh_token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW() FOR UPDATE`, [hashToken(refreshToken)]);
        const session = found.rows[0];
        if (!session || session.status !== 'Active') { await client.query('ROLLBACK'); return res.status(401).json({success:false,message:'Session expired.'}); }
        const next = createOpaqueToken();
        await client.query('UPDATE user_sessions SET refresh_token_hash=$1,last_seen_at=NOW() WHERE id=$2',[next.hash,session.id]);
        await client.query('COMMIT');
        res.json({success:true,token:createAccessToken({id:session.user_id,email:session.email,role:session.role,directorate:session.directorate,token_version:session.token_version},session.id),refreshToken:next.token,sessionExpiresAt:session.expires_at});
    } catch(e){await client.query('ROLLBACK'); res.status(401).json({success:false,message:'Session expired.'});} finally{client.release();}
};

exports.logout = async (req, res) => {
    await pool.query('UPDATE user_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2',[req.user.sid,req.user.id]);
    await logAudit({req,action:'LOGOUT',entityType:'Auth'});
    res.json({success:true,message:'Logged out successfully.'});
};

exports.forgotPassword = async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({success:false,message:'Enter a valid email address.'});
    const result = await pool.query("SELECT id,email,full_name,role FROM users WHERE LOWER(email)=$1 AND status='Active'",[email]);
    const user = result.rows[0];
    await logAudit({req,user:user||{email},action:'PASSWORD_RESET_REQUESTED',entityType:'User',entityId:user?.id});
    if (user) {
        const reset = createOpaqueToken();
        await pool.query(`UPDATE users SET reset_token_hash=$1,reset_token_expires_at=NOW()+($2 || ' minutes')::interval,reset_token_requested_at=NOW(),reset_token_used_at=NULL WHERE id=$3`,[reset.hash,PASSWORD_POLICY.resetMinutes,user.id]);
        const base = process.env.FRONTEND_URL || 'http://localhost:5500';
        try { await sendPasswordResetEmail({email:user.email,fullName:user.full_name,resetUrl:`${base}/reset-password.html?token=${encodeURIComponent(reset.token)}`,userId:user.id,role:user.role,sentBy:user.id});
            await logAudit({req,user,action:'PASSWORD_RESET_EMAIL_QUEUED',entityType:'User',entityId:user.id});
        } catch(e) { console.error(e); await logAudit({req,user,action:'PASSWORD_RESET_EMAIL_SENT',entityType:'User',entityId:user.id,status:'Failed'}); }
        const admins=(await pool.query("SELECT id FROM users WHERE role='System Administrator' AND status='Active'")).rows;for(const admin of admins)await createAction({actionKey:`password-reset:${user.id}:${Date.now()}:${admin.id}`,module:'User Management',actionType:'Password Reset Request',title:`Password reset requested: ${user.full_name}`,description:user.email,priority:'Medium',status:'Pending',assignedTo:admin.id,assignedRole:'System Administrator',sourceType:'PasswordReset',sourceId:user.id,actionUrl:'pages/users.html',availableActions:['view','dismiss']},{req});
    }
    res.json({success:true,message:publicMessage});
};

exports.resetPassword = async (req, res) => {
    const tokenHash = hashToken(String(req.body.token || ''));
    const password = String(req.body.newPassword || '');
    const errors = validatePassword(password);
    if (password !== req.body.confirmPassword) errors.push('Passwords do not match.');
    if (errors.length) return res.status(400).json({success:false,message:errors[0],errors});
    const client = await pool.connect();
    try { await client.query('BEGIN');
        const found=await client.query('SELECT * FROM users WHERE reset_token_hash=$1 AND reset_token_used_at IS NULL AND reset_token_expires_at>NOW() FOR UPDATE',[tokenHash]);
        const user=found.rows[0]; if(!user){await client.query('ROLLBACK');return res.status(400).json({success:false,message:'Reset link is invalid or has expired.'});}
        if(await bcrypt.compare(password,user.password_hash)||await passwordWasUsed(client,user.id,password)){await client.query('ROLLBACK');return res.status(400).json({success:false,message:'Choose a password you have not used recently.'});}
        const hash=await bcrypt.hash(password,12);
        await client.query('INSERT INTO password_history(user_id,password_hash) VALUES($1,$2)',[user.id,user.password_hash]);
        await client.query(`UPDATE users SET password_hash=$1,must_change_password=FALSE,password_changed_at=NOW(),last_password_reset=NOW(),reset_token_used_at=NOW(),reset_token_hash=NULL,reset_token_expires_at=NULL,token_version=token_version+1 WHERE id=$2`,[hash,user.id]);
        await client.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[user.id]); await client.query('COMMIT');
        await logAudit({req,user,action:'PASSWORD_RESET_COMPLETED',entityType:'User',entityId:user.id}); res.json({success:true,message:'Password reset successfully. Please sign in.'});
    } catch(e){await client.query('ROLLBACK');console.error(e);res.status(500).json({success:false,message:'Unable to reset password.'});}finally{client.release();}
};

exports.changePassword = async (req,res) => {
    const password=String(req.body.newPassword||''); const errors=validatePassword(password); if(password!==req.body.confirmPassword) errors.push('Passwords do not match.');
    if(errors.length)return res.status(400).json({success:false,message:errors[0],errors}); const client=await pool.connect();
    try{await client.query('BEGIN');const found=await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);const user=found.rows[0];
        if(!user||!await bcrypt.compare(String(req.body.currentPassword||''),user.password_hash)){await client.query('ROLLBACK');return res.status(400).json({success:false,message:'Current password is incorrect.'});}
        if(await bcrypt.compare(password,user.password_hash)||await passwordWasUsed(client,user.id,password)){await client.query('ROLLBACK');return res.status(400).json({success:false,message:'Choose a password you have not used recently.'});}
        const hash=await bcrypt.hash(password,12);await client.query('INSERT INTO password_history(user_id,password_hash) VALUES($1,$2)',[user.id,user.password_hash]);
        await client.query("UPDATE users SET password_hash=$1,must_change_password=FALSE,password_changed_at=NOW(),last_password_reset=NOW(),token_version=token_version+1,activation_status='Active',activated_at=COALESCE(activated_at,NOW()) WHERE id=$2",[hash,user.id]);
        await client.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1',[user.id]);
        const session=await issueSession(client,{...user,token_version:Number(user.token_version)+1},req);
        await client.query('COMMIT');await logAudit({req,user,action:'PASSWORD_CHANGED',entityType:'User',entityId:user.id});
        const admins=await pool.query("SELECT id FROM users WHERE role='System Administrator' AND status='Active'");
        await Promise.allSettled(admins.rows.map(admin=>createNotification({actor:req.user,req,userId:admin.id,title:'Password Changed',message:`${user.full_name} completed the required password change.`,type:'Security',category:'User Management',priority:'High',entityType:'User',entityId:user.id,createdBy:req.user.id,systemGenerated:true})));
        try {
            await completeBySource('UserActivation',user.id,{actor:req.user,req,comments:'First-login password change completed.'});
        } catch(actionError) {
            console.error('User activation action completion failed:',actionError.message);
        }
        try { await sendPasswordChangedEmail({email:user.email,fullName:user.full_name,userId:user.id,role:user.role,directorate:user.division||user.directorate,sentBy:user.id}); await logAudit({req,user,action:'PASSWORD_CHANGED_EMAIL_QUEUED',entityType:'User',entityId:user.id}); } catch(emailError) { console.error('Password confirmation email failed:',emailError.message); await logAudit({req,user,action:'PASSWORD_CHANGED_EMAIL_FAILED',entityType:'User',entityId:user.id,status:'Failed'}); }
        res.json({success:true,message:'Password changed successfully.',...session,redirectTo:`${process.env.FRONTEND_URL || 'http://localhost:5500'}/nca-grc-risk-register.html`});
    }catch(e){await client.query('ROLLBACK');console.error(e);res.status(500).json({success:false,message:'Unable to change password.'});}finally{client.release();}
};
