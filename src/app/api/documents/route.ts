import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { ingestDocument } from "@/lib/ingest/pipeline";
import {
  GUEST,
  MAX_DOC_BYTES,
  DEFAULT_USER_ID,
  DocLimitError,
  isGuest,
  cleanupExpiredGuests,
  logUsage,
} from "@/lib/limits";

export const runtime = "nodejs";

/** Bibliothek des eingeloggten Users auflisten. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const cols = sql`
    d.id,
    d.title,
    d.source,
    d.source_path    AS "sourcePath",
    count(c.id)::int AS "chunkCount"
  `;

  // Eigene Bibliothek des Users.
  const documents = await sql`
    SELECT ${cols}
    FROM documents d
    LEFT JOIN chunks c ON c.document_id = d.id
    WHERE d.user_id = ${session.user.id}
    GROUP BY d.id
    ORDER BY d.created_at DESC
  `;

  // Eingebauter Standard-Korpus (für alle sichtbar, read-only).
  const defaultDocuments = await sql`
    SELECT ${cols}
    FROM documents d
    LEFT JOIN chunks c ON c.document_id = d.id
    WHERE d.user_id = ${DEFAULT_USER_ID}
    GROUP BY d.id
    ORDER BY d.title ASC
  `;

  return Response.json({ documents, defaultDocuments });
}

/** Ein Markdown-Dokument für den eingeloggten User einspeisen. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const title =
    typeof (body as { title?: unknown })?.title === "string"
      ? (body as { title: string }).title.trim()
      : "";
  const content =
    typeof (body as { content?: unknown })?.content === "string"
      ? (body as { content: string }).content
      : "";

  if (!title || content.trim() === "") {
    return Response.json({ error: "Titel und Inhalt sind nötig." }, { status: 400 });
  }

  const userId = session.user.id;
  const guest = isGuest(userId);

  // Größenlimit gilt für ALLE (Kosten/Speicher). Die Dokument-Anzahl wird für
  // Gäste atomar in der Ingestion geprüft (race-fest, siehe ingestDocument).
  if (Buffer.byteLength(content, "utf8") > MAX_DOC_BYTES) {
    return Response.json(
      { error: `Dokument zu groß (max. ${MAX_DOC_BYTES / 1000} KB pro Dokument).` },
      { status: 413 },
    );
  }
  if (guest) await cleanupExpiredGuests(sql);

  try {
    const chunks = await ingestDocument(
      sql,
      {
        userId,
        source: "upload",
        sourcePath: title, // pro User eindeutig -> Re-Upload gleichen Titels ersetzt
        title,
        markdown: content,
      },
      guest ? { maxDocuments: GUEST.maxDocs } : undefined,
    );
    if (guest) await logUsage(sql, userId, "upload");
    if (chunks === 0) {
      return Response.json(
        { error: "Kein Inhalt zum Einspeisen gefunden (keine Chunks)." },
        { status: 400 },
      );
    }
    return Response.json({ ok: true, chunks });
  } catch (err) {
    if (err instanceof DocLimitError) {
      return Response.json(
        { error: `${err.message} Melde dich an, um mehr einzuspeisen.` },
        { status: 403 },
      );
    }
    // Interne Fehler serverseitig loggen, dem Client nur eine generische Meldung
    // zeigen (keine DB-/Upstream-Details nach außen tragen).
    console.error("Upload fehlgeschlagen:", err);
    return Response.json({ error: "Einspeisen fehlgeschlagen." }, { status: 500 });
  }
}
