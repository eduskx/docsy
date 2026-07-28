/**
 * Evaluation (Kernstelle #4).  Aufruf:  npm run eval
 *
 * Misst die Retrieval-Qualität: Für jede Testfrage mit bekannter richtiger
 * Quelle (source_path + heading) wird geprüft, auf welchem Rang die Vektorsuche
 * die richtige Sektion liefert.
 *
 * Metriken:
 *   - Hit@1 / Hit@3 / Hit@5  = Anteil Fragen, bei denen die richtige Sektion
 *                              in den Top-1 / Top-3 / Top-5 auftaucht.
 *   - MRR (Mean Reciprocal Rank) = Durchschnitt von 1/Rang der ersten richtigen
 *                              Sektion (0, wenn nicht in den Top-K). Rangsensitiv.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { search } from "../src/lib/retrieval/search.ts";

type TestCase = {
  id: number;
  question: string;
  source_path: string;
  heading: string;
};

const DB_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌ DATABASE_URL(_UNPOOLED) fehlt. Trag sie in .env ein.");
  process.exit(1);
}

const K = 5; // wir holen Top-5 und messen Hit@1/3/5 + MRR daraus.

const testset: TestCase[] = JSON.parse(
  readFileSync(join(process.cwd(), "eval", "testset.json"), "utf8"),
);

const sql = postgres(DB_URL, { prepare: false });

/** Rang (1-basiert) der ersten korrekten Sektion, oder null wenn nicht in Top-K. */
function rankOfCorrect(
  results: { sourcePath: string; heading: string | null }[],
  gold: TestCase,
): number | null {
  for (let i = 0; i < results.length; i++) {
    if (results[i].sourcePath === gold.source_path && results[i].heading === gold.heading) {
      return i + 1;
    }
  }
  return null;
}

try {
  let hit1 = 0;
  let hit3 = 0;
  let hit5 = 0;
  let reciprocalSum = 0;
  const misses: { tc: TestCase; topPath: string; topHeading: string | null }[] = [];

  console.log(`\nEvaluation über ${testset.length} Fragen (Top-${K})\n`);
  console.log("Rang  Ergebnis  Frage");
  console.log("────  ────────  ─────");

  for (const tc of testset) {
    const results = await search(sql, tc.question, K, ["seed"]);
    const rank = rankOfCorrect(results, tc);

    if (rank !== null) {
      reciprocalSum += 1 / rank;
      if (rank <= 1) hit1++;
      if (rank <= 3) hit3++;
      if (rank <= 5) hit5++;
    } else {
      misses.push({
        tc,
        topPath: results[0]?.sourcePath ?? "(keins)",
        topHeading: results[0]?.heading ?? null,
      });
    }

    const rankLabel = rank !== null ? `#${rank}` : "—";
    const mark = rank === 1 ? "✅" : rank !== null ? "🔸" : "❌";
    console.log(`${rankLabel.padEnd(4)}  ${mark.padEnd(8)}  ${tc.question}`);
  }

  const n = testset.length;
  const pct = (x: number) => ((x / n) * 100).toFixed(1) + "%";

  console.log("\n── Metriken ──");
  console.log(`  Hit@1: ${pct(hit1)}  (${hit1}/${n})   — richtige Sektion auf Platz 1`);
  console.log(`  Hit@3: ${pct(hit3)}  (${hit3}/${n})   — in den Top-3`);
  console.log(`  Hit@5: ${pct(hit5)}  (${hit5}/${n})   — in den Top-5`);
  console.log(`  MRR:   ${(reciprocalSum / n).toFixed(3)}         — je höher, desto weiter oben im Schnitt`);

  if (misses.length > 0) {
    console.log(`\n── Fehlschläge (${misses.length}) — hier lohnt der genaue Blick ──`);
    for (const m of misses) {
      console.log(`  ❌ „${m.tc.question}"`);
      console.log(`     erwartet: ${m.tc.source_path} — ${m.tc.heading}`);
      console.log(`     Top-1 war: ${m.topPath} — ${m.topHeading ?? "(ohne Überschrift)"}`);
    }
  }
} catch (err) {
  console.error("❌ Evaluation fehlgeschlagen:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
