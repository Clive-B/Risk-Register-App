const role=require('./roleMiddleware');
const analyticsRoles=['System Administrator','Risk Committee Chairman'];
const boardRoles=['System Administrator','Risk Committee Chairman'];
module.exports={analyticsAccess:role(...analyticsRoles),boardAccess:role(...boardRoles),analyticsRoles,boardRoles};
