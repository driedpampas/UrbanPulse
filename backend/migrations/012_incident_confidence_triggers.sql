-- Migration 012: Incident confidence triggers
-- Implements confidence scoring and thresholds using triggers.

-- Helper function to calculate vote score
CREATE OR REPLACE FUNCTION app.calculate_vote_score(p_role app.user_role, p_trust integer, p_approved boolean)
RETURNS integer AS $$
DECLARE
    v_score integer := 0;
BEGIN
    IF p_approved THEN
        CASE p_role
            WHEN 'admin' THEN v_score := 10;
            WHEN 'mod' THEN v_score := 4;
            WHEN 'first_responder' THEN v_score := 10;
            ELSE v_score := 2;
        END CASE;
        v_score := v_score + LEAST(3, p_trust / 10);
    ELSE
        CASE p_role
            WHEN 'admin' THEN v_score := -20;
            WHEN 'mod' THEN v_score := -3;
            WHEN 'first_responder' THEN v_score := -20;
            ELSE v_score := -2;
        END CASE;
        v_score := v_score - LEAST(2, p_trust / 15);
    END IF;
    RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Function to check thresholds and update status or delete
CREATE OR REPLACE FUNCTION app.check_incident_thresholds(p_incident_id uuid)
RETURNS void AS $$
DECLARE
    v_score integer;
    v_confirmed boolean;
    v_location geography(Polygon, 4326);
BEGIN
    SELECT confidence_score, confirmed, location INTO v_score, v_confirmed, v_location 
    FROM app.incidents WHERE id = p_incident_id;
    
    IF v_score IS NULL THEN
        RETURN;
    END IF;

    -- 1. Delete if score <= 0
    IF v_score <= 0 THEN
        DELETE FROM app.incidents WHERE id = p_incident_id;
        RETURN;
    END IF;

    -- 2. Delete if score < 15 and was confirmed
    IF v_score < 15 AND v_confirmed THEN
        DELETE FROM app.incidents WHERE id = p_incident_id;
        RETURN;
    END IF;

    -- 3. Confirm if score >= 40
    IF v_score >= 40 AND NOT v_confirmed THEN
        UPDATE app.incidents SET confirmed = true WHERE id = p_incident_id;
        RETURN;
    END IF;

    -- 4. Confirm if score >= 25 and nearby is confirmed
    IF v_score >= 25 AND NOT v_confirmed THEN
        -- Check if any nearby incident is confirmed
        -- "Nearby" means touches or within 100m
        IF EXISTS (
            SELECT 1 FROM app.incidents 
            WHERE id != p_incident_id 
              AND confirmed = true 
              AND (ST_Touches(location::geometry, v_location::geometry) 
                   OR ST_DWithin(location, v_location, 100))
        ) THEN
            UPDATE app.incidents SET confirmed = true WHERE id = p_incident_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for incident_reports
CREATE OR REPLACE FUNCTION app.update_incident_confidence_from_report()
RETURNS TRIGGER AS $$
DECLARE
    v_user_role app.user_role;
    v_trust_score integer;
    v_score integer := 0;
    v_incident_id uuid;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_incident_id := NEW.id_incident;
        SELECT role, trust_score INTO v_user_role, v_trust_score FROM app.users WHERE id = NEW.id_user;
        
        CASE v_user_role
            WHEN 'admin' THEN v_score := 40;
            WHEN 'mod' THEN v_score := 10;
            WHEN 'first_responder' THEN v_score := 30;
            ELSE v_score := 5;
        END CASE;
        v_score := v_score + LEAST(5, v_trust_score / 10);
        
        UPDATE app.incidents 
        SET confidence_score = confidence_score + v_score
        WHERE id = v_incident_id;
        
    ELSIF TG_OP = 'DELETE' THEN
        v_incident_id := OLD.id_incident;
        SELECT role, trust_score INTO v_user_role, v_trust_score FROM app.users WHERE id = OLD.id_user;
        
        CASE v_user_role
            WHEN 'admin' THEN v_score := 40;
            WHEN 'mod' THEN v_score := 10;
            WHEN 'first_responder' THEN v_score := 30;
            ELSE v_score := 5;
        END CASE;
        v_score := v_score + LEAST(5, v_trust_score / 10);
        
        UPDATE app.incidents 
        SET confidence_score = confidence_score - v_score
        WHERE id = v_incident_id;
        
    ELSIF TG_OP = 'UPDATE' THEN
        v_incident_id := NEW.id_incident;
        -- If user or incident changed, we would need delta. 
        -- Assuming no score change on simple content update as per original rule.
    END IF;

    -- Check thresholds
    PERFORM app.check_incident_thresholds(v_incident_id);

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for incident_votes
CREATE OR REPLACE FUNCTION app.update_incident_confidence_from_vote()
RETURNS TRIGGER AS $$
DECLARE
    v_user_role app.user_role;
    v_trust_score integer;
    v_score integer := 0;
    v_incident_id uuid;
    v_old_score integer := 0;
    v_new_score integer := 0;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_incident_id := NEW.id_incident;
        SELECT role, trust_score INTO v_user_role, v_trust_score FROM app.users WHERE id = NEW.id_user;
        
        v_score := app.calculate_vote_score(v_user_role, v_trust_score, NEW.approved);
        
        UPDATE app.incidents 
        SET confidence_score = confidence_score + v_score
        WHERE id = v_incident_id;
        
    ELSIF TG_OP = 'DELETE' THEN
        v_incident_id := OLD.id_incident;
        SELECT role, trust_score INTO v_user_role, v_trust_score FROM app.users WHERE id = OLD.id_user;
        
        v_score := app.calculate_vote_score(v_user_role, v_trust_score, OLD.approved);
        
        UPDATE app.incidents 
        SET confidence_score = confidence_score - v_score
        WHERE id = v_incident_id;
        
    ELSIF TG_OP = 'UPDATE' THEN
        v_incident_id := NEW.id_incident;
        SELECT role, trust_score INTO v_user_role, v_trust_score FROM app.users WHERE id = NEW.id_user;
        
        v_old_score := app.calculate_vote_score(v_user_role, v_trust_score, OLD.approved);
        v_new_score := app.calculate_vote_score(v_user_role, v_trust_score, NEW.approved);
        
        UPDATE app.incidents 
        SET confidence_score = confidence_score - v_old_score + v_new_score
        WHERE id = v_incident_id;
    END IF;

    -- Check thresholds
    PERFORM app.check_incident_thresholds(v_incident_id);

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trg_incident_reports_confidence ON app.incident_reports;
CREATE TRIGGER trg_incident_reports_confidence
AFTER INSERT OR DELETE OR UPDATE ON app.incident_reports
FOR EACH ROW EXECUTE FUNCTION app.update_incident_confidence_from_report();

DROP TRIGGER IF EXISTS trg_incident_votes_confidence ON app.incident_votes;
CREATE TRIGGER trg_incident_votes_confidence
AFTER INSERT OR DELETE OR UPDATE ON app.incident_votes
FOR EACH ROW EXECUTE FUNCTION app.update_incident_confidence_from_vote();
