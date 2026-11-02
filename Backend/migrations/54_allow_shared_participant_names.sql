-- Display names are not identities; different accounts may share a name.
ALTER TABLE pool_participants
DROP CONSTRAINT IF EXISTS pool_participants_contest_name_unique;
