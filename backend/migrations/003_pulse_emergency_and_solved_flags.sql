ALTER TABLE app.pulses
ADD COLUMN IF NOT EXISTS is_emergency boolean;

UPDATE app.pulses
SET is_emergency = CASE
    WHEN LOWER(pulse_type) = 'emergency' THEN true
    ELSE COALESCE(is_emergency, false)
END
WHERE is_emergency IS NULL OR LOWER(pulse_type) = 'emergency';

ALTER TABLE app.pulses
ALTER COLUMN is_emergency SET DEFAULT false;

ALTER TABLE app.pulses
ALTER COLUMN is_emergency SET NOT NULL;

ALTER TABLE app.pulses
ADD COLUMN IF NOT EXISTS is_solved boolean;

UPDATE app.pulses
SET is_solved = COALESCE(is_solved, false)
WHERE is_solved IS NULL;

ALTER TABLE app.pulses
ALTER COLUMN is_solved SET DEFAULT false;

ALTER TABLE app.pulses
ALTER COLUMN is_solved SET NOT NULL;

CREATE INDEX IF NOT EXISTS pulses_is_emergency_idx ON app.pulses (is_emergency);
CREATE INDEX IF NOT EXISTS pulses_is_solved_idx ON app.pulses (is_solved);
