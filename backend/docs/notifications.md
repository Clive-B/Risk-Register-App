# Notification Centre

## Overview
The notification module provides a reusable backend foundation for sending, listing, reading, and deleting notifications for each user.

## Endpoints
- GET /api/notifications
- GET /api/notifications/unread-count
- POST /api/notifications
- PATCH /api/notifications/:id/read
- PATCH /api/notifications/read-all
- DELETE /api/notifications/:id

## Payloads
### Create notification
```json
{
  "userId": 12,
  "title": "Risk review requested",
  "message": "A new treatment plan requires your review.",
  "type": "Risk",
  "category": "Treatment",
  "priority": "High",
  "entityType": "Risk",
  "entityId": "101"
}
```

## Security
- JWT authentication is enforced through the shared auth middleware.
- Non-admin users can only access their own notifications.
- System Administrators can query or manage notifications for any user when needed.

## Notes
- Results are ordered by newest first.
- Pagination is supported through the page and limit query parameters.
- Audit actions are logged through the shared audit logger.
