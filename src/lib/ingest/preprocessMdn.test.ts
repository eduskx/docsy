import { test } from "node:test";
import assert from "node:assert/strict";
import { preprocessMdn, stripMacros } from "./preprocessMdn.ts";

/**
 * Unit-Tests für die MDN-Vorverarbeitung. Laufen ohne DB/Netz über den
 * eingebauten node:test-Runner (`npm test`).
 *
 * Geprüft werden die bewussten Entscheidungen aus preprocessMdn.ts:
 *  - Frontmatter abtrennen + title/slug/page-type auslesen
 *  - Referenz-Macros behalten inneren Begriff, Block-Macros verschwinden
 *  - escapte \{{...}} und unbekannte Macros werden gestrippt
 */

// --- Frontmatter ------------------------------------------------------------

test("Frontmatter wird abgetrennt und die drei Felder ausgelesen", () => {
  const raw = [
    "---",
    'title: "`color` CSS property"',
    "slug: Web/CSS/Reference/Properties/color",
    "page-type: css-property",
    "sidebar: cssref",
    "---",
    "",
    "Der Body-Text.",
  ].join("\n");
  const doc = preprocessMdn(raw);
  assert.equal(doc.title, "color CSS property"); // Quotes + Backticks entfernt
  assert.equal(doc.slug, "Web/CSS/Reference/Properties/color");
  assert.equal(doc.pageType, "css-property");
  assert.ok(doc.markdown.includes("Der Body-Text."));
  assert.ok(!doc.markdown.includes("slug:")); // Frontmatter nicht im Body
});

test("ohne Frontmatter bleiben die Felder null und der Body erhalten", () => {
  const doc = preprocessMdn("Nur Text, kein Header.");
  assert.equal(doc.title, null);
  assert.equal(doc.slug, null);
  assert.equal(doc.pageType, null);
  assert.equal(doc.markdown, "Nur Text, kein Header.");
});

// --- Macro-Behandlung -------------------------------------------------------

test("Referenz-Macros behalten den inneren Fachbegriff", () => {
  assert.equal(stripMacros('siehe {{cssxref("color")}} hier'), "siehe color hier");
  assert.equal(
    stripMacros('nutze {{jsxref("Array.prototype.map")}}.'),
    "nutze Array.prototype.map.",
  );
});

test("Argumente mit runden Klammern brechen den Match nicht ab", () => {
  // Der häufigste Fallstrick: Methoden-Namen mit () im Argument.
  assert.equal(stripMacros('{{jsxref("Array.prototype.map()")}}'), "Array.prototype.map()");
  assert.equal(stripMacros('{{InteractiveExample("Demo: Array.unshift()")}} rest').trim(), "rest");
});

test("Element-Macros werden zu spitzen Klammern", () => {
  assert.equal(stripMacros('das {{HTMLElement("div")}}-Element'), "das <div>-Element");
});

test("Groß-/Kleinschreibung des Macro-Namens ist egal", () => {
  assert.equal(stripMacros('{{CSSxRef("gap")}}'), "gap");
});

test("Block-/Render-Macros verschwinden ersatzlos", () => {
  assert.equal(stripMacros("Text.\n\n{{Compat}}\n\n{{Specifications}}\n\nMehr.").trim(), "Text.\n\nMehr.");
});

test("escapte und unbekannte Macros werden gestrippt", () => {
  // Nur der Macro verschwindet; interne Doppel-Leerzeichen werden bewusst
  // NICHT kollabiert (nur trailing Whitespace + 3+ Newlines räumt stripMacros auf).
  assert.equal(stripMacros("a \\{{Compat}} b"), "a  b");
  assert.equal(stripMacros("x {{UnbekanntesMacro}} y"), "x  y");
});

test("Annotation-Macros werden zu kurzem Klartext", () => {
  assert.equal(stripMacros("foo {{deprecated_inline}}"), "foo (deprecated)");
});

test("mehrere überlange Leerzeilen nach Block-Entfernung werden kollabiert", () => {
  const out = stripMacros("A\n\n{{EmbedLiveSample('x')}}\n\n\n\nB");
  assert.equal(out, "A\n\nB");
});
