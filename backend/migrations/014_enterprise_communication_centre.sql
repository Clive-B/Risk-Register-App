ALTER TABLE email_deliveries
ADD COLUMN IF NOT EXISTS recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS recipient_role VARCHAR(100),
ADD COLUMN IF NOT EXISTS recipient_directorate VARCHAR(150),
ADD COLUMN IF NOT EXISTS encrypted_payload TEXT,
ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160),
ADD COLUMN IF NOT EXISTS sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_status_check;
ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_status_check
CHECK (status IN ('Queued','Sending','Sent','Delivered','Failed','Cancelled'));
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_idempotency_unique ON email_deliveries(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_queue_ready ON email_deliveries(status,next_attempt_at,created_at);

CREATE TABLE IF NOT EXISTS email_templates (
 id BIGSERIAL PRIMARY KEY, template_key VARCHAR(100) NOT NULL UNIQUE, name VARCHAR(150) NOT NULL,
 subject TEXT NOT NULL, html_body TEXT NOT NULL, text_body TEXT, allowed_placeholders TEXT[] NOT NULL DEFAULT '{}',
 is_active BOOLEAN NOT NULL DEFAULT TRUE, version INTEGER NOT NULL DEFAULT 1,
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO email_templates(template_key,name,subject,html_body,allowed_placeholders) VALUES
('welcome_user','Welcome User','Welcome to the NCA Enterprise GRC Platform','<h2>National Communications Authority</h2><p>Dear {{full_name}},</p><p>Your account has been created.</p><p>Email: {{email}}<br>Role: {{role}}<br>Division: {{division}}<br>Temporary Password: {{temporary_password}}</p><p><a href="{{login_url}}">Login to NCA Enterprise GRC Platform</a></p>',ARRAY['full_name','email','role','division','temporary_password','login_url']),
('password_reset','Password Reset','NCA GRC password reset','<p>Dear {{full_name}},</p><p><a href="{{reset_url}}">Reset your password</a></p>',ARRAY['full_name','reset_url']),
('password_changed','Password Changed','Password Changed Successfully','<p>Dear {{full_name}},</p><p>Your password has been updated successfully.</p>',ARRAY['full_name']),
('risk_assigned','Risk Assigned','Risk assigned: {{risk_name}}','<p>Dear {{full_name}},</p><p>The risk {{risk_name}} has been assigned to you.</p>',ARRAY['full_name','risk_name','action_url']),
('risk_approved','Risk Approved','Risk approved: {{risk_name}}','<p>The risk {{risk_name}} has been approved.</p>',ARRAY['risk_name','action_url']),
('risk_rejected','Risk Rejected','Risk rejected: {{risk_name}}','<p>The risk {{risk_name}} has been rejected.</p>',ARRAY['risk_name','action_url']),
('treatment_reminder','Treatment Reminder','Treatment reminder: {{risk_name}}','<p>Treatment action is due for {{risk_name}}.</p>',ARRAY['full_name','risk_name','action_url']),
('compliance_reminder','Compliance Reminder','Compliance reminder','<p>Dear {{full_name}}, a compliance action requires attention.</p>',ARRAY['full_name','action_url']),
('audit_assignment','Audit Assignment','New audit assignment','<p>Dear {{full_name}}, an audit has been assigned to you.</p>',ARRAY['full_name','action_url']),
('executive_announcement','Executive Announcement','{{title}}','<h2>{{title}}</h2><p>{{message}}</p>',ARRAY['title','message']),
('system_maintenance','System Maintenance','System maintenance notice','<h2>{{title}}</h2><p>{{message}}</p>',ARRAY['title','message'])
ON CONFLICT(template_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS notification_templates (
 id BIGSERIAL PRIMARY KEY, template_key VARCHAR(100) NOT NULL UNIQUE, name VARCHAR(150) NOT NULL,
 icon VARCHAR(80), priority VARCHAR(20) NOT NULL DEFAULT 'Normal', category VARCHAR(80) NOT NULL,
 title TEXT NOT NULL, message TEXT NOT NULL, action_url TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO notification_templates(template_key,name,icon,priority,category,title,message,action_url) VALUES
('risk_created','Risk Created','shield','Normal','Risk','Risk Created','{{risk_name}} was created.','pages/risks.html'),
('risk_assigned','Risk Assigned','user-check','High','Risk','Risk Assigned','{{risk_name}} was assigned to you.','pages/risks.html'),
('risk_approved','Risk Approved','check-circle','Normal','Risk','Risk Approved','{{risk_name}} was approved.','pages/risks.html'),
('risk_closed','Risk Closed','lock','Normal','Risk','Risk Closed','{{risk_name}} was closed.','pages/risks.html'),
('audit_assigned','Audit Assigned','clipboard','High','Audit','Audit Assigned','An audit was assigned to you.',''),
('audit_completed','Audit Completed','check','Normal','Audit','Audit Completed','An audit was completed.',''),
('password_changed','Password Changed','key','Normal','Security','Password Changed','Your password was changed.',''),
('welcome_user','Welcome User','user-plus','Normal','User','Welcome to NCA GRC','Your account is ready.',''),
('login_alert','Login Alert','log-in','High','Security','New Login','A new login was detected.','') ON CONFLICT(template_key) DO NOTHING;

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS category VARCHAR(80) NOT NULL DEFAULT 'General';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_data TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS audience_type VARCHAR(30) NOT NULL DEFAULT 'Everyone';
CREATE TABLE IF NOT EXISTS announcement_recipients(announcement_id BIGINT REFERENCES announcements(id) ON DELETE CASCADE,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(announcement_id,user_id));

CREATE TABLE IF NOT EXISTS smtp_settings (
 id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1), host TEXT, port INTEGER NOT NULL DEFAULT 587, username TEXT,
 encrypted_password TEXT, sender_name TEXT NOT NULL DEFAULT 'NCA Enterprise GRC', sender_email TEXT,
 encryption VARCHAR(20) NOT NULL DEFAULT 'STARTTLS', connection_status VARCHAR(30) NOT NULL DEFAULT 'Not Tested',
 last_checked_at TIMESTAMPTZ, updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO smtp_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS communication_logs (
 id BIGSERIAL PRIMARY KEY, communication_type VARCHAR(50) NOT NULL, recipient TEXT,
 delivery_status VARCHAR(30) NOT NULL, sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 reference_type VARCHAR(80), reference_id TEXT, error_message TEXT, metadata JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_communication_logs_created ON communication_logs(created_at DESC);
