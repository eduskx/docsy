/**
 * Schneller Verbindungstest gegen die DB.
 * Aufruf:  npm run db:ping
 * Zeigt Postgres-Version und ob die pgvector-Extension installiert ist.
 */
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL_UNPOOLED (oder DATABASE_URL) fehlt. Trag sie in .env ein.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const [{ version }] = await sql`SELECT version()`;
  console.log("✅ Verbunden.");
  console.log("   " + version);

  const ext = await sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
  if (ext.length > 0) {
    console.log("✅ pgvector ist aktiv.");
  } else {
    console.log("ℹ  pgvector noch nicht aktiv — wird durch `npm run db:migrate` angelegt.");
  }
} catch (err) {
  console.error("❌ Verbindung fehlgeschlagen:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
