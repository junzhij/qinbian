CREATE TABLE IF NOT EXISTS theme_sets (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, builtin INTEGER NOT NULL DEFAULT 0,
 tokens TEXT NOT NULL, rules TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS resources (
 id TEXT PRIMARY KEY, theme_set_id TEXT NOT NULL REFERENCES theme_sets(id), kind TEXT NOT NULL CHECK(kind IN ('component','template')),
 name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, tags TEXT NOT NULL, legacy_id TEXT,
 builtin INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS resources_theme_kind ON resources(theme_set_id,kind,deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS resources_builtin_legacy ON resources(legacy_id) WHERE builtin=1;
CREATE TABLE IF NOT EXISTS documents (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, theme_set_id TEXT NOT NULL REFERENCES theme_sets(id), blocks TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS assets (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, file_name TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL,
 width INTEGER NOT NULL, height INTEGER NOT NULL, hash TEXT NOT NULL UNIQUE, builtin INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS versions (
 id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, revision INTEGER NOT NULL,
 payload TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS versions_entity_revision ON versions(entity_type,entity_id,revision);
CREATE TABLE IF NOT EXISTS ai_jobs (
 id TEXT PRIMARY KEY, operation TEXT NOT NULL, status TEXT NOT NULL, model TEXT NOT NULL, request TEXT NOT NULL,
 result TEXT, error TEXT, usage TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
