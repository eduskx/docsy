# docsy — Wissensassistent für Entwickler-Dokumentation

Stelle natürlichsprachige Fragen an Entwickler-Dokumentationen und bekomme
Antworten **mit Quellenangabe** — welche Doku-Stelle die Antwort stützt. Als
eingebaute Standard-Bibliothek dienen die offiziellen **MDN**-Dokus (HTML, CSS,
JavaScript); angemeldete Nutzer können zusätzlich eigene Markdown-Dokus
einspeisen.

## Stack

- **Next.js 16 + TypeScript** (App Router, Streaming)
- **PostgreSQL + pgvector** (Neon) — Embeddings & hybride Suche
- **Voyage AI** (`voyage-3.5`, 1024 Dim) — Embeddings
- **Auth.js (NextAuth v5)** — Login + Gast-Modus mit Limits
- LLM-API mit Streaming für die Antwort-Generierung

## Architektur

Die vier Kernstellen einer RAG-Pipeline, jeweils bewusst entworfen:

| # | Stelle | Datei |
|---|--------|-------|
| 1 | **Chunking** — structure-aware an Überschriften, Größen-Fallback mit Overlap, contextual chunking (Überschrift im Embedding) | [`src/lib/ingest/chunk.ts`](src/lib/ingest/chunk.ts) |
| 2 | **Embedding-Call** — Voyage REST, Batching, Retry mit Backoff bei 429/5xx | [`src/lib/embed.ts`](src/lib/embed.ts) |
| 3 | **Hybride Suche** — pgvector (Cosinus) + Volltext, fusioniert per Reciprocal Rank Fusion | [`src/lib/retrieval/search.ts`](src/lib/retrieval/search.ts) |
| 4 | **Evaluation** — Testfragen mit bekannter Gold-Quelle, Retrieval-Qualität auf zwei Ebenen | [`scripts/evaluate.ts`](scripts/evaluate.ts) |

## Standard-Bibliothek (MDN)

Die MDN-Dokus liegen als tausende `index.md` vor und werden einmalig unter
`user_id = "seed"` eingespeist — dieser Korpus wird für **jeden** Nutzer
zusätzlich zur eigenen Bibliothek durchsucht. Der Ordner `mdn/` ist bewusst
**nicht** eingecheckt (CC-BY-SA-Inhalt, 28 MB); er wird lokal gehalten und über
`npm run ingest:mdn` eingespeist.

## Design-Entscheidungen

**MDN-Vorverarbeitung** ([`src/lib/ingest/preprocessMdn.ts`](src/lib/ingest/preprocessMdn.ts)).
MDN-Markdown steckt voller Macros (`{{cssxref("color")}}`, `{{Compat}}`, …) und
YAML-Frontmatter. Roh belassen landen kaputte Platzhalter in den Chunks und
verschlechtern das Retrieval. Die Vorverarbeitung ist zweistufig statt „alles
wegwerfen": Referenz-Macros behalten ihren inneren Fachbegriff (`color`,
`Array.prototype.map()`), Block-Macros verschwinden ganz. Der `slug` aus dem
Frontmatter wird als `source_path` zum Zitier-Schlüssel und Deep-Link
(`developer.mozilla.org/en-US/docs/{slug}`). Über den ganzen Korpus (2833 Seiten)
bleiben so **0** Rest-Macros.

**Volltext-Config passt zur Sprache des Inhalts, nicht der Frage.** Der Korpus
ist englisch, die Fragen sind deutsch. Postgres-FTS auf `'german'` stemmt den
englischen Text falsch; zusätzlich UND-verknüpft `plainto_tsquery` alle Terme,
sodass deutsche Füllwörter jeden Treffer abwürgen. Lösung: `to_tsvector('english', …)`
plus eine **ODER-tsquery** auf der Query-Seite — so zieht ein einzelner
Fachbegriff-Anker (`reviver`, `z-index`) den Chunk hoch. Umgesetzt als
GIN-**Expression-Index** statt materialisierter Spalte (spart Speicher, da die
DB durch den HNSW-Index nah am Neon-Limit liegt).

**Evaluation misst zwei Ebenen.** Eine einzige strikte Metrik `(Seite + Abschnitt)`
würde „richtige Seite, Nachbar-Abschnitt" wie „komplett daneben" werten und die
Qualität verzerren. Deshalb getrennt:

| Ebene | Bedeutung | Hit@1 | Hit@3 | Hit@5 | MRR |
|-------|-----------|:-----:|:-----:|:-----:|:---:|
| **Dokument** | richtige Quellseite (= Zitier-Qualität) | 79 % | 92 % | **96 %** | 0,86 |
| **Sektion** | exakt richtiger Abschnitt (Feinschärfe) | 54 % | 67 % | 71 % | 0,61 |

*(24 Testfragen über CSS/HTML/JS, hybride Suche.)* Die Dokument-Ebene ist das
maßgebliche Zitier-Kriterium; die Sektions-Ebene ist die bewusst ausgewiesene
Limitierung — Intro- und Syntax-Chunks verdrängen dort spezifische Abschnitte.

## Setup

```bash
npm install
cp .env.example .env      # DATABASE_URL, VOYAGE_API_KEY, Auth-Keys eintragen
npm run db:migrate        # Schema + pgvector + Indizes anlegen
npm run ingest:mdn        # MDN-Standardkorpus einspeisen (einmalig)
npm run dev
```

### Wichtige Scripts

| Befehl | Zweck |
|--------|-------|
| `npm run db:migrate` | `db/schema.sql` gegen die DB ausführen (idempotent) |
| `npm run ingest:mdn` | MDN-Korpus einspeisen (`-- --skip-existing` für Resume) |
| `npm run ingest` | eigene Markdown-Dateien aus `docs/` einspeisen |
| `npm run eval` | Retrieval-Qualität messen (zwei Ebenen) |
| `npm test` | Unit-Tests (Chunking, MDN-Vorverarbeitung) |
