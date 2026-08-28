require('dotenv').config();

const bcrypt = require('bcrypt');
const pool = require('../config/db');

const users = [
    {
        staffId: 'NCA-GRC-ADMIN',
        fullName: 'System Administrator',
        email: 'admin@nca.org.gh',
        role: 'System Administrator',
        division: null,
        position: 'System Administrator',
        phone: '0240000001'
    },
    {
        staffId: 'NCA-GRC-CHAIR',
        fullName: 'Risk Committee Chairman',
        email: 'chairman@nca.org.gh',
        role: 'Risk Committee Chairman',
        division: null,
        position: 'Risk Committee Chairman',
        phone: '0240000002'
    },
    {
        staffId: 'NCA-GRC-IT-CHAMPION',
        fullName: 'Information Technology Risk Champion',
        email: 'information.technology.champion@nca.org.gh',
        role: 'Risk Champion',
        division: 'Information Technology',
        position: 'Risk Champion',
        phone: '0240000003'
    },
    {
        staffId: 'NCA-GRC-IT-FOCAL',
        fullName: 'Information Technology Risk Focal Person',
        email: 'information.technology.focal@nca.org.gh',
        role: 'Risk Focal Person',
        division: 'Information Technology',
        position: 'Risk Focal Person',
        phone: '0240000004'
    }
];

async function seed() {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Test users cannot be seeded in production.');
    }

    const password = String(process.env.TEST_USER_PASSWORD || '');
    if (!password) {
        throw new Error('TEST_USER_PASSWORD must be set before seeding test users.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (const user of users) {
            await client.query(
                `INSERT INTO users (
                    staff_id, full_name, email, password_hash, role, directorate,
                    position, division, phone, status, must_change_password,
                    password_changed_at, activation_status, email_status
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$6,$8,'Active',FALSE,NOW(),'Active','Delivered')
                ON CONFLICT (staff_id) DO UPDATE SET
                    full_name=EXCLUDED.full_name,
                    email=EXCLUDED.email,
                    role=EXCLUDED.role,
                    directorate=EXCLUDED.directorate,
                    position=EXCLUDED.position,
                    division=EXCLUDED.division,
                    phone=EXCLUDED.phone
                RETURNING (xmax = 0) AS created`,
                [user.staffId, user.fullName, user.email, passwordHash, user.role, user.division, user.position, user.phone]
            );
        }

        await client.query('COMMIT');
        console.log(`Test-user setup completed for ${users.length} accounts. Existing passwords and account states were retained.`);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
