require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const users = [
    ['NCA-TEST-RIPS-FOCAL','Test RIPS Risk Focal Person','test.rips.focal@nca.org.gh','Risk Focal Person','Risk Focal Person','0240000014'],
    ['NCA-TEST-RIPS-CHAMPION','Test RIPS Risk Champion','test.rips.champion@nca.org.gh','Risk Champion','Risk Champion','0240000013']
];

(async()=>{
    if(process.env.NODE_ENV==='production')throw new Error('Test users cannot be seeded in production.');
    const password=String(process.env.TEST_USER_PASSWORD||'');
    if(!password)throw new Error('TEST_USER_PASSWORD must be set.');
    const hash=await bcrypt.hash(password,12);
    for(const [staffId,name,email,role,position,phone] of users){
        const result=await pool.query(`INSERT INTO users(staff_id,full_name,email,password_hash,role,directorate,position,division,phone,status,must_change_password,password_changed_at,activation_status,email_status)
            VALUES($1,$2,$3,$4,$5,'RIPS',$6,'RIPS',$7,'Active',FALSE,NOW(),'Active','Delivered')
            ON CONFLICT(staff_id) DO UPDATE SET
                full_name=EXCLUDED.full_name,email=EXCLUDED.email,role=EXCLUDED.role,
                directorate='RIPS',division='RIPS',position=EXCLUDED.position,phone=EXCLUDED.phone
            RETURNING (xmax = 0) AS created`,
            [staffId,name,email,hash,role,position,phone]);
        console.log(`${email}: ${result.rows[0].created ? 'created' : 'existing password and account state retained'}.`);
    }
    console.log('RIPS test-user setup completed safely.');
})().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>pool.end());
