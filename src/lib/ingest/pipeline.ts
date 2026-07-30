import postgres from "postgres";
import { chunk } from "./chunk.ts";
import { embed, EMBEDDING_DIMENSIONS } from "../embed.ts";
import { DocLimitError } from "../limits.ts";

/**
 * Wiederverwendbare Ingestion für EIN Dokument: Markdown -> Chunks ->
 * Embeddings -> DB, gebunden an einen User. Genutzt vom CLI-Seed-Skript
 * UND von der Upload-Route.
 *
 * Idempotent pro (user_id, source_path): ein bereits vorhandenes Dokument
 * dieses Users mit gleichem source_path wird vor dem Neuschreiben gelöscht.
 */
type Db = ReturnType<typeof postgres>;

const BATCH_SIZE = 128; // Voyage-Limit pro Request

export type IngestInput = {
  userId: string;
  source: string; // grobe Kategorie, z.B. "upload" oder "javascript"
  sourcePath: string; // eindeutige Kennung des Dokuments innerhalb des Users
  title: string;
  markdown: string;
};

export type IngestOptions = {
  /**
   * Wenn gesetzt: max. Dokumente pro User. Wird ATOMAR in der Transaktion
   * geprüft (nach dem Idempotenz-DELETE, unter Advisory-Lock) — race-fest gegen
   * gleichzeitige Uploads. Wirft DocLimitError, wenn das Limit erreicht ist.
   */
  maxDocuments?: number;
};

export async function ingestDocument(
  sql: Db,
  input: IngestInput,
  options?: IngestOptions,
): Promise<number> {
  const chunks = chunk(input.markdown);
  if (chunks.length === 0) return 0;

  // In Batches embedden (input_type "document").
  const contents = chunks.map((c) => c.content);
  const vectors: number[][] = [];
  for (let i = 0; i < contents.length; i += BATCH_SIZE) {
    vectors.push(...(await embed(contents.slice(i, i + BATCH_SIZE), "document")));
  }

  // Sicherheitsnetze vor dem DB-Schreiben.
  if (vectors.length !== chunks.length) {
    throw new Error(`Anzahl Vektoren (${vectors.length}) != Chunks (${chunks.length}).`);
  }
  if (vectors[0].length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Vektor-Dimension ${vectors[0].length} != erwartete ${EMBEDDING_DIMENSIONS}.`);
  }

  await sql.begin(async (tx) => {
    // Gleichzeitige Uploads DESSELBEN Users serialisieren, damit die
    // Limit-Prüfung unten race-fest ist (Key 2 = Upload-Domain, vgl. Chat-Quota).
    if (options?.maxDocuments != null) {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${input.userId}), 2)`;
    }
    // Idempotenz: ein vorhandenes Dokument mit gleichem source_path zuerst weg.
    // WICHTIG vor der Zählung — ein Re-Upload ERSETZT und zählt nicht doppelt.
    await tx`
      DELETE FROM documents
      WHERE user_id = ${input.userId} AND source_path = ${input.sourcePath}
    `;
    if (options?.maxDocuments != null) {
      const [{ n }] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM documents WHERE user_id = ${input.userId}
      `;
      if (n >= options.maxDocuments) throw new DocLimitError(options.maxDocuments);
    }
    const [doc] = await tx`
      INSERT INTO documents (user_id, title, source, source_path)
      VALUES (${input.userId}, ${input.title}, ${input.source}, ${input.sourcePath})
      RETURNING id
    `;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await tx`
        INSERT INTO chunks (document_id, chunk_index, content, heading, token_count, embedding)
        VALUES (${doc.id}, ${c.chunkIndex}, ${c.content}, ${c.heading}, ${c.tokenCount},
                ${`[${vectors[i].join(",")}]`}::vector)
      `;
    }
  });

  return chunks.length;
}
