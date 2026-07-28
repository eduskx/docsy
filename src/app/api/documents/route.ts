import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { ingestDocument } from "@/lib/ingest/pipeline";
import {
  GUEST,
  DEFAULT_USER_ID,
  isGuest,
  cleanupExpiredGuests,
  countDocuments,
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

  // Gast-Kappen: Aufräumen, Größe und Anzahl prüfen.
  if (isGuest(userId)) {
    await cleanupExpiredGuests(sql);
    if (Buffer.byteLength(content, "utf8") > GUEST.maxDocBytes) {
      return Response.json(
        { error: `Gast-Limit: max. ${GUEST.maxDocBytes / 1000} KB pro Dokument. Melde dich an für größere Uploads.` },
        { status: 413 },
      );
    }
    const count = await countDocuments(sql, userId);
    if (count >= GUEST.maxDocs) {
      return Response.json(
        { error: `Gast-Limit erreicht (max. ${GUEST.maxDocs} Dokumente). Melde dich an, um mehr einzuspeisen.` },
        { status: 403 },
      );
    }
  }

  try {
    const chunks = await ingestDocument(sql, {
      userId,
      source: "upload",
      sourcePath: title, // pro User eindeutig -> Re-Upload gleichen Titels ersetzt
      title,
      markdown: content,
    });
    if (isGuest(userId)) await logUsage(sql, userId, "upload");
    if (chunks === 0) {
      return Response.json(
        { error: "Kein Inhalt zum Einspeisen gefunden (keine Chunks)." },
        { status: 400 },
      );
    }
    return Response.json({ ok: true, chunks });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
