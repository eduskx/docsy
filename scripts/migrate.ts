/**
 * Führt db/schema.sql gegen die Datenbank aus.
 * Aufruf:  npm run db:migrate
 *
 * Läuft mit Node 24 direkt als .ts (Type-Stripping), kein tsx nötig.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

// .env wird über `node --env-file=.env` geladen (siehe package.json).
// Migrationen/DDL laufen über die DIRECT-Verbindung (Pooler kann kein DDL sauber).
const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL_UNPOOLED (oder DATABASE_URL) fehlt. Trag sie in .env ein.");
  process.exit(1);
}

const schemaPath = join(process.cwd(), "db", "schema.sql");
const schema = readFileSync(schemaPath, "utf8");

const sql = postgres(databaseUrl, { max: 1 });

try {
  console.log("▶  Führe db/schema.sql aus …");
  await sql.unsafe(schema);
  console.log("✅ Migration erfolgreich.");
} catch (err) {
  console.error("❌ Migration fehlgeschlagen:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
