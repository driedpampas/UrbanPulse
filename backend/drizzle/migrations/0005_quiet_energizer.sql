CREATE TABLE "app"."message_edits_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"old_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."messages" ADD COLUMN "is_edited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."message_edits_history" ADD CONSTRAINT "message_edits_history_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_edits_history_message_id_idx" ON "app"."message_edits_history" USING btree ("message_id");