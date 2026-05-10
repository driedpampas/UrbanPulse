-- Migration 013: Fix confidence_score constraint and add missing defaults
-- The triggers introduced in 012 can push confidence_score above 100,
-- so the upper bound CHECK constraint is incorrect and must be removed.

ALTER TABLE app.incidents DROP CONSTRAINT IF EXISTS incidents_confidence_score_check;
ALTER TABLE app.incidents ADD CONSTRAINT incidents_confidence_score_check CHECK (confidence_score >= 0);
ALTER TABLE app.incidents ALTER COLUMN confidence_score SET DEFAULT 0;
ALTER TABLE app.incidents ALTER COLUMN confirmed SET DEFAULT false;
