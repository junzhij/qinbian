ALTER TABLE theme_sets ADD COLUMN palette TEXT;
CREATE TABLE resources_next (
 id TEXT PRIMARY KEY, theme_set_id TEXT NOT NULL REFERENCES theme_sets(id), kind TEXT NOT NULL CHECK(kind IN ('component','template','palette')),
 name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, tags TEXT NOT NULL, legacy_id TEXT,
 builtin INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
INSERT INTO resources_next SELECT * FROM resources;
DROP TABLE resources;
ALTER TABLE resources_next RENAME TO resources;
CREATE INDEX resources_theme_kind ON resources(theme_set_id,kind,deleted_at);
CREATE UNIQUE INDEX resources_builtin_legacy ON resources(legacy_id) WHERE builtin=1;
