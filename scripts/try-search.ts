/**
 * Test-Harness für die Vektorsuche (Kategorie A — Rahmen).
 * Aufruf:  npm run search:try -- "deine Frage hier"
 *          (ohne Argument wird eine Beispiel-Frage genutzt)
 *
 * Das ist der erste komplette Loop: Frage -> Embedding -> pgvector -> Treffer.
 */
import postgres from "postgres";
import { search } from "../src/lib/retrieval/search.ts";

const DB_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌ DATABASE_URL(_UNPOOLED) fehlt. Trag sie in .env ein.");
  process.exit(1);
}

const query = process.argv.slice(2).join(" ") || "Wie behandle ich Fehler bei async/await?";
const sql = postgres(DB_URL, { prepare: false });

try {
  console.log(`\nFrage: "${query}"\n`);
  const results = await search(sql, query, 5, ["seed"]);

  if (results.length === 0) {
    console.log("Keine Treffer. Ist schon etwas per `npm run ingest:mdn` eingespeist?");
  }

  results.forEach((r, i) => {
    const pct = (r.similarity * 100).toFixed(1);
    const snippet = r.content.replace(/\s+/g, " ").slice(0, 100);
    console.log(`#${i + 1}  ${pct}%  [${r.sourcePath}]  „${r.heading}"`);
    console.log(`     ${snippet}…\n`);
  });
} catch (err) {
  console.error("❌ Suche fehlgeschlagen:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
