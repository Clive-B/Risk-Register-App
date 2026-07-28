function applyScope(req, conditions, params, options = {}) {
    const alias = options.alias || 'r';
    const divisionColumn = options.divisionColumn || `${alias}.division`;
    if (['System Administrator','Risk Committee Chairman'].includes(req.user.role)) return;
    params.push(req.user.division);
    conditions.push(`${divisionColumn} = $${params.length}`);
}

function requireAssignedScope(req,res,next) {
    if (req.user.role === 'Risk Focal Person' && !req.user.division) return res.status(403).json({success:false,message:'A division must be assigned to this Risk Focal Person account.'});
    if (req.user.role === 'Risk Champion' && !req.user.division) return res.status(403).json({success:false,message:'A division must be assigned to this Risk Champion account.'});
    next();
}

module.exports={applyScope,requireAssignedScope};
