/**
 * Kernstelle #2 — Embedding-Call (Voyage AI).
 *
 * Wandelt Text in einen Vektor (Zahlenliste) um, der die Bedeutung repräsentiert.
 * Wird an ZWEI Stellen gebraucht:
 *   - beim Ingesten: die Doku-Chunks embedden  -> input_type "document"
 *   - bei der Suche:  die Frage des Users embedden -> input_type "query"
 *
 * Kern ist ein fetch gegen die Voyage-REST-API — die direkte Parallele zu
 * fetch im Frontend, nur serverseitig und mit API-Key.
 */

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

/** Modell + Dimension müssen zur DB-Spalte VECTOR(1024) passen. */
export const EMBEDDING_MODEL = "voyage-3.5";
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * Voyage optimiert das Embedding je nachdem, ob der Text ein zu durchsuchendes
 * Dokument ist oder eine Suchanfrage. Das verbessert die Trefferqualität spürbar.
 */
export type EmbeddingInputType = "document" | "query";

/** Nur der Teil der Voyage-Antwort, den wir brauchen. */
type VoyageResponse = {
  data: { embedding: number[]; index: number }[];
  usage?: { total_tokens: number };
};

function getApiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    throw new Error("VOYAGE_API_KEY fehlt. Trag ihn in .env ein.");
  }
  return key;
}

/**
 * Embeddet eine Liste von Texten in einem einzigen API-Call (Batch).
 * Gibt die Vektoren in derselben Reihenfolge wie die Eingabe zurück.
 */
export async function embed(
  texts: string[],
  inputType: EmbeddingInputType,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  let response: Response;
  try {
    response = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
        input_type: inputType,
      }),
    });
  } catch (cause) {
    // fetch rejectet NUR bei Netzwerkfehlern (offline, DNS, Verbindung abgebrochen).
    // Ein HTTP-Fehlerstatus (4xx/5xx) landet NICHT hier — den prüfen wir unten.
    throw new Error("Voyage-Request fehlgeschlagen (Netzwerkfehler).", { cause });
  }

  if (!response.ok) {
    // Fehlerantwort mitlesen, damit die Meldung brauchbar ist (z.B. 401 falscher Key,
    // 429 Rate-Limit, 400 Text zu lang).
    const body = await response.text().catch(() => "");
    throw new Error(`Voyage-API-Fehler ${response.status}: ${body}`);
  }

  const json = (await response.json()) as VoyageResponse;

  // Nach index sortieren, damit die Reihenfolge garantiert zur Eingabe passt.
  return json.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

/** Bequemlichkeit für einen einzelnen Text (z.B. eine Suchanfrage). */
export async function embedOne(
  text: string,
  inputType: EmbeddingInputType,
): Promise<number[]> {
  const [vector] = await embed([text], inputType);
  return vector;
}
