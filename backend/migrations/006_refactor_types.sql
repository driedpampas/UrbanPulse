-- ============================================================
-- Migration 006: Refactor TEXT columns to VARCHAR and ENUMs
-- ============================================================

-- ------------------------------------------------------------
-- 1. Create ENUM types
-- ------------------------------------------------------------

DROP TYPE IF EXISTS "app"."user_role" CASCADE;
CREATE TYPE "app"."user_role" AS ENUM ('admin', 'mod', 'user', 'banned');

DROP TYPE IF EXISTS "app"."pulse_type" CASCADE;
CREATE TYPE "app"."pulse_type" AS ENUM ('update', 'emergency', 'skill', 'item', 'pet', 'need');

DROP TYPE IF EXISTS "app"."library_item_type" CASCADE;
CREATE TYPE "app"."library_item_type" AS ENUM ('item', 'skill');

DROP TYPE IF EXISTS "app"."report_target_type" CASCADE;
CREATE TYPE "app"."report_target_type" AS ENUM ('pulse', 'user', 'message');

DROP TYPE IF EXISTS "app"."message_type" CASCADE;
CREATE TYPE "app"."message_type" AS ENUM ('text', 'notice');

DROP TYPE IF EXISTS "app"."report_status" CASCADE;
CREATE TYPE "app"."report_status" AS ENUM ('pending', 'resolved', 'dismissed');

-- ------------------------------------------------------------
-- 2. Alter app.users
-- ------------------------------------------------------------

ALTER TABLE "app"."users"
    DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE "app"."users"
    ALTER COLUMN "email" TYPE varchar(255),

    ALTER COLUMN "role" DROP DEFAULT,
    ALTER COLUMN "role" TYPE "app"."user_role" USING "role"::"app"."user_role",
    ALTER COLUMN "role" SET DEFAULT 'user',

    ALTER COLUMN "password_hash" TYPE varchar(255),
    ALTER COLUMN "verification_token" TYPE varchar(255),
    ALTER COLUMN "password_reset_token" TYPE varchar(255),
    ALTER COLUMN "display_name" TYPE varchar(100),

    ALTER COLUMN "timezone" DROP DEFAULT,
    ALTER COLUMN "timezone" TYPE varchar(64),
    ALTER COLUMN "timezone" SET DEFAULT 'UTC',

    ALTER COLUMN "bio" TYPE varchar,
    ALTER COLUMN "profile_picture_filename" TYPE varchar(255),
    ALTER COLUMN "profile_picture_mime_type" TYPE varchar(127);

-- ------------------------------------------------------------
-- 3. Alter app.chat_threads
-- ------------------------------------------------------------

ALTER TABLE "app"."chat_threads"
    ALTER COLUMN "name" TYPE varchar(50);

-- ------------------------------------------------------------
-- 4. Alter app.chat_participant_roles
-- ------------------------------------------------------------

ALTER TABLE "app"."chat_participant_roles"
    ALTER COLUMN "role" TYPE varchar(50);

-- ------------------------------------------------------------
-- 5. Alter app.messages
-- ------------------------------------------------------------

ALTER TABLE "app"."messages"
    ALTER COLUMN "content" TYPE varchar(5000),

    ALTER COLUMN "message_type" DROP DEFAULT,
    ALTER COLUMN "message_type" TYPE "app"."message_type" USING "message_type"::"app"."message_type",
    ALTER COLUMN "message_type" SET DEFAULT 'text';

-- ------------------------------------------------------------
-- 6. Alter app.pulse_interactions
-- ------------------------------------------------------------

ALTER TABLE "app"."pulse_interactions"
    ALTER COLUMN "status" DROP DEFAULT,
    ALTER COLUMN "status" TYPE varchar(50),
    ALTER COLUMN "status" SET DEFAULT 'accepted';

-- ------------------------------------------------------------
-- 7. Alter app.pulses
-- ------------------------------------------------------------

-- Drop the existing CHECK constraint (replaced by ENUM type)
ALTER TABLE "app"."pulses"
    DROP CONSTRAINT IF EXISTS "pulses_pulse_type_check";

ALTER TABLE "app"."pulses"
    ALTER COLUMN "pulse_type" TYPE "app"."pulse_type" USING "pulse_type"::"app"."pulse_type",
    ALTER COLUMN "content" TYPE varchar(5000);

-- ------------------------------------------------------------
-- 8. Alter app.library_items
-- ------------------------------------------------------------

ALTER TABLE "app"."library_items"
    ALTER COLUMN "item_type" TYPE "app"."library_item_type" USING "item_type"::"app"."library_item_type",
    ALTER COLUMN "title" TYPE varchar(255),
    ALTER COLUMN "description" TYPE varchar(2000);

-- ------------------------------------------------------------
-- 9. Alter app.message_edits_history
-- ------------------------------------------------------------

ALTER TABLE "app"."message_edits_history"
    ALTER COLUMN "old_content" TYPE varchar(5000);

-- ------------------------------------------------------------
-- 10. Alter app.message_reports
-- ------------------------------------------------------------

ALTER TABLE "app"."message_reports"
    ALTER COLUMN "reason" TYPE varchar(500);

-- ------------------------------------------------------------
-- 11. Alter app.reports
-- ------------------------------------------------------------

ALTER TABLE "app"."reports"
    ALTER COLUMN "target_type" TYPE "app"."report_target_type" USING "target_type"::"app"."report_target_type",
    ALTER COLUMN "reason" TYPE varchar(500),

    ALTER COLUMN "status" DROP DEFAULT,
    ALTER COLUMN "status" TYPE "app"."report_status" USING "status"::"app"."report_status",
    ALTER COLUMN "status" SET DEFAULT 'pending',

    ALTER COLUMN "content" TYPE varchar(5000);

