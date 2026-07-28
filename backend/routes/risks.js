const express = require('express');

const router = express.Router();
const riskController = require('../controllers/riskController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const riskRoles = [
    'System Administrator',
    'Risk Committee Chairman',
    'Risk Champion',
    'Risk Focal Person'
];

router.get(
    '/',
    authMiddleware,
    roleMiddleware(...riskRoles),
    riskController.getRisks
);

router.get(
    '/committee-bulk-summary',
    authMiddleware,
    roleMiddleware('System Administrator','Risk Committee Chairman'),
    riskController.getCommitteeBulkSummary
);

router.post(
    '/committee-bulk-approve',
    authMiddleware,
    roleMiddleware('System Administrator','Risk Committee Chairman'),
    riskController.committeeBulkApprove
);

router.post(
    '/workplan-focal-submit-all',
    authMiddleware,
    roleMiddleware('System Administrator','Risk Focal Person'),
    riskController.submitAllWorkplanFocalAssessments
);

router.post(
    '/champion-reviews-submit-all',
    authMiddleware,
    roleMiddleware('System Administrator','Risk Champion'),
    riskController.submitChampionReviewsBulk
);

router.post(
    '/',
    authMiddleware,
    roleMiddleware('System Administrator', 'Risk Focal Person', 'Risk Champion'),
    riskController.createRisk
);

router.post(
    '/import/preview',
    authMiddleware,
    roleMiddleware('Risk Focal Person'),
    riskController.previewRiskImport
);

router.post(
    '/import',
    authMiddleware,
    roleMiddleware('Risk Focal Person'),
    riskController.importRisks
);

router.get(
    '/import-batches',
    authMiddleware,
    roleMiddleware(...riskRoles),
    riskController.getImportBatches
);

router.post(
    '/import-batches/:id/champion-approve',
    authMiddleware,
    roleMiddleware('System Administrator', 'Risk Champion'),
    riskController.approveImportBatch
);

router.put(
    '/:id',
    authMiddleware,
    roleMiddleware('System Administrator', 'Risk Focal Person', 'Risk Champion'),
    riskController.updateRisk
);

router.patch(
    '/:id/review',
    authMiddleware,
    roleMiddleware('System Administrator', 'Risk Champion'),
    riskController.reviewRisk
);
router.patch(
    '/:id/assessment-decision',
    authMiddleware,
    roleMiddleware(...riskRoles),
    riskController.recordAssessmentDecision
);
router.patch('/:id/start-review',authMiddleware,roleMiddleware('System Administrator','Risk Champion'),riskController.startRiskReview);

router.patch('/:id/committee-review',authMiddleware,roleMiddleware('System Administrator','Risk Committee Chairman'),riskController.committeeReview);
router.patch('/:id/committee-edit',authMiddleware,roleMiddleware('System Administrator','Risk Committee Chairman'),riskController.committeeEditRisk);
router.patch(
    '/:id/consolidated-edit',
    authMiddleware,
    roleMiddleware(...riskRoles),
    riskController.editConsolidatedRisk
);

router.post(
    '/:id/treatment-updates',
    authMiddleware,
    roleMiddleware('System Administrator', 'Risk Focal Person', 'Risk Champion'),
    riskController.addTreatmentUpdate
);

router.patch(
    '/:id/close',
    authMiddleware,
    roleMiddleware('System Administrator', 'Risk Champion', 'Risk Committee Chairman'),
    riskController.closeRisk
);

router.get(
    '/:id/history',
    authMiddleware,
    roleMiddleware(...riskRoles),
    riskController.getRiskHistory
);

router.get(
    '/:id/attachments',
    authMiddleware,
    roleMiddleware(...riskRoles),
    riskController.getAttachments
);

router.post(
    '/:id/attachments',
    authMiddleware,
    roleMiddleware('System Administrator','Risk Champion','Risk Focal Person'),
    riskController.addAttachment
);

router.delete(
    '/:id',
    authMiddleware,
    roleMiddleware(...riskRoles),
    riskController.deleteRisk
);

module.exports = router;
