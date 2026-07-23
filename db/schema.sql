-- Schema für den Doku-Wissensassistenten.
-- Idempotent: kann mehrfach ausgeführt werden.

-- pgvector-Extension aktivieren (auf Neon per SQL erlaubt).
CREATE EXTENSION IF NOT EXISTS vector;

-- Eine eingespeiste Doku-Quelle (z.B. "Next.js App Router", eine Markdown-Datei/Sammlung).
CREATE TABLE IF NOT EXISTS documents (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       TEXT NOT NULL,
  source      TEXT NOT NULL,            -- z.B. "nextjs", "react", "typescript"
  source_path TEXT,                     -- Original-Dateipfad/URL, für Quellenangabe
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
