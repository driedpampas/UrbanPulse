ALTER TABLE "app"."users" ADD COLUMN "is_email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."users" ADD COLUMN "verification_token" text;--> statement-breakpoint