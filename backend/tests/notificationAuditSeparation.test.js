const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname,'..','migrations','044_separate_audit_and_notifications.sql');
const migration = fs.readFileSync(migrationPath,'utf8');
const service = fs.readFileSync(path.join(__dirname,'..','services','notificationService.js'),'utf8');

test('audit activity no longer creates end-user notifications',() => {
    assert.match(migration,/DROP TRIGGER IF EXISTS trg_audit_grc_notification ON audit_logs/i);
    assert.match(migration,/DROP FUNCTION IF EXISTS create_grc_notification_from_audit/i);
});

test('cleanup removes only notifications proven to be trigger-generated audit copies',() => {
    assert.match(migration,/notification\.type = 'System'/i);
    assert.match(migration,/notification\.category = 'Audit'/i);
    assert.match(migration,/notification\.title = audit\.action/i);
    assert.match(migration,/notification\.message = COALESCE\(audit\.details::text/i);
    assert.match(migration,/notification\.entity_type IS NOT DISTINCT FROM audit\.entity_type/i);
    assert.match(migration,/notification\.entity_id IS NOT DISTINCT FROM audit\.entity_id/i);
    assert.match(migration,/notification\.created_at - audit\.created_at/i);
    assert.doesNotMatch(migration,/DELETE\s+FROM\s+notifications\s*;/i);
});

test('notification feeds and unread counts exclude retained technical audit records',() => {
    const governedFilter = /NOT \(type = 'System' AND category = 'Audit'\)/g;
    assert.ok((service.match(governedFilter) || []).length >= 3);
});
