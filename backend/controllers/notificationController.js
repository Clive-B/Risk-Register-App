const notificationService = require('../services/notificationService');
const { validateCreatePayload, validatePagination } = require('../utils/notificationValidation');

exports.list = async (req, res, next) => {
    try {
        const pagination = validatePagination(req.query);
        const unreadOnly = String(req.query.unreadOnly || req.query.unread || '').toLowerCase() === 'true';
        const result = await notificationService.listNotifications({
            actor: req.user,
            req,
            userId: req.query.userId || null,
            page: pagination.page,
            limit: pagination.limit,
            unreadOnly
        });

        const unreadCount = await notificationService.getUnreadCount({ actor: req.user, req, userId: req.query.userId || null });
        res.json({ success: true, data: { ...result, unreadCount } });
    } catch (error) {
        next(error);
    }
};

exports.getUnreadCount = async (req, res, next) => {
    try {
        const unreadCount = await notificationService.getUnreadCount({ actor: req.user, req, userId: req.query.userId || null });
        res.json({ success: true, data: { unreadCount } });
    } catch (error) {
        next(error);
    }
};

exports.create = async (req, res, next) => {
    try {
        const errors = validateCreatePayload(req.body);
        if (errors.length) {
            return res.status(400).json({ success: false, message: errors[0], errors });
        }

        const notification = await notificationService.createNotification({
            actor: req.user,
            req,
            userId: req.body.userId,
            title: req.body.title,
            message: req.body.message,
            type: req.body.type,
            category: req.body.category,
            priority: req.body.priority,
            entityType: req.body.entityType,
            entityId: req.body.entityId,
            createdBy: req.body.createdBy || req.user.id
        });

        res.status(201).json({ success: true, data: notification });
    } catch (error) {
        next(error);
    }
};

exports.read = async (req, res, next) => {
    try {
        const notification = await notificationService.markNotificationAsRead({ actor: req.user, req, notificationId: req.params.id });
        res.json({ success: true, data: notification });
    } catch (error) {
        next(error);
    }
};

exports.readAll = async (req, res, next) => {
    try {
        const result = await notificationService.markAllNotificationsAsRead({ actor: req.user, req, userId: req.query.userId || null });
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.delete = async (req, res, next) => {
    try {
        const result = await notificationService.deleteNotification({ actor: req.user, req, notificationId: req.params.id });
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};
