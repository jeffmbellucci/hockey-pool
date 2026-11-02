-- Apply the same contest/team rules to draft picks and administrator corrections.
CREATE FUNCTION validate_two_team_pick() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE participant_contest integer;
BEGIN
  SELECT contest_id INTO participant_contest FROM pool_participants WHERE participant_id = NEW.participant_id;
  IF participant_contest IS NULL THEN
    RAISE EXCEPTION 'Participant must belong to a contest';
  END IF;
  IF NEW.contest_id IS NOT NULL AND NEW.contest_id <> participant_contest THEN
    RAISE EXCEPTION 'Pick and participant must belong to the same contest';
  END IF;
  NEW.contest_id := participant_contest;
  PERFORM 1 FROM contests WHERE contest_id = participant_contest AND contest_type = 'two_team' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Two-team picks require a two-team contest'; END IF;
  IF NEW.team1_id = NEW.team2_id THEN RAISE EXCEPTION 'Cannot pick the same team twice'; END IF;
  IF EXISTS (
    SELECT 1 FROM two_team_picks
    WHERE contest_id = NEW.contest_id AND pick_id IS DISTINCT FROM NEW.pick_id
      AND (team1_id IN (NEW.team1_id, NEW.team2_id) OR team2_id IN (NEW.team1_id, NEW.team2_id))
  ) THEN RAISE EXCEPTION 'This team is already picked in this contest'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_two_team_pick
BEFORE INSERT OR UPDATE OF participant_id, contest_id, team1_id, team2_id ON two_team_picks
FOR EACH ROW EXECUTE FUNCTION validate_two_team_pick();
