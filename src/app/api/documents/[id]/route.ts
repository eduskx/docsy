import { auth } from "@/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Ein eigenes Dokument löschen. Die Chunks (inkl. Embeddings) gehen per
 * ON DELETE CASCADE automatisch mit. Der Besitz-Scope im WHERE schützt zugleich
 * die Standard-Bibliothek (user_id = 'seed') — die kann kein User löschen.
 */
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

  const deleted = await sql`
    DELETE FROM documents
    WHERE id = ${Number(id)} AND user_id = ${session.user.id}
    RETURNING id
  `;
  if (deleted.length === 0) {
    return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
