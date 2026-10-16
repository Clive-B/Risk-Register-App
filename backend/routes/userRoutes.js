const express = require('express');

console.log("User routes loaded");

const router = express.Router();

const userController = require('../controllers/userController');

const authMiddleware = require('../middleware/authMiddleware');

const roleMiddleware = require('../middleware/roleMiddleware');
const authController = require('../controllers/authController');

router.get(
    '/',
    authMiddleware,
    roleMiddleware('System Administrator'),
    userController.getUsers
);

router.post(
    '/',
    authMiddleware,
    roleMiddleware('System Administrator'),
    userController.createUser
);
router.post('/bulk/preview', authMiddleware, roleMiddleware('System Administrator'), userController.previewBulkUsers);
router.post('/bulk', authMiddleware, roleMiddleware('System Administrator'), userController.createBulkUsers);
router.get('/role-slots', authMiddleware, roleMiddleware('System Administrator'), userController.getRoleSlots);
router.post('/role-slots/onboarding/send-deferred', authMiddleware, roleMiddleware('System Administrator'), userController.sendDeferredRoleHolderOnboarding);
router.get('/role-slots/:id/history', authMiddleware, roleMiddleware('System Administrator'), userController.getRoleSlotHistory);
router.post('/role-slots/:id/map', authMiddleware, roleMiddleware('System Administrator'), userController.mapRoleSlot);
router.post('/role-slots/:id/clear', authMiddleware, roleMiddleware('System Administrator'), userController.clearRoleSlot);

router.put('/change-password', authMiddleware, authController.changePassword);

router.put(
    '/:id',
    authMiddleware,
    roleMiddleware('System Administrator'),
    userController.updateUser
);

router.delete(
    '/:id',
    authMiddleware,
    roleMiddleware('System Administrator'),
    userController.deleteUser
);

router.put('/:id/reset-password', authMiddleware, roleMiddleware('System Administrator'), userController.resetPassword);
router.put('/:id/unlock', authMiddleware, roleMiddleware('System Administrator'), userController.unlockUser);
router.put('/:id/deactivate', authMiddleware, roleMiddleware('System Administrator'), userController.deleteUser);
router.put('/:id/account/:action', authMiddleware, roleMiddleware('System Administrator'), userController.setAccountState);
router.get('/:id/audit-history', authMiddleware, roleMiddleware('System Administrator'), userController.getAuditHistory);
router.post('/:id/generate-temporary-password', authMiddleware, roleMiddleware('System Administrator'), userController.generateTemporaryPassword);

module.exports = router;
