CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."blocked_users" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_users_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
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
	"is_group" boolean DEFAULT false NOT NULL,
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
CREATE TABLE "app"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
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
CREATE TABLE "app"."pulses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"pulse_type" text NOT NULL,
	"content" text NOT NULL,
	"location" "geography(Point, 4326)" NOT NULL,
	"is_verified_info" boolean DEFAULT false NOT NULL,
	"confirmation_count" integer DEFAULT 0 NOT NULL,
	"urgency_level" integer DEFAULT 1 NOT NULL,
	"required_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"skills_and_resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"distance_limit_meters" integer,
	"location" "geography(Point, 4326)",
	"quiet_hours" "app.timemultirange",
	"quiet_days" integer[],
	"trust_score" integer DEFAULT 0 NOT NULL,
	"bio" text,
	"is_verified_neighbor" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."blocked_users" ADD CONSTRAINT "blocked_users_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."blocked_users" ADD CONSTRAINT "blocked_users_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chat_participants" ADD CONSTRAINT "chat_participants_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "app"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chat_participants" ADD CONSTRAINT "chat_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."hidden_messages" ADD CONSTRAINT "hidden_messages_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."hidden_messages" ADD CONSTRAINT "hidden_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."library_items" ADD CONSTRAINT "library_items_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "app"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pulse_confirmations" ADD CONSTRAINT "pulse_confirmations_pulse_id_pulses_id_fk" FOREIGN KEY ("pulse_id") REFERENCES "app"."pulses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pulse_confirmations" ADD CONSTRAINT "pulse_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pulses" ADD CONSTRAINT "pulses_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocked_users_blocked_id_idx" ON "app"."blocked_users" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "idx_library_items_type" ON "app"."library_items" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "library_items_author_id_idx" ON "app"."library_items" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "messages_thread_id_idx" ON "app"."messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "app"."messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "pulses_created_at_idx" ON "app"."pulses" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pulses_author_id_idx" ON "app"."pulses" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "app"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "app"."users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_trust_score_idx" ON "app"."users" USING btree ("trust_score");