/**
 * A/B-Vergleich: reine Vektorsuche vs. hybride Suche (RRF).
 * Aufruf:  npm run compare
 *
 * Zeigt bei keyword-lastigen Fragen, wo die lexikalische Komponente hilft.
 * Diagnose-Tool — nicht Teil der App.
 */
import postgres from "postgres";
import { embedOne } from "../src/lib/embed.ts";

const DB_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌ DATABASE_URL(_UNPOOLED) fehlt.");
  process.exit(1);
}
const sql = postgres(DB_URL, { prepare: false });

const K = 3;
const RRF_K = 60;
const CANDIDATES = 50;

async function vectorOnly(literal: string): Promise<string[]> {
  const rows = await sql<{ heading: string | null }[]>`
    SELECT c.heading
    FROM chunks c JOIN documents d ON d.id = c.document_id
    WHERE d.user_id = 'seed'
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${K}
  `;
  return rows.map((r) => r.heading ?? "—");
}

async function hybrid(literal: string, query: string): Promise<string[]> {
  const rows = await sql<{ heading: string | null }[]>`
    WITH
    vector_ranked AS (
      SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> ${literal}::vector) AS rank
      FROM chunks c JOIN documents d ON d.id = c.document_id
      WHERE d.user_id = 'seed'
      ORDER BY c.embedding <=> ${literal}::vector LIMIT ${CANDIDATES}
    ),
    fts_ranked AS (
      SELECT c.id, row_number() OVER (
               ORDER BY ts_rank(c.content_tsv, plainto_tsquery('german', ${query})) DESC) AS rank
      FROM chunks c JOIN documents d ON d.id = c.document_id
      WHERE c.content_tsv @@ plainto_tsquery('german', ${query}) AND d.user_id = 'seed'
      LIMIT ${CANDIDATES}
    ),
    fused AS (
      SELECT id, sum(1.0 / (${RRF_K} + rank)) AS score
      FROM (SELECT id, rank FROM vector_ranked UNION ALL SELECT id, rank FROM fts_ranked) r
      GROUP BY id
    )
    SELECT c.heading
    FROM fused f JOIN chunks c ON c.id = f.id
    ORDER BY f.score DESC LIMIT ${K}
  `;
  return rows.map((r) => r.heading ?? "—");
}

const queries = [
  "Wann sollte ich useCallback verwenden?",
  "Unterschied zwischen git merge und git rebase",
  "Wie warte ich auf alle Promises, egal ob Fehler?",
];

try {
  for (const q of queries) {
    const vector = await embedOne(q, "query");
    const literal = `[${vector.join(",")}]`;
    const vo = await vectorOnly(literal);
    const hy = await hybrid(literal, q);
    console.log(`\nFrage: "${q}"`);
    console.log(`  Vektor-only:  ${vo.join("  |  ")}`);
    console.log(`  Hybrid (RRF): ${hy.join("  |  ")}`);
  }
} catch (err) {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
