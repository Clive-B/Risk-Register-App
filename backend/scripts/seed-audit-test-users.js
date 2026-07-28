require('dotenv').config();

const bcrypt = require('bcrypt');
const pool = require('../config/db');

const users = [
    {
        staffId:'NCA-TEST-AUDIT-FOCAL',
        name:'Test Internal Audit Risk Focal Person',
        email:'audit.focal@nca.org.gh',
        role:'Risk Focal Person',
        position:'Risk Focal Person',
        phone:'0240000020'
    },
    {
        staffId:'NCA-TEST-AUDIT-CHAMPION',
        name:'Test Internal Audit Risk Champion',
        email:'audit.champion@nca.org.gh',
        role:'Risk Champion',
        position:'Risk Champion',
        phone:'0240000021'
    }
];

(async () => {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Audit test users cannot be seeded in production.');
    }
    const password = String(process.env.TEST_USER_PASSWORD || '');
    if (!password) {
        throw new Error('TEST_USER_PASSWORD must be set.');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    for (const user of users) {
        const result = await pool.query(
            `INSERT INTO users(
                staff_id,full_name,email,password_hash,role,directorate,position,division,phone,
                status,must_change_password,password_changed_at,activation_status,email_status
             ) VALUES($1,$2,$3,$4,$5,'Internal Audit',$6,'Internal Audit',$7,
                'Active',TRUE,NOW(),'Active','Delivered')
             ON CONFLICT(staff_id) DO UPDATE SET
                full_name=EXCLUDED.full_name,email=EXCLUDED.email,
                role=EXCLUDED.role,directorate='Internal Audit',division='Internal Audit',
                position=EXCLUDED.position,phone=EXCLUDED.phone,status='Active',
                activation_status=CASE
                    WHEN users.activation_status='Pending Activation' THEN users.activation_status
                    ELSE 'Active'
                END,
                email_status=CASE
                    WHEN users.email_status='Pending' THEN users.email_status
                    ELSE 'Delivered'
                END
             RETURNING (xmax = 0) AS created`,
            [
                user.staffId,user.name,user.email,passwordHash,
                user.role,user.position,user.phone
            ]
        );
        console.log(`${user.email}: ${result.rows[0].created ? 'created with temporary password' : 'existing password and onboarding state retained'}.`);
    }
    console.log('Internal Audit test-user setup completed safely.');
})()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
