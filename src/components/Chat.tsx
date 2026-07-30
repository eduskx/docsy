"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { githubSignOut } from "@/app/actions";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";

/** Kleine Inline-Icons (currentColor) — keine Emojis (Design-Checkliste). */
const svg = "1.5";
function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={svg} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
function IconFile() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={svg} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    </svg>
  );
}
function IconMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={svg} strokeLinecap="round" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={svg} strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

type Source = {
  index: number;
  heading: string | null;
  sourcePath: string;
  similarity: number;
  content?: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

type Doc = {
  id: number;
  title: string;
  source: string;
  sourcePath: string;
  chunkCount: number;
};

/** Anzeigename je Sprach-Quelle der Standard-Bibliothek. */
const SOURCE_LABELS: Record<string, string> = {
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
};

/**
 * Baut aus einem MDN-slug (source_path der Seed-Docs, z.B.
 * "Web/CSS/Reference/Properties/color") den Deep-Link zur MDN-Seite.
 * Für eigene Uploads (kein "Web/"-Präfix) gibt es keinen Link -> null.
 */
function mdnUrl(sourcePath: string): string | null {
  return sourcePath.startsWith("Web/")
    ? `https://developer.mozilla.org/en-US/docs/${sourcePath}`
    : null;
}

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

  // --- Mobile: Sidebar als Off-Canvas-Drawer ---
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    if (res.ok) {
      const list: Conversation[] = (await res.json()).conversations ?? [];
      // postgres.js liefert BIGINT als String -> auf Number normalisieren, damit
      // strikte Vergleiche (=== conversationId) verlässlich funktionieren.
      setConvs(list.map((c) => ({ ...c, id: Number(c.id) })));
    }
  }, [user.isGuest]);

  useEffect(() => {
    void loadDocs();
    void loadConvs();
  }, [loadDocs, loadConvs]);

  function newChat() {
    setMessages([]);
    setConversationId(null);
  }

  /** Eigenes Dokument löschen (Chunks gehen serverseitig per CASCADE mit). */
  async function deleteDoc(id: number, docTitle: string) {
    if (!confirm(`„${docTitle}" wirklich löschen?`)) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) await loadDocs();
  }

  /** Konversation löschen; war sie gerade offen, auf neuen Chat zurücksetzen. */
  async function deleteConv(id: number) {
    if (!confirm("Diese Konversation löschen?")) return;
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (id === conversationId) newChat();
      await loadConvs();
    }
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
      setUploadMsg(`✅ „${title}" hochgeladen (${data.chunks} Chunks)`);
      setTitle("");
      setContent("");
      await loadDocs();
    } catch (e) {
      setUploadMsg(`⚠ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
    }
  }

  /**
   * Lädt eine gewählte .md-Datei clientseitig und füllt Titel + Inhalt vor.
   * Nur Markdown wird akzeptiert (PDF bewusst nicht — zerstört die Struktur, auf
   * die Chunking und Quellenanzeige angewiesen sind). Der User prüft/editiert
   * danach und klickt „Einspeisen".
   */
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // Reset -> dieselbe Datei kann erneut gewählt werden
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".md") && !name.endsWith(".markdown")) {
      setUploadMsg("⚠ Nur Markdown-Dateien (.md) werden unterstützt.");
      return;
    }
    const text = await file.text();
    setContent(text);
    if (!title.trim()) setTitle(file.name.replace(/\.(md|markdown)$/i, ""));
    setUploadMsg(
      `📄 „${file.name}" geladen (${(file.size / 1000).toFixed(1)} KB) — jetzt hochladen.`,
    );
  }

  /**
   * Kern des Chats: schickt die Frage an /api/chat und streamt die Antwort in
   * die letzte (leere) Assistant-Nachricht. Wird von send() und regenerate()
   * geteilt. `regenerate` sagt dem Server, die letzte Antwort zu ersetzen statt
   * eine neue User-Nachricht anzulegen.
   */
  async function streamAnswer(question: string, regenerate: boolean) {
    setBusy(true);

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
        body: JSON.stringify({ message: question, conversationId, regenerate }),
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

  async function send() {
    const question = input.trim();
    if (!question || busy) return;

    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);
    await streamAnswer(question, false);
  }

  /** Die letzte Antwort verwerfen und zur letzten Frage neu generieren. */
  async function regenerate() {
    if (busy) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    // Letzte Assistant-Nachricht auf leer zurücksetzen (Platzhalter zum Streamen).
    setMessages((m) => {
      const copy = m.slice();
      if (copy.length > 0 && copy[copy.length - 1].role === "assistant") {
        copy[copy.length - 1] = { role: "assistant", content: "" };
      } else {
        copy.push({ role: "assistant", content: "" });
      }
      return copy;
    });
    await streamAnswer(lastUser.content, true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[1500px] flex-col bg-bg text-fg">
      {/* Kopfzeile */}
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? "Menü schließen" : "Menü öffnen"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-app border border-border text-muted hover:bg-surface-2 hover:text-fg md:hidden"
          >
            <IconMenu />
          </button>
          <Logo size={30} className="shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight tracking-tight">docsy</h1>
            <p className="hidden text-xs text-muted sm:block">Deine Doku, befragbar mit Quellenangabe.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="flex items-center gap-2 text-sm text-muted">
            {user.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="h-6 w-6 rounded-full" />
            )}
            {!user.isGuest && (
              <span className="hidden max-w-[8rem] truncate sm:inline">{user.name}</span>
            )}
            {user.isGuest && (
              <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
                Gast
              </span>
            )}
          </span>
          <ThemeToggle />
          <form action={githubSignOut}>
            <button
              type="submit"
              className="rounded-app border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface-2"
            >
              Abmelden
            </button>
          </form>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden md:px-6 lg:px-10">
        {/* Scrim — schließt den Drawer auf Mobil */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
            className="absolute inset-0 z-30 bg-black/60 md:hidden"
          />
        )}

        {/* Sidebar: auf Mobil ein Off-Canvas-Drawer, ab md fest in der Spalte */}
        <aside
          className={
            "drawer absolute inset-y-0 left-0 z-40 flex w-[85%] max-w-xs flex-col gap-4 overflow-y-auto border-r border-border bg-bg p-4 md:static md:z-auto md:w-72 md:max-w-none " +
            (sidebarOpen ? "" : "drawer-closed")
          }
        >
          <div className="flex items-center justify-between md:hidden">
            <span className="text-sm font-semibold">Menü</span>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Menü schließen"
              className="inline-flex h-9 w-9 items-center justify-center rounded-app border border-border text-muted hover:bg-surface-2 hover:text-fg"
            >
              <IconClose />
            </button>
          </div>
          {!user.isGuest && (
            <section className="rounded-app border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-fg">Chats</h2>
                <button
                  onClick={() => {
                    newChat();
                    setSidebarOpen(false);
                  }}
                  className="text-xs font-medium text-accent-strong hover:underline"
                >
                  + Neuer Chat
                </button>
              </div>
              {convs.length === 0 ? (
                <p className="text-xs text-muted">Noch keine Konversationen.</p>
              ) : (
                <ul className="space-y-0.5 text-sm">
                  {convs.map((c) => (
                    <li key={c.id} className="group flex items-center gap-1">
                      <button
                        onClick={() => {
                          void loadConversation(c.id);
                          setSidebarOpen(false);
                        }}
                        className={
                          "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-fg hover:bg-surface-2 " +
                          (c.id === conversationId ? "bg-surface-2 font-medium" : "")
                        }
                      >
                        {c.title}
                      </button>
                      <button
                        onClick={() => void deleteConv(c.id)}
                        title="Löschen"
                        aria-label="Konversation löschen"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition hover:bg-surface-2 hover:text-red-500 group-hover:opacity-100"
                      >
                        <IconTrash />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {user.isGuest && (
            <div className="rounded-app border border-border bg-surface-2 p-3 text-xs text-muted">
              <p className="font-semibold text-fg">Gastmodus</p>
              <p className="mt-1">
                Du kannst den Demo-Korpus befragen und bis zu 3 eigene Dokumente
                testen (max. 50 KB, 20 Fragen/Stunde). Gast-Daten werden nach 24 h
                gelöscht — melde dich an, um deine Bibliothek zu behalten.
              </p>
            </div>
          )}
          <section className="rounded-app border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-medium text-fg">Doku hochladen</h2>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-app border border-dashed border-border px-3 py-4 text-sm text-muted hover:border-accent hover:text-accent-strong">
              <input
                type="file"
                accept=".md,.markdown,text/markdown"
                className="hidden"
                onChange={(e) => void handleFile(e)}
              />
              <IconFile />
              Markdown-Datei wählen (.md)
            </label>
            <button
              onClick={() => void upload()}
              disabled={uploading || !content.trim()}
              className="mt-2 w-full rounded-app bg-accent py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
            >
              {uploading ? "Lade hoch…" : "Hochladen"}
            </button>
            {uploadMsg && <p className="mt-2 text-xs text-muted">{uploadMsg}</p>}
          </section>

          <section className="rounded-app border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-medium text-fg">Deine Bibliothek ({docs.length})</h2>
            {docs.length === 0 ? (
              <p className="text-xs text-muted">Noch nichts Eigenes hochgeladen.</p>
            ) : (
              <ul className="space-y-0.5 text-sm">
                {docs.map((d) => (
                  <li key={d.id} className="group flex items-center justify-between gap-2 rounded-md px-1 py-0.5">
                    <span className="truncate text-fg">{d.title}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-xs tabular-nums text-muted">{d.chunkCount}</span>
                      <button
                        onClick={() => void deleteDoc(d.id, d.title)}
                        title="Löschen"
                        aria-label={`„${d.title}" löschen`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted opacity-0 transition hover:bg-surface-2 hover:text-red-500 group-hover:opacity-100"
                      >
                        <IconTrash />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {defaultDocs.length > 0 && (
            <section className="rounded-app border border-border bg-surface p-3">
              <h2 className="mb-1 text-sm font-medium text-fg">Standard-Bibliothek</h2>
              <p className="mb-2 text-xs text-muted">
                Integrierte Dokumentationen, für jeden verfügbar.
              </p>
              {/* Nach Sprache gruppiert & eingeklappt — bei tausenden MDN-Seiten
                  wäre eine flache Liste unbrauchbar. */}
              <div className="space-y-1">
                {Object.entries(
                  defaultDocs.reduce<Record<string, Doc[]>>((groups, d) => {
                    (groups[d.source] ??= []).push(d);
                    return groups;
                  }, {}),
                )
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([source, group]) => (
                    <details key={source} className="group rounded-md">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center gap-1 text-fg">
                          <span className="select-none text-muted transition-transform group-open:rotate-90">
                            ▸
                          </span>
                          {SOURCE_LABELS[source] ?? source}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted">
                          {group.length} Seiten
                        </span>
                      </summary>
                      <ul className="mt-0.5 max-h-64 space-y-0.5 overflow-y-auto pl-5 text-sm">
                        {group.map((d) => (
                          <li key={d.id} className="flex justify-between gap-2 px-1">
                            <span className="truncate text-fg">{d.title}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted">
                              {d.chunkCount}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
              </div>
            </section>
          )}
        </aside>

        {/* Chat — fluide Spalte; Inhalt auf angenehme Lesebreite begrenzt. */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-5">
              {messages.length === 0 && (
                <div className="mt-16 text-center text-muted">
                  {docs.length === 0
                    ? "Frag die integrierten Dokumentationen oder lade über das Menü deine eigenen hoch."
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
                      "inline-block max-w-[90%] px-4 py-2.5 text-left " +
                      (msg.role === "user"
                        ? "whitespace-pre-wrap rounded-app rounded-br bg-user text-user-fg"
                        : "rounded-app rounded-bl border border-border bg-surface text-fg")
                    }
                  >
                    {msg.role === "user" ? (
                      msg.content
                    ) : waiting ? (
                      <span className="flex gap-1 py-1" aria-label="Antwort wird generiert">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
                      </span>
                    ) : (
                      <MarkdownMessage content={msg.content} msgId={`msg-${i}`} />
                    )}
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 space-y-1 text-left text-xs text-muted">
                      <div className="font-medium text-fg">Quellen</div>
                      {msg.sources.map((s) => (
                        <details
                          key={s.index}
                          id={`msg-${i}-src-${s.index}`}
                          className="group rounded-md px-1 transition-shadow"
                        >
                          <summary className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
                            <span className="select-none text-muted transition-transform group-open:rotate-90">
                              ▸
                            </span>
                            <span>
                              [{s.index}]{" "}
                              {mdnUrl(s.sourcePath) ? (
                                <a
                                  href={mdnUrl(s.sourcePath)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-fg underline decoration-dotted underline-offset-2 hover:decoration-solid"
                                >
                                  {s.sourcePath}
                                </a>
                              ) : (
                                s.sourcePath
                              )}
                              {s.heading ? ` — ${s.heading}` : ""}{" "}
                              <span
                                className="text-muted/80"
                                title="Semantische Ähnlichkeit von Frage und Textstelle — kein Konfidenz- oder Korrektheitswert."
                              >
                                · Ähnlichkeit {(s.similarity * 100).toFixed(0)}%
                              </span>
                            </span>
                          </summary>
                          {s.content ? (
                            <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-2 font-mono text-[11px] leading-relaxed text-muted">
                              {s.content}
                            </pre>
                          ) : (
                            <p className="mt-1 pl-4 italic text-muted">
                              (Kein Auszug gespeichert — ältere Konversation.)
                            </p>
                          )}
                        </details>
                      ))}
                    </div>
                  )}
                  {msg.role === "assistant" && isLast && !busy && msg.content !== "" && (
                    <button
                      onClick={() => void regenerate()}
                      className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-fg"
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                      Neu generieren
                    </button>
                  )}
                </div>
              );
            })}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="border-t border-border">
            <div className="mx-auto w-full max-w-3xl p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder="Frage eingeben…"
                  className="max-h-40 flex-1 resize-none rounded-app border border-border bg-surface px-4 py-2.5 text-fg outline-none placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-ring"
                />
                <button
                  onClick={() => void send()}
                  disabled={busy || input.trim() === ""}
                  className="rounded-app bg-accent px-4 py-2.5 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
                >
                  {busy ? "…" : "Senden"}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
