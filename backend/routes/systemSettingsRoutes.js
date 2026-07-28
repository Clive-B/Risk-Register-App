const router=require('express').Router();
const auth=require('../middleware/authMiddleware');
const role=require('../middleware/roleMiddleware');
const controller=require('../controllers/systemSettingsController');
router.get('/overview',auth,role('System Administrator'),controller.overview);
module.exports=router;
