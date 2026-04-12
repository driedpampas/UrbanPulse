ALTER TABLE app.users
ADD COLUMN IF NOT EXISTS timezone text;

UPDATE app.users
SET timezone = COALESCE(NULLIF(timezone, ''), 'UTC')
WHERE timezone IS NULL OR timezone = '';

ALTER TABLE app.users
ALTER COLUMN timezone SET DEFAULT 'UTC';

ALTER TABLE app.users
ALTER COLUMN timezone SET NOT NULL;
