import postgres from "postgres";

type Db = ReturnType<typeof postgres>;

/**
 * Maximale Dokumentgröße — gilt für ALLE Nutzer (Gäste wie angemeldete),
 * schützt Kosten (Embedding-Calls), Speicher und Free-Tier-Limits.
 */
export const MAX_DOC_BYTES = 50_000; // ~50 KB / ~10k Tokens pro Dokument

/** Zusätzliche Grenzen nur für anonyme Gäste. */
export const GUEST = {
  maxDocs: 3, // max. Dokumente pro Gast
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
 * Wird geworfen, wenn ein Gast sein Dokument-Limit erreicht hat. Trägt die
 * Grenze mit, damit die Route eine passende 403-Meldung bauen kann. Getrennt
 * von generischen Fehlern, damit die Route sie gezielt abfangen kann.
 */
export class DocLimitError extends Error {
  constructor(public readonly maxDocs: number) {
    super(`Gast-Limit erreicht (max. ${maxDocs} Dokumente).`);
    this.name = "DocLimitError";
  }
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

/**
 * Zählt die Fragen der letzten Stunde und protokolliert die neue Frage ATOMAR:
 * gibt true zurück, wenn noch Budget frei war (Event wurde geloggt), sonst false.
 *
 * Warum eine Transaktion + Advisory-Lock statt "erst zählen, dann loggen":
 * Ohne Sperre lesen parallele Requests denselben Zählerstand, BEVOR einer sein
 * INSERT committet — alle sehen "unter Limit" und kämen durch (TOCTOU-Race, das
 * Limit ließe sich mit gleichzeitigen Anfragen umgehen). Der Transaction-Level-
 * Advisory-Lock (auto-release bei COMMIT/ROLLBACK, PgBouncer-tauglich)
 * serialisiert die Requests DESSELBEN Users, sodass der Zähler stimmt.
 */
export async function tryConsumeChatQuota(
  sql: Db,
  userId: string,
  limit: number,
): Promise<boolean> {
  return sql.begin(async (tx) => {
    // Key 1 = Chat-Domain (Uploads nutzen Key 2), pro User gehasht.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${userId}), 1)`;
    const [{ n }] = await tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM usage_events
      WHERE user_id = ${userId} AND kind = 'chat'
        AND created_at > now() - interval '1 hour'
    `;
    if (n >= limit) return false;
    await tx`INSERT INTO usage_events (user_id, kind) VALUES (${userId}, 'chat')`;
    return true;
  });
}

/** Ein Usage-Event protokollieren (z.B. Upload — für Analytics/Nachvollziehbarkeit). */
export async function logUsage(sql: Db, userId: string, kind: "chat" | "upload"): Promise<void> {
  await sql`INSERT INTO usage_events (user_id, kind) VALUES (${userId}, ${kind})`;
}
