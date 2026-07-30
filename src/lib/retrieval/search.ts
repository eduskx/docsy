/**
 * Kernstelle #3 — Hybride Suche (Retrieval).
 *
 * Kombiniert zwei Signale und fusioniert sie per Reciprocal Rank Fusion (RRF):
 *   1. Semantisch: pgvector, Cosinus-Distanz auf den Embeddings (Bedeutung)
 *   2. Lexikalisch: Postgres-Volltext (tsvector), exakte/gestemmte Wörter
 *
 * RRF fusioniert über RÄNGE, nicht über Roh-Scores — dadurch braucht man die
 * unterschiedlichen Skalen (Cosinus ~0.4 vs. ts_rank ~beliebig) nicht zu
 * gewichten. Score eines Chunks = Σ 1/(k + Rang) über beide Listen.
 *
 * Die DB-Verbindung wird injiziert (Parameter `sql`), damit die Funktion
 * sowohl aus einem Script als auch aus einer Next-Route nutzbar ist.
 */
import postgres from "postgres";
import { embedOne } from "../embed.ts";

type Db = ReturnType<typeof postgres>;

/** RRF-Konstante. 60 ist der etablierte Standardwert aus der Literatur. */
const RRF_K = 60;
/** Wie viele Kandidaten jede Einzelsuche liefert, bevor fusioniert wird. */
const CANDIDATES = 50;

export type SearchResult = {
  chunkId: number;
  content: string;
  heading: string | null;
  chunkIndex: number;
  /** Dokument-Metadaten für die Quellenangabe. */
  title: string;
  source: string;
  sourcePath: string;
  /** Cosinus-Ähnlichkeit 0..1 (informativ; die Reihenfolge macht der RRF-Score). */
  similarity: number;
};

export async function search(
  sql: Db,
  query: string,
  topK = 5,
  userIds?: string[],
): Promise<SearchResult[]> {
  // Frage embedden — WICHTIG: input_type "query", nicht "document".
  const queryVector = await embedOne(query, "query");
  const literal = `[${queryVector.join(",")}]`;

  // Lexikalische tsquery ('english', passend zum englischen Korpus) mit
  // ODER-Semantik: plainto_tsquery UND-verknüpft alle Terme — deutsche
  // Füllwörter der Frage ("wozu", "dient") sind in keiner Stoppwortliste und
  // würden als Pflicht-Terme JEDEN Treffer gegen den englischen Text abwürgen.
  // Trick: plainto (UND) -> Text -> "&" durch "|" ersetzen -> to_tsquery (ODER).
  // So zieht ein einzelner Fachbegriff-Anker ("reviver", "z-index") den Chunk hoch.
  const tsq = sql`to_tsquery('english', replace(plainto_tsquery('english', ${query})::text, '&', '|'))`;

  // Multi-User-Trennung: in der Vektor-CTE als erstes WHERE, in der FTS-CTE als
  // zusätzliches AND (dort steht schon ein WHERE für den tsquery-Match).
  const userWhere =
    userIds && userIds.length > 0 ? sql`WHERE d.user_id = ANY(${userIds})` : sql``;
  const userAnd =
    userIds && userIds.length > 0 ? sql`AND d.user_id = ANY(${userIds})` : sql``;

  const results = await sql<SearchResult[]>`
    WITH
    -- (1) Semantisches Ranking: nächste Nachbarn per Cosinus-Distanz.
    vector_ranked AS (
      SELECT c.id,
             row_number() OVER (ORDER BY c.embedding <=> ${literal}::vector) AS rank
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      ${userWhere}
      ORDER BY c.embedding <=> ${literal}::vector
      LIMIT ${CANDIDATES}
    ),
    -- (2) Lexikalisches Ranking: Volltext-Treffer nach ts_rank.
    -- to_tsvector(...) statt einer STORED-Spalte: die Ausdrucks-Form wird vom
    -- GIN-Expression-Index chunks_content_tsv_idx bedient und spart die 17 MB
    -- der materialisierten Spalte (relevant beim knappen Neon-Speicher).
    fts_ranked AS (
      SELECT c.id,
             row_number() OVER (
               ORDER BY ts_rank(to_tsvector('english', c.content), ${tsq}) DESC
             ) AS rank
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE to_tsvector('english', c.content) @@ ${tsq}
      ${userAnd}
      LIMIT ${CANDIDATES}
    ),
    -- (3) Reciprocal Rank Fusion: Ränge beider Listen zusammenzählen.
    fused AS (
      SELECT id, sum(1.0 / (${RRF_K} + rank)) AS score
      FROM (
        SELECT id, rank FROM vector_ranked
        UNION ALL
        SELECT id, rank FROM fts_ranked
      ) ranks
      GROUP BY id
    )
    SELECT
      c.id            AS "chunkId",
      c.content,
      c.heading,
      c.chunk_index   AS "chunkIndex",
      d.title,
      d.source,
      d.source_path   AS "sourcePath",
      1 - (c.embedding <=> ${literal}::vector) AS similarity
    FROM fused f
    JOIN chunks c ON c.id = f.id
    JOIN documents d ON d.id = c.document_id
    ORDER BY f.score DESC
    LIMIT ${topK}
  `;

  return results;
}
