class Notification {
    constructor(data = {}) {
        this.id = data.id || null;
        this.userId = data.user_id ?? data.userId ?? null;
        this.title = data.title || '';
        this.message = data.message || '';
        this.type = data.type || data.notification_type || 'General';
        this.category = data.category || data.entity_type || 'General';
        this.priority = data.priority || 'Normal';
        this.entityType = data.entity_type ?? data.entityType ?? null;
        this.entityId = data.entity_id ?? data.entityId ?? null;
        this.isRead = Boolean(data.is_read ?? data.isRead ?? false);
        this.createdAt = data.created_at ?? data.createdAt ?? null;
        this.readAt = data.read_at ?? data.readAt ?? null;
        this.createdBy = data.created_by ?? data.createdBy ?? null;
        this.updatedAt = data.updated_at ?? data.updatedAt ?? null;
    }

    toJSON() {
        return {
            id: this.id,
            user_id: this.userId,
            title: this.title,
            message: this.message,
            type: this.type,
            category: this.category,
            priority: this.priority,
            entity_type: this.entityType,
            entity_id: this.entityId,
            is_read: this.isRead,
            created_at: this.createdAt,
            read_at: this.readAt,
            created_by: this.createdBy,
            updated_at: this.updatedAt
        };
    }
}

module.exports = Notification;
