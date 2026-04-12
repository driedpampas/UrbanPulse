DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'pulses'
          AND column_name = 'is_verified_info'
          AND is_generated = 'ALWAYS'
    ) THEN
        ALTER TABLE "app"."pulses"
        ALTER COLUMN "is_verified_info" DROP EXPRESSION;
    END IF;
END $$;--> statement-breakpoint
ALTER TABLE "app"."pulses" ALTER COLUMN "confirmation_count" SET DEFAULT 0;--> statement-breakpoint
UPDATE "app"."pulses"
SET "confirmation_count" = COALESCE("confirmation_count", 0),
    "is_verified_info" = CASE
        WHEN COALESCE("confirmation_count", 0) >= 3 THEN true
        ELSE COALESCE("is_verified_info", false)
    END
WHERE "confirmation_count" IS NULL
   OR "is_verified_info" IS NULL
   OR COALESCE("confirmation_count", 0) >= 3;--> statement-breakpoint
ALTER TABLE "app"."pulses" ALTER COLUMN "is_verified_info" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "app"."pulses" ALTER COLUMN "confirmation_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."pulses" ALTER COLUMN "is_verified_info" SET NOT NULL;
