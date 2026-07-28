const router=require('express').Router();
const auth=require('../middleware/authMiddleware');
const roles=require('../middleware/roleMiddleware');
const controller=require('../controllers/complianceController');
const viewers=['System Administrator','Risk Focal Person','Risk Champion','Risk Committee Chairman'];

router.use(auth);
router.get('/options',roles(...viewers),controller.options);
router.get('/',roles(...viewers),controller.list);
router.post('/',roles('System Administrator','Risk Champion'),controller.create);
router.patch('/:id/assess',roles('System Administrator','Risk Focal Person','Risk Champion'),controller.assess);
router.patch('/:id/verify',roles('System Administrator','Risk Champion'),controller.verify);

module.exports=router;
