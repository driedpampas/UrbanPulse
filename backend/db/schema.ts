import { sql } from './client';
import { PULSE_CONFIRMATION_THRESHOLD } from './constants';

let isSchemaEnsured = false;

export async function ensureSchema() {
    if (isSchemaEnsured) return;

    await sql.begin(async (tx) => {
        await tx`CREATE SCHEMA IF NOT EXISTS app`;

        // Create ENUM types if they don't exist
        const enumTypes = [
            { name: 'user_role', values: ['admin', 'mod', 'user', 'banned', 'first_responder'] },
            { name: 'pulse_type', values: ['update', 'emergency', 'skill', 'item', 'pet', 'need'] },
            { name: 'library_item_type', values: ['item', 'skill'] },
            { name: 'report_target_type', values: ['pulse', 'user', 'message'] },
            { name: 'message_type', values: ['text', 'notice'] },
            { name: 'report_status', values: ['pending', 'resolved', 'dismissed'] },
            {
                name: 'crisis_status',
                values: ['safe', 'need_help', 'injured', 'available_to_help', 'no_response'],
            },
        ] as const;

        for (const enumType of enumTypes) {
            const existing = await tx`
                SELECT 1 FROM pg_type t
                JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE t.typname = ${enumType.name} AND n.nspname = 'app'
                LIMIT 1
            `;
            if (existing.length === 0) {
                const values = enumType.values.map((v) => `'${v}'`).join(', ');
                await tx.unsafe(`CREATE TYPE app.${enumType.name} AS ENUM (${values})`);
            }
        }

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

        // Check incident_type table
        const incidentTypeTable = await tx`
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'app' AND table_name = 'incident_type'
            LIMIT 1
        `;
        if (incidentTypeTable.length === 0) {
            await tx`
                CREATE TABLE app.incident_type (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                    label text NOT NULL
                )
            `;
        }

        // Check incidents table
        const incidentsTable = await tx`
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'app' AND table_name = 'incidents'
            LIMIT 1
        `;
        if (incidentsTable.length === 0) {
            await tx`
                CREATE TABLE app.incidents (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                    type uuid NOT NULL REFERENCES app.incident_type(id) ON DELETE CASCADE,
                    location geography(Polygon, 4326) NOT NULL,
                    confidence_score smallint NOT NULL DEFAULT 0 CHECK (confidence_score >= 0),
                    confirmed boolean NOT NULL DEFAULT false
                )
            `;
        } else {
            // Fix pre-existing upper bound constraint and missing defaults
            await tx`
                ALTER TABLE app.incidents
                DROP CONSTRAINT IF EXISTS incidents_confidence_score_check
            `;
            await tx`
                ALTER TABLE app.incidents
                ADD CONSTRAINT incidents_confidence_score_check CHECK (confidence_score >= 0)
            `;
            await tx`ALTER TABLE app.incidents ALTER COLUMN confidence_score SET DEFAULT 0`;
            await tx`ALTER TABLE app.incidents ALTER COLUMN confirmed SET DEFAULT false`;
        }

        // Check incident_reports table
        const incidentReportsTable = await tx`
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'app' AND table_name = 'incident_reports'
            LIMIT 1
        `;
        if (incidentReportsTable.length === 0) {
            await tx`
                CREATE TABLE app.incident_reports (
                    id_incident uuid NOT NULL REFERENCES app.incidents(id) ON DELETE CASCADE,
                    id_user uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    created_at timestamp NOT NULL DEFAULT now(),
                    title varchar NOT NULL,
                    description varchar NOT NULL,
                    PRIMARY KEY (id_incident, id_user)
                )
            `;
        }

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

        // Migrate any legacy 'resident' roles to 'user' before the enum was applied
        await tx`
            UPDATE app.users
            SET role = 'user'
            WHERE role::text = 'resident'
        `;

        // Drop the old CHECK constraint (superseded by the app.user_role enum type)
        await tx`
            ALTER TABLE app.users
            DROP CONSTRAINT IF EXISTS users_role_check
        `;

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
                WHEN pulse_type::text = 'emergency' THEN true
                ELSE COALESCE(is_emergency, false)
            END
            WHERE is_emergency IS NULL OR pulse_type::text = 'emergency'
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

        // Drop the old CHECK constraint (superseded by the app.pulse_type enum type)
        await tx`
            ALTER TABLE app.pulses
            DROP CONSTRAINT IF EXISTS pulses_pulse_type_check
        `;

        // incident_votes table
        const incidentVotesTable = await tx`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'incident_votes'
            LIMIT 1
        `;
        if (incidentVotesTable.length === 0) {
            await tx`
                CREATE TABLE app.incident_votes (
                    id_incident uuid NOT NULL REFERENCES app.incidents(id) ON DELETE CASCADE,
                    id_user     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    created_at  timestamp NOT NULL DEFAULT now(),
                    approved    boolean NOT NULL,
                    PRIMARY KEY (id_incident, id_user)
                )
            `;
        }

        // user_crisis table
        const userCrisisTable = await tx`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'user_crisis'
            LIMIT 1
        `;
        if (userCrisisTable.length === 0) {
            await tx`
                CREATE TABLE app.user_crisis (
                    user_id  uuid NOT NULL PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
                    location geography(Point, 4326) NOT NULL,
                    status   app.crisis_status NOT NULL DEFAULT 'no_response'
                )
            `;
        }

        // lost_documents table
        const lostDocumentsTable = await tx`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'lost_documents'
            LIMIT 1
        `;
        if (lostDocumentsTable.length === 0) {
            await tx`
                CREATE TABLE app.lost_documents (
                    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    poster_id      uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    location       geography(Point, 4326) NOT NULL,
                    image_censored varchar(512),
                    image_original varchar(512)
                )
            `;
        }

        // Stored procedures (idempotent via CREATE OR REPLACE)
        await tx.unsafe(`
            CREATE OR REPLACE FUNCTION app.incident_report_insert(
                p_user_id       uuid,
                p_incident_type uuid,
                p_title         varchar,
                p_description   varchar,
                p_location      geography(Polygon, 4326)
            )
            RETURNS void
            LANGUAGE plpgsql
            AS $$
            DECLARE
                v_incident_id uuid;
            BEGIN
                SELECT id
                    INTO v_incident_id
                    FROM app.incidents
                    WHERE type = p_incident_type
                      AND location = p_location
                    LIMIT 1;

                IF v_incident_id IS NULL THEN
                    INSERT INTO app.incidents (type, location, confidence_score, confirmed)
                    VALUES (p_incident_type, p_location, 0, false)
                    RETURNING id INTO v_incident_id;
                END IF;

                DELETE FROM app.incident_votes
                WHERE id_incident = v_incident_id
                  AND id_user = p_user_id;

                INSERT INTO app.incident_reports (id_incident, id_user, title, description)
                VALUES (v_incident_id, p_user_id, p_title, p_description)
                ON CONFLICT (id_incident, id_user) DO NOTHING;
            END;
            $$;
        `);

        await tx.unsafe(`
            CREATE OR REPLACE FUNCTION app.incident_votes_insert(
                p_user_id     uuid,
                p_incident_id uuid,
                p_approve     boolean
            )
            RETURNS void
            LANGUAGE plpgsql
            AS $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM app.incidents WHERE id = p_incident_id
                ) THEN
                    RETURN;
                END IF;

                IF p_approve = false THEN
                    DELETE FROM app.incident_reports
                    WHERE id_incident = p_incident_id
                      AND id_user = p_user_id;

                    INSERT INTO app.incident_votes (id_incident, id_user, approved)
                    VALUES (p_incident_id, p_user_id, p_approve)
                    ON CONFLICT (id_incident, id_user) DO NOTHING;

                ELSIF NOT EXISTS (
                    SELECT 1 FROM app.incident_reports
                    WHERE id_incident = p_incident_id
                      AND id_user = p_user_id
                ) THEN
                    INSERT INTO app.incident_votes (id_incident, id_user, approved)
                    VALUES (p_incident_id, p_user_id, p_approve)
                    ON CONFLICT (id_incident, id_user) DO NOTHING;
                END IF;
            END;
            $$;
        `);

        // Confidence scoring trigger functions (idempotent)
        await tx.unsafe(`
            CREATE OR REPLACE FUNCTION app.calculate_vote_score(p_role app.user_role, p_trust integer, p_approved boolean)
            RETURNS integer AS $$
            DECLARE
                v_score integer := 0;
            BEGIN
                IF p_approved THEN
                    CASE p_role
                        WHEN 'admin' THEN v_score := 10;
                        WHEN 'mod' THEN v_score := 4;
                        WHEN 'first_responder' THEN v_score := 10;
                        ELSE v_score := 2;
                    END CASE;
                    v_score := v_score + LEAST(3, p_trust / 10);
                ELSE
                    CASE p_role
                        WHEN 'admin' THEN v_score := -20;
                        WHEN 'mod' THEN v_score := -3;
                        WHEN 'first_responder' THEN v_score := -20;
                        ELSE v_score := -2;
                    END CASE;
                    v_score := v_score - LEAST(2, p_trust / 15);
                END IF;
                RETURN v_score;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await tx.unsafe(`
            CREATE OR REPLACE FUNCTION app.check_incident_thresholds(p_incident_id uuid)
            RETURNS void AS $$
            DECLARE
                v_score     integer;
                v_confirmed boolean;
                v_location  geography(Polygon, 4326);
            BEGIN
                SELECT confidence_score, confirmed, location
                    INTO v_score, v_confirmed, v_location
                    FROM app.incidents WHERE id = p_incident_id;

                IF v_score IS NULL THEN RETURN; END IF;

                IF v_score <= 0 THEN
                    DELETE FROM app.incidents WHERE id = p_incident_id;
                    RETURN;
                END IF;

                IF v_score < 15 AND v_confirmed THEN
                    DELETE FROM app.incidents WHERE id = p_incident_id;
                    RETURN;
                END IF;

                IF v_score >= 40 AND NOT v_confirmed THEN
                    UPDATE app.incidents SET confirmed = true WHERE id = p_incident_id;
                    RETURN;
                END IF;

                IF v_score >= 25 AND NOT v_confirmed THEN
                    IF EXISTS (
                        SELECT 1 FROM app.incidents
                        WHERE id != p_incident_id
                          AND confirmed = true
                          AND (ST_Touches(location::geometry, v_location::geometry)
                               OR ST_DWithin(location, v_location, 100))
                    ) THEN
                        UPDATE app.incidents SET confirmed = true WHERE id = p_incident_id;
                    END IF;
                END IF;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await tx.unsafe(`
            CREATE OR REPLACE FUNCTION app.update_incident_confidence_from_report()
            RETURNS TRIGGER AS $$
            DECLARE
                v_user_role   app.user_role;
                v_trust_score integer;
                v_score       integer := 0;
                v_incident_id uuid;
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    v_incident_id := NEW.id_incident;
                    SELECT role, trust_score INTO v_user_role, v_trust_score FROM app.users WHERE id = NEW.id_user;
                    CASE v_user_role
                        WHEN 'admin' THEN v_score := 40;
                        WHEN 'mod' THEN v_score := 10;
                        WHEN 'first_responder' THEN v_score := 30;
                        ELSE v_score := 5;
                    END CASE;
                    v_score := v_score + LEAST(5, v_trust_score / 10);
                    UPDATE app.incidents SET confidence_score = confidence_score + v_score WHERE id = v_incident_id;
                ELSIF TG_OP = 'DELETE' THEN
                    v_incident_id := OLD.id_incident;
                    SELECT role, trust_score INTO v_user_role, v_trust_score FROM app.users WHERE id = OLD.id_user;
                    CASE v_user_role
                        WHEN 'admin' THEN v_score := 40;
                        WHEN 'mod' THEN v_score := 10;
                        WHEN 'first_responder' THEN v_score := 30;
                        ELSE v_score := 5;
                    END CASE;
                    v_score := v_score + LEAST(5, v_trust_score / 10);
                    UPDATE app.incidents SET confidence_score = confidence_score - v_score WHERE id = v_incident_id;
                ELSE
                    v_incident_id := NEW.id_incident;
                END IF;
                PERFORM app.check_incident_thresholds(v_incident_id);
                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await tx.unsafe(`
            CREATE OR REPLACE FUNCTION app.update_incident_confidence_from_vote()
            RETURNS TRIGGER AS $$
            DECLARE
                v_user_role   app.user_role;
                v_trust_score integer;
                v_score       integer := 0;
                v_old_score   integer := 0;
                v_new_score   integer := 0;
                v_incident_id uuid;
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    v_incident_id := NEW.id_incident;
                    SELECT role, trust_score INTO v_user_role, v_trust_score FROM app.users WHERE id = NEW.id_user;
                    v_score := app.calculate_vote_score(v_user_role, v_trust_score, NEW.approved);
                    UPDATE app.incidents SET confidence_score = confidence_score + v_score WHERE id = v_incident_id;
                ELSIF TG_OP = 'DELETE' THEN
                    v_incident_id := OLD.id_incident;
                    SELECT role, trust_score INTO v_user_role, v_trust_score FROM app.users WHERE id = OLD.id_user;
                    v_score := app.calculate_vote_score(v_user_role, v_trust_score, OLD.approved);
                    UPDATE app.incidents SET confidence_score = confidence_score - v_score WHERE id = v_incident_id;
                ELSIF TG_OP = 'UPDATE' THEN
                    v_incident_id := NEW.id_incident;
                    SELECT role, trust_score INTO v_user_role, v_trust_score FROM app.users WHERE id = NEW.id_user;
                    v_old_score := app.calculate_vote_score(v_user_role, v_trust_score, OLD.approved);
                    v_new_score := app.calculate_vote_score(v_user_role, v_trust_score, NEW.approved);
                    UPDATE app.incidents SET confidence_score = confidence_score - v_old_score + v_new_score WHERE id = v_incident_id;
                END IF;
                PERFORM app.check_incident_thresholds(v_incident_id);
                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await tx.unsafe(`
            DROP TRIGGER IF EXISTS trg_incident_reports_confidence ON app.incident_reports;
            CREATE TRIGGER trg_incident_reports_confidence
            AFTER INSERT OR DELETE OR UPDATE ON app.incident_reports
            FOR EACH ROW EXECUTE FUNCTION app.update_incident_confidence_from_report();
        `);

        await tx.unsafe(`
            DROP TRIGGER IF EXISTS trg_incident_votes_confidence ON app.incident_votes;
            CREATE TRIGGER trg_incident_votes_confidence
            AFTER INSERT OR DELETE OR UPDATE ON app.incident_votes
            FOR EACH ROW EXECUTE FUNCTION app.update_incident_confidence_from_vote();
        `);

        // Add private information columns to app.users
        await tx`
            ALTER TABLE app.users
            ADD COLUMN IF NOT EXISTS legal_first_name text,
            ADD COLUMN IF NOT EXISTS legal_last_name text,
            ADD COLUMN IF NOT EXISTS birthday date,
            ADD COLUMN IF NOT EXISTS home_address text,
            ADD COLUMN IF NOT EXISTS phone_number text
        `;

        // Check lost_documents table
        const lostDocumentsTable = await tx`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'lost_documents'
            LIMIT 1
        `;
        if (lostDocumentsTable.length === 0) {
            await tx`
                CREATE TABLE app.lost_documents (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    title text NOT NULL,
                    description text NOT NULL,
                    location geography(Point, 4326) NOT NULL,
                    image_path text NOT NULL,
                    redacted_image_path text NOT NULL,
                    status text NOT NULL DEFAULT 'pending',
                    matched_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    CONSTRAINT lost_documents_status_check CHECK (status IN ('pending', 'processed', 'matched', 'returned'))
                )
            `;
            await tx`
                CREATE INDEX IF NOT EXISTS lost_documents_user_id_idx ON app.lost_documents(user_id)
            `;
            await tx`
                CREATE INDEX IF NOT EXISTS lost_documents_matched_user_id_idx ON app.lost_documents(matched_user_id)
            `;
            await tx`
                CREATE INDEX IF NOT EXISTS lost_documents_location_idx ON app.lost_documents USING GIST(location)
            `;
        }
    });

    isSchemaEnsured = true;
}
