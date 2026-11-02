-- Fix conference and division names from Spanish to English

-- Update conference names
UPDATE divisions SET conference_name = 'Eastern' WHERE conference_name = 'Este';
UPDATE divisions SET conference_name = 'Western' WHERE conference_name = 'Oeste';

-- Update division names
UPDATE divisions SET division_name = 'Metropolitan' WHERE division_name = 'Metropolitana';
UPDATE divisions SET division_name = 'Atlantic' WHERE division_name = 'Atlántica';
UPDATE divisions SET division_name = 'Pacific' WHERE division_name = 'Pacífico';

-- Central division is already in English, no change needed

-- Add comment
COMMENT ON TABLE divisions IS 'NHL divisions and conferences. Eastern Conference: Metropolitan, Atlantic. Western Conference: Central, Pacific.';

