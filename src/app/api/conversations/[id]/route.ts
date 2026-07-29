import { auth } from "@/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/** Nachrichten einer Konversation laden (nur wenn sie dem User gehört). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Ungültige ID." }, { status: 400 });
  }
  const conversationId = Number(id);

  // Besitz prüfen.
  const [conversation] = await sql<{ id: number; title: string }[]>`
    SELECT id, title FROM conversations
    WHERE id = ${conversationId} AND user_id = ${session.user.id}
  `;
  if (!conversation) {
    return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  const messages = await sql`
    SELECT role, content, sources
    FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY id ASC
  `;

  return Response.json({ conversation, messages });
}

/** Eine Konversation löschen (nur eigene). Nachrichten gehen per CASCADE mit. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Ungültige ID." }, { status: 400 });
  }

  // Nur löschen, wenn die Konversation dem User gehört (Scope im WHERE).
  const deleted = await sql`
    DELETE FROM conversations
    WHERE id = ${Number(id)} AND user_id = ${session.user.id}
    RETURNING id
  `;
  if (deleted.length === 0) {
    return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
