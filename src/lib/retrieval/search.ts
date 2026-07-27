/**
 * Kernstelle #3 — Vektorsuche (Retrieval).
 *
 * Die Umkehrung der Ingestion: Frage rein -> die ähnlichsten Doku-Chunks raus.
 *   1. Frage in einen Vektor umwandeln (input_type "query")
 *   2. in pgvector die nächsten Nachbarn per Cosinus-Distanz suchen (Top-K)
 *
 * Die DB-Verbindung wird injiziert (Parameter `sql`), damit die Funktion
 * sowohl aus einem Script als auch aus einer Next-Route nutzbar ist.
 */
import postgres from "postgres";
import { embedOne } from "../embed.ts";

type Db = ReturnType<typeof postgres>;

export type SearchResult = {
  chunkId: number;
  content: string;
  heading: string | null;
  chunkIndex: number;
  /** Dokument-Metadaten für die Quellenangabe. */
  title: string;
  source: string;
  sourcePath: string;
  /** Ähnlichkeit 0..1 (höher = ähnlicher). */
  similarity: number;
};

export async function search(
  sql: Db,
  query: string,
  topK = 5,
): Promise<SearchResult[]> {
  // 1. Frage embedden — WICHTIG: input_type "query", nicht "document".
  const queryVector = await embedOne(query, "query");
  const literal = `[${queryVector.join(",")}]`;

  // 2. Ähnlichste Chunks holen.
  //    <=> ist der Cosinus-DISTANZ-Operator von pgvector (0 = identisch).
  //    Ähnlichkeit = 1 - Distanz, damit "höher = besser" gilt.
  //    ORDER BY Distanz ASC + LIMIT = Top-K nächste Nachbarn (nutzt den HNSW-Index).
  const results = await sql<SearchResult[]>`
    SELECT
      c.id            AS "chunkId",
      c.content,
      c.heading,
      c.chunk_index   AS "chunkIndex",
      d.title,
      d.source,
      d.source_path   AS "sourcePath",
      1 - (c.embedding <=> ${literal}::vector) AS similarity
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${topK}
  `;

  return results;
}
