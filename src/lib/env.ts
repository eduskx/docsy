/**
 * Zentraler, validierter Zugriff auf Environment-Variablen.
 * Wirft beim Start klar verständlich, wenn etwas fehlt — statt später
 * mit kryptischem "undefined" mitten im API-Call.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Fehlende Environment-Variable: ${name}. Trag sie in .env ein (Vorlage: .env.example).`,
    );
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get voyageApiKey() {
    return required("VOYAGE_API_KEY");
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
};
