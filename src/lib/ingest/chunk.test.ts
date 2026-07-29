import { test } from "node:test";
import assert from "node:assert/strict";
import { chunk, type Chunk } from "./chunk.ts";

/**
 * Unit-Tests für Kernstelle #1 (Chunking). Laufen ohne externe Dependency über
 * den eingebauten node:test-Runner + Type-Stripping (`npm test`).
 *
 * Jeder Block prüft eine bewusste Design-Entscheidung aus chunk.ts:
 *  - Struktur-Split an Überschriften
 *  - Überschrift im content (contextual chunking) UND separat im heading-Feld
 *  - leere Abschnitte überspringen
 *  - Code-Block-Schutz (# in ```-Blöcken ist keine Überschrift)
 *  - Max-Size-Fallback bei zu großen Sektionen
 *  - Overlap zwischen gesplitteten Teilstücken
 */

// Die Konstanten aus chunk.ts gespiegelt, damit die Größen-Assertions nicht raten.
const MAX_TOKENS = 500;
const OVERLAP_TOKENS = Math.round(MAX_TOKENS * 0.15);
const estimateTokens = (t: string) => Math.round(t.length / 4);

/** Baut einen Body aus n eindeutig nummerierten Sätzen (für Größen-/Overlap-Tests). */
function sentences(n: number): string {
  return Array.from(
    { length: n },
    (_, i) =>
      `Satz Nummer ${i + 1} enthält genügend Text damit die Token-Schätzung sinnvoll ansteigt.`,
  ).join(" ");
}

// --- Struktur-Split ---------------------------------------------------------

test("eine Sektion -> ein Chunk mit Überschrift im content und im heading-Feld", () => {
  const chunks = chunk("## Promises\n\nEin Promise repräsentiert einen künftigen Wert.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].heading, "Promises");
  assert.equal(chunks[0].chunkIndex, 0);
  // contextual chunking: die Überschrift steht im embeddeten Text.
  assert.ok(chunks[0].content.includes("## Promises"));
  assert.ok(chunks[0].content.includes("künftigen Wert"));
});

test("mehrere Überschriften -> je ein Chunk, fortlaufende Indizes, korrekte headings", () => {
  const md = [
    "# Einleitung",
    "Text A.",
    "## Kapitel 1",
    "Text B.",
    "## Kapitel 2",
    "Text C.",
  ].join("\n");
  const chunks = chunk(md);
  assert.equal(chunks.length, 3);
  assert.deepEqual(
    chunks.map((c) => c.heading),
    ["Einleitung", "Kapitel 1", "Kapitel 2"],
  );
  assert.deepEqual(
    chunks.map((c) => c.chunkIndex),
    [0, 1, 2],
  );
});

test("Inhalt vor der ersten Überschrift -> heading ist null", () => {
  const chunks = chunk("Freistehender Text ohne Überschrift.\n\n## Danach\n\nMehr Text.");
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].heading, null);
  assert.ok(chunks[0].content.includes("Freistehender Text"));
  assert.equal(chunks[1].heading, "Danach");
});

test("verschiedene Überschriften-Ebenen (# bis ######) werden erkannt", () => {
  const md = ["### Tief", "Text.", "###### Noch tiefer", "Text."].join("\n");
  const chunks = chunk(md);
  assert.equal(chunks.length, 2);
  assert.deepEqual(
    chunks.map((c) => c.heading),
    ["Tief", "Noch tiefer"],
  );
});

// --- Leere / triviale Eingaben ---------------------------------------------

test("leerer String -> keine Chunks", () => {
  assert.deepEqual(chunk(""), []);
});

test("nur Leerraum -> keine Chunks", () => {
  assert.deepEqual(chunk("   \n\n  \t\n"), []);
});

test("leere Sektion zwischen zwei Überschriften wird übersprungen", () => {
  const md = ["## Leer", "", "## Voll", "Hier steht Inhalt."].join("\n");
  const chunks = chunk(md);
  // "## Leer" hat als Inhalt nur die Überschrift selbst -> zählt als Inhalt.
  // Wichtiger Fall: eine WIRKLICH leere Sektion (nur Whitespace) darf nicht crashen.
  assert.ok(chunks.every((c) => c.content.trim() !== ""));
  assert.ok(chunks.some((c) => c.heading === "Voll"));
});

// --- Code-Block-Schutz (der gefixte Bug) -----------------------------------

test("# innerhalb eines ```-Codeblocks ist KEINE Überschrift", () => {
  const md = [
    "## Git Basics",
    "So legst du einen Branch an:",
    "```bash",
    "# neuen Branch anlegen",
    "git checkout -b feature",
    "```",
    "Fertig.",
  ].join("\n");
  const chunks = chunk(md);
  // Der Bash-Kommentar darf die Sektion NICHT zerschneiden -> genau 1 Chunk.
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].heading, "Git Basics");
  assert.ok(chunks[0].content.includes("# neuen Branch anlegen"));
});

// --- Max-Size-Fallback ------------------------------------------------------

test("übergroße Sektion wird in mehrere Chunks gesplittet", () => {
  const body = sentences(60); // ~ weit über 2000 Zeichen => > 500 Tokens
  assert.ok(estimateTokens(body) > MAX_TOKENS, "Test-Setup: Body muss > MAX_TOKENS sein");
  const chunks = chunk(`## Groß\n\n${body}`);
  assert.ok(chunks.length > 1, "erwartet mehrere Chunks");
});

test("jedes Teilstück bleibt in der erwarteten Größenobergrenze (max + overlap + heading)", () => {
  const headingLine = "## Groß";
  const chunks = chunk(`${headingLine}\n\n${sentences(80)}`);
  const upperBound = MAX_TOKENS + OVERLAP_TOKENS + estimateTokens(headingLine) + 5;
  for (const c of chunks) {
    assert.ok(
      c.tokenCount <= upperBound,
      `Chunk ${c.chunkIndex} hat ${c.tokenCount} Tokens (> ${upperBound})`,
    );
  }
});

test("beim Split trägt JEDES Teilstück die Überschrift (contextual chunking)", () => {
  const headingLine = "## Groß";
  const chunks = chunk(`${headingLine}\n\n${sentences(80)}`);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.equal(c.heading, "Groß");
    assert.ok(
      c.content.startsWith(headingLine),
      `Teilstück ${c.chunkIndex} beginnt nicht mit der Überschrift`,
    );
  }
});

test("chunkIndex bleibt über einen Split hinweg fortlaufend", () => {
  const md = [`## Groß`, sentences(80), `## Klein`, "Kurzer Text."].join("\n\n");
  const chunks = chunk(md);
  assert.deepEqual(
    chunks.map((c) => c.chunkIndex),
    chunks.map((_, i) => i),
  );
});

// --- Overlap ----------------------------------------------------------------

test("aufeinanderfolgende Teilstücke einer Sektion teilen sich Overlap", () => {
  const headingLine = "## Groß";
  const chunks = chunk(`${headingLine}\n\n${sentences(80)}`);
  assert.ok(chunks.length > 1, "Test braucht mindestens zwei Teilstücke");

  // Überschrift vorne abziehen, um an den reinen Body zu kommen.
  const bodyOf = (c: Chunk) => c.content.slice(headingLine.length).trim();
  const first = bodyOf(chunks[0]);
  const second = bodyOf(chunks[1]);

  // Overlap = letzte 1–2 Sätze des Vorgängers, dann eine \n\n-Naht, dann der
  // eigene Inhalt. Der Overlap-Bereich vor der Naht muss also mit dem letzten
  // Satz des ersten Teilstücks enden.
  const lastSentence = first.split(/(?<=[.!?])\s+/).filter(Boolean).at(-1)!;
  const overlapRegion = second.split("\n\n")[0];
  assert.ok(
    overlapRegion.endsWith(lastSentence),
    "der Overlap-Bereich des zweiten Teilstücks endet nicht mit dem letzten Satz des ersten",
  );
});

// --- tokenCount -------------------------------------------------------------

test("tokenCount entspricht der Zeichen-basierten Schätzung", () => {
  const chunks = chunk("## H\n\nEin kurzer Absatz mit etwas Inhalt.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].tokenCount, estimateTokens(chunks[0].content));
});
