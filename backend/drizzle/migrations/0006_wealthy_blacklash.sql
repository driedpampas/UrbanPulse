ALTER TABLE "app"."messages" ADD COLUMN "reply_to_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "app"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_reply_to_no_self_reply" CHECK ("reply_to_id" IS NULL OR "reply_to_id" <> "id");--> statement-breakpoint
CREATE INDEX "messages_reply_to_id_idx" ON "app"."messages" USING btree ("reply_to_id");