-- Migration 011: Add personal info columns to users table
-- Adds first_name, last_name, birthday, and phone_number columns to the app.users table.

ALTER TABLE "app"."users"
    ADD COLUMN "first_name" VARCHAR(100),
    ADD COLUMN "last_name" VARCHAR(100),
    ADD COLUMN "birthday" DATE,
    ADD COLUMN "phone_number" VARCHAR(20);
