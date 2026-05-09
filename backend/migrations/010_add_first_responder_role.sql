-- Migration 010: Add first_responder role to user_role enum
-- Adds 'first_responder' to the app.user_role enum type.

ALTER TYPE "app"."user_role" ADD VALUE 'first_responder';
