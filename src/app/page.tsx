"use client";

import { useEffect, useRef, useState } from "react";

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

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    // Hilfsfunktion: das letzte (Assistant-)Message-Objekt aktualisieren.
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
        body: JSON.stringify({ message: question }),
      });
      if (!res.ok || !res.body) throw new Error(`Anfrage fehlgeschlagen (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // letzte, evtl. unvollständige Zeile behalten

        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "sources") {
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
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col px-4">
      <header className="py-6">
        <h1 className="text-2xl font-semibold">docsy</h1>
        <p className="text-sm text-neutral-500">
          Wissensassistent für Entwickler-Dokumentation — mit Quellenangabe.
        </p>
      </header>

      <main className="flex-1 space-y-6 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="mt-20 text-center text-neutral-400">
            Stell eine Frage zur eingespeisten Doku, z.B.
            <br />
            <span className="text-neutral-600 dark:text-neutral-300">
              „Wie behandle ich Fehler bei async/await?"
            </span>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "text-right" : "text-left"}>
            <div
              className={
                "inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-left " +
                (msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100")
              }
            >
              {msg.content || (busy && i === messages.length - 1 ? "…" : "")}
            </div>

            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-2 space-y-1 text-left text-xs text-neutral-500">
                <div className="font-medium">Quellen:</div>
                {msg.sources.map((s) => (
                  <div key={s.index}>
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
        ))}
        <div ref={bottomRef} />
      </main>

      <footer className="border-t border-neutral-200 py-4 dark:border-neutral-800">
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
      </footer>
    </div>
  );
}
