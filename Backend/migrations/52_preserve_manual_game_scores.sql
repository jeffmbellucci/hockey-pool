-- NHL refreshes must not silently undo administrator score corrections.
ALTER TABLE games ADD COLUMN score_overridden boolean NOT NULL DEFAULT FALSE;
