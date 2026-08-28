DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM users legacy
        JOIN users deployed
          ON LOWER(deployed.email) = LOWER(REGEXP_REPLACE(legacy.email, '^test\.', '', 'i'))
         AND deployed.id <> legacy.id
        WHERE legacy.email ~* '^test\..+@nca\.org\.gh$'
    ) THEN
        RAISE EXCEPTION 'Cannot remove test. prefixes because a deployment email already exists.';
    END IF;
END $$;

UPDATE users
SET email = REGEXP_REPLACE(email, '^test\.', '', 'i'),
    full_name = CASE
        WHEN role='Risk Focal Person' THEN COALESCE(NULLIF(BTRIM(division),''),NULLIF(BTRIM(directorate),''),'NCA') || ' Risk Focal Person'
        WHEN role='Risk Champion' THEN COALESCE(NULLIF(BTRIM(division),''),NULLIF(BTRIM(directorate),''),'NCA') || ' Risk Champion'
        WHEN role='System Administrator' THEN 'System Administrator'
        WHEN role='Risk Committee Chairman' THEN 'Risk Committee Chairman'
        ELSE REGEXP_REPLACE(full_name, '^Test\s+', '', 'i')
    END,
    staff_id = CASE WHEN staff_id ~* '^NCA-TEST-' THEN REGEXP_REPLACE(staff_id,'^NCA-TEST-','NCA-GRC-','i') ELSE staff_id END,
    updated_at = NOW()
WHERE email ~* '^test\..+@nca\.org\.gh$';

CREATE TABLE IF NOT EXISTS organizational_role_slots (
    id BIGSERIAL PRIMARY KEY,
    slot_key VARCHAR(180) NOT NULL UNIQUE,
    role_email VARCHAR(320) NOT NULL,
    role VARCHAR(100) NOT NULL,
    division VARCHAR(150),
    display_name VARCHAR(220) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active','Inactive')),
    current_holder_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT organizational_role_slots_role_check CHECK (
        role IN ('System Administrator','Risk Committee Chairman','Risk Champion','Risk Focal Person')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS organizational_role_slots_email_unique
    ON organizational_role_slots(LOWER(role_email));

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role_slot_id BIGINT REFERENCES organizational_role_slots(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS identity_type VARCHAR(30) NOT NULL DEFAULT 'Named Employee',
    ADD COLUMN IF NOT EXISTS role_email VARCHAR(320),
    ADD COLUMN IF NOT EXISTS assignment_status VARCHAR(20) NOT NULL DEFAULT 'Current';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_identity_type_check;
ALTER TABLE users ADD CONSTRAINT users_identity_type_check
    CHECK (identity_type IN ('Role Placeholder','Named Employee'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_assignment_status_check;
ALTER TABLE users ADD CONSTRAINT users_assignment_status_check
    CHECK (assignment_status IN ('Current','Former','Unassigned'));

INSERT INTO organizational_role_slots(
    slot_key,role_email,role,division,display_name,current_holder_user_id
)
SELECT
    'role:' || REGEXP_REPLACE(LOWER(SPLIT_PART(u.email,'@',1)), '[^a-z0-9]+', '-', 'g'),
    LOWER(u.email),
    u.role,
    COALESCE(NULLIF(BTRIM(u.division),''),NULLIF(BTRIM(u.directorate),'')),
    CASE
        WHEN u.role='Risk Focal Person' THEN COALESCE(NULLIF(BTRIM(u.division),''),NULLIF(BTRIM(u.directorate),''),'NCA') || ' Risk Focal Person'
        WHEN u.role='Risk Champion' THEN COALESCE(NULLIF(BTRIM(u.division),''),NULLIF(BTRIM(u.directorate),''),'NCA') || ' Risk Champion'
        ELSE u.role
    END,
    u.id
FROM users u
WHERE u.status='Active'
  AND u.role IN ('System Administrator','Risk Committee Chairman','Risk Champion','Risk Focal Person')
ON CONFLICT (slot_key) DO NOTHING;

UPDATE users u
SET role_slot_id = slot.id,
    role_email = slot.role_email,
    identity_type = CASE
        WHEN LOWER(u.email)=LOWER(slot.role_email) THEN 'Role Placeholder'
        ELSE 'Named Employee'
    END,
    assignment_status = 'Current'
FROM organizational_role_slots slot
WHERE slot.current_holder_user_id=u.id;

CREATE TABLE IF NOT EXISTS role_slot_assignments (
    id BIGSERIAL PRIMARY KEY,
    slot_id BIGINT NOT NULL REFERENCES organizational_role_slots(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    employee_email VARCHAR(320) NOT NULL,
    employee_name VARCHAR(220) NOT NULL,
    staff_id VARCHAR(50),
    position VARCHAR(180),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    replacement_reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Current'
        CHECK (status IN ('Current','Ended')),
    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ended_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS role_slot_assignments_one_current
    ON role_slot_assignments(slot_id) WHERE status='Current';
CREATE INDEX IF NOT EXISTS role_slot_assignments_history
    ON role_slot_assignments(slot_id,effective_from DESC,created_at DESC);

INSERT INTO role_slot_assignments(
    slot_id,user_id,employee_email,employee_name,staff_id,position,
    effective_from,replacement_reason,status,metadata
)
SELECT
    slot.id,u.id,u.email,u.full_name,u.staff_id,u.position,
    CURRENT_DATE,'Initial deployment role-holder migration','Current',
    jsonb_build_object('identity_type','Role Placeholder','migrated',true)
FROM organizational_role_slots slot
JOIN users u ON u.id=slot.current_holder_user_id
ON CONFLICT DO NOTHING;

COMMENT ON TABLE organizational_role_slots IS
    'Permanent organizational access roles kept separate from changing employee identities.';
COMMENT ON TABLE role_slot_assignments IS
    'Effective-dated holder history for organizational roles; historic user records are never renamed during personnel replacement.';
