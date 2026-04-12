DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'pulses'
          AND column_name = 'is_verified_info'
          AND is_generated = 'NEVER'
    ) THEN
        ALTER TABLE "app"."pulses" DROP COLUMN "is_verified_info";

        ALTER TABLE "app"."pulses"
        ADD COLUMN "is_verified_info" boolean
        GENERATED ALWAYS AS (COALESCE("confirmation_count", 0) >= 3) STORED;
    END IF;
END $$;
