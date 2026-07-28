import postgres from "postgres";

type Db = ReturnType<typeof postgres>;

/** Grenzen für anonyme Gäste (schützen Kosten, Speicher, Free-Tier-Rate-Limits). */
export const GUEST = {
  maxDocs: 3, // max. Dokumente pro Gast
  maxDocBytes: 50_000, // ~50 KB / ~10k Tokens pro Dokument
  chatPerHour: 20, // max. Fragen/Stunde pro Gast
  ttlHours: 24, // Gast-Daten werden nach 24 h gelöscht
} as const;

/**
 * Der Standard-/Default-Korpus (eingebaute Doku, z.B. JavaScript). Wird von
 * ALLEN Nutzern zusätzlich zu ihren eigenen Uploads durchsucht — Gäste wie
 * angemeldete User. Gespeichert unter user_id = "seed" (via `npm run ingest`).
 */
export const DEFAULT_USER_ID = "seed";

export function isGuest(userId: string): boolean {
  return userId.startsWith("guest:");
}

/**
 * Räumt abgelaufene Gast-Daten auf (Dokumente > TTL) und alte Usage-Events.
 * "Lazy Cleanup": wird bei Gast-Aktionen mitausgeführt — kein separater Cron nötig.
 * Dokument-Löschung kaskadiert auf die zugehörigen Chunks.
 */
export async function cleanupExpiredGuests(sql: Db): Promise<void> {
  await sql`
    DELETE FROM documents
    WHERE user_id LIKE 'guest:%'
      AND created_at < now() - make_interval(hours => ${GUEST.ttlHours})
  `;
  await sql`DELETE FROM usage_events WHERE created_at < now() - interval '1 hour'`;
}

/** Anzahl Dokumente eines Users. */
export async function countDocuments(sql: Db, userId: string): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM documents WHERE user_id = ${userId}
  `;
  return n;
}

/** Anzahl Chat-Anfragen eines Users in der letzten Stunde (für Rate-Limit). */
export async function countRecentChats(sql: Db, userId: string): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM usage_events
    WHERE user_id = ${userId} AND kind = 'chat'
      AND created_at > now() - interval '1 hour'
  `;
  return n;
}

/** Ein Usage-Event protokollieren (für Rate-Limiting). */
export async function logUsage(sql: Db, userId: string, kind: "chat" | "upload"): Promise<void> {
  await sql`INSERT INTO usage_events (user_id, kind) VALUES (${userId}, ${kind})`;
}
