-- Migration 009: user_crisis table
-- Creates the crisis_status enum and user_crisis table to track
-- a user's self-reported status during a crisis event.

CREATE TYPE "app"."crisis_status" AS ENUM (
    'safe',
    'need_help',
    'injured',
    'available_to_help',
    'no_response'
);

CREATE TABLE "app"."user_crisis" (
    "user_id"  uuid NOT NULL PRIMARY KEY
               REFERENCES "app"."users"("id") ON DELETE CASCADE,
    "location" geography(Point, 4326) NOT NULL,
    "status"   "app"."crisis_status" NOT NULL DEFAULT 'no_response'
);
