const pool = require('../config/db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { validatePassword } = require('../config/security');
const { logAudit } = require('../utils/auditLogger');
const { isValidNcaEmail, isValidNcaPhone } = require('../utils/contactValidation');
const { sendWelcomeEmail } = require('../services/emailService');
const { createNotification } = require('../services/notificationService');
const { createAction, completeBySource } = require('../services/actionService');
const {
    BULK_USER_RULES_VERSION,
    DIVISIONS,
    ROLES,
    STATUSES,
    applyConfirmedUsers,
    buildManualUserPreview,
    parseUserWorkbook,
    validateUser:validateBulkUser
} = require('../utils/bulkUserWorkbookCorrectionEngine');

const ALLOWED_ROLES = [
    'System Administrator',
    'Risk Committee Chairman',
    'Risk Champion',
    'Risk Focal Person'
];

const GLOBAL_ROLES = ['System Administrator','Risk Committee Chairman'];

const ALLOWED_DIRECTORATES = [
    'RIPS',
    'Legal',
    'Regulatory Administration',
    'Consumer Affairs',
    'Corporate Affairs',
    'Finance',
    'Engineering',
    'Information Technology',
    'Procurement and Protocol',
    'Internal Audit',
    'Human Resource',
    'ROD',
    'Administration',
    'Cybersecurity',
    'International Affairs'
];

const ALLOWED_STATUSES = ['Active', 'Inactive', 'Disabled'];
function generateTemporaryPassword() {
    return `Nca!${crypto.randomBytes(12).toString('base64url')}`;
}

function normalizeUserInput(body) {
    const role = String(body.role || '').trim();
    const division = GLOBAL_ROLES.includes(role)
        ? null
        : (String(body.directorate || body.division || '').trim() || null);

    return {
        staff_id: String(body.staff_id || '').trim() || null,
        full_name: String(body.full_name || '').trim(),
        email: String(body.email || '').trim().toLowerCase(),
        role,
        directorate: division,
        position: String(body.position || '').trim(),
        division,
        phone: String(body.phone || '').trim(),
        status: String(body.status || 'Active').trim(),
        temporary_password: '',
        force_password_change: true
    };
}

function validateUserInput(user, { requireStatus = false } = {}) {
    const errors = [];

    if (!user.full_name) errors.push('Full name is required.');
    if (!user.email) errors.push('Email is required.');
    if (user.email && !isValidNcaEmail(user.email)) errors.push('Only official NCA email addresses (@nca.org.gh) are permitted.');
    if (!ALLOWED_ROLES.includes(user.role)) errors.push('Select a valid role.');
    if (!GLOBAL_ROLES.includes(user.role) && !ALLOWED_DIRECTORATES.includes(user.division)) {
        errors.push('Select a valid division.');
    }
    if (user.phone && !isValidNcaPhone(user.phone)) errors.push('Phone number must be exactly 10 digits and start with an approved network code.');
    if (user.staff_id && user.staff_id.length > 50) errors.push('Staff ID cannot exceed 50 characters.');
    if (requireStatus && !ALLOWED_STATUSES.includes(user.status)) errors.push('Select a valid status.');

    return errors;
}

async function ensureUniqueUser(input) {
    const {email,staff_id:staffId,excludeId = null} = input;
    const params = [email,staffId || null];
    let query = `
        SELECT id, email, staff_id
        FROM users
        WHERE LOWER(email) = $1
           OR ($2::text IS NOT NULL AND LOWER(staff_id) = LOWER($2))
    `;

    if (excludeId) {
        params.push(excludeId);
        query = `SELECT id,email,staff_id FROM users
                 WHERE (LOWER(email)=$1 OR ($2::text IS NOT NULL AND LOWER(staff_id)=LOWER($2)))
                   AND id<>$3`;
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) return null;

    const duplicateEmail = result.rows.some(row => row.email.toLowerCase() === email);

    if (duplicateEmail) return 'Email already exists.';
    if (staffId && result.rows.some(row => String(row.staff_id || '').toLowerCase() === staffId.toLowerCase())) return 'Staff ID already exists.';

    return 'User already exists.';
}

function decodeUserWorkbook(body) {
    const fileName=String(body.file_name||'').trim();
    if(!/\.(xlsx|xls)$/i.test(fileName))throw Object.assign(new Error('Upload an .xlsx or .xls bulk-user workbook.'),{statusCode:400});
    const encoded=String(body.file_data||'').replace(/^data:.*;base64,/,'').replace(/\s/g,'');
    if(!encoded||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Object.assign(new Error('The uploaded workbook data is invalid.'),{statusCode:400});
    const buffer=Buffer.from(encoded,'base64');
    if(!buffer.length||buffer.length>8*1024*1024)throw Object.assign(new Error('The workbook is empty or exceeds 8 MB.'),{statusCode:400});
    const isZip=buffer.length>=4&&buffer[0]===0x50&&buffer[1]===0x4b;
    const isCompound=buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
    if((/\.xlsx$/i.test(fileName)&&!isZip)||(/\.xls$/i.test(fileName)&&!isCompound))throw Object.assign(new Error('The file contents do not match the selected Excel format.'),{statusCode:400});
    return {fileName,buffer};
}

function buildBulkPreview(body) {
    if(body.mode==='manual')return {source:'Manual multi-user form',rows:buildManualUserPreview(body.rows),sheet_name:null,header_row:null};
    const {fileName,buffer}=decodeUserWorkbook(body);
    const parsed=parseUserWorkbook(buffer);
    return {source:fileName,rows:parsed.rows,sheet_name:parsed.sheet_name,header_row:parsed.header_row};
}

async function addExistingUserErrors(rows) {
    const emails=rows.map(row=>String(row.values.email||'').toLowerCase()).filter(Boolean);
    const staffIds=rows.map(row=>String(row.values.staff_id||'').toLowerCase()).filter(Boolean);
    const existing=(await pool.query(
        `SELECT email,staff_id FROM users
         WHERE LOWER(email)=ANY($1::text[])
            OR (staff_id IS NOT NULL AND LOWER(staff_id)=ANY($2::text[]))`,
        [emails,staffIds]
    )).rows;
    const existingEmails=new Set(existing.map(row=>String(row.email).toLowerCase()));
    const existingStaff=new Set(existing.map(row=>String(row.staff_id||'').toLowerCase()).filter(Boolean));
    rows.forEach(row=>{
        row.errors=[...(row.errors||[])];
        if(existingEmails.has(String(row.values.email||'').toLowerCase()))row.errors.push('An account with this email already exists.');
        if(row.values.staff_id&&existingStaff.has(String(row.values.staff_id).toLowerCase()))row.errors.push('An account with this Staff ID already exists.');
        row.errors=[...new Set(row.errors)];
        row.valid=row.errors.length===0;
    });
    return rows;
}

exports.previewBulkUsers = async(req,res)=>{
    try{
        const preview=buildBulkPreview(req.body);
        await addExistingUserErrors(preview.rows);
        const valid=preview.rows.filter(row=>row.valid).length;
        res.json({success:true,message:'Proposed users analysed. Review and confirm every account before creation.',preview:{
            source:preview.source,sheet_name:preview.sheet_name,header_row:preview.header_row,
            rules_version:BULK_USER_RULES_VERSION,rows:preview.rows,
            approved_roles:ROLES,approved_divisions:DIVISIONS,approved_statuses:STATUSES,
            education:{title:'How governed bulk-user correction works',steps:[
                'The system preserves the original entries and creates a separate account proposal for administrator review.',
                'Official emails are normalised; ambiguous roles and divisions require selection from approved lists.',
                'Staff ID and Phone Number are optional. When blank, both remain blank and no Staff ID is generated.',
                'Every correction displays its detection, proposal, explanation, confidence, validation and audit record.',
                'No account is created until every row is valid and explicitly confirmed.'
            ]},
            summary:{total_rows:preview.rows.length,valid_rows:valid,failed_rows:preview.rows.length-valid}
        }});
    }catch(error){
        console.error('Bulk-user preview failed:',error.message);
        await logAudit({req,action:'BULK_USER_PREVIEW_FAILED',entityType:'User Batch',status:'Failed',details:{source:req.body?.file_name||req.body?.mode,error:error.message}});
        res.status(error.statusCode||500).json({success:false,message:error.statusCode?error.message:'Unable to analyse the proposed users.'});
    }
};

exports.createBulkUsers = async(req,res)=>{
    const client=await pool.connect();
    try{
        const preview=buildBulkPreview(req.body);
        const confirmed=applyConfirmedUsers(preview.rows,req.body.confirmed_rows);
        const emails=confirmed.map(item=>String(item.values.email).toLowerCase());
        const staffIds=confirmed.map(item=>String(item.values.staff_id||'').toLowerCase()).filter(Boolean);
        if(new Set(emails).size!==emails.length)throw Object.assign(new Error('Email addresses must be unique within the batch.'),{statusCode:422});
        if(new Set(staffIds).size!==staffIds.length)throw Object.assign(new Error('Supplied Staff IDs must be unique within the batch.'),{statusCode:422});
        const finalRows=confirmed.map(item=>({...item,errors:validateBulkUser(item.values)}));
        if(finalRows.some(item=>item.errors.length))throw Object.assign(new Error(finalRows.find(item=>item.errors.length).errors[0]),{statusCode:422});
        const existing=(await pool.query(
            `SELECT email,staff_id FROM users WHERE LOWER(email)=ANY($1::text[])
             OR (staff_id IS NOT NULL AND LOWER(staff_id)=ANY($2::text[]))`,
            [emails,staffIds]
        )).rows;
        if(existing.length)throw Object.assign(new Error('One or more confirmed emails or Staff IDs already belong to existing accounts.'),{statusCode:409});

        const prepared=[];
        for(const item of finalRows){
            const temporaryPassword=generateTemporaryPassword();
            const passwordHash=await bcrypt.hash(temporaryPassword,12);
            prepared.push({...item,temporaryPassword,passwordHash});
        }
        const batchId=crypto.randomUUID();
        await client.query('BEGIN');
        const created=[];
        for(const item of prepared){
            const user=item.values;
            const inserted=(await client.query(
                `INSERT INTO users(
                    staff_id,full_name,email,password_hash,role,directorate,position,division,phone,status,
                    must_change_password,password_changed_at,created_by,activation_status,email_status
                 ) VALUES($1,$2,$3,$4,$5,$6,$7,$6,$8,$9,TRUE,NOW(),$10,'Pending Activation','Queued')
                 RETURNING id,staff_id,full_name,email,role,directorate,position,division,phone,status,
                    created_at,activation_status,email_status,must_change_password`,
                [user.staff_id||null,user.full_name,user.email,item.passwordHash,user.role,user.division||null,user.position||null,user.phone||null,user.status,req.user.id]
            )).rows[0];
            created.push({...inserted,temporaryPassword:item.temporaryPassword,correctionAudit:item.audit});
        }
        await client.query('COMMIT');

        let queued=0;
        for(const user of created){
            await logAudit({req,action:'USER_CREATED_BULK',entityType:'User',entityId:user.id,details:{batchId,correctionConfirmation:user.correctionAudit}});
            await createAction({actionKey:`user-activation:${user.id}`,module:'User Management',actionType:'Activate User',title:`User awaiting activation: ${user.full_name}`,description:`${user.email} must complete the first-login password change.`,priority:'Medium',status:'Waiting for Review',assignedTo:req.user.id,assignedRole:'System Administrator',assignedBy:req.user.id,sourceType:'UserActivation',sourceId:user.id,actionUrl:'pages/users.html',availableActions:['view','dismiss']},{req});
            const delivery=await deliverWelcomeEmail({req,user,temporaryPassword:user.temporaryPassword,auditAction:'WELCOME_EMAIL_SENT'});
            if(delivery.sent)queued+=1;
        }
        await logAudit({req,action:'BULK_USERS_CREATED',entityType:'User Batch',entityId:batchId,details:{created:created.length,welcomeEmailsQueued:queued,rulesVersion:BULK_USER_RULES_VERSION}});
        await notifyAdministrators(req,'Bulk User Creation Completed',`${created.length} accounts were created; ${queued} welcome emails were queued.`,null);
        res.status(201).json({success:true,message:`${created.length} accounts created. ${queued} welcome emails queued.`,summary:{total_rows:created.length,created_users:created.length,welcome_emails_queued:queued,failed_rows:0},users:created.map(({temporaryPassword,correctionAudit,...user})=>user)});
    }catch(error){
        await client.query('ROLLBACK').catch(()=>{});
        console.error('Bulk-user creation failed:',error.message);
        await logAudit({req,action:'BULK_USERS_CREATE_FAILED',entityType:'User Batch',status:'Failed',details:{source:req.body?.file_name||req.body?.mode,error:error.message}});
        res.status(error.statusCode||(error.code==='23505'?409:500)).json({success:false,message:error.statusCode?error.message:error.code==='23505'?'A confirmed email or Staff ID already exists.':'Unable to create the user batch. No accounts were saved.'});
    }finally{client.release();}
};

exports.createUser = async (req, res) => {
    let createdUser;
    try {
        const user = normalizeUserInput(req.body);
        const errors = validateUserInput(user);

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: errors[0],
                errors
            });
        }

        const duplicateMessage = await ensureUniqueUser(user);

        if (duplicateMessage) {
            return res.status(409).json({
                success: false,
                message: duplicateMessage
            });
        }

        const temporaryPassword = generateTemporaryPassword();
        const passwordErrors = validatePassword(temporaryPassword);
        if (passwordErrors.length) return res.status(400).json({ success:false, message:passwordErrors[0], errors:passwordErrors });
        const passwordHash = await bcrypt.hash(temporaryPassword, 12);
        const client = await pool.connect();
        let result;
        try {
          await client.query('BEGIN');
          result = await client.query(
            `
            INSERT INTO users (
                staff_id,
                full_name,
                email,
                password_hash,
                role,
                directorate,
                position,
                division,
                phone,
                status,
                must_change_password,
                password_changed_at,
                created_by, activation_status, email_status
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12,'Pending Activation','Queued')
            RETURNING
                id,
                staff_id,
                full_name,
                email,
                role,
                directorate,
                position,
                division,
                phone,
                status,
                created_at, activation_status, email_status, must_change_password
            `,
            [
                user.staff_id,user.full_name,user.email,passwordHash,user.role,user.division,
                user.position,user.division,user.phone || null,user.status,
                user.force_password_change,req.user.id
            ]
        );
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
        createdUser = result.rows[0];

        await logAudit({req,action:'USER_CREATED',entityType:'User',entityId:createdUser.id});
        await notifyAdministrators(req, 'User Created', `${createdUser.full_name} has been created and is pending first-login activation.`, createdUser.id);
        await createAction({actionKey:`user-activation:${createdUser.id}`,module:'User Management',actionType:'Activate User',title:`User awaiting activation: ${createdUser.full_name}`,description:`${createdUser.email} must complete the first-login password change.`,priority:'Medium',status:'Waiting for Review',assignedTo:req.user.id,assignedRole:'System Administrator',assignedBy:req.user.id,sourceType:'UserActivation',sourceId:createdUser.id,actionUrl:'pages/users.html',availableActions:['view','dismiss']},{req});
        const emailResult = await deliverWelcomeEmail({ req, user: createdUser, temporaryPassword, auditAction: 'WELCOME_EMAIL_SENT' });
        res.status(201).json({
            success: true,
            message: emailResult.sent ? 'User created and welcome email queued successfully.' : 'User created, but the welcome email could not be queued. You can retry from User Management.',
            user: { ...createdUser, email_status: emailResult.status }
        });
    } catch (err) {
        console.error(err);
        const duplicate = err.code === '23505';
        res.status(duplicate ? 409 : 500).json({
            success: false,
            message: duplicate ? 'A user with this official NCA email already exists.' : 'Unable to create user. No account was saved.'
        });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = normalizeUserInput(req.body);
        const errors = validateUserInput(user, { requireStatus: true });

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: errors[0],
                errors
            });
        }

        const duplicateMessage = await ensureUniqueUser({
            ...user,
            excludeId: id
        });

        if (duplicateMessage) {
            return res.status(409).json({
                success: false,
                message: duplicateMessage
            });
        }

        const result = await pool.query(
            `
            UPDATE users
            SET
                staff_id = $1,
                full_name = $2,
                email = $3,
                role = $4,
                directorate = $5,
                position = $6,
                division = $7,
                phone = $8,
                status = $9,
                updated_by = $10,
                updated_at = NOW()
            WHERE id = $11
            RETURNING
                id,
                staff_id,
                full_name,
                email,
                role,
                directorate,
                position,
                division,
                phone,
                status,
                created_at
            `,
            [
                user.staff_id,user.full_name,user.email,user.role,user.division,user.position,
                user.division,user.phone || null,user.status,req.user.id,id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        await logAudit({req,action:'USER_UPDATED',entityType:'User',entityId:id});
        res.json({
            success: true,
            message: 'User updated successfully.',
            user: result.rows[0]
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            message: 'Unable to update user.'
        });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                users.id,
                users.staff_id,
                users.full_name,
                users.email,
                users.role,
                users.directorate,
                users.position,
                users.division,
                users.phone,
                users.status,
                users.created_at,
                users.last_login,
                users.locked_until,
                users.must_change_password,
                users.password_changed_at, users.activation_status, users.email_status,
                CASE WHEN users.must_change_password THEN 'Temporary' ELSE 'Changed' END AS password_status,
                CASE WHEN users.must_change_password THEN 'Yes' ELSE 'No' END AS force_password_change,
                users.identity_type,users.assignment_status,users.role_email,users.role_slot_id,
                slot.display_name AS role_slot_name,
                CASE WHEN slot.current_holder_user_id=users.id THEN TRUE ELSE FALSE END AS is_current_role_holder
            FROM users
            LEFT JOIN organizational_role_slots slot ON slot.id=users.role_slot_id
            ORDER BY users.full_name
        `);

        res.json({
            success: true,
            users: result.rows
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            message: 'Unable to load users.'
        });
    }
};

exports.getRoleSlots = async (req,res) => {
    try {
        const result=await pool.query(`
            SELECT slot.id,slot.slot_key,slot.role_email,slot.role,slot.division,slot.display_name,slot.status,
                   holder.id AS holder_user_id,holder.full_name AS holder_name,holder.email AS holder_email,
                   holder.staff_id,holder.position,holder.identity_type,holder.activation_status,holder.email_status,
                   holder.must_change_password,
                   assignment.id AS assignment_id,assignment.effective_from,assignment.replacement_reason
            FROM organizational_role_slots slot
            LEFT JOIN users holder ON holder.id=slot.current_holder_user_id
            LEFT JOIN role_slot_assignments assignment
              ON assignment.slot_id=slot.id AND assignment.status='Current'
            ORDER BY COALESCE(slot.division,''),slot.role,slot.display_name
        `);
        res.json({success:true,role_slots:result.rows});
    } catch(error) {
        console.error(error);
        res.status(500).json({success:false,message:'Unable to load organizational account mappings.'});
    }
};

exports.getRoleSlotHistory = async (req,res) => {
    try {
        const slot=(await pool.query('SELECT * FROM organizational_role_slots WHERE id=$1',[req.params.id])).rows[0];
        if(!slot)return res.status(404).json({success:false,message:'Organizational role account not found.'});
        const history=(await pool.query(`
            SELECT assignment.*,administrator.full_name AS assigned_by_name,ender.full_name AS ended_by_name
            FROM role_slot_assignments assignment
            LEFT JOIN users administrator ON administrator.id=assignment.assigned_by
            LEFT JOIN users ender ON ender.id=assignment.ended_by
            WHERE assignment.slot_id=$1
            ORDER BY assignment.effective_from DESC,assignment.created_at DESC`,[slot.id])).rows;
        res.json({success:true,slot,history});
    } catch(error) {
        console.error(error);
        res.status(500).json({success:false,message:'Unable to load role-holder history.'});
    }
};

exports.mapRoleSlot = async (req,res) => {
    const fullName=String(req.body.full_name||'').trim();
    const email=String(req.body.email||'').trim().toLowerCase();
    const staffId=String(req.body.staff_id||'').trim()||null;
    const position=String(req.body.position||'').trim()||null;
    const reason=String(req.body.replacement_reason||'').trim();
    const effectiveFrom=String(req.body.effective_from||'').trim()||new Date().toISOString().slice(0,10);
    const deferOnboarding=req.body.defer_onboarding===true||String(req.body.defer_onboarding||'').toLowerCase()==='true'||String(req.body.defer_onboarding||'').toLowerCase()==='on';
    if(!fullName)return res.status(400).json({success:false,message:'The new role holder\'s full name is required.'});
    if(!isValidNcaEmail(email))return res.status(400).json({success:false,message:'Enter the employee\'s official @nca.org.gh email address.'});
    if(!reason)return res.status(400).json({success:false,message:'Record the reason for this personnel assignment.'});
    if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom))return res.status(400).json({success:false,message:'Select a valid effective date.'});

    const temporaryPassword=generateTemporaryPassword();
    const passwordHash=await bcrypt.hash(temporaryPassword,12);
    const client=await pool.connect();
    let createdUser;
    let slot;
    let formerHolder;
    try {
        await client.query('BEGIN');
        slot=(await client.query('SELECT * FROM organizational_role_slots WHERE id=$1 AND status=\'Active\' FOR UPDATE',[req.params.id])).rows[0];
        if(!slot)throw Object.assign(new Error('Organizational role account not found.'),{statusCode:404});
        const existingUser=(await client.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1) FOR UPDATE',[email])).rows[0];
        if(existingUser?.identity_type==='Role Placeholder')throw Object.assign(new Error('That address is a permanent organizational role account and cannot be assigned as a named employee.'),{statusCode:409});
        if(existingUser?.assignment_status==='Current'&&Number(existingUser.role_slot_id)!==Number(slot.id))throw Object.assign(new Error('This employee currently holds another organizational role. Map their successor in that role first, then assign this promotion or transfer.'),{statusCode:409});
        if(existingUser&&Number(existingUser.id)===Number(slot.current_holder_user_id))throw Object.assign(new Error('This employee is already the current holder of this role.'),{statusCode:409});
        if(staffId){
            const staffDuplicate=(await client.query('SELECT id FROM users WHERE LOWER(staff_id)=LOWER($1)',[staffId])).rows[0];
            if(staffDuplicate&&Number(staffDuplicate.id)!==Number(existingUser?.id))throw Object.assign(new Error('That Staff ID already belongs to a system account.'),{statusCode:409});
        }
        formerHolder=slot.current_holder_user_id
            ? (await client.query('SELECT id,full_name,email FROM users WHERE id=$1 FOR UPDATE',[slot.current_holder_user_id])).rows[0]
            : null;
        if(existingUser){
            createdUser=(await client.query(`UPDATE users SET staff_id=$1,full_name=$2,password_hash=$3,role=$4,
                directorate=$5,division=$5,position=$6,status='Active',must_change_password=TRUE,password_changed_at=NOW(),
                activation_status='Pending Activation',email_status='Queued',role_slot_id=$7,identity_type='Named Employee',
                role_email=$8,assignment_status='Current',failed_login_attempts=0,locked_until=NULL,
                token_version=token_version+1,updated_by=$9,updated_at=NOW() WHERE id=$10
                RETURNING id,staff_id,full_name,email,role,directorate,division,position,status,
                          activation_status,email_status,must_change_password,role_slot_id,identity_type,role_email`,
                [staffId,fullName,passwordHash,slot.role,slot.division,position,slot.id,slot.role_email,req.user.id,existingUser.id])).rows[0];
            await client.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[existingUser.id]);
        }else{
            createdUser=(await client.query(`
                INSERT INTO users(
                    staff_id,full_name,email,password_hash,role,directorate,position,division,status,
                    must_change_password,password_changed_at,created_by,activation_status,email_status,
                    role_slot_id,identity_type,role_email,assignment_status
                ) VALUES($1,$2,$3,$4,$5,$6,$7,$6,'Active',TRUE,NOW(),$8,'Pending Activation','Queued',$9,'Named Employee',$10,'Current')
                RETURNING id,staff_id,full_name,email,role,directorate,division,position,status,
                          activation_status,email_status,must_change_password,role_slot_id,identity_type,role_email`,
                [staffId,fullName,email,passwordHash,slot.role,slot.division,position,req.user.id,slot.id,slot.role_email]
            )).rows[0];
        }
        if(deferOnboarding){
            await client.query("UPDATE users SET email_status='Deferred',updated_at=NOW() WHERE id=$1",[createdUser.id]);
            createdUser.email_status='Deferred';
        }
        await client.query(`UPDATE role_slot_assignments SET status='Ended',effective_to=$2::date,ended_at=NOW(),ended_by=$3
                            WHERE slot_id=$1 AND status='Current'`,[slot.id,effectiveFrom,req.user.id]);
        if(formerHolder&&Number(formerHolder.id)!==Number(createdUser.id)){
            await client.query(`UPDATE users SET status='Inactive',activation_status='Disabled',assignment_status='Former',
                                token_version=token_version+1,updated_by=$2,updated_at=NOW() WHERE id=$1`,[formerHolder.id,req.user.id]);
            await client.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[formerHolder.id]);
            await client.query(`UPDATE actions SET assigned_to=$2,updated_at=NOW()
                                WHERE assigned_to=$1 AND status NOT IN ('Completed','Cancelled')`,[formerHolder.id,createdUser.id]);
            if(slot.role==='Risk Focal Person'){
                await client.query(`UPDATE risk_register_import_batches SET accountable_focal_id=$2,updated_at=NOW()
                                    WHERE accountable_focal_id=$1 AND status IN ('Awaiting Focal Review','Returned')`,[formerHolder.id,createdUser.id]);
                await client.query(`UPDATE risks SET accountable_focal_id=$2,updated_at=NOW()
                                    WHERE accountable_focal_id=$1 AND admission_status<>'Admitted'`,[formerHolder.id,createdUser.id]);
            }
        }
        await client.query(`INSERT INTO role_slot_assignments(
            slot_id,user_id,employee_email,employee_name,staff_id,position,effective_from,replacement_reason,status,assigned_by,metadata
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Current',$9,$10::jsonb)`,[
            slot.id,createdUser.id,email,fullName,staffId,position,effectiveFrom,reason,req.user.id,
            JSON.stringify({role_email:slot.role_email,former_holder_user_id:formerHolder?.id||null})
        ]);
        await client.query('UPDATE organizational_role_slots SET current_holder_user_id=$1,updated_at=NOW() WHERE id=$2',[createdUser.id,slot.id]);
        await client.query('COMMIT');
    } catch(error) {
        await client.query('ROLLBACK').catch(()=>{});
        client.release();
        console.error(error);
        return res.status(error.statusCode||(error.code==='23505'?409:500)).json({success:false,message:error.statusCode?error.message:'Unable to map the organizational account. No changes were saved.'});
    }
    client.release();

    await logAudit({req,action:'ROLE_HOLDER_ASSIGNED',entityType:'Organizational Role',entityId:slot.id,details:{role_email:slot.role_email,new_user_id:createdUser.id,former_user_id:formerHolder?.id||null,effective_from:effectiveFrom,replacement_reason:reason}});
    if(deferOnboarding){
        await logAudit({req,action:'ROLE_HOLDER_ONBOARDING_DEFERRED',entityType:'User',entityId:createdUser.id,details:{role_slot_id:slot.id}});
        return res.status(201).json({
            success:true,
            message:'The role holder was mapped and onboarding was deferred for the group send.',
            user:{...createdUser,email_status:'Deferred'},role_slot:{id:slot.id,role_email:slot.role_email}
        });
    }
    const delivery=await deliverWelcomeEmail({req,user:createdUser,temporaryPassword,auditAction:'ROLE_HOLDER_WELCOME_EMAIL'});
    res.status(201).json({
        success:true,
        message:delivery.sent
            ? 'The new role holder was mapped, prior access was revoked, and onboarding email delivery was queued.'
            : 'The new role holder was mapped and prior access was revoked, but the onboarding email could not be queued. Generate a new temporary password from User Management to retry.',
        user:{...createdUser,email_status:delivery.status},role_slot:{id:slot.id,role_email:slot.role_email}
    });
};

exports.clearRoleSlot = async (req,res) => {
    const reason=String(req.body.reason||'').trim();
    const effectiveTo=String(req.body.effective_to||'').trim()||new Date().toISOString().slice(0,10);
    if(!reason)return res.status(400).json({success:false,message:'Record the reason for clearing this role holder.'});
    if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo))return res.status(400).json({success:false,message:'Select a valid effective date.'});
    const client=await pool.connect();
    let slot,holder;
    try{
        await client.query('BEGIN');
        slot=(await client.query("SELECT * FROM organizational_role_slots WHERE id=$1 AND status='Active' FOR UPDATE",[req.params.id])).rows[0];
        if(!slot)throw Object.assign(new Error('Organizational role account not found.'),{statusCode:404});
        if(!slot.current_holder_user_id)throw Object.assign(new Error('This organizational role is already unassigned.'),{statusCode:409});
        holder=(await client.query('SELECT id,full_name,email,role FROM users WHERE id=$1 FOR UPDATE',[slot.current_holder_user_id])).rows[0];
        if(!holder)throw Object.assign(new Error('The current role-holder record could not be found.'),{statusCode:409});
        await client.query(`UPDATE role_slot_assignments
            SET status='Ended',effective_to=$2::date,ended_at=NOW(),ended_by=$3,
                metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object('clearance_reason',$4,'cleared_without_successor',true)
            WHERE slot_id=$1 AND status='Current'`,[slot.id,effectiveTo,req.user.id,reason]);
        await client.query(`UPDATE users SET status='Inactive',activation_status='Disabled',assignment_status='Former',
            token_version=token_version+1,updated_by=$2,updated_at=NOW() WHERE id=$1`,[holder.id,req.user.id]);
        await client.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[holder.id]);
        await client.query(`UPDATE actions SET assigned_to=$2,assigned_role='System Administrator',updated_at=NOW()
            WHERE assigned_to=$1 AND status NOT IN ('Completed','Cancelled')`,[holder.id,req.user.id]);
        if(slot.role==='Risk Focal Person'){
            await client.query(`UPDATE risk_register_import_batches SET accountable_focal_id=NULL,updated_at=NOW()
                WHERE accountable_focal_id=$1 AND status IN ('Awaiting Focal Review','Returned')`,[holder.id]);
            await client.query(`UPDATE risks SET accountable_focal_id=NULL,updated_at=NOW()
                WHERE accountable_focal_id=$1 AND admission_status<>'Admitted'`,[holder.id]);
        }
        await client.query('UPDATE organizational_role_slots SET current_holder_user_id=NULL,updated_at=NOW() WHERE id=$1',[slot.id]);
        await client.query('COMMIT');
    }catch(error){
        await client.query('ROLLBACK').catch(()=>{});
        console.error(error);
        return res.status(error.statusCode||500).json({success:false,message:error.statusCode?error.message:'Unable to clear the role holder. No changes were saved.'});
    }finally{client.release();}
    await logAudit({req,action:'ROLE_HOLDER_CLEARED',entityType:'Organizational Role',entityId:slot.id,details:{role_email:slot.role_email,former_user_id:holder.id,effective_to:effectiveTo,reason}});
    res.json({success:true,message:`${slot.display_name} is now unassigned. The former holder was deactivated, sessions were revoked, and history was preserved.`});
};

exports.sendDeferredRoleHolderOnboarding = async (req,res) => {
    const client=await pool.connect();
    const prepared=[];
    try{
        await client.query('BEGIN');
        const holders=(await client.query(`SELECT holder.id,holder.full_name,holder.email,holder.role,holder.division,slot.id AS slot_id
            FROM organizational_role_slots slot JOIN users holder ON holder.id=slot.current_holder_user_id
            WHERE slot.status='Active' AND holder.status='Active' AND holder.assignment_status='Current'
              AND holder.email_status='Deferred'
            ORDER BY COALESCE(slot.division,''),slot.role,slot.id
            FOR UPDATE OF holder,slot`)).rows;
        if(!holders.length){await client.query('ROLLBACK');return res.status(409).json({success:false,message:'There are no deferred role-holder onboarding emails to send.'});}
        if(holders.length>100)throw Object.assign(new Error('Group onboarding is limited to 100 account holders at a time.'),{statusCode:422});
        for(const holder of holders){
            const temporaryPassword=generateTemporaryPassword();
            const passwordHash=await bcrypt.hash(temporaryPassword,12);
            await client.query(`UPDATE users SET password_hash=$1,must_change_password=TRUE,password_changed_at=NOW(),
                last_password_reset=NOW(),activation_status='Pending Activation',email_status='Queued',
                token_version=token_version+1,failed_login_attempts=0,locked_until=NULL,updated_by=$2,updated_at=NOW()
                WHERE id=$3`,[passwordHash,req.user.id,holder.id]);
            await client.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[holder.id]);
            prepared.push({...holder,temporaryPassword});
        }
        await client.query('COMMIT');
    }catch(error){
        await client.query('ROLLBACK').catch(()=>{});
        console.error(error);
        return res.status(error.statusCode||500).json({success:false,message:error.statusCode?error.message:'Unable to prepare group onboarding. No credentials were changed.'});
    }finally{client.release();}
    const results=[];
    for(const holder of prepared){
        const delivery=await deliverWelcomeEmail({req,user:holder,temporaryPassword:holder.temporaryPassword,auditAction:'GROUP_ROLE_HOLDER_ONBOARDING'});
        results.push({userId:holder.id,status:delivery.status});
    }
    const queued=results.filter(item=>item.status==='Queued').length;
    await logAudit({req,action:'GROUP_ROLE_HOLDER_ONBOARDING',entityType:'Organizational Role',details:{total:prepared.length,queued,failed:prepared.length-queued,role_slot_ids:prepared.map(item=>item.slot_id)}});
    res.status(queued===prepared.length?200:207).json({success:queued>0,message:`${queued} of ${prepared.length} deferred onboarding emails were queued.`,summary:{total:prepared.length,queued,failed:prepared.length-queued}});
};

async function notifyAdministrators(req, title, message, entityId) {
    const admins = await pool.query("SELECT id FROM users WHERE role='System Administrator' AND status='Active'");
    await Promise.allSettled(admins.rows.map(admin => createNotification({ actor:req.user, req, userId:admin.id, title, message, type:'System', category:'User Management', priority:'Normal', entityType:'User', entityId, createdBy:req.user?.id })));
}

async function deliverWelcomeEmail({ req, user, temporaryPassword, auditAction }) {
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5500'}/index.html`;
    try {
        const info = await sendWelcomeEmail({ email:user.email, fullName:user.full_name, temporaryPassword, loginUrl, userId:user.id, role:user.role, directorate:user.division||user.directorate, sentBy:req.user?.id });
        await pool.query(`UPDATE users SET email_status='Queued',welcome_email_last_attempt_at=NOW() WHERE id=$1`,[user.id]);
        await logAudit({req,action:'WELCOME_EMAIL_QUEUED',entityType:'User',entityId:user.id,details:{deliveryId:info?.messageId}});
        return { sent:true,status:'Queued' };
    } catch (error) {
        await pool.query(`UPDATE users SET email_status='Failed',welcome_email_last_attempt_at=NOW() WHERE id=$1`,[user.id]);
        await pool.query(`UPDATE email_deliveries SET status='Failed',attempted_at=NOW(),error_message=$2 WHERE id=(SELECT id FROM email_deliveries WHERE recipient_user_id=$1 AND email_type='Welcome' ORDER BY created_at DESC LIMIT 1)`,[user.id,String(error.message).slice(0,1000)]);
        await logAudit({req,action:'WELCOME_EMAIL_FAILED',entityType:'User',entityId:user.id,status:'Failed'});
        await notifyAdministrators(req, 'Welcome Email Failed', `The welcome email for ${user.full_name} could not be sent.`, user.id);
        const admins=(await pool.query("SELECT id FROM users WHERE role='System Administrator' AND status='Active'")).rows;for(const admin of admins)await createAction({actionKey:`welcome-email-failed:${user.id}:${admin.id}:${Date.now()}`,module:'Communication',actionType:'Retry Email',title:`Welcome email failed: ${user.full_name}`,description:'Review SMTP status and retry the welcome email.',priority:'High',status:'Pending',assignedTo:admin.id,assignedRole:'System Administrator',sourceType:'WelcomeEmail',sourceId:user.id,actionUrl:'pages/communication-centre.html',availableActions:['view','dismiss']},{req});
        return { sent:false,status:'Failed' };
    }
}

exports.setAccountState = async (req,res) => {
    const action=req.params.action; const map={activate:['Active','Active','ACCOUNT_ACTIVATED'],deactivate:['Inactive','Disabled','USER_DEACTIVATED'],lock:['Active','Locked','ACCOUNT_LOCKED'],unlock:['Active','Active','ACCOUNT_UNLOCKED']};
    if(!map[action])return res.status(400).json({success:false,message:'Invalid account action.'});
    const [status,activation,audit]=map[action]; const locked=action==='lock' ? "NOW()+INTERVAL '100 years'" : 'NULL';
    const result=await pool.query(`UPDATE users SET status=$2,activation_status=$3,locked_until=${locked},failed_login_attempts=0,activated_at=CASE WHEN $3='Active' THEN NOW() ELSE activated_at END,updated_by=$4,updated_at=NOW() WHERE id=$1 RETURNING id,full_name`,[req.params.id,status,activation,req.user.id]);
    if(!result.rowCount)return res.status(404).json({success:false,message:'User not found.'});
    if(status!=='Active')await pool.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[req.params.id]);
    await logAudit({req,action:audit,entityType:'User',entityId:req.params.id});
    if(action==='activate')await notifyAdministrators(req,'Account Activated',`${result.rows[0].full_name}'s account was activated.`,req.params.id);
    res.json({success:true,message:`Account ${action}d successfully.`});
};

exports.getAuditHistory = async (req,res) => {
    const result=await pool.query(`SELECT * FROM audit_logs WHERE entity_type='User' AND entity_id=$1 ORDER BY created_at DESC LIMIT 200`,[String(req.params.id)]);
    res.json({success:true,auditLogs:result.rows});
};

exports.generateTemporaryPassword = async (req,res) => {
    const result=await pool.query('SELECT id,full_name,email,password_hash FROM users WHERE id=$1',[req.params.id]);
    const user=result.rows[0]; if(!user)return res.status(404).json({success:false,message:'User not found.'});
    const temporaryPassword=`Nca!${crypto.randomBytes(9).toString('base64url')}`;
    const hash=await bcrypt.hash(temporaryPassword,12); const client=await pool.connect();
    try { await client.query('BEGIN'); await client.query('INSERT INTO password_history(user_id,password_hash) VALUES($1,$2)',[user.id,user.password_hash]);
        await client.query(`UPDATE users SET password_hash=$1,must_change_password=TRUE,password_changed_at=NOW(),last_password_reset=NOW(),activation_status='Pending Activation',email_status='Queued',token_version=token_version+1,updated_by=$2,updated_at=NOW() WHERE id=$3`,[hash,req.user.id,user.id]);
        await client.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[user.id]);
        await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    await logAudit({req,action:'TEMPORARY_PASSWORD_REGENERATED',entityType:'User',entityId:user.id});
    const delivery=await deliverWelcomeEmail({req,user,temporaryPassword,auditAction:'WELCOME_EMAIL_RESENT'});
    res.status(delivery.sent?200:502).json({success:delivery.sent,message:delivery.sent?'A new temporary password was generated and securely queued for email delivery.':'The temporary password was regenerated, but the email could not be queued. Generate another temporary password to retry securely.'});
};

exports.unlockUser = async (req,res) => {
    const result=await pool.query('UPDATE users SET failed_login_attempts=0,locked_until=NULL,updated_by=$2,updated_at=NOW() WHERE id=$1 RETURNING id',[req.params.id,req.user.id]);
    if(!result.rowCount)return res.status(404).json({success:false,message:'User not found.'});
    await logAudit({req,action:'ACCOUNT_UNLOCK',entityType:'User',entityId:req.params.id});
    res.json({success:true,message:'Account unlocked successfully.'});
};

exports.resetPassword = async (req,res) => {
    const password=String(req.body.newPassword||'');const errors=validatePassword(password);if(password!==req.body.confirmPassword)errors.push('Passwords do not match.');
    if(errors.length)return res.status(400).json({success:false,message:errors[0],errors});const client=await pool.connect();
    try{await client.query('BEGIN');const found=await client.query('SELECT id,password_hash FROM users WHERE id=$1 FOR UPDATE',[req.params.id]);const user=found.rows[0];if(!user){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'User not found.'});}
        const history=await client.query('SELECT password_hash FROM password_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5',[user.id]);
        if(await bcrypt.compare(password,user.password_hash)){await client.query('ROLLBACK');return res.status(400).json({success:false,message:'Choose a password the user has not used recently.'});}
        for(const row of history.rows){if(await bcrypt.compare(password,row.password_hash)){await client.query('ROLLBACK');return res.status(400).json({success:false,message:'Choose a password the user has not used recently.'});}}
        const hash=await bcrypt.hash(password,12);await client.query('INSERT INTO password_history(user_id,password_hash) VALUES($1,$2)',[user.id,user.password_hash]);
        await client.query(`UPDATE users SET password_hash=$1,must_change_password=$2,password_changed_at=NOW(),last_password_reset=NOW(),failed_login_attempts=0,locked_until=NULL,token_version=token_version+1,updated_by=$3,updated_at=NOW() WHERE id=$4`,[hash,req.body.forceChange!==false,req.user.id,user.id]);
        await client.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[user.id]);await client.query('COMMIT');await logAudit({req,action:'PASSWORD_RESET',entityType:'User',entityId:user.id});res.json({success:true,message:'Password reset successfully.'});
    }catch(e){await client.query('ROLLBACK');console.error(e);res.status(500).json({success:false,message:'Unable to reset password.'});}finally{client.release();}
};

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `
            UPDATE users
            SET status = 'Inactive'
            WHERE id = $1
            RETURNING id
            `,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        await pool.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[id]);
        await logAudit({req,action:'USER_DEACTIVATED',entityType:'User',entityId:id});

        res.json({
            success: true,
            message: 'User deactivated successfully.'
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            message: 'Unable to deactivate user.'
        });
    }
};
