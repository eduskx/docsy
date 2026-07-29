import Groq from "groq-sdk";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { search, type SearchResult } from "@/lib/retrieval/search";
import {
  GUEST,
  DEFAULT_USER_ID,
  isGuest,
  cleanupExpiredGuests,
  countRecentChats,
  logUsage,
} from "@/lib/limits";

// postgres.js braucht die Node-Runtime (nicht Edge).
export const runtime = "nodejs";

/**
 * Chat-Modell (Groq, kostenloser Tier). Alternativen z.B. "llama-3.1-8b-instant"
 * (schneller/kleiner). Nur der LLM-Call läuft über Groq — Retrieval, Embeddings
 * und Chunking bleiben unverändert.
 */
const CHAT_MODEL = "llama-3.3-70b-versatile";
/** Kleines, schnelles Modell für die zusammenfassende Verlaufs-Überschrift. */
const TITLE_MODEL = "llama-3.1-8b-instant";
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
    "Nutze KEIN Vorwissen und erfinde nichts.",
    "Prüfe zuerst, ob die Ausschnitte die Frage überhaupt behandeln. Wenn nicht,",
    'antworte NUR mit: "Dazu finde ich in deiner Doku nichts." — und nichts weiter.',
    "Wenn sie die Frage behandeln, antworte knapp und zitiere die genutzten Stellen mit [Quelle N].",
    "",
    "=== Doku-Ausschnitte ===",
    context || "(keine relevanten Ausschnitte gefunden)",
  ].join("\n");
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  let body: { message?: unknown; conversationId?: unknown; regenerate?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }
  if (typeof body.message !== "string" || body.message.trim() === "") {
    return Response.json({ error: "Feld 'message' fehlt." }, { status: 400 });
  }
  const message: string = body.message;
  const regenerate = body.regenerate === true;
  const userId = session.user.id;
  const guest = isGuest(userId);

  // Gäste: aufräumen, Rate-Limit prüfen, protokollieren.
  if (guest) {
    await cleanupExpiredGuests(sql);
    const recent = await countRecentChats(sql, userId);
    if (recent >= GUEST.chatPerHour) {
      return Response.json(
        { error: `Gast-Limit erreicht (${GUEST.chatPerHour} Fragen/Stunde). Melde dich an für unbegrenzten Zugriff.` },
        { status: 429 },
      );
    }
    await logUsage(sql, userId, "chat");
  }

  // Verlauf: nur für angemeldete GitHub-User persistieren.
  // Bestehende Konversation fortführen oder neue anlegen; User-Nachricht speichern.
  let conversationId: number | null = null;
  let conversationTitle: string | null = null;
  let createdNewConversation = false;
  if (!guest) {
    const provided = Number(body.conversationId);
    if (Number.isInteger(provided) && provided > 0) {
      const [c] = await sql<{ id: number; title: string }[]>`
        SELECT id, title FROM conversations WHERE id = ${provided} AND user_id = ${userId}
      `;
      if (c) {
        conversationId = Number(c.id);
        conversationTitle = c.title;
      }
    }
    if (conversationId === null) {
      // Vorläufiger Titel (Anfang der Frage) — wird nach der Antwort durch eine
      // zusammenfassende Überschrift ersetzt (siehe generateTitle im Stream).
      conversationTitle = message.slice(0, 60);
      const [c] = await sql<{ id: number }[]>`
        INSERT INTO conversations (user_id, title) VALUES (${userId}, ${conversationTitle})
        RETURNING id
      `;
      conversationId = Number(c.id);
      createdNewConversation = true;
    }
    if (regenerate && conversationId !== null) {
      // Regenerate: die letzte Assistant-Antwort entfernen (wird neu erzeugt) —
      // KEINE neue User-Nachricht anlegen, sonst entstünde eine Dublette.
      await sql`
        DELETE FROM messages
        WHERE id = (
          SELECT id FROM messages
          WHERE conversation_id = ${conversationId} AND role = 'assistant'
          ORDER BY id DESC LIMIT 1
        )
      `;
    } else {
      await sql`
        INSERT INTO messages (conversation_id, role, content)
        VALUES (${conversationId}, 'user', ${message})
      `;
    }
  }

  // 1. Retrieval (Kernstelle #3). ALLE Nutzer durchsuchen ihre eigene Bibliothek
  //    UND den eingebauten Standard-Korpus (JavaScript etc.).
  const scope =
    userId === DEFAULT_USER_ID ? [userId] : [userId, DEFAULT_USER_ID];
  const results = await search(sql, message, TOP_K, scope);

  const sourcesPayload = results.map((r, i) => ({
    index: i + 1,
    heading: r.heading,
    sourcePath: r.sourcePath,
    similarity: r.similarity,
    // Der tatsächliche Chunk-Text, der die Antwort stützt — im UI aufklappbar,
    // damit Nutzer die Antwort direkt an der Quelle nachprüfen können.
    content: r.content,
  }));

  const groq = new Groq(); // liest GROQ_API_KEY aus der Umgebung
  const encoder = new TextEncoder();

  // 2. NDJSON-Stream: erst die Quellen, dann die Antwort-Deltas.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      // Assistant-Nachricht persistieren (nur GitHub-User mit Konversation).
      const persistAssistant = async (text: string) => {
        if (conversationId !== null && text.trim() !== "") {
          await sql`
            INSERT INTO messages (conversation_id, role, content, sources)
            VALUES (${conversationId}, 'assistant', ${text}, ${sql.json(sourcesPayload)})
          `;
        }
      };

      // Nach der Antwort: für neue Konversationen eine zusammenfassende
      // Überschrift aus der ersten Frage erzeugen (statt der Frage im Wortlaut).
      // Läuft NACH dem Streamen -> keine zusätzliche Latenz für die Antwort.
      const maybeUpdateTitle = async () => {
        if (!createdNewConversation || conversationId === null) return;
        try {
          const t = await groq.chat.completions.create({
            model: TITLE_MODEL,
            max_tokens: 24,
            messages: [
              {
                role: "system",
                content:
                  "Formuliere eine kurze, prägnante Überschrift (höchstens 6 Wörter) für eine Chat-Konversation anhand der ersten Frage des Nutzers. Antworte NUR mit der Überschrift — ohne Anführungszeichen, ohne Satzzeichen am Ende.",
              },
              { role: "user", content: message },
            ],
          });
          const title = t.choices[0]?.message?.content
            ?.trim()
            .replace(/^["']|["']$/g, "")
            .slice(0, 80);
          if (title) {
            await sql`UPDATE conversations SET title = ${title} WHERE id = ${conversationId}`;
            send({ type: "conversation", id: conversationId, title });
          }
        } catch {
          // Titel-Generierung ist optional — bei Fehler bleibt der vorläufige Titel.
        }
      };

      try {
        // Konversation zuerst, damit der Client die ID kennt (Verlauf).
        if (conversationId !== null) {
          send({ type: "conversation", id: conversationId, title: conversationTitle });
        }

        send({ type: "sources", sources: sourcesPayload });

        // Harter Riegel: keine Treffer (z.B. leere Bibliothek) -> kein LLM-Call.
        if (results.length === 0) {
          const msg =
            "In deiner Bibliothek finde ich dazu nichts. Speise ein Dokument ein, das dein Thema abdeckt.";
          send({ type: "text", text: msg });
          await persistAssistant(msg);
          await maybeUpdateTitle();
          send({ type: "done" });
          return;
        }

        const completion = await groq.chat.completions.create({
          model: CHAT_MODEL,
          max_tokens: 2048,
          stream: true,
          messages: [
            { role: "system", content: buildSystemPrompt(results) },
            { role: "user", content: message },
          ],
        });

        let assistantText = "";
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            assistantText += delta;
            send({ type: "text", text: delta });
          }
        }

        await persistAssistant(assistantText);
        await maybeUpdateTitle();
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
