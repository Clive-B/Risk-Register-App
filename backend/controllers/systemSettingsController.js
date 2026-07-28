const pool=require('../config/db');
const {PASSWORD_POLICY}=require('../config/security');

exports.overview=async(req,res,next)=>{
    try{
        const [migrations,smtp,users,sessions]=await Promise.all([
            pool.query('SELECT COUNT(*)::int count,MAX(applied_at) last_applied FROM schema_migrations'),
            pool.query('SELECT host,port,sender_name,sender_email,encryption,connection_status,last_checked_at,updated_at FROM smtp_settings WHERE id=1'),
            pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='Active')::int active,
                COUNT(*) FILTER(WHERE locked_until>NOW())::int locked FROM users`),
            pool.query('SELECT COUNT(*)::int active FROM user_sessions WHERE revoked_at IS NULL AND expires_at>NOW()')
        ]);
        res.json({success:true,data:{
            environment:process.env.NODE_ENV||'development',
            timezone:process.env.TZ||'Africa/Accra',
            authentication:'Enabled',
            database:'Connected',
            migrations:migrations.rows[0],
            smtp:smtp.rows[0]||{connection_status:'Not configured'},
            users:users.rows[0],
            activeSessions:sessions.rows[0].active,
            passwordPolicy:PASSWORD_POLICY
        }});
    }catch(error){next(error);}
};
