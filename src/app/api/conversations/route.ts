import { auth } from "@/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/** Konversationen des eingeloggten Users (neueste zuerst). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const conversations = await sql`
    SELECT id, title, created_at AS "createdAt"
    FROM conversations
    WHERE user_id = ${session.user.id}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return Response.json({ conversations });
}
