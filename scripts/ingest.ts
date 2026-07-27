/**
 * Ingestion-Pipeline.  Aufruf:  npm run ingest
 *
 * Führt die drei Bausteine zusammen:
 *   1. Markdown-Dateien aus docs/ lesen
 *   2. chunken           (src/lib/ingest/chunk.ts — Kernstelle #1)
 *   3. embedden in Batches (src/lib/embed.ts       — Kernstelle #2)
 *   4. Dokument + Chunks in Postgres/pgvector schreiben
 *
 * Idempotent: ein bereits eingespeistes Dokument (gleicher source_path) wird
 * vor dem Neuschreiben gelöscht — mehrfaches Ausführen dupliziert also nicht.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import postgres from "postgres";
import { chunk } from "../src/lib/ingest/chunk.ts";
import { embed, EMBEDDING_DIMENSIONS } from "../src/lib/embed.ts";

const DB_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌ DATABASE_URL(_UNPOOLED) fehlt. Trag sie in .env ein.");
  process.exit(1);
}

const DOCS_DIR = join(process.cwd(), "docs");
const BATCH_SIZE = 128; // Voyage nimmt pro Request bis zu 128 Texte.

/** Titel = erste H1-Überschrift, sonst der Dateiname. */
function extractTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

/** Vektor -> pgvector-Textformat "[0.1,0.2,...]". */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

const sql = postgres(DB_URL, { prepare: false });

try {
  // --- 1. Dateien finden (rekursiv, ohne README) ---
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
    // Pfad mit / statt \ (Windows) — als stabile Kennung fürs Dokument.
    const relPath = relative(DOCS_DIR, fullPath).split(sep).join("/");
    // source = oberster Ordner unter docs/ (z.B. "javascript"), sonst "root".
    const source = relPath.includes("/") ? relPath.split("/")[0] : "root";

    const markdown = readFileSync(fullPath, "utf8");
    const chunks = chunk(markdown);
    if (chunks.length === 0) {
      console.log(`⏭  ${relPath} — keine Chunks, übersprungen.`);
      continue;
    }

    const title = extractTitle(markdown, relPath);
    process.stdout.write(`▶  ${relPath} — ${chunks.length} Chunks … `);

    // --- 3. Embedden in Batches ---
    const contents = chunks.map((c) => c.content);
    const vectors: number[][] = [];
    for (let i = 0; i < contents.length; i += BATCH_SIZE) {
      const batch = contents.slice(i, i + BATCH_SIZE);
      vectors.push(...(await embed(batch, "document")));
    }

    // Sicherheitsnetze, bevor irgendwas in die DB geht.
    if (vectors.length !== chunks.length) {
      throw new Error(`Anzahl Vektoren (${vectors.length}) != Chunks (${chunks.length}).`);
    }
    if (vectors[0].length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Vektor-Dimension ${vectors[0].length} != erwartete ${EMBEDDING_DIMENSIONS}.`);
    }

    // --- 4. In einer Transaktion schreiben (Idempotenz: erst löschen) ---
    await sql.begin(async (tx) => {
      await tx`DELETE FROM documents WHERE source_path = ${relPath}`;
      const [doc] = await tx`
        INSERT INTO documents (title, source, source_path)
        VALUES (${title}, ${source}, ${relPath})
        RETURNING id
      `;
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        await tx`
          INSERT INTO chunks (document_id, chunk_index, content, heading, token_count, embedding)
          VALUES (${doc.id}, ${c.chunkIndex}, ${c.content}, ${c.heading}, ${c.tokenCount},
                  ${toVectorLiteral(vectors[i])}::vector)
        `;
      }
    });

    totalChunks += chunks.length;
    console.log("✅ gespeichert.");
  }

  console.log(`\nFertig: ${files.length} Dokument(e), ${totalChunks} Chunks eingespeist.`);
} catch (err) {
  console.error("\n❌ Ingestion fehlgeschlagen:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
