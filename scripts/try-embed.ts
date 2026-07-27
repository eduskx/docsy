/**
 * Smoke-Test für den Embedding-Call (Kategorie A — Rahmen).
 * Aufruf:  npm run embed:try
 *          npm run embed:try -- "eigener Text" "noch einer"
 *
 * Ruft die Voyage-API real auf (kleiner Free-Tier-Verbrauch) und zeigt,
 * dass ein Vektor mit der erwarteten Dimension zurückkommt.
 */
import { embed, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "../src/lib/embed.ts";

const args = process.argv.slice(2);
const inputs = args.length > 0 ? args : ["Wie behandle ich Fehler bei async/await?"];

console.log(`Modell: ${EMBEDDING_MODEL} · erwartete Dimension: ${EMBEDDING_DIMENSIONS}\n`);

try {
  const vectors = await embed(inputs, "query");
  inputs.forEach((text, i) => {
    const v = vectors[i];
    const preview = v.slice(0, 5).map((n) => n.toFixed(4)).join(", ");
    console.log(`"${text}"`);
    console.log(`  Dimension: ${v.length}${v.length === EMBEDDING_DIMENSIONS ? " ✅" : " ⚠ passt NICHT zur DB!"}`);
    console.log(`  erste Werte: [${preview}, …]\n`);
  });
} catch (err) {
  console.error("❌ Embedding fehlgeschlagen:");
  console.error("   " + (err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
}
