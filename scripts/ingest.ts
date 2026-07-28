/**
 * Seed-Ingestion aus dem docs/-Ordner.  Aufruf:  npm run ingest
 *
 * Speist alle Markdown-Dateien unter docs/ (ohne README) als Seed-Korpus ein.
 * Die eigentliche Ingestion-Logik liegt in src/lib/ingest/pipeline.ts und wird
 * von der Upload-Route wiederverwendet.
 *
 * User: über INGEST_USER_ID steuerbar (Default "seed"). Der Seed-Korpus dient
 * u.a. der Evaluation.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import postgres from "postgres";
import { ingestDocument } from "../src/lib/ingest/pipeline.ts";

const DB_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌ DATABASE_URL(_UNPOOLED) fehlt. Trag sie in .env ein.");
  process.exit(1);
}

const USER_ID = process.env.INGEST_USER_ID ?? "seed";
const DOCS_DIR = join(process.cwd(), "docs");

/** Titel = erste H1-Überschrift, sonst der Dateiname. */
function extractTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

const sql = postgres(DB_URL, { prepare: false });

try {
  const files = readdirSync(DOCS_DIR, { recursive: true })
    .filter((f): f is string => typeof f === "string" && f.endsWith(".md"))
    .filter((f) => !f.toLowerCase().endsWith("readme.md"));

  if (files.length === 0) {
    console.log("Keine Markdown-Dateien in docs/ gefunden.");
    await sql.end();
    process.exit(0);
  }

  let totalChunks = 0;

  for (const file of files) {
    const fullPath = join(DOCS_DIR, file);
    const relPath = relative(DOCS_DIR, fullPath).split(sep).join("/");
    const source = relPath.includes("/") ? relPath.split("/")[0] : "root";
    const markdown = readFileSync(fullPath, "utf8");

    process.stdout.write(`▶  ${relPath} … `);
    const chunks = await ingestDocument(sql, {
      userId: USER_ID,
      source,
      sourcePath: relPath,
      title: extractTitle(markdown, relPath),
      markdown,
    });
    totalChunks += chunks;
    console.log(chunks > 0 ? `✅ ${chunks} Chunks` : "⏭  keine Chunks");
  }

  console.log(`\nFertig: ${files.length} Dokument(e), ${totalChunks} Chunks (user: ${USER_ID}).`);
} catch (err) {
  console.error("\n❌ Ingestion fehlgeschlagen:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
