import Groq from "groq-sdk";
import { sql } from "@/lib/db";
import { search, type SearchResult } from "@/lib/retrieval/search";

// postgres.js braucht die Node-Runtime (nicht Edge).
export const runtime = "nodejs";

/**
 * Chat-Modell (Groq, kostenloser Tier). Alternativen z.B. "llama-3.1-8b-instant"
 * (schneller/kleiner). Nur der LLM-Call läuft über Groq — Retrieval, Embeddings
 * und Chunking bleiben unverändert.
 */
const CHAT_MODEL = "llama-3.3-70b-versatile";
const TOP_K = 5;

/** Baut den System-Prompt: Antworte NUR aus den Doku-Ausschnitten, mit Quellen. */
function buildSystemPrompt(results: SearchResult[]): string {
  const context = results
    .map(
      (r, i) =>
        `[Quelle ${i + 1}] ${r.sourcePath}${r.heading ? ` — ${r.heading}` : ""}\n${r.content}`,
    )
    .join("\n\n---\n\n");

  return [
    "Du bist ein Wissensassistent für Entwickler-Dokumentation.",
    "Beantworte die Frage des Users AUSSCHLIESSLICH anhand der folgenden Doku-Ausschnitte.",
    "Steht die Antwort nicht in den Ausschnitten, sag das ehrlich und rate nicht.",
    "Zitiere die genutzten Stellen im Text mit [Quelle N].",
    "",
    "=== Doku-Ausschnitte ===",
    context || "(keine relevanten Ausschnitte gefunden)",
  ].join("\n");
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    ({ message: raw } = await req.json());
  } catch {
    return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    return Response.json({ error: "Feld 'message' fehlt." }, { status: 400 });
  }
  const message: string = raw;

  // 1. Retrieval: passende Chunks holen (Kernstelle #3).
  const results = await search(sql, message, TOP_K);

  const groq = new Groq(); // liest GROQ_API_KEY aus der Umgebung
  const encoder = new TextEncoder();

  // 2. NDJSON-Stream: erst die Quellen, dann die Antwort-Deltas.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        send({
          type: "sources",
          sources: results.map((r, i) => ({
            index: i + 1,
            heading: r.heading,
            sourcePath: r.sourcePath,
            similarity: r.similarity,
          })),
        });

        const completion = await groq.chat.completions.create({
          model: CHAT_MODEL,
          max_tokens: 2048,
          stream: true,
          messages: [
            { role: "system", content: buildSystemPrompt(results) },
            { role: "user", content: message },
          ],
        });

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) send({ type: "text", text: delta });
        }

        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
