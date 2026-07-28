-- Staff ID and Phone Number are optional account attributes.
-- PostgreSQL unique indexes permit multiple NULL values, so blank Staff IDs remain NULL.
ALTER TABLE users
    ALTER COLUMN staff_id DROP NOT NULL,
    ALTER COLUMN staff_id TYPE VARCHAR(50),
    ALTER COLUMN phone DROP NOT NULL;
