const pool=require('../config/db');const repo=require('../repositories/dashboardRepository');

async function loadNotifications(userId){
  try{
    const result=await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',[userId]);
    return result.rows || [];
  }catch(error){
    console.error('[dashboardController] Failed to load notifications:', error.message);
    return [];
  }
}

async function loadMessages(userId){
  try{
    const result=await pool.query('SELECT * FROM internal_messages WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 10',[userId]);
    return result.rows || [];
  }catch(error){
    console.error('[dashboardController] Failed to load messages:', error.message);
    return [];
  }
}

exports.statistics=async(req,res,next)=>{try{res.json({success:true,data:await repo.statistics(req)})}catch(e){next(e)}};
exports.tasks=async(req,res,next)=>{try{res.json({success:true,data:await repo.tasks(req)})}catch(e){next(e)}};
exports.activity=async(req,res,next)=>{try{res.json({success:true,data:await repo.activity(req)})}catch(e){next(e)}};
exports.profile=async(req,res)=>res.json({success:true,data:{full_name:req.user.full_name,email:req.user.email,role:req.user.role,directorate:req.user.directorate,division:req.user.division,phone:req.user.phone,status:req.user.status,last_login:req.user.last_login}});
exports.dashboard=async(req,res,next)=>{try{const [statistics,tasks,activities,notifications,announcements,messages]=await Promise.all([
 repo.statistics(req),repo.tasks(req),repo.activity(req),
 loadNotifications(req.user.id),
 pool.query(`SELECT a.* FROM announcements a LEFT JOIN announcement_dismissals d ON d.announcement_id=a.id AND d.user_id=$1 WHERE d.user_id IS NULL AND a.publish_at<=NOW() AND (a.expires_at IS NULL OR a.expires_at>NOW()) AND (a.target_audience='All' OR a.target_audience=$2) AND (a.directorate IS NULL OR a.directorate=$3) AND (a.division IS NULL OR a.division=$4) ORDER BY a.priority DESC,a.publish_at DESC`,[req.user.id,req.user.role,req.user.directorate,req.user.division]),
 loadMessages(req.user.id)]);
 res.json({success:true,data:{role:req.user.role,scope:{directorate:req.user.directorate,division:req.user.division},profile:{full_name:req.user.full_name,email:req.user.email,role:req.user.role,directorate:req.user.directorate,division:req.user.division,phone:req.user.phone,status:req.user.status,last_login:req.user.last_login},statistics,tasks,activities,notifications,announcements:announcements.rows||[],messages}});
}catch(e){next(e)}};
