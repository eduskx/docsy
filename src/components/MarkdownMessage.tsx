"use client";

import { useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

/** Codeblock mit Copy-Button (liest den gerenderten Text aus dem <pre>). */
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = preRef.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard-API nicht verfügbar (z.B. ohne HTTPS) -> still ignorieren.
    }
  }

  return (
    <div className="group/code relative mb-3 last:mb-0">
      <button
        type="button"
        onClick={copy}
        title={copied ? "Kopiert" : "Code kopieren"}
        aria-label={copied ? "Kopiert" : "Code kopieren"}
        className="absolute right-3 top-3 rounded-md bg-white/10 p-1.5 text-neutral-300 opacity-0 transition hover:bg-white/20 hover:text-white group-hover/code:opacity-100"
      >
        {copied ? (
          // Häkchen
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          // Klemmbrett/Kopieren
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      <pre ref={preRef} className="overflow-x-auto rounded-lg bg-code p-3 pr-12 text-sm">
        {children}
      </pre>
    </div>
  );
}

/**
 * Rendert die Markdown-Antwort des Assistenten als echtes HTML statt rohem Text.
 * react-markdown parst zu React-Elementen (kein dangerouslySetInnerHTML -> XSS-sicher),
 * remark-gfm liefert Tabellen/Listen, rehype-highlight das Syntax-Highlighting.
 *
 * Die `[Quelle N]`-Marker im Text werden anklickbar gemacht: ein Klick scrollt zur
 * passenden Quelle unter der Nachricht (Anker `${msgId}-src-N`).
 */

/** Zerlegt Text an [Quelle N] und ersetzt die Marker durch anklickbare Buttons. */
function linkifyCitations(text: string, msgId: string) {
  const parts = text.split(/(\[Quelle \d+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[Quelle (\d+)\]$/);
    if (!m) return part;
    const n = m[1];
    return (
      <button
        key={i}
        type="button"
        onClick={() => {
          const el = document.getElementById(`${msgId}-src-${n}`);
          // Ist die Quelle ein <details>, gleich aufklappen (zeigt den Chunk-Text).
          if (el instanceof HTMLDetailsElement) el.open = true;
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
          el?.classList.add("ring-2", "ring-accent");
          setTimeout(() => el?.classList.remove("ring-2", "ring-accent"), 1200);
        }}
        className="mx-0.5 rounded bg-accent/15 px-1 text-xs font-medium text-accent-strong hover:bg-accent/25"
      >
        [Quelle {n}]
      </button>
    );
  });
}

/** Wendet linkifyCitations auf alle String-Kinder eines Knotens an. */
function withCitations(children: React.ReactNode, msgId: string): React.ReactNode {
  if (typeof children === "string") return linkifyCitations(children, msgId);
  if (Array.isArray(children))
    return children.map((c, i) =>
      typeof c === "string" ? <span key={i}>{linkifyCitations(c, msgId)}</span> : c,
    );
  return children;
}

export function MarkdownMessage({ content, msgId }: { content: string; msgId: string }) {
  const components: Components = {
    p: ({ children }) => <p className="mb-3 last:mb-0">{withCitations(children, msgId)}</p>,
    li: ({ children }) => <li className="mb-1">{withCitations(children, msgId)}</li>,
    ul: ({ children }) => <ul className="mb-3 list-disc pl-5 last:mb-0">{children}</ul>,
    ol: ({ children }) => <ol className="mb-3 list-decimal pl-5 last:mb-0">{children}</ol>,
    h1: ({ children }) => <h1 className="mb-2 mt-1 text-lg font-semibold">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-2 mt-1 text-base font-semibold">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-1 mt-1 text-sm font-semibold">{children}</h3>,
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
      >
        {children}
      </a>
    ),
    code: ({ className, children }) => {
      // Blockcode hat eine language-* Klasse (von rehype-highlight), Inline-Code nicht.
      const isBlock = /language-/.test(className ?? "");
      if (isBlock) {
        return <code className={className}>{children}</code>;
      }
      return (
        <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/15">
          {children}
        </code>
      );
    },
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    table: ({ children }) => (
      <div className="mb-3 overflow-x-auto last:mb-0">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-neutral-300 px-2 py-1 text-left font-medium dark:border-neutral-700">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-neutral-300 px-2 py-1 dark:border-neutral-700">{children}</td>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mb-3 border-l-2 border-neutral-300 pl-3 italic text-neutral-600 last:mb-0 dark:border-neutral-600 dark:text-neutral-400">
        {children}
      </blockquote>
    ),
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
