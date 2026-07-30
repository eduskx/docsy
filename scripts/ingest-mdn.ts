/**
 * Seed-Ingestion des MDN-Standardkorpus.  Aufruf:  npm run ingest:mdn
 *   optional:  npm run ingest:mdn -- --skip-existing
 *
 * Walkt mdn/{css,html,javascript}/**\/index.md, verarbeitet jede Datei mit
 * preprocessMdn() (Frontmatter raus, Macros normalisiert) und speist sie über
 * die bestehende Pipeline (src/lib/ingest/pipeline.ts) als Standardkorpus ein:
 *   userId      = "seed"  (DEFAULT_USER_ID -> für ALLE Nutzer mitdurchsucht)
 *   source      = Sprache (css/html/javascript, aus dem Ordner)
 *   source_path = slug    (Zitier-Schlüssel, z.B. Web/CSS/.../color)
 *   title       = Frontmatter-Title
 *
 * Idempotent pro (seed, slug): Re-Run ersetzt vorhandene Docs. Mit
 * --skip-existing werden bereits eingespeiste slugs übersprungen (Resume nach
 * Abbruch, ohne die ~$0.50 Embeddings erneut zu zahlen).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import postgres from "postgres";
import { ingestDocument } from "../src/lib/ingest/pipeline.ts";
import { preprocessMdn } from "../src/lib/ingest/preprocessMdn.ts";

const DB_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌ DATABASE_URL(_UNPOOLED) fehlt. Trag sie in .env ein.");
  process.exit(1);
}

const USER_ID = process.env.INGEST_USER_ID ?? "seed";
const MDN_DIR = join(process.cwd(), "mdn");
const SKIP_EXISTING = process.argv.includes("--skip-existing");

const sql = postgres(DB_URL, { prepare: false });

try {
  const files = readdirSync(MDN_DIR, { recursive: true })
    .filter((f): f is string => typeof f === "string" && f.endsWith("index.md"));

  if (files.length === 0) {
    console.log("Keine index.md unter mdn/ gefunden. Liegt der Korpus dort?");
    await sql.end();
    process.exit(0);
  }

  // Für --skip-existing: bereits eingespeiste slugs des seed-Users vorladen.
  const existing = new Set<string>();
  if (SKIP_EXISTING) {
    const rows = await sql<{ source_path: string }[]>`
      SELECT source_path FROM documents WHERE user_id = ${USER_ID}
    `;
    for (const r of rows) existing.add(r.source_path);
    console.log(`↻  --skip-existing: ${existing.size} bereits vorhandene Docs werden übersprungen.\n`);
  }

  let totalChunks = 0;
  let done = 0;
  let skipped = 0;

  for (const file of files) {
    const fullPath = join(MDN_DIR, file);
    const relPath = relative(MDN_DIR, fullPath).split(sep).join("/");
    // Sprache = erster Pfadabschnitt (css/html/javascript).
    const source = relPath.split("/")[0];
    const raw = readFileSync(fullPath, "utf8");

    const { title, slug, markdown } = preprocessMdn(raw);
    // slug ist der Zitier-Schlüssel; ohne Frontmatter fällt er auf den Pfad zurück.
    const sourcePath = slug ?? relPath;
    const docTitle = title ?? relPath;

    if (SKIP_EXISTING && existing.has(sourcePath)) {
      skipped++;
      continue;
    }

    done++;
    process.stdout.write(`▶  [${done}/${files.length}] ${sourcePath} … `);
    try {
      const chunks = await ingestDocument(sql, {
        userId: USER_ID,
        source,
        sourcePath,
        title: docTitle,
        markdown,
      });
      totalChunks += chunks;
      console.log(chunks > 0 ? `✅ ${chunks} Chunks` : "⏭  keine Chunks");
    } catch (err) {
      // Einzelne Datei soll den ganzen Lauf nicht abbrechen.
      console.log(`⚠  Fehler: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `\nFertig: ${done} eingespeist${skipped ? `, ${skipped} übersprungen` : ""}, ` +
      `${totalChunks} Chunks (user: ${USER_ID}).`,
  );
} catch (err) {
  console.error("\n❌ MDN-Ingestion fehlgeschlagen:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
