/**
 * Test-Harness fürs Chunking (Kategorie A — Rahmen, nicht die Logik).
 * Aufruf:  npm run chunk:try
 *
 * Lädt das Test-Dokument, ruft deine chunk()-Funktion auf und zeigt dir
 * jeden Chunk plus ein paar Statistiken zum Tunen der Zielgröße.
 *
 * Optional anderes Dokument:  npm run chunk:try -- docs/pfad/zur/datei.md
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chunk, type Chunk } from "../src/lib/ingest/chunk.ts";

const relPath = process.argv[2] ?? "docs/javascript/async-await.md";
const filePath = join(process.cwd(), relPath);

let markdown: string;
try {
  markdown = readFileSync(filePath, "utf8");
} catch {
  console.error(`❌ Datei nicht gefunden: ${relPath}`);
  process.exit(1);
}

let chunks: Chunk[];
try {
  chunks = chunk(markdown);
} catch (err) {
  console.error("⚠  chunk() lief nicht durch:");
  console.error("   " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

const dim = "\x1b[2m";
const bold = "\x1b[1m";
const reset = "\x1b[0m";

console.log(`\n${bold}Dokument:${reset} ${relPath}`);
console.log(`${bold}Chunks:${reset} ${chunks.length}\n`);

for (const c of chunks) {
  const chars = c.content.length;
  console.log(
    `${bold}── Chunk #${c.chunkIndex}${reset}  ${dim}heading=${JSON.stringify(c.heading)} · ~${c.tokenCount} tokens · ${chars} chars${reset}`,
  );
  console.log(c.content);
  console.log("");
}

// --- Statistiken zum Tunen ---
if (chunks.length > 0) {
  const tokens = chunks.map((c) => c.tokenCount);
  const sum = tokens.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / tokens.length);
  const min = Math.min(...tokens);
  const max = Math.max(...tokens);
  const tiny = chunks.filter((c) => c.tokenCount < 50).length;
  const huge = chunks.filter((c) => c.tokenCount > 500).length;

  console.log(`${bold}── Statistik ──${reset}`);
  console.log(`   Tokens/Chunk: min ${min} · ø ${avg} · max ${max}`);
  console.log(`   ${dim}Sehr kleine (<50): ${tiny} · Sehr große (>500): ${huge}${reset}`);
  if (huge > 0) console.log(`   ⚠  ${huge} Chunk(s) über 500 Tokens — greift dein Max-Size-Fallback?`);
  if (tiny > 0) console.log(`   ⚠  ${tiny} Chunk(s) unter 50 Tokens — evtl. zu fein zerschnitten.`);
}
