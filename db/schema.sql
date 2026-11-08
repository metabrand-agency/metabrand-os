-- Metabrand OS — Cloudflare D1 (SQLite)
-- Multi-org from day one: Metabrand is org #1; other agencies later (white-label, BYOK).

CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  custom_domain TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  code_hash TEXT,            -- personal sign-in code (clients); agency uses ACCESS_CODE
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS org_members (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('agency_admin','agency_member')),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  client_url TEXT,
  category_description TEXT,
  stage TEXT NOT NULL DEFAULT 'lead'
    CHECK (stage IN ('lead','proposal','active','launched','monitoring','archived')),
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE (org_id, slug)
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('client_admin','client_member','brand_guest')),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT, email TEXT, role TEXT, notes TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  happened_at INTEGER NOT NULL,
  document_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client'))
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT,
  r2_key TEXT,
  text_content TEXT,
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client')),
  created_at INTEGER NOT NULL
);

-- Full-text search over project memory (free, built into D1)
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(title, text_content, content='documents', content_rowid='rowid');
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, title, text_content) VALUES (new.rowid, new.title, new.text_content);
END;
CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, text_content) VALUES('delete', old.rowid, old.title, old.text_content);
END;

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  r2_key TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS research (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL,           -- market_map, lens:<name>
  data_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, kind)
);

CREATE TABLE IF NOT EXISTS data_sources (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  provider TEXT NOT NULL,
  secret_ref TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  trial_until INTEGER
);

CREATE TABLE IF NOT EXISTS usage (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id),
  provider TEXT NOT NULL,
  units INTEGER NOT NULL,       -- tokens or calls
  cost_microusd INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  body TEXT NOT NULL,
  author_id TEXT,
  created_at INTEGER NOT NULL
);

-- Access rules (enforced in functions/api on every request):
--   agency_admin  -> every workspace of the org, all fields
--   agency_member -> every workspace of the org (assignment later)
--   client_*      -> only their workspace; only visibility='client' rows and status='published' research;
--                    never: workspaces.stage, settings internals, notes, usage
