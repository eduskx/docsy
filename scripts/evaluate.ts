/**
 * Evaluation (Kernstelle #4).  Aufruf:  npm run eval
 *
 * Misst die Retrieval-Qualität auf ZWEI Ebenen — weil das für eine Zitier-RAG
 * zwei verschiedene Erfolgskriterien sind:
 *
 *   - DOKUMENT-Ebene: Landet die richtige Quell-SEITE (source_path) in den
 *     Top-k? Das ist die eigentliche Zitier-Qualität — verweist die Antwort auf
 *     die richtige MDN-Seite?
 *   - SEKTION-Ebene: Landet exakt der richtige ABSCHNITT (source_path + heading)
 *     in den Top-k? Strenger — misst, ob auch die konkrete Textstelle stimmt.
 *
 * Warum getrennt: Die Suche findet oft die richtige Seite, aber deren
 * Intro-Chunk (ohne Überschrift) oder eine Nachbar-Sektion statt exakt der
 * Gold-Sektion. Eine einzige strikte Metrik würde „richtige Seite, falscher
 * Abschnitt" wie „komplett daneben" werten und die Qualität verzerren.
 *
 * Je Ebene: Hit@1 / Hit@3 / Hit@5 und MRR (Mean Reciprocal Rank).
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

const K = 5; // Top-5 holen, daraus Hit@1/3/5 + MRR.

const testset: TestCase[] = JSON.parse(
  readFileSync(join(process.cwd(), "eval", "testset.json"), "utf8"),
);

const sql = postgres(DB_URL, { prepare: false });

type Ranked = { sourcePath: string; heading: string | null };

/** 1-basierter Rang der ersten richtigen SEITE, oder null. */
function docRank(results: Ranked[], gold: TestCase): number | null {
  const i = results.findIndex((r) => r.sourcePath === gold.source_path);
  return i === -1 ? null : i + 1;
}

/** 1-basierter Rang des ersten richtigen ABSCHNITTS (Seite + Überschrift), oder null. */
function sectionRank(results: Ranked[], gold: TestCase): number | null {
  const i = results.findIndex(
    (r) => r.sourcePath === gold.source_path && r.heading === gold.heading,
  );
  return i === -1 ? null : i + 1;
}

/** Sammelt Hit@1/3/5 + MRR über eine Rang-Folge (null = nicht in Top-K). */
function makeAccumulator() {
  let hit1 = 0;
  let hit3 = 0;
  let hit5 = 0;
  let reciprocalSum = 0;
  return {
    add(rank: number | null) {
      if (rank === null) return;
      reciprocalSum += 1 / rank;
      if (rank <= 1) hit1++;
      if (rank <= 3) hit3++;
      if (rank <= 5) hit5++;
    },
    report(n: number) {
      const pct = (x: number) => ((x / n) * 100).toFixed(1) + "%";
      return {
        line1: `Hit@1: ${pct(hit1)} (${hit1}/${n})`,
        line3: `Hit@3: ${pct(hit3)} (${hit3}/${n})`,
        line5: `Hit@5: ${pct(hit5)} (${hit5}/${n})`,
        mrr: `MRR: ${(reciprocalSum / n).toFixed(3)}`,
      };
    },
  };
}

try {
  // NOTICEs (z.B. „word too long to be indexed" bei data-URIs) unterdrücken.
  await sql`SET client_min_messages TO warning`;

  const doc = makeAccumulator();
  const sec = makeAccumulator();

  // Fehlschläge in zwei Klassen: falsche SEITE (ernst) vs. richtige Seite, aber
  // Gold-Sektion nicht in Top-K (Feinschärfe).
  const wrongDoc: { tc: TestCase; top: Ranked | undefined }[] = [];
  const wrongSection: { tc: TestCase; docRank: number; results: Ranked[] }[] = [];

  console.log(`\nEvaluation über ${testset.length} Fragen (Top-${K})\n`);
  console.log("Doc   Sek   Frage");
  console.log("────  ────  ─────");

  for (const tc of testset) {
    const results = await search(sql, tc.question, K, ["seed"]);
    const dRank = docRank(results, tc);
    const sRank = sectionRank(results, tc);
    doc.add(dRank);
    sec.add(sRank);

    if (dRank === null) {
      wrongDoc.push({ tc, top: results[0] });
    } else if (sRank === null) {
      wrongSection.push({ tc, docRank: dRank, results });
    }

    const dLabel = dRank !== null ? `#${dRank}` : "—";
    const sLabel = sRank !== null ? `#${sRank}` : "—";
    console.log(`${dLabel.padEnd(4)}  ${sLabel.padEnd(4)}  ${tc.question}`);
  }

  const n = testset.length;
  const d = doc.report(n);
  const s = sec.report(n);

  console.log("\n── Dokument-Ebene (richtige Quellseite = Zitier-Qualität) ──");
  console.log(`  ${d.line1}   ${d.line3}   ${d.line5}   ${d.mrr}`);
  console.log("\n── Sektion-Ebene (exakt richtiger Abschnitt) ──");
  console.log(`  ${s.line1}   ${s.line3}   ${s.line5}   ${s.mrr}`);

  if (wrongDoc.length > 0) {
    console.log(`\n── Falsche Seite (${wrongDoc.length}) — die ernsten Misses ──`);
    for (const m of wrongDoc) {
      console.log(`  ❌ „${m.tc.question}"`);
      console.log(`     erwartet: ${m.tc.source_path}`);
      console.log(`     Top-1:    ${m.top?.sourcePath ?? "(keins)"} — ${m.top?.heading ?? "(ohne Überschrift)"}`);
    }
  }

  if (wrongSection.length > 0) {
    console.log(
      `\n── Richtige Seite, Gold-Sektion nicht in Top-${K} (${wrongSection.length}) — Feinschärfe ──`,
    );
    for (const m of wrongSection) {
      const onPage = m.results
        .filter((r) => r.sourcePath === m.tc.source_path)
        .map((r) => r.heading ?? "(ohne Überschrift)");
      console.log(`  🔸 „${m.tc.question}"`);
      console.log(`     Seite auf #${m.docRank} gefunden; erwartete Sektion: „${m.tc.heading}"`);
      console.log(`     stattdessen von der Seite in Top-${K}: ${onPage.join(" · ")}`);
    }
  }
} catch (err) {
  console.error("❌ Evaluation fehlgeschlagen:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
