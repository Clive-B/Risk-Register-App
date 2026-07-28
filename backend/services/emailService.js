let nodemailer;
try { nodemailer = require('nodemailer'); } catch (_) { nodemailer = null; }
const { isValidNcaEmail } = require('../utils/contactValidation');

function cleanHeader(value, label) {
    const header = String(value || '').trim();
    if (!header || /[\r\n]/.test(header)) throw new Error(`${label} contains invalid characters.`);
    return header;
}

function ncaRecipient(value) {
    const address = cleanHeader(value, 'Email recipient').toLowerCase();
    if (!isValidNcaEmail(address)) throw new Error('Email delivery is restricted to official @nca.org.gh addresses.');
    return address;
}

async function transporter() {
    let config={host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),username:process.env.SMTP_USER,password:process.env.SMTP_PASSWORD,sender:process.env.SMTP_FROM||process.env.MAIL_FROM,encryption:String(process.env.SMTP_SECURE).toLowerCase()==='true'?'TLS':'STARTTLS'};
    try { const pool=require('../config/db'),{decrypt}=require('./communicationService');const result=await pool.query('SELECT * FROM smtp_settings WHERE id=1');const saved=result.rows[0];if(saved?.host){config={host:saved.host,port:saved.port,username:saved.username,password:saved.encrypted_password?decrypt(saved.encrypted_password):null,sender:saved.sender_email?`${saved.sender_name} <${saved.sender_email}>`:config.sender,encryption:saved.encryption};} } catch(error) { console.warn('Using environment SMTP configuration:',error.message); }
    if (!nodemailer || !config.host) {
        if (process.env.NODE_ENV === 'production') throw new Error('SMTP is not configured.');
        return null;
    }
    const client=nodemailer.createTransport({
        host: config.host,
        port: Number(config.port || 587),
        secure: config.encryption === 'TLS',
        requireTLS: config.encryption === 'STARTTLS',
        auth: config.username ? { user: config.username, pass: config.password } : undefined,
        disableFileAccess: true,
        disableUrlAccess: true,
        tls: {
            rejectUnauthorized: String(process.env.SMTP_ALLOW_SELF_SIGNED || '').toLowerCase() !== 'true',
            minVersion: 'TLSv1.2'
        }
    });
    client._ncaFrom=config.sender||'NCA GRC <no-reply@nca.org.gh>';return client;
}

async function sendRawEmail({ to, subject, text, html }) {
    const client = await transporter();
    const recipient = ncaRecipient(to);
    const safeSubject = cleanHeader(subject, 'Email subject');
    if (!client) { console.info(`[development] Email queued for ${recipient}: ${safeSubject}`); return { messageId: 'development' }; }
    return client.sendMail({
        from: cleanHeader(client._ncaFrom, 'Email sender'),
        to: recipient,
        subject: safeSubject,
        text: String(text || ''),
        html: String(html || ''),
        disableFileAccess: true,
        disableUrlAccess: true
    });
}

async function sendEmail(options) {
    const { queueEmail } = require('./communicationService');
    const queued = await queueEmail(options);
    if (options.processImmediately !== false) setImmediate(() => require('./communicationService').processQueue({limit:1}).catch(error => console.error('Email queue processing failed:',error.message)));
    return queued;
}

async function sendPasswordResetEmail({ email, fullName, resetUrl, ...queueOptions }) {
    await sendEmail({
        to: email,
        subject: 'NCA GRC password reset',
        text: `Hello ${fullName},\n\nUse this single-use link within 30 minutes to reset your password:\n${resetUrl}\n\nIf you did not request this, no action is required.`,
        html: `<p>Hello ${fullName},</p><p>Use the secure link below within 30 minutes to reset your password.</p><p><a href="${resetUrl}">Reset Password</a></p><p>If you did not request this, no action is required.</p>`, emailType:'Password Reset', ...queueOptions
    });
}

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function sendWelcomeEmail({ email, fullName, temporaryPassword, loginUrl, ...queueOptions }) {
    const name = escapeHtml(fullName), address = escapeHtml(email), url = escapeHtml(loginUrl);
    return sendEmail({ to: email, subject: 'Welcome to the NCA Enterprise GRC Platform',
        text: `National Communications Authority\n\nEnterprise Governance, Risk, Compliance & Audit Management Platform\n\nDear ${fullName},\n\nYour account has been created successfully.\n\nAccount Details\nName: ${fullName}\nOfficial Email: ${email}\nTemporary Password: ${temporaryPassword}\n\nFor security reasons you must change this temporary password immediately after your first login.\n\n${loginUrl}\n\nSupporting NCA's 2024–2028 Strategic Plan\nMoving from Good to Great\n\nNational Communications Authority`,
        html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#172b4d"><h2 style="color:#006b54">National Communications Authority</h2><p><strong>Enterprise Governance, Risk, Compliance &amp; Audit Management Platform</strong></p><p>Dear ${name},</p><p>Your account has been created successfully.</p><h3>Account Details</h3><p><strong>Name:</strong><br>${name}</p><p><strong>Official Email:</strong><br>${address}</p><p><strong>Temporary Password:</strong><br>${escapeHtml(temporaryPassword)}</p><p>For security reasons you must change this temporary password immediately after your first login.</p><p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#006b54;color:white;text-decoration:none;border-radius:4px">Login to NCA Enterprise GRC Platform</a></p><p>Supporting NCA's 2024–2028 Strategic Plan<br><strong>Moving from Good to Great</strong></p><p>National Communications Authority</p></div>`, emailType:'Welcome', ...queueOptions });
}

async function sendPasswordChangedEmail({ email, fullName, ...queueOptions }) {
    return sendEmail({ to: email, subject: 'Password Changed Successfully', text: `Dear ${fullName},\n\nYour password has been updated successfully.\n\nYour account is now active.\n\nYou may now access the NCA Enterprise GRC Platform.`, html: `<p>Dear ${escapeHtml(fullName)},</p><p>Your password has been updated successfully.</p><p>Your account is now active.</p><p>You may now access the NCA Enterprise GRC Platform.</p>`, emailType:'Password Changed', ...queueOptions });
}

async function verifyEmailTransport() {
    const client = await transporter();
    if (!client) return { configured: false, verified: false };
    await client.verify();
    return { configured: true, verified: true };
}

module.exports = {
    sendEmail,
    sendRawEmail,
    sendPasswordResetEmail,
    sendWelcomeEmail,
    sendPasswordChangedEmail,
    verifyEmailTransport,
    validateRecipient: ncaRecipient,
    validateHeader: cleanHeader
};
