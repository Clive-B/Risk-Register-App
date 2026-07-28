const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const roles = require('../middleware/roleMiddleware');
const controller = require('../controllers/workplanController');

const viewers = ['System Administrator','Risk Focal Person','Risk Champion','Risk Committee Chairman'];
router.get('/', auth, roles(...viewers), controller.list);
router.get('/:id', auth, roles(...viewers), controller.get);
router.get('/:id/archive', auth, roles(...viewers), controller.getArchiveSnapshot);
router.post('/preview', auth, roles('System Administrator','Risk Focal Person'), controller.previewUpload);
router.post('/upload', auth, roles('System Administrator','Risk Focal Person'), controller.upload);
router.patch('/:id/assessments/:assessmentId', auth, roles('System Administrator','Risk Focal Person','Risk Champion','Risk Committee Chairman'), controller.updateAssessment);
router.post('/:id/champion-approve', auth, roles('System Administrator','Risk Champion'), controller.championBatchApprove);
router.post('/:id/chairman-approve', auth, roles('System Administrator','Risk Committee Chairman'), controller.chairmanBatchApprove);
router.post('/:id/submit', auth, roles('System Administrator','Risk Focal Person'), controller.submit);

module.exports = router;
