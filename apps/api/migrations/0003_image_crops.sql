ALTER TABLE assets ADD COLUMN source_asset_id TEXT REFERENCES assets(id);
ALTER TABLE assets ADD COLUMN crop TEXT;
CREATE INDEX assets_source_idx ON assets(source_asset_id);
