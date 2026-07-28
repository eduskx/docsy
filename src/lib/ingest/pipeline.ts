import postgres from "postgres";
import { chunk } from "./chunk.ts";
import { embed, EMBEDDING_DIMENSIONS } from "../embed.ts";

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

export async function ingestDocument(sql: Db, input: IngestInput): Promise<number> {
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
    await tx`
      DELETE FROM documents
      WHERE user_id = ${input.userId} AND source_path = ${input.sourcePath}
    `;
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
