"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { githubSignOut } from "@/app/actions";
import { MarkdownMessage } from "@/components/MarkdownMessage";

type Source = {
  index: number;
  heading: string | null;
  sourcePath: string;
  similarity: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

type Doc = {
  id: number;
  title: string;
  sourcePath: string;
  chunkCount: number;
};

type Conversation = {
  id: number;
  title: string;
};

export function Chat({
  user,
}: {
  user: { name: string; image: string | null; isGuest: boolean };
}) {
  // --- Chat-State ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // --- Bibliothek / Upload ---
  const [docs, setDocs] = useState<Doc[]>([]);
  const [defaultDocs, setDefaultDocs] = useState<Doc[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  // --- Verlauf (nur GitHub-User) ---
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);

  const loadDocs = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) {
      const data = await res.json();
      setDocs(data.documents ?? []);
      setDefaultDocs(data.defaultDocuments ?? []);
    }
  }, []);

  const loadConvs = useCallback(async () => {
    if (user.isGuest) return;
    const res = await fetch("/api/conversations");
    if (res.ok) setConvs((await res.json()).conversations ?? []);
  }, [user.isGuest]);

  useEffect(() => {
    void loadDocs();
    void loadConvs();
  }, [loadDocs, loadConvs]);

  function newChat() {
    setMessages([]);
    setConversationId(null);
  }

  async function loadConversation(id: number) {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(
      (data.messages ?? []).map(
        (m: { role: "user" | "assistant"; content: string; sources: Source[] | null }) => ({
          role: m.role,
          content: m.content,
          sources: m.sources ?? undefined,
        }),
      ),
    );
    setConversationId(id);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function upload() {
    if (!title.trim() || !content.trim() || uploading) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
      setUploadMsg(`✅ „${title}" eingespeist (${data.chunks} Chunks)`);
      setTitle("");
      setContent("");
      await loadDocs();
    } catch (e) {
      setUploadMsg(`⚠ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    const question = input.trim();
    if (!question || busy) return;

    setInput("");
    setBusy(true);
    setMessages((m) => [
      ...m,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);

    const patchLast = (fn: (msg: Message) => Message) =>
      setMessages((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = fn(copy[copy.length - 1]);
        return copy;
      });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, conversationId }),
      });
      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? `Anfrage fehlgeschlagen (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "conversation") {
            setConversationId(evt.id);
          } else if (evt.type === "sources") {
            patchLast((msg) => ({ ...msg, sources: evt.sources }));
          } else if (evt.type === "text") {
            patchLast((msg) => ({ ...msg, content: msg.content + evt.text }));
          } else if (evt.type === "error") {
            patchLast((msg) => ({ ...msg, content: msg.content + `\n\n⚠ Fehler: ${evt.error}` }));
          }
        }
      }
    } catch (e) {
      patchLast((msg) => ({
        ...msg,
        content: msg.content + `\n\n⚠ ${e instanceof Error ? e.message : String(e)}`,
      }));
    } finally {
      setBusy(false);
      void loadConvs(); // neue/aktualisierte Konversation in der Sidebar zeigen
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="mx-auto flex h-dvh max-w-6xl flex-col px-4">
      {/* Kopfzeile */}
      <header className="flex items-center justify-between border-b border-neutral-200 py-4 dark:border-neutral-800">
        <div>
          <h1 className="text-xl font-semibold">docsy</h1>
          <p className="text-xs text-neutral-500">Deine Doku, befragbar mit Quellenangabe.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            {user.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="h-6 w-6 rounded-full" />
            )}
            {user.name}
            {user.isGuest && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                Gast
              </span>
            )}
          </span>
          <form action={githubSignOut}>
            <button
              type="submit"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Abmelden
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-hidden py-4 md:flex-row">
        {/* Sidebar: Upload + Bibliothek */}
        <aside className="flex w-full flex-col gap-4 overflow-y-auto md:w-72 md:shrink-0">
          {!user.isGuest && (
            <section className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium">Verlauf</h2>
                <button
                  onClick={() => newChat()}
                  className="text-xs text-blue-600 hover:underline"
                >
                  + Neuer Chat
                </button>
              </div>
              {convs.length === 0 ? (
                <p className="text-xs text-neutral-400">Noch keine Konversationen.</p>
              ) : (
                <ul className="space-y-0.5 text-sm">
                  {convs.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => void loadConversation(c.id)}
                        className={
                          "w-full truncate rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 " +
                          (c.id === conversationId
                            ? "bg-neutral-100 font-medium dark:bg-neutral-800"
                            : "")
                        }
                      >
                        {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {user.isGuest && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              <p className="font-medium">Gastmodus</p>
              <p className="mt-1">
                Du kannst den Demo-Korpus befragen und bis zu 3 eigene Dokumente
                testen (max. 50 KB, 20 Fragen/Stunde). Gast-Daten werden nach 24 h
                gelöscht — melde dich an, um deine Bibliothek zu behalten.
              </p>
            </div>
          )}
          <section className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <h2 className="mb-2 text-sm font-medium">Doku einspeisen</h2>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel (z.B. React Hooks)"
              className="mb-2 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-neutral-700"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Markdown hier einfügen…"
              rows={5}
              className="mb-2 w-full resize-none rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-neutral-700"
            />
            <button
              onClick={() => void upload()}
              disabled={uploading || !title.trim() || !content.trim()}
              className="w-full rounded-lg bg-blue-600 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {uploading ? "Speise ein…" : "Einspeisen"}
            </button>
            {uploadMsg && <p className="mt-2 text-xs text-neutral-500">{uploadMsg}</p>}
          </section>

          <section className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <h2 className="mb-2 text-sm font-medium">Deine Bibliothek ({docs.length})</h2>
            {docs.length === 0 ? (
              <p className="text-xs text-neutral-400">
                Noch nichts Eigenes eingespeist. Füg oben Markdown hinzu.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {docs.map((d) => (
                  <li key={d.id} className="flex justify-between gap-2">
                    <span className="truncate">{d.title}</span>
                    <span className="shrink-0 text-xs text-neutral-400">{d.chunkCount}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {defaultDocs.length > 0 && (
            <section className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
              <h2 className="mb-1 text-sm font-medium">Standard-Bibliothek</h2>
              <p className="mb-2 text-xs text-neutral-400">
                Eingebaute Doku — für alle verfügbar.
              </p>
              <ul className="space-y-1 text-sm">
                {defaultDocs.map((d) => (
                  <li key={d.id} className="flex justify-between gap-2">
                    <span className="truncate">{d.title}</span>
                    <span className="shrink-0 text-xs text-neutral-400">{d.chunkCount}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        {/* Chat */}
        <main className="flex flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="mt-16 text-center text-neutral-400">
                {docs.length === 0
                  ? "Frag die eingebaute Standard-Doku (JavaScript, TypeScript, …) — oder speise links eigene Doku ein."
                  : "Stell eine Frage zu deiner oder der Standard-Doku."}
              </div>
            )}
            {messages.map((msg, i) => {
              const isLast = i === messages.length - 1;
              const waiting = msg.role === "assistant" && msg.content === "" && busy && isLast;
              return (
                <div key={i} className={msg.role === "user" ? "text-right" : "text-left"}>
                  <div
                    className={
                      "inline-block max-w-[90%] rounded-2xl px-4 py-2 text-left " +
                      (msg.role === "user"
                        ? "whitespace-pre-wrap bg-blue-600 text-white"
                        : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100")
                    }
                  >
                    {msg.role === "user" ? (
                      msg.content
                    ) : waiting ? (
                      <span className="flex gap-1 py-1" aria-label="Antwort wird generiert">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
                      </span>
                    ) : (
                      <MarkdownMessage content={msg.content} msgId={`msg-${i}`} />
                    )}
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 space-y-1 text-left text-xs text-neutral-500">
                      <div className="font-medium">Quellen:</div>
                      {msg.sources.map((s) => (
                        <div
                          key={s.index}
                          id={`msg-${i}-src-${s.index}`}
                          className="rounded px-1 transition-shadow"
                        >
                          [{s.index}] {s.sourcePath}
                          {s.heading ? ` — ${s.heading}` : ""}{" "}
                          <span className="text-neutral-400">
                            ({(s.similarity * 100).toFixed(0)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Frage eingeben… (Enter zum Senden)"
                className="flex-1 resize-none rounded-xl border border-neutral-300 bg-transparent px-4 py-2 outline-none focus:border-blue-500 dark:border-neutral-700"
              />
              <button
                onClick={() => void send()}
                disabled={busy || input.trim() === ""}
                className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-40"
              >
                {busy ? "…" : "Senden"}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
