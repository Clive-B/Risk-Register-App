const express = require('express');

const router = express.Router();
const treatmentController = require('../controllers/treatmentController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const treatmentRoles = [
    'System Administrator',
    'Risk Committee Chairman',
    'Risk Champion',
    'Risk Focal Person'
];

router.get(
    '/',
    authMiddleware,
    roleMiddleware(...treatmentRoles),
    treatmentController.getTreatmentPlans
);

router.post(
    '/',
    authMiddleware,
    roleMiddleware('System Administrator','Risk Champion','Risk Focal Person'),
    treatmentController.createTreatmentPlan
);

router.post(
    '/approve-all',
    authMiddleware,
    roleMiddleware('System Administrator','Risk Champion','Risk Committee Chairman'),
    treatmentController.approveAllTreatmentPlans
);

router.post(
    '/:id/decision',
    authMiddleware,
    roleMiddleware('System Administrator','Risk Champion','Risk Committee Chairman'),
    treatmentController.decideTreatmentPlan
);

router.put(
    '/:id',
    authMiddleware,
    roleMiddleware('System Administrator','Risk Champion','Risk Focal Person','Risk Committee Chairman'),
    treatmentController.updateTreatmentPlan
);

router.delete(
    '/:id',
    authMiddleware,
    roleMiddleware('System Administrator','Risk Champion','Risk Focal Person'),
    treatmentController.deleteTreatmentPlan
);

module.exports = router;
