-- Undo: removes all data inserted by seed_incident_test.sql

BEGIN;

-- ── 1. Remove incident votes cast by the test users ──────────────────────────
DELETE FROM app.incident_votes
WHERE id_user = ANY(ARRAY[
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'a0000000-0000-0000-0000-000000000003'::uuid,
    'a0000000-0000-0000-0000-000000000004'::uuid,
    'a0000000-0000-0000-0000-000000000005'::uuid,
    'a0000000-0000-0000-0000-000000000006'::uuid,
    'a0000000-0000-0000-0000-000000000007'::uuid,
    'a0000000-0000-0000-0000-000000000008'::uuid,
    'a0000000-0000-0000-0000-000000000009'::uuid,
    'a0000000-0000-0000-0000-000000000010'::uuid
]);

-- ── 2. Remove incident reports filed by the test users ───────────────────────
DELETE FROM app.incident_reports
WHERE id_user = ANY(ARRAY[
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid
]);

-- ── 3. Remove the incident itself (now orphaned) ─────────────────────────────
DELETE FROM app.incidents
WHERE type = '00000000-0000-0000-0000-000000000001'::uuid;

-- ── 4. Remove the test incident type ─────────────────────────────────────────
DELETE FROM app.incident_type
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ── 5. Remove the 10 test users ──────────────────────────────────────────────
DELETE FROM app.users
WHERE id = ANY(ARRAY[
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'a0000000-0000-0000-0000-000000000003'::uuid,
    'a0000000-0000-0000-0000-000000000004'::uuid,
    'a0000000-0000-0000-0000-000000000005'::uuid,
    'a0000000-0000-0000-0000-000000000006'::uuid,
    'a0000000-0000-0000-0000-000000000007'::uuid,
    'a0000000-0000-0000-0000-000000000008'::uuid,
    'a0000000-0000-0000-0000-000000000009'::uuid,
    'a0000000-0000-0000-0000-000000000010'::uuid
]);

COMMIT;
