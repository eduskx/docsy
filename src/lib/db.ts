import postgres from "postgres";
import { env } from "./env";

/**
 * Postgres-Verbindung (postgres.js).
 *
 * Wichtig im Next.js-Dev-Modus: Hot-Reload würde bei jedem Reload eine neue
 * Verbindung öffnen. Deshalb cachen wir die Instanz global — ein bewährtes
 * Muster für langlebige Verbindungen in Next.js.
 */

const globalForDb = globalThis as unknown as {
  sql: ReturnType<typeof postgres> | undefined;
};

export const sql =
  globalForDb.sql ??
  postgres(env.databaseUrl, {
    // Neon braucht SSL; der Connection-String enthält bereits sslmode=require.
    // postgres.js liest das aus. Bei Bedarf: ssl: "require".
    max: 10,
    // Der Neon-Pooler (PgBouncer, Transaction-Mode) unterstützt keine
    // Prepared Statements. postgres.js nutzt die per Default -> hier abschalten.
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.sql = sql;
}
