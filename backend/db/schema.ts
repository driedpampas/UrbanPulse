import { sql } from './client';
import { PULSE_CONFIRMATION_THRESHOLD } from './constants';

let isSchemaEnsured = false;

export async function ensureSchema() {
    if (isSchemaEnsured) return;

    await sql.begin(async (tx) => {
        await tx`CREATE SCHEMA IF NOT EXISTS app`;

        await tx`
            CREATE OR REPLACE FUNCTION app.jsonb_to_integer_array(json_val jsonb)
            RETURNS integer[]
            LANGUAGE sql
            IMMUTABLE STRICT
            AS $$
                SELECT ARRAY(
                    SELECT jsonb_array_elements_text(
                        CASE 
                            WHEN jsonb_typeof(json_val) = 'array' THEN json_val 
                            ELSE '[]'::jsonb 
                        END
                    )::int
                );
            $$;
        `;

        await tx`
            CREATE OR REPLACE FUNCTION app.text_array_to_timemultirange(text_val text[])
            RETURNS app.timemultirange
            LANGUAGE sql
            IMMUTABLE STRICT
            AS $$
                WITH parsed AS (
                    SELECT 
                        left(rng, 1) AS b_lower,
                        right(rng, 1) AS b_upper,
                        nullif(trim(split_part(substring(rng, 2, length(rng)-2), ',', 1)), '')::time AS t_start,
                        nullif(trim(split_part(substring(rng, 2, length(rng)-2), ',', 2)), '')::time AS t_end
                    FROM unnest(text_val) AS rng
                ),
                split_ranges AS (
                    SELECT app.timerange(t_start, t_end, b_lower || b_upper) AS tr
                    FROM parsed
                    WHERE t_start <= t_end
                    
                    UNION ALL
                    
                    SELECT app.timerange(t_start, '24:00:00'::time, b_lower || ')') AS tr
                    FROM parsed
                    WHERE t_start > t_end
                    
                    UNION ALL
                    
                    SELECT app.timerange('00:00:00'::time, t_end, '[' || b_upper) AS tr
                    FROM parsed
                    WHERE t_start > t_end
                )
                SELECT range_agg(tr) FROM split_ranges;
            $$;
        `;

        // Check chat_threads.owner_id
        const ownerIdCol = await tx`
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'app' AND table_name = 'chat_threads' AND column_name = 'owner_id'
            LIMIT 1
        `;
        if (ownerIdCol.length === 0) {
            await tx`
                ALTER TABLE app.chat_threads
                ADD COLUMN owner_id uuid REFERENCES app.users(id) ON DELETE SET NULL
            `;
        }

        // Check chat_threads.name
        const threadNameCol = await tx`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'chat_threads' AND column_name = 'name'
            LIMIT 1
        `;
        if (threadNameCol.length === 0) {
            await tx`
                ALTER TABLE app.chat_threads
                ADD COLUMN name text
            `;
        }

        // Check chat_participant_roles table
        const rolesTable = await tx`
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'app' AND table_name = 'chat_participant_roles'
            LIMIT 1
        `;
        if (rolesTable.length === 0) {
            await tx`
                CREATE TABLE app.chat_participant_roles (
                    thread_id uuid NOT NULL REFERENCES app.chat_threads(id) ON DELETE CASCADE,
                    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    role text NOT NULL,
                    assigned_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
                    assigned_at timestamptz NOT NULL DEFAULT now(),
                    PRIMARY KEY (thread_id, user_id, role)
                )
            `;
        }

        // Check pulse_confirmations table
        const confirmationsTable = await tx`
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'app' AND table_name = 'pulse_confirmations'
            LIMIT 1
        `;
        if (confirmationsTable.length === 0) {
            await tx`
                CREATE TABLE app.pulse_confirmations (
                    pulse_id uuid NOT NULL REFERENCES app.pulses(id) ON DELETE CASCADE,
                    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    confirmed_at timestamptz NOT NULL DEFAULT now(),
                    PRIMARY KEY (pulse_id, user_id)
                )
            `;
        }

        // Check reports table
        const reportsTable = await tx`
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'app' AND table_name = 'reports'
            LIMIT 1
        `;
        if (reportsTable.length === 0) {
            await tx`
                CREATE TABLE app.reports (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    target_id uuid NOT NULL,
                    target_type text NOT NULL,
                    reason text NOT NULL,
                    reported_by uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    status text NOT NULL DEFAULT 'pending',
                    content text NOT NULL
                )
            `;
        }

        const messageReportStatusType = await tx`
            SELECT 1
            FROM pg_type AS t
            JOIN pg_namespace AS n ON n.oid = t.typnamespace
            WHERE t.typname = 'message_report_status'
              AND n.nspname = 'app'
            LIMIT 1
        `;
        if (messageReportStatusType.length === 0) {
            await tx`
                CREATE TYPE app.message_report_status AS ENUM ('pending', 'reviewed', 'action_taken')
            `;
        }

        const messageReportsTable = await tx`
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'message_reports'
            LIMIT 1
        `;
        if (messageReportsTable.length === 0) {
            await tx`
                CREATE TABLE app.message_reports (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    reporter_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    offender_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    message_id uuid NOT NULL REFERENCES app.messages(id) ON DELETE CASCADE,
                    reason text NOT NULL,
                    status app.message_report_status NOT NULL DEFAULT 'pending',
                    created_at timestamptz NOT NULL DEFAULT now()
                )
            `;
        }

        await tx`
            CREATE INDEX IF NOT EXISTS message_reports_reporter_id_idx
            ON app.message_reports (reporter_id)
        `;
        await tx`
            CREATE INDEX IF NOT EXISTS message_reports_offender_id_idx
            ON app.message_reports (offender_id)
        `;
        await tx`
            CREATE INDEX IF NOT EXISTS message_reports_message_id_idx
            ON app.message_reports (message_id)
        `;
        await tx`
            CREATE INDEX IF NOT EXISTS message_reports_status_created_at_idx
            ON app.message_reports (status, created_at)
        `;
        await tx`
            CREATE INDEX IF NOT EXISTS message_reports_created_at_idx
            ON app.message_reports (created_at)
        `;

        // Check pulse_interactions table
        const interactionsTable = await tx`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'pulse_interactions'
            LIMIT 1
        `;
        if (interactionsTable.length === 0) {
            await tx`
                CREATE TABLE app.pulse_interactions (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    pulse_id uuid NOT NULL REFERENCES app.pulses(id) ON DELETE CASCADE,
                    author_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    helper_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    status text NOT NULL DEFAULT 'accepted',
                    accepted_at timestamptz NOT NULL DEFAULT now(),
                    confirmed_at timestamptz,
                    trust_awarded integer NOT NULL DEFAULT 0,
                    CONSTRAINT pulse_interactions_unique_accept UNIQUE (pulse_id, helper_id),
                    CONSTRAINT pulse_interactions_status_check CHECK (status IN ('accepted', 'successful'))
                )
            `;
        }

        await tx`
            CREATE INDEX IF NOT EXISTS pulse_interactions_author_id_idx
            ON app.pulse_interactions (author_id)
        `;

        await tx`
            CREATE INDEX IF NOT EXISTS pulse_interactions_helper_id_idx
            ON app.pulse_interactions (helper_id)
        `;

        await tx`
            CREATE INDEX IF NOT EXISTS pulse_interactions_pulse_id_idx
            ON app.pulse_interactions (pulse_id)
        `;

        // Check app.messages.message_type
        const messageEditedCol = await tx`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'messages' AND column_name = 'is_edited'
            LIMIT 1
        `;
        if (messageEditedCol.length === 0) {
            await tx`
                ALTER TABLE app.messages
                ADD COLUMN is_edited boolean NOT NULL DEFAULT false
            `;
        }

        const messageTypeCol = await tx`
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'app' AND table_name = 'messages' AND column_name = 'message_type'
            LIMIT 1
        `;
        if (messageTypeCol.length === 0) {
            await tx`
                ALTER TABLE app.messages
                ADD COLUMN message_type text NOT NULL DEFAULT 'text'
            `;
        }

        const messageReplyToCol = await tx`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'messages' AND column_name = 'reply_to_id'
            LIMIT 1
        `;
        if (messageReplyToCol.length === 0) {
            await tx`
                ALTER TABLE app.messages
                ADD COLUMN reply_to_id uuid
            `;
        }

        const messageReplyToForeignKey = await tx`
            SELECT 1
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
            WHERE tc.table_schema = 'app'
                AND tc.table_name = 'messages'
                AND tc.constraint_type = 'FOREIGN KEY'
                AND kcu.column_name = 'reply_to_id'
            LIMIT 1
        `;
        if (messageReplyToForeignKey.length === 0) {
            await tx`
                ALTER TABLE app.messages
                ADD CONSTRAINT messages_reply_to_id_fk
                FOREIGN KEY (reply_to_id)
                REFERENCES app.messages(id)
                ON DELETE SET NULL
            `;
        }

        const messageReplyToNoSelfConstraint = await tx`
            SELECT 1
            FROM information_schema.table_constraints
            WHERE table_schema = 'app'
                AND table_name = 'messages'
                AND constraint_type = 'CHECK'
                AND constraint_name = 'messages_reply_to_no_self_reply'
            LIMIT 1
        `;
        if (messageReplyToNoSelfConstraint.length === 0) {
            await tx`
                ALTER TABLE app.messages
                ADD CONSTRAINT messages_reply_to_no_self_reply
                CHECK (reply_to_id IS NULL OR reply_to_id <> id)
            `;
        }

        await tx`
            CREATE INDEX IF NOT EXISTS messages_reply_to_id_idx
            ON app.messages (reply_to_id)
        `;

        const messageEditsHistoryTable = await tx`
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'message_edits_history'
            LIMIT 1
        `;
        if (messageEditsHistoryTable.length === 0) {
            await tx`
                CREATE TABLE app.message_edits_history (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    message_id uuid NOT NULL REFERENCES app.messages(id) ON DELETE CASCADE,
                    old_content text NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now()
                )
            `;
        }

        await tx`
            CREATE INDEX IF NOT EXISTS message_edits_history_message_id_idx
            ON app.message_edits_history (message_id)
        `;

        const deletionRequestedAtCol = await tx`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'deletion_requested_at'
            LIMIT 1
        `;
        if (deletionRequestedAtCol.length === 0) {
            await tx`
                ALTER TABLE app.users
                ADD COLUMN deletion_requested_at timestamptz
            `;
        }

        await tx`
            CREATE INDEX IF NOT EXISTS users_deletion_requested_at_idx
            ON app.users (deletion_requested_at)
        `;

        const timezoneCol = await tx`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'timezone'
            LIMIT 1
        `;
        if (timezoneCol.length === 0) {
            await tx`
                ALTER TABLE app.users
                ADD COLUMN timezone text
            `;
        }

        await tx`
            UPDATE app.users
            SET timezone = COALESCE(NULLIF(timezone, ''), 'UTC')
            WHERE timezone IS NULL OR timezone = ''
        `;

        await tx`
            ALTER TABLE app.users
            ALTER COLUMN timezone SET DEFAULT 'UTC'
        `;

        await tx`
            ALTER TABLE app.users
            ALTER COLUMN timezone SET NOT NULL
        `;

        await tx`
            ALTER TABLE app.users
            ADD COLUMN IF NOT EXISTS profile_picture_filename text
        `;
        await tx`
            ALTER TABLE app.users
            ADD COLUMN IF NOT EXISTS profile_picture_mime_type text
        `;
        await tx`
            ALTER TABLE app.users
            ADD COLUMN IF NOT EXISTS profile_picture_size_bytes integer
        `;
        await tx`
            ALTER TABLE app.users
            ADD COLUMN IF NOT EXISTS profile_picture_updated_at timestamptz
        `;

        const usersRoleConstraint = (await tx`
            SELECT pg_get_constraintdef(c.oid) AS constraint_def
            FROM pg_constraint AS c
            WHERE c.conrelid = 'app.users'::regclass
              AND c.conname = 'users_role_check'
            LIMIT 1
        `) as Array<{ constraint_def?: string | null }>;

        const usersRoleConstraintDef = String(
            usersRoleConstraint[0]?.constraint_def ?? ''
        ).toLowerCase();

        await tx`
            UPDATE app.users
            SET role = 'user'
            WHERE LOWER(role) = 'resident'
        `;

        const usersRoleConstraintNeedsUpdate =
            usersRoleConstraint.length === 0 ||
            !usersRoleConstraintDef.includes('admin') ||
            !usersRoleConstraintDef.includes('mod') ||
            !usersRoleConstraintDef.includes('banned') ||
            !usersRoleConstraintDef.includes('user') ||
            usersRoleConstraintDef.includes('resident');

        if (usersRoleConstraintNeedsUpdate) {
            await tx`
                ALTER TABLE app.users
                DROP CONSTRAINT IF EXISTS users_role_check
            `;

            await tx`
                ALTER TABLE app.users
                ADD CONSTRAINT users_role_check CHECK (
                    LOWER(role) = ANY (ARRAY['admin', 'mod', 'user', 'banned'])
                )
            `;
        }

        const pulseVerifiedInfoCol = (await tx`
            SELECT is_generated
            FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'pulses' AND column_name = 'is_verified_info'
            LIMIT 1
        `) as Array<{ is_generated: string }>;

        if (pulseVerifiedInfoCol.length === 0) {
            await tx`
                ALTER TABLE app.pulses
                ADD COLUMN is_verified_info boolean
            `;
        }

        if (pulseVerifiedInfoCol[0]?.is_generated === 'ALWAYS') {
            await tx`
                ALTER TABLE app.pulses
                ALTER COLUMN is_verified_info DROP EXPRESSION
            `;
        }

        const pulseConfirmationCountCol = (await tx`
            SELECT is_generated
            FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'pulses' AND column_name = 'confirmation_count'
            LIMIT 1
        `) as Array<{ is_generated: string }>;

        if (pulseConfirmationCountCol.length === 0) {
            await tx`
                ALTER TABLE app.pulses
                ADD COLUMN confirmation_count integer
            `;
        }

        if (pulseConfirmationCountCol[0]?.is_generated === 'ALWAYS') {
            throw new Error(
                'Unsupported app.pulses schema: confirmation_count must be writable and cannot be a generated column.'
            );
        }

        await tx`
            UPDATE app.pulses
            SET confirmation_count = COALESCE(confirmation_count, 0)
            WHERE confirmation_count IS NULL
        `;

        await tx`
            ALTER TABLE app.pulses
            ALTER COLUMN confirmation_count SET DEFAULT 0
        `;

        await tx`
            ALTER TABLE app.pulses
            ALTER COLUMN confirmation_count SET NOT NULL
        `;

        await tx`
            UPDATE app.pulses
            SET is_verified_info = CASE
                WHEN COALESCE(confirmation_count, 0) >= ${PULSE_CONFIRMATION_THRESHOLD}
                    THEN true
                ELSE COALESCE(is_verified_info, false)
            END
            WHERE is_verified_info IS NULL OR COALESCE(confirmation_count, 0) >= ${PULSE_CONFIRMATION_THRESHOLD}
        `;

        await tx`
            ALTER TABLE app.pulses
            ALTER COLUMN is_verified_info SET DEFAULT false
        `;

        await tx`
            ALTER TABLE app.pulses
            ALTER COLUMN is_verified_info SET NOT NULL
        `;

        const pulseEmergencyCol = await tx`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'pulses' AND column_name = 'is_emergency'
            LIMIT 1
        `;
        if (pulseEmergencyCol.length === 0) {
            await tx`
                ALTER TABLE app.pulses
                ADD COLUMN is_emergency boolean
            `;
        }

        const pulseEmergencyGeneratedCol = (await tx`
            SELECT is_generated
            FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'pulses' AND column_name = 'is_emergency'
            LIMIT 1
        `) as Array<{ is_generated: string }>;

        if (pulseEmergencyGeneratedCol[0]?.is_generated === 'ALWAYS') {
            throw new Error(
                'Unsupported app.pulses schema: is_emergency must be writable and cannot be a generated column.'
            );
        }

        await tx`
            UPDATE app.pulses
            SET is_emergency = CASE
                WHEN LOWER(COALESCE(pulse_type, '')) = 'emergency' THEN true
                ELSE COALESCE(is_emergency, false)
            END
            WHERE is_emergency IS NULL OR LOWER(COALESCE(pulse_type, '')) = 'emergency'
        `;

        await tx`
            ALTER TABLE app.pulses
            ALTER COLUMN is_emergency SET DEFAULT false
        `;

        await tx`
            ALTER TABLE app.pulses
            ALTER COLUMN is_emergency SET NOT NULL
        `;

        const pulseSolvedCol = await tx`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'pulses' AND column_name = 'is_solved'
            LIMIT 1
        `;
        if (pulseSolvedCol.length === 0) {
            await tx`
                ALTER TABLE app.pulses
                ADD COLUMN is_solved boolean
            `;
        }

        const pulseSolvedGeneratedCol = (await tx`
            SELECT is_generated
            FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'pulses' AND column_name = 'is_solved'
            LIMIT 1
        `) as Array<{ is_generated: string }>;

        if (pulseSolvedGeneratedCol[0]?.is_generated === 'ALWAYS') {
            throw new Error(
                'Unsupported app.pulses schema: is_solved must be writable and cannot be a generated column.'
            );
        }

        await tx`
            UPDATE app.pulses
            SET is_solved = COALESCE(is_solved, false)
            WHERE is_solved IS NULL
        `;

        await tx`
            ALTER TABLE app.pulses
            ALTER COLUMN is_solved SET DEFAULT false
        `;

        await tx`
            ALTER TABLE app.pulses
            ALTER COLUMN is_solved SET NOT NULL
        `;

        await tx`
            CREATE INDEX IF NOT EXISTS pulses_is_emergency_idx
            ON app.pulses (is_emergency)
        `;

        await tx`
            CREATE INDEX IF NOT EXISTS pulses_is_solved_idx
            ON app.pulses (is_solved)
        `;

        const pulseTypeConstraint = (await tx`
            SELECT pg_get_constraintdef(c.oid) AS constraint_def
            FROM pg_constraint AS c
            WHERE c.conrelid = 'app.pulses'::regclass
              AND c.conname = 'pulses_pulse_type_check'
            LIMIT 1
        `) as Array<{ constraint_def?: string | null }>;

        if (
            pulseTypeConstraint.length === 0 ||
            !String(pulseTypeConstraint[0]?.constraint_def ?? '')
                .toLowerCase()
                .includes('need')
        ) {
            await tx`
                ALTER TABLE app.pulses
                DROP CONSTRAINT IF EXISTS pulses_pulse_type_check
            `;

            await tx`
                ALTER TABLE app.pulses
                ADD CONSTRAINT pulses_pulse_type_check CHECK (
                    LOWER(pulse_type) = ANY (
                        ARRAY['update', 'emergency', 'skill', 'item', 'pet', 'need']
                    )
                )
            `;
        }
    });

    isSchemaEnsured = true;
}
