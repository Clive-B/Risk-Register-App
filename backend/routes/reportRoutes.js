const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const controller = require('../controllers/reportController');

const router = express.Router();
const roles = ['System Administrator', 'Risk Committee Chairman', 'Risk Champion'];

router.use(authMiddleware, roleMiddleware(...roles));
router.get('/options', controller.options);
router.post('/generate', controller.generate);
router.get('/versions', controller.versions);
router.get('/schedules', controller.getSchedules);
router.post('/schedules', controller.createSchedule);
router.patch('/schedules/:id', controller.toggleSchedule);
router.get('/:id', controller.getSnapshot);
router.patch('/:id', controller.updateDraft);
router.post('/:id/finalise', controller.finalise);
router.post('/:id/email', controller.emailSnapshot);

module.exports = router;
