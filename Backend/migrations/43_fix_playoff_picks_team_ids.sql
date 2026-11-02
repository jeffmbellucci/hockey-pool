-- Migration 43: Fix playoff_picks.team_ids to use team_id instead of nhl_api_id
-- Also fix contests.excluded_team_id to use team_id

-- Step 1: Convert team_ids from nhl_api_id to team_id
UPDATE playoff_picks pp
SET team_ids = COALESCE(
    (SELECT array_agg(nt.team_id ORDER BY ord)
     FROM unnest(pp.team_ids) WITH ORDINALITY AS u(api_id, ord)
     JOIN nhl_teams nt ON nt.nhl_api_id = u.api_id),
    '{}'
)
WHERE array_length(pp.team_ids, 1) > 0;

-- Step 2: Convert contests.excluded_team_id from nhl_api_id to team_id
UPDATE contests c
SET excluded_team_id = nt.team_id
FROM nhl_teams nt
WHERE c.excluded_team_id = nt.nhl_api_id
  AND c.excluded_team_id IS NOT NULL;
