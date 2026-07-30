-- Schema für den Doku-Wissensassistenten.
-- Idempotent: kann mehrfach ausgeführt werden.

-- pgvector-Extension aktivieren (auf Neon per SQL erlaubt).
CREATE EXTENSION IF NOT EXISTS vector;

-- Eine eingespeiste Doku-Quelle (z.B. "Next.js App Router", eine Markdown-Datei/Sammlung).
CREATE TABLE IF NOT EXISTS documents (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     TEXT NOT NULL DEFAULT 'seed', -- gehört zu welchem User (Auth.js-ID)
  title       TEXT NOT NULL,
  source      TEXT NOT NULL,            -- z.B. "nextjs", "react", "typescript"
  source_path TEXT,                     -- Original-Dateipfad/URL, für Quellenangabe
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Falls die Tabelle schon ohne user_id existiert (ältere DB): Spalte nachrüsten.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'seed';

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents(user_id);

-- Ein Chunk eines Dokuments inkl. Embedding.
-- Dimension 1024 = Voyage "voyage-3" / "voyage-3.5". Bei anderem Modell anpassen!
CREATE TABLE IF NOT EXISTS chunks (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,             -- Reihenfolge innerhalb des Dokuments
  content     TEXT NOT NULL,
  heading     TEXT,                     -- optional: die Überschrift, unter der der Chunk steht
  token_count INT,
  embedding   VECTOR(1024),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HNSW-Index für schnelle Ähnlichkeitssuche mit Cosinus-Distanz.
-- (Alternative: ivfflat — HNSW ist bei kleinen/mittleren Datenmengen meist besser
--  und braucht kein vorheriges Training.)
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw
  ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks(document_id);

-- Volltext-Suche (für die hybride Suche): GIN-EXPRESSION-Index statt einer
-- materialisierten tsvector-Spalte. Zwei Gründe:
--   1. 'english'-Config — der Korpus (MDN) ist ENGLISCH; Stemming muss zur
--      Sprache des INHALTS passen, nicht zur Sprache der Fragen. Die deutschen
--      Fragen tragen ihre Retrieval-Signale über die englischen Fachbegriffe;
--      die Query-Seite (search.ts) baut eine ODER-tsquery, damit deutsche
--      Füllwörter keine Treffer abwürgen.
--   2. Ein Expression-Index spart die ~17 MB der doppelt gespeicherten
--      tsvector-Spalte — relevant, weil die DB (HNSW-Index!) nah am Neon-Limit
--      liegt. search.ts fragt exakt `to_tsvector('english', content)` ab, damit
--      der Planner diesen Index nutzt.
-- Eine evtl. alte STORED-Spalte aus früheren Migrationen wird entfernt.
ALTER TABLE chunks DROP COLUMN IF EXISTS content_tsv;

CREATE INDEX IF NOT EXISTS chunks_content_tsv_idx
  ON chunks USING GIN (to_tsvector('english', content));

-- Verlauf: eine Konversation pro Chat-Sitzung, gehört einem User.
CREATE TABLE IF NOT EXISTS conversations (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);

-- Einzelne Nachrichten innerhalb einer Konversation.
CREATE TABLE IF NOT EXISTS messages (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  sources         JSONB,               -- bei Assistant-Nachrichten: die Quellen
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);

-- Usage-Events für Rate-Limiting (v.a. Gäste): ein Eintrag pro Chat/Upload.
CREATE TABLE IF NOT EXISTS usage_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('chat', 'upload')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_user_time_idx ON usage_events(user_id, created_at);
