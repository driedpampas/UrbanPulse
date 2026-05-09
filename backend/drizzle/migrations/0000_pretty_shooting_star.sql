CREATE EXTENSION postgis;

CREATE SCHEMA "app";

CREATE TYPE "app"."timerange" AS RANGE ( 
    subtype = time,
    multirange_type_name = app.timemultirange
);

CREATE OR REPLACE FUNCTION "app"."text_array_to_timemultirange"(json_val jsonb)
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
        FROM jsonb_array_elements_text(json_val) AS rng
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

CREATE OR REPLACE FUNCTION "app"."jsonb_to_integer_array"(json_val jsonb)
RETURNS int[]
LANGUAGE sql
IMMUTABLE STRICT
AS $$
    SELECT ARRAY(
        SELECT jsonb_array_elements_text(json_val)::int
    );
$$;

--> statement-breakpoint
CREATE TYPE "app"."message_report_status" AS ENUM('pending', 'reviewed', 'action_taken');--> statement-breakpoint
CREATE TABLE "app"."blocked_users" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_users_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "app"."chat_participant_roles" (
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_participant_roles_thread_id_user_id_role_pk" PRIMARY KEY("thread_id","user_id","role")
);
--> statement-breakpoint
CREATE TABLE "app"."chat_participants" (
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_participants_thread_id_user_id_pk" PRIMARY KEY("thread_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"is_group" boolean DEFAULT false NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."hidden_messages" (
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"hidden_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hidden_messages_message_id_user_id_pk" PRIMARY KEY("message_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."message_edits_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"old_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."message_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"offender_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "app"."message_report_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"reply_to_id" uuid,
	"content" text NOT NULL,
	"is_edited" boolean DEFAULT false NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."pulse_confirmations" (
	"pulse_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pulse_confirmations_pulse_id_user_id_pk" PRIMARY KEY("pulse_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."pulse_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pulse_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"helper_id" uuid NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"trust_awarded" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."pulses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"pulse_type" text NOT NULL,
	"content" text NOT NULL,
	"location" geography(point) NOT NULL,
	"is_verified_info" boolean DEFAULT false NOT NULL,
	"confirmation_count" integer DEFAULT 0 NOT NULL,
	"urgency_level" integer DEFAULT 1 NOT NULL,
	"is_emergency" boolean DEFAULT false NOT NULL,
	"is_solved" boolean DEFAULT false NOT NULL,
	"required_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"reason" text NOT NULL,
	"reported_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"password_hash" text NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"verification_token" text,
	"password_reset_token" text,
	"password_reset_expires" timestamp with time zone,
	"display_name" text,
	"distance_limit_meters" integer,
	"location" geography(Point),
	"quiet_hours" app.timemultirange,
	"quiet_days" integer[],
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"trust_score" integer DEFAULT 0 NOT NULL,
	"bio" text,
	"profile_picture_filename" text,
	"profile_picture_mime_type" text,
	"profile_picture_size_bytes" integer,
	"profile_picture_updated_at" timestamp with time zone,
	"is_verified_neighbor" boolean DEFAULT false NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."blocked_users" ADD CONSTRAINT "blocked_users_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."blocked_users" ADD CONSTRAINT "blocked_users_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chat_participant_roles" ADD CONSTRAINT "chat_participant_roles_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "app"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chat_participant_roles" ADD CONSTRAINT "chat_participant_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chat_participant_roles" ADD CONSTRAINT "chat_participant_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chat_participants" ADD CONSTRAINT "chat_participants_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "app"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chat_participants" ADD CONSTRAINT "chat_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chat_threads" ADD CONSTRAINT "chat_threads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."hidden_messages" ADD CONSTRAINT "hidden_messages_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."hidden_messages" ADD CONSTRAINT "hidden_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."library_items" ADD CONSTRAINT "library_items_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."message_edits_history" ADD CONSTRAINT "message_edits_history_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."message_reports" ADD CONSTRAINT "message_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."message_reports" ADD CONSTRAINT "message_reports_offender_id_users_id_fk" FOREIGN KEY ("offender_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."message_reports" ADD CONSTRAINT "message_reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "app"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "app"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pulse_confirmations" ADD CONSTRAINT "pulse_confirmations_pulse_id_pulses_id_fk" FOREIGN KEY ("pulse_id") REFERENCES "app"."pulses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pulse_confirmations" ADD CONSTRAINT "pulse_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pulse_interactions" ADD CONSTRAINT "pulse_interactions_pulse_id_pulses_id_fk" FOREIGN KEY ("pulse_id") REFERENCES "app"."pulses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pulse_interactions" ADD CONSTRAINT "pulse_interactions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pulse_interactions" ADD CONSTRAINT "pulse_interactions_helper_id_users_id_fk" FOREIGN KEY ("helper_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pulses" ADD CONSTRAINT "pulses_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reports" ADD CONSTRAINT "reports_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocked_users_blocked_id_idx" ON "app"."blocked_users" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "idx_library_items_type" ON "app"."library_items" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "library_items_author_id_idx" ON "app"."library_items" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "message_edits_history_message_id_idx" ON "app"."message_edits_history" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_reports_reporter_id_idx" ON "app"."message_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "message_reports_offender_id_idx" ON "app"."message_reports" USING btree ("offender_id");--> statement-breakpoint
CREATE INDEX "message_reports_message_id_idx" ON "app"."message_reports" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_reports_status_created_at_idx" ON "app"."message_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "message_reports_created_at_idx" ON "app"."message_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "messages_thread_id_idx" ON "app"."messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "app"."messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "messages_reply_to_id_idx" ON "app"."messages" USING btree ("reply_to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pulse_interactions_unique_accept" ON "app"."pulse_interactions" USING btree ("pulse_id","helper_id");--> statement-breakpoint
CREATE INDEX "pulse_interactions_author_id_idx" ON "app"."pulse_interactions" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "pulse_interactions_helper_id_idx" ON "app"."pulse_interactions" USING btree ("helper_id");--> statement-breakpoint
CREATE INDEX "pulse_interactions_pulse_id_idx" ON "app"."pulse_interactions" USING btree ("pulse_id");--> statement-breakpoint
CREATE INDEX "pulses_created_at_idx" ON "app"."pulses" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pulses_author_id_idx" ON "app"."pulses" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "pulses_is_emergency_idx" ON "app"."pulses" USING btree ("is_emergency");--> statement-breakpoint
CREATE INDEX "pulses_is_solved_idx" ON "app"."pulses" USING btree ("is_solved");--> statement-breakpoint
CREATE INDEX "reports_target_id_idx" ON "app"."reports" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "reports_reported_by_idx" ON "app"."reports" USING btree ("reported_by");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "app"."reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "app"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "app"."users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_trust_score_idx" ON "app"."users" USING btree ("trust_score");--> statement-breakpoint
CREATE INDEX "users_deletion_requested_at_idx" ON "app"."users" USING btree ("deletion_requested_at");
