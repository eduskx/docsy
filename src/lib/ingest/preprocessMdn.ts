/**
 * Vorverarbeitung für MDN-Markdown — läuft VOR dem Chunking (Kernstelle #1),
 * die es nicht anfasst. Zwei Aufgaben:
 *
 *  1. Frontmatter abtrennen und die 3 relevanten Felder auslesen
 *     (`title`, `slug`, `page-type`). Der YAML-Block darf NICHT mit-embeddet
 *     werden; der `slug` ist unser Zitier-Schlüssel (-> source_path).
 *
 *  2. MDN-Macros normalisieren. Die roh belassenen `{{...}}` würden als kaputte
 *     Platzhalter in den Chunks landen und Embedding + Volltext verschlechtern.
 *     Strategie (bewusst zweistufig statt „alles wegwerfen"):
 *       - Inline-Referenz-Macros -> inneren Fachbegriff BEHALTEN
 *         ({{cssxref("color")}} -> `color`), damit genau die Suchbegriffe
 *         überleben, auf die Nutzer suchen.
 *       - Element-Macros -> in spitze Klammern ({{HTMLElement("div")}} -> `<div>`).
 *       - Block-/Render-Macros ({{Compat}}, {{Specifications}}, …) -> ganz weg.
 *       - Alles Übrige (langer Schwanz seltener Macros) -> Catch-all strippen.
 *
 * Reine Funktionen, String rein — testbar ohne DB/Netz.
 */

export type MdnDoc = {
  /** Aus dem Frontmatter (`title`), Backticks/Quotes bereinigt. Null ohne Frontmatter. */
  title: string | null;
  /** Aus dem Frontmatter (`slug`) — Zitier-Schlüssel, z.B. "Web/CSS/Reference/Properties/color". */
  slug: string | null;
  /** Aus dem Frontmatter (`page-type`), z.B. "css-property". Rein informativ. */
  pageType: string | null;
  /** Der bereinigte Markdown-Body ohne Frontmatter und ohne Macros. */
  markdown: string;
};

/** Inline-Macros, deren erstes Argument als Fachbegriff erhalten bleibt. */
const REF_MACROS = new Set([
  "cssxref",
  "jsxref",
  "domxref",
  "glossary",
  "svgattr",
  "htmlattrdef",
  "htmlattrxref",
]);

/** Element-Macros -> Begriff in spitzen Klammern (<div>, <circle>, …). */
const ELEMENT_MACROS = new Set(["htmlelement", "svgelement"]);

/** Inline-Annotationen -> kurzer Klartext statt Wegwerfen (Signal bleibt erhalten). */
const ANNOTATION_MACROS: Record<string, string> = {
  deprecated_inline: "(deprecated)",
  experimental_inline: "(experimental)",
  "non-standard_inline": "(non-standard)",
  optional_inline: "(optional)",
  readonlyinline: "(read-only)",
};

/**
 * Ein einzelner Macro-Treffer: optional führender Backslash (escapte Form
 * \{{Compat}}), dann alles bis zum schließenden `}}` (non-greedy). Name und
 * Argumente werden anschließend aus dem Inneren geparst — NICHT im Regex, sonst
 * bricht ein `)` im Argument (z.B. "Array.prototype.map()") den Match ab.
 */
const MACRO_RE = /\\?\{\{\s*([\s\S]*?)\s*\}\}/g;

/** Erstes in Anführungszeichen stehendes Argument, z.B. aus `("color", "map()")`. */
function firstQuotedArg(args: string): string | null {
  const m = args.match(/["']([^"']+)["']/);
  return m ? m[1].trim() : null;
}

/** Ersetzt/entfernt alle MDN-Macros nach der oben beschriebenen Strategie. */
export function stripMacros(markdown: string): string {
  const replaced = markdown.replace(MACRO_RE, (_full, inner: string) => {
    const nameMatch = inner.match(/^([A-Za-z0-9_-]+)/);
    if (!nameMatch) return "";
    const name = nameMatch[1].toLowerCase();
    const args = inner.slice(nameMatch[1].length); // Rest inkl. runder Klammern

    if (REF_MACROS.has(name)) {
      const term = firstQuotedArg(args);
      return term ?? "";
    }
    if (ELEMENT_MACROS.has(name)) {
      const term = firstQuotedArg(args);
      return term ? `<${term}>` : "";
    }
    if (name in ANNOTATION_MACROS) {
      return ANNOTATION_MACROS[name];
    }
    // Block-/Render-Macros und der gesamte unbekannte Rest: ersatzlos weg.
    return "";
  });

  // Aufräumen: Zeilen, die durch einen entfernten Block-Macro leer wurden,
  // hinterlassen sonst Lücken aus 3+ Newlines und trailing Spaces.
  return replaced
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Wrapping-Quotes und Markdown-Backticks aus einem Frontmatter-Titel entfernen. */
function cleanTitle(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/`/g, "")
    .trim();
}

/**
 * Trennt den führenden `--- … ---`-Frontmatter-Block ab und liest die drei
 * benötigten Felder mit einem kleinen zeilenbasierten Parser (kein YAML-Dep —
 * MDN-Frontmatter ist flach und konsistent).
 */
function parseFrontmatter(raw: string): {
  title: string | null;
  slug: string | null;
  pageType: string | null;
  body: string;
} {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { title: null, slug: null, pageType: null, body: raw };

  const block = m[1];
  const body = raw.slice(m[0].length);

  const field = (key: string): string | null => {
    // Zeilenanfang, key:, dann der Rest der Zeile als Wert.
    const fm = block.match(new RegExp(`^${key}:[ \\t]*(.+)$`, "m"));
    return fm ? fm[1].trim() : null;
  };

  const titleRaw = field("title");
  const slugRaw = field("slug");
  const pageTypeRaw = field("page-type");

  return {
    title: titleRaw ? cleanTitle(titleRaw) : null,
    slug: slugRaw ? slugRaw.replace(/^["']|["']$/g, "").trim() : null,
    pageType: pageTypeRaw ? pageTypeRaw.replace(/^["']|["']$/g, "").trim() : null,
    body,
  };
}

/** Vollständige MDN-Aufbereitung: Frontmatter raus, Macros normalisieren. */
export function preprocessMdn(raw: string): MdnDoc {
  const { title, slug, pageType, body } = parseFrontmatter(raw);
  return {
    title,
    slug,
    pageType,
    markdown: stripMacros(body),
  };
}
