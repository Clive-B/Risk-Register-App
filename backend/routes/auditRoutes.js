const express = require('express');

const router = express.Router();
const auditController = require('../controllers/auditController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.post(
    '/client',
    authMiddleware,
    auditController.createClientAuditLog
);

router.get(
    '/',
    authMiddleware,
    roleMiddleware('System Administrator'),
    auditController.getAuditLogs
);

module.exports = router;
