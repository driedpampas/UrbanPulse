CREATE TYPE "app"."message_report_status" AS ENUM('pending', 'reviewed', 'action_taken');--> statement-breakpoint
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
ALTER TABLE "app"."message_reports" ADD CONSTRAINT "message_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."message_reports" ADD CONSTRAINT "message_reports_offender_id_users_id_fk" FOREIGN KEY ("offender_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."message_reports" ADD CONSTRAINT "message_reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_reports_reporter_id_idx" ON "app"."message_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "message_reports_offender_id_idx" ON "app"."message_reports" USING btree ("offender_id");--> statement-breakpoint
CREATE INDEX "message_reports_message_id_idx" ON "app"."message_reports" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_reports_status_created_at_idx" ON "app"."message_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "message_reports_created_at_idx" ON "app"."message_reports" USING btree ("created_at");