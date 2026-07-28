const router=require('express').Router();const auth=require('../middleware/authMiddleware');const {requireAssignedScope}=require('../middleware/scopeMiddleware');const c=require('../controllers/dashboardController');
router.use(auth,requireAssignedScope);router.get('/',c.dashboard);router.get('/statistics',c.statistics);router.get('/tasks',c.tasks);router.get('/activity',c.activity);module.exports=router;
router.get('/profile',c.profile);
