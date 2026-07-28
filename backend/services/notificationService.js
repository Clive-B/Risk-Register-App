const pool = require('../config/db');
const Notification = require('../models/Notification');
const { logAudit } = require('../utils/auditLogger');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function sanitizeLimit(value) {
    const parsed = Number(value || DEFAULT_LIMIT);
    if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT;
    return Math.min(parsed, MAX_LIMIT);
}

function sanitizePage(value) {
    const parsed = Number(value || 1);
    if (!Number.isInteger(parsed) || parsed < 1) return 1;
    return parsed;
}

function isAdmin(user) {
    return user?.role === 'System Administrator';
}

function normalizeIdentifier(value) {
    if (value === undefined || value === null || value === '') return null;
    return String(value).trim();
}

async function listNotifications({ actor, req, userId = null, page = 1, limit = DEFAULT_LIMIT, unreadOnly = false } = {}) {
    try {
        const safeLimit = sanitizeLimit(limit);
        const safePage = sanitizePage(page);
        const offset = (safePage - 1) * safeLimit;
        const isSystemAdmin = isAdmin(actor);

        const conditions = ["NOT (type = 'System' AND category = 'Audit')"];
        const params = [];

        if (!isSystemAdmin) {
            conditions.push('user_id = $1');
            params.push(actor.id);
        } else if (userId !== null && userId !== undefined && userId !== '') {
            const numericUserId = Number(userId);
            if (!Number.isInteger(numericUserId)) {
                const error = new Error('A valid userId is required for admin queries.');
                error.statusCode = 400;
                throw error;
            }
            conditions.push('user_id = $1');
            params.push(numericUserId);
        }

        if (unreadOnly) {
            conditions.push('is_read = FALSE');
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const countQuery = `SELECT COUNT(*)::int AS total_count FROM notifications ${whereClause}`;
        const rowsQuery = `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        const [countResult, rowsResult] = await Promise.all([
            pool.query(countQuery, params),
            pool.query(rowsQuery, [...params, safeLimit, offset])
        ]);

        const notifications = rowsResult.rows.map(row => new Notification(row).toJSON());
        const totalCount = Number(countResult.rows[0]?.total_count || 0);

        await logAudit({
            req,
            user: actor,
            action: 'NOTIFICATION_LISTED',
            entityType: 'Notification',
            status: 'Success',
            details: { count: notifications.length, unreadOnly, page: safePage, limit: safeLimit }
        });

        return {
            notifications,
            pagination: {
                page: safePage,
                limit: safeLimit,
                totalCount,
                totalPages: totalCount > 0 ? Math.ceil(totalCount / safeLimit) : 0
            }
        };
    } catch (error) {
        console.error('[notificationService] Failed to list notifications:', error.message);
        throw error;
    }
}

async function getUnreadCount({ actor, req, userId = null } = {}) {
    try {
        const isSystemAdmin = isAdmin(actor);
        const targetUserId = isSystemAdmin && userId !== null && userId !== undefined && userId !== ''
            ? Number(userId)
            : actor.id;

        if (!isSystemAdmin && Number(targetUserId) !== Number(actor.id)) {
            const error = new Error('You can only view your own unread count.');
            error.statusCode = 403;
            throw error;
        }

        const result = await pool.query(`
            SELECT COUNT(*)::int AS unread_count
            FROM notifications
            WHERE user_id = $1
              AND is_read = FALSE
              AND NOT (type = 'System' AND category = 'Audit')
        `, [targetUserId]);
        const unreadCount = Number(result.rows[0]?.unread_count || 0);

        await logAudit({
            req,
            user: actor,
            action: 'NOTIFICATION_UNREAD_COUNT_VIEWED',
            entityType: 'Notification',
            status: 'Success',
            details: { unreadCount }
        });

        return unreadCount;
    } catch (error) {
        console.error('[notificationService] Failed to get unread count:', error.message);
        throw error;
    }
}

async function createNotification({ actor, req, userId, title, message, type = 'General', category = 'General', priority = 'Normal', entityType = null, entityId = null, createdBy = null, systemGenerated = false } = {}) {
    try {
        const safeTitle = String(title || '').trim();
        const safeMessage = String(message || '').trim();
        const safeType = String(type || 'General').trim() || 'General';
        const safeCategory = String(category || 'General').trim() || 'General';
        const safePriority = String(priority || 'Normal').trim() || 'Normal';

        if (!safeTitle || !safeMessage) {
            const error = new Error('Notification title and message are required.');
            error.statusCode = 400;
            throw error;
        }

        const targetUserId = Number(userId ?? actor?.id);
        if (!Number.isInteger(targetUserId)) {
            const error = new Error('A valid userId is required.');
            error.statusCode = 400;
            throw error;
        }

        if (!systemGenerated && !isAdmin(actor) && Number(targetUserId) !== Number(actor.id)) {
            const error = new Error('You can only create notifications for your own account.');
            error.statusCode = 403;
            throw error;
        }

        const existsResult = await pool.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
        if (!existsResult.rowCount) {
            const error = new Error('The requested user could not be found.');
            error.statusCode = 404;
            throw error;
        }

        const result = await pool.query(`
            INSERT INTO notifications (
                user_id,
                title,
                message,
                type,
                category,
                priority,
                entity_type,
                entity_id,
                created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [targetUserId, safeTitle, safeMessage, safeType, safeCategory, safePriority, normalizeIdentifier(entityType), normalizeIdentifier(entityId), createdBy ?? actor?.id ?? null]);

        const notification = new Notification(result.rows[0]).toJSON();

        await logAudit({
            req,
            user: actor,
            action: 'NOTIFICATION_CREATED',
            entityType: 'Notification',
            entityId: notification.id,
            status: 'Success',
            details: { userId: targetUserId, title: safeTitle }
        });

        return notification;
    } catch (error) {
        console.error('[notificationService] Failed to create notification:', error.message);
        throw error;
    }
}

async function markNotificationAsRead({ actor, req, notificationId }) {
    try {
        const safeNotificationId = normalizeIdentifier(notificationId);
        if (!safeNotificationId) {
            const error = new Error('A valid notification id is required.');
            error.statusCode = 400;
            throw error;
        }

        const result = await pool.query(`
            UPDATE notifications
            SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND (${isAdmin(actor) ? 'TRUE' : 'user_id = $2'})
            RETURNING *
        `, isAdmin(actor) ? [safeNotificationId] : [safeNotificationId, actor.id]);

        if (!result.rowCount) {
            const error = new Error('Notification not found or access denied.');
            error.statusCode = 404;
            throw error;
        }

        const notification = new Notification(result.rows[0]).toJSON();

        await logAudit({
            req,
            user: actor,
            action: 'NOTIFICATION_READ',
            entityType: 'Notification',
            entityId: notification.id,
            status: 'Success'
        });

        return notification;
    } catch (error) {
        console.error('[notificationService] Failed to mark notification as read:', error.message);
        throw error;
    }
}

async function markAllNotificationsAsRead({ actor, req, userId = null } = {}) {
    try {
        const isSystemAdmin = isAdmin(actor);
        const targetUserId = isSystemAdmin && userId !== null && userId !== undefined && userId !== ''
            ? Number(userId)
            : actor.id;

        if (!isSystemAdmin && Number(targetUserId) !== Number(actor.id)) {
            const error = new Error('You can only mark your own notifications as read.');
            error.statusCode = 403;
            throw error;
        }

        const result = await pool.query(`
            UPDATE notifications
            SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
            WHERE user_id = $1
              AND is_read = FALSE
              AND NOT (type = 'System' AND category = 'Audit')
            RETURNING id
        `, [targetUserId]);

        await logAudit({
            req,
            user: actor,
            action: 'NOTIFICATION_READ_ALL',
            entityType: 'Notification',
            status: 'Success',
            details: { userId: targetUserId, updatedCount: result.rowCount }
        });

        return { updatedCount: result.rowCount };
    } catch (error) {
        console.error('[notificationService] Failed to mark notifications as read:', error.message);
        throw error;
    }
}

async function deleteNotification({ actor, req, notificationId }) {
    try {
        const safeNotificationId = normalizeIdentifier(notificationId);
        if (!safeNotificationId) {
            const error = new Error('A valid notification id is required.');
            error.statusCode = 400;
            throw error;
        }

        const result = await pool.query(`
            DELETE FROM notifications
            WHERE id = $1 AND (${isAdmin(actor) ? 'TRUE' : 'user_id = $2'})
            RETURNING id
        `, isAdmin(actor) ? [safeNotificationId] : [safeNotificationId, actor.id]);

        if (!result.rowCount) {
            const error = new Error('Notification not found or access denied.');
            error.statusCode = 404;
            throw error;
        }

        await logAudit({
            req,
            user: actor,
            action: 'NOTIFICATION_DELETED',
            entityType: 'Notification',
            entityId: safeNotificationId,
            status: 'Success'
        });

        return { deleted: true };
    } catch (error) {
        console.error('[notificationService] Failed to delete notification:', error.message);
        throw error;
    }
}

module.exports = {
    listNotifications,
    getUnreadCount,
    createNotification,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification
};
