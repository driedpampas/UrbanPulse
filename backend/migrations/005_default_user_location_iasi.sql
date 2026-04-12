UPDATE app.users
SET location = ST_SetSRID(ST_MakePoint(27.5889, 47.1569), 4326)::geography
WHERE location IS NULL;

ALTER TABLE app.users
ALTER COLUMN location SET DEFAULT ST_SetSRID(ST_MakePoint(27.5889, 47.1569), 4326)::geography;
