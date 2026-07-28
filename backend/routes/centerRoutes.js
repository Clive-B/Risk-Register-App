const router=require('express').Router();
const auth=require('../middleware/authMiddleware');
const {requireAssignedScope}=require('../middleware/scopeMiddleware');
const controller=require('../controllers/dashboardController');
router.use(auth,requireAssignedScope);
router.get('/tasks',controller.tasks);
router.get('/activity',controller.activity);
router.get('/profile',controller.profile);
module.exports=router;
