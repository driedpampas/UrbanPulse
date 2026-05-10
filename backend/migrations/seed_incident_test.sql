-- Seed: 10 test users at the same location, 2 report an incident, 8 approve it
-- Location: lat 48.8566, lng 2.3522 (Paris center)
-- Uses app.incident_report_insert and app.incident_votes_insert

BEGIN;

-- ── 1. Ensure a test incident type exists ────────────────────────────────────
INSERT INTO app.incident_type (id, label)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test: Fire')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Insert 10 test users at the same point ────────────────────────────────
-- Roles and trust scores are varied to exercise the confidence-score weights.
-- Passwords are dummy bcrypt hashes (not usable for real login).
INSERT INTO app.users (id, email, display_name, password_hash, is_email_verified, role, trust_score, location)
VALUES
    -- reporters (will file incident reports)
    ('a0000000-0000-0000-0000-000000000001', 'test_reporter1@example.com', 'Reporter One',
     '$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true,
     'user', 10,
     ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography),

    ('a0000000-0000-0000-0000-000000000002', 'test_reporter2@example.com', 'Reporter Two',
     '$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true,
     'user', 25,
     ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography),

    -- approvers (will vote to confirm the incident)
    ('a0000000-0000-0000-0000-000000000003', 'test_voter3@example.com', 'Voter Three',
     '$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true,
     'user', 5,
     ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography),

    ('a0000000-0000-0000-0000-000000000004', 'test_voter4@example.com', 'Voter Four',
     '$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true,
     'user', 30,
     ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography),

    ('a0000000-0000-0000-0000-000000000005', 'test_voter5@example.com', 'Voter Five',
     '$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true,
     'user', 50,
     ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography),

    ('a0000000-0000-0000-0000-000000000006', 'test_voter6@example.com', 'Voter Six',
     '$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true,
     'mod', 40,
     ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography),

    ('a0000000-0000-0000-0000-000000000007', 'test_voter7@example.com', 'Voter Seven',
     '$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true,
     'user', 15,
     ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography),

    ('a0000000-0000-0000-0000-000000000008', 'test_voter8@example.com', 'Voter Eight',
     '$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true,
     'user', 60,
     ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography),

    ('a0000000-0000-0000-0000-000000000009', 'test_voter9@example.com', 'Voter Nine',
     '$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true,
     'first_responder', 80,
     ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography),

    ('a0000000-0000-0000-0000-000000000010', 'test_voter10@example.com', 'Voter Ten',
     '$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true,
     'user', 20,
     ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Two users file incident reports (creates the incident via the procedure) ─
-- The location is a small polygon around the same Paris point.
-- app.incident_report_insert(p_user_id, p_incident_type, p_title, p_description, p_location)
SELECT app.incident_report_insert(
    'a0000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Fire spotted near landmark',
    'Thick smoke visible from the main square.',
    ST_SetSRID(
        ST_GeomFromText('POLYGON((2.3520 48.8564, 2.3524 48.8564, 2.3524 48.8568, 2.3520 48.8568, 2.3520 48.8564))'),
        4326
    )::geography(Polygon, 4326)
);

SELECT app.incident_report_insert(
    'a0000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Fire confirmed — building evacuating',
    'Flames visible on the second floor, fire brigade called.',
    ST_SetSRID(
        ST_GeomFromText('POLYGON((2.3520 48.8564, 2.3524 48.8564, 2.3524 48.8568, 2.3520 48.8568, 2.3520 48.8564))'),
        4326
    )::geography(Polygon, 4326)
);

-- ── 4. Eight users approve the incident ──────────────────────────────────────
-- Retrieve the incident id that was just created (matched by type + location).
DO $$
DECLARE
    v_incident_id uuid;
    v_location    geography(Polygon, 4326) := ST_SetSRID(
        ST_GeomFromText('POLYGON((2.3520 48.8564, 2.3524 48.8564, 2.3524 48.8568, 2.3520 48.8568, 2.3520 48.8564))'),
        4326
    )::geography(Polygon, 4326);
    v_voter       uuid;
    v_voters      uuid[] := ARRAY[
        'a0000000-0000-0000-0000-000000000003'::uuid,
        'a0000000-0000-0000-0000-000000000004'::uuid,
        'a0000000-0000-0000-0000-000000000005'::uuid,
        'a0000000-0000-0000-0000-000000000006'::uuid,
        'a0000000-0000-0000-0000-000000000007'::uuid,
        'a0000000-0000-0000-0000-000000000008'::uuid,
        'a0000000-0000-0000-0000-000000000009'::uuid,
        'a0000000-0000-0000-0000-000000000010'::uuid
    ];
BEGIN
    SELECT id INTO v_incident_id
    FROM app.incidents
    WHERE type = '00000000-0000-0000-0000-000000000001'
      AND location = v_location
    LIMIT 1;

    IF v_incident_id IS NULL THEN
        RAISE EXCEPTION 'Incident not found — were the reports inserted?';
    END IF;

    FOREACH v_voter IN ARRAY v_voters LOOP
        PERFORM app.incident_votes_insert(v_voter, v_incident_id, true);
    END LOOP;
END;
$$;

-- ── 5. Verify result ──────────────────────────────────────────────────────────
SELECT
    i.id,
    it.label         AS type,
    i.confidence_score,
    i.confirmed,
    (SELECT COUNT(*) FROM app.incident_reports ir WHERE ir.id_incident = i.id) AS reports,
    (SELECT COUNT(*) FROM app.incident_votes   iv WHERE iv.id_incident = i.id AND iv.approved) AS approvals
FROM app.incidents i
JOIN app.incident_type it ON it.id = i.type
WHERE i.type = '00000000-0000-0000-0000-000000000001';

COMMIT;
