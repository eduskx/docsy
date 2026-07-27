/**
 * Kernstelle #1 — Chunking.
 *
 * Design (selbst hergeleitet):
 *  - an Überschriften schneiden (structure-aware)
 *  - zu lange Sektionen zusätzlich nach Maximalgröße splitten (Fallback)
 *  - Größe in Tokens denken, per Zeichen annähern (~4 Zeichen ≈ 1 Token)
 *  - Zielgröße ~300–500 Tokens
 *  - Split zur nächsten Satzgrenze verschieben (keine kaputten Sätze)
 *  - Overlap: letzte 1–2 Sätze wiederholen (~10–15 %)
 *  - Überschrift in den embeddeten `content` ziehen (contextual chunking)
 *  - Überschrift zusätzlich separat in `heading` (für die Quellenanzeige)
 *
 * Die Funktion ist SYNCHRON — reine Funktion, String rein, Chunk[] raus.
 */

export type Chunk = {
  /** Der Text, der später embeddet UND als Quelle gespeichert wird. */
  content: string;
  /** Reihenfolge im Dokument, beginnend bei 0. */
  chunkIndex: number;
  /** Die Überschrift, unter der der Chunk steht (für die Anzeige). */
  heading: string | null;
  /** Grobe Token-Schätzung (z.B. über Zeichenzahl). */
  tokenCount: number;
};

/** Erkennt eine Markdown-Überschriften-Zeile, z.B. "## Promises" oder "### Foo". */
const HEADING_RE = /^#{1,6}\s+(.*)$/;

/** Grobe Token-Schätzung über die Zeichenzahl (~4 Zeichen ≈ 1 Token). */
function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

/**
 * Maximale Zielgröße eines Chunks in (geschätzten) Tokens.
 * Zum Testen des Fallbacks auf kleinen Dokumenten kurz runterdrehen (z.B. 80).
 */
const MAX_TOKENS = 500;

/**
 * Wie viel Kontext (in Tokens) am Anfang eines Teilstücks vom Vorgänger
 * wiederholt wird. ~15 % der Zielgröße — klein halten, sonst zu viele Duplikate.
 */
const OVERLAP_TOKENS = Math.round(MAX_TOKENS * 0.15);

/**
 * Zerlegt Text an Satzgrenzen (Satzendezeichen + Leerraum dahinter).
 * Bewusst simpel — nicht perfekt bei Abkürzungen o.ä., aber für Doku gut genug.
 * Wird nur als Notfall-Ebene gebraucht, wenn ein einzelner Absatz zu groß ist.
 */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/**
 * Packt eine Liste von Einheiten (Absätze oder Sätze) gierig zu Stücken
 * zusammen, sodass jedes Stück möglichst nah an MAX_TOKENS bleibt, ohne
 * es zu überschreiten. Eine einzelne Einheit, die allein schon größer als
 * MAX ist, wird als eigenes (überlanges) Stück durchgereicht.
 */
function packUnits(units: string[], maxTokens: number, joiner: string): string[] {
  const pieces: string[] = [];
  let current = "";

  for (const unit of units) {
    const candidate = current === "" ? unit : current + joiner + unit;
    if (current !== "" && estimateTokens(candidate) > maxTokens) {
      pieces.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current !== "") pieces.push(current);

  return pieces;
}

/**
 * Nimmt die letzten Sätze eines Textes bis zu einem Token-Budget — der
 * Kontext-"Schwanz", der am Anfang des nächsten Teilstücks wiederholt wird.
 * Mindestens ein Satz, auch wenn er das Budget überschreitet.
 */
function takeTailSentences(text: string, budgetTokens: number): string {
  const sentences = splitIntoSentences(text);
  const tail: string[] = [];
  let tokens = 0;

  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentence = sentences[i];
    const t = estimateTokens(sentence);
    if (tail.length > 0 && tokens + t > budgetTokens) break;
    tail.unshift(sentence);
    tokens += t;
  }

  return tail.join(" ");
}

/**
 * Legt Overlap zwischen benachbarte Teilstücke: jedes Stück (außer dem ersten)
 * bekommt vorne den Kontext-Schwanz seines Vorgängers. Nur innerhalb einer
 * gesplitteten Sektion — an Überschriften-Grenzen gibt es bewusst KEIN Overlap.
 */
function addOverlap(pieces: string[], overlapTokens: number): string[] {
  if (pieces.length <= 1) return pieces;

  const result = [pieces[0]];
  for (let i = 1; i < pieces.length; i++) {
    const tail = takeTailSentences(pieces[i - 1], overlapTokens);
    result.push(tail === "" ? pieces[i] : tail + "\n\n" + pieces[i]);
  }
  return result;
}

/**
 * Der Max-Size-Fallback: schneidet einen zu großen Abschnitt in mehrere
 * Stücke (jedes ≤ MAX_TOKENS), rekursiv von der stärksten zur schwächsten
 * Grenze — erst an Absätzen, und nur wenn ein einzelner Absatz allein schon
 * zu groß ist, runter auf Satzgrenzen.
 */
function splitBySize(text: string, maxTokens: number): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "");

  const pieces: string[] = [];
  let current = "";

  const flushCurrent = () => {
    if (current.trim() !== "") pieces.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    // Notfall-Ebene: einzelner Absatz allein schon zu groß -> auf Sätze runter.
    if (estimateTokens(paragraph) > maxTokens) {
      flushCurrent();
      const sentences = splitIntoSentences(paragraph);
      pieces.push(...packUnits(sentences, maxTokens, " "));
      continue;
    }

    const candidate = current === "" ? paragraph : current + "\n\n" + paragraph;
    if (current !== "" && estimateTokens(candidate) > maxTokens) {
      flushCurrent();
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  flushCurrent();

  // Kontext an den Nahtstellen retten.
  return addOverlap(pieces, OVERLAP_TOKENS);
}

export function chunk(markdown: string): Chunk[] {
  const lines = markdown.split("\n");

  const chunks: Chunk[] = [];

  // Der Abschnitt, den wir gerade aufsammeln.
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  // Schließt den aktuellen Abschnitt ab und hängt ihn als Chunk an —
  // sofern er überhaupt Inhalt hat.
  function flush() {
    const content = currentLines.join("\n").trim();
    if (content === "") return; // leere Abschnitte überspringen

    if (estimateTokens(content) <= MAX_TOKENS) {
      // Passt in einen Chunk — wie bisher.
      chunks.push({
        content,
        chunkIndex: chunks.length,
        heading: currentHeading,
        tokenCount: estimateTokens(content),
      });
      return;
    }

    // Zu groß => Fallback: in mehrere Stücke schneiden. Jedes Stück wird ein
    // eigener Chunk mit derselben Überschrift; chunkIndex zählt automatisch weiter.
    for (const piece of splitBySize(content, MAX_TOKENS)) {
      chunks.push({
        content: piece,
        chunkIndex: chunks.length,
        heading: currentHeading,
        tokenCount: estimateTokens(piece),
      });
    }
  }

  for (const line of lines) {
    const match = line.match(HEADING_RE);

    if (match) {
      // Neue Überschrift => vorherigen Abschnitt abschließen, neuen beginnen.
      flush();
      currentHeading = match[1].trim(); // der Text ohne die #-Zeichen
      currentLines = [line]; // die Überschrift bleibt Teil des Inhalts
      //           ^ absichtlich: so steht die Überschrift später im embeddeten
      //             Text (contextual chunking) UND separat im heading-Feld.
    } else {
      currentLines.push(line);
    }
  }

  // Den letzten Abschnitt nicht vergessen.
  flush();

  return chunks;
}
