# docsy

Ein Wissensassistent für Entwickler-Dokumentation. Du stellst deine Frage in
natürlicher Sprache und bekommst eine Antwort mit Quellenangabe: welche
Doku-Stelle die Antwort trägt, direkt aufklappbar zum Nachprüfen. Als
Standard-Bibliothek liegen die offiziellen MDN-Dokus zu HTML, CSS und
JavaScript bereit. Wer sich anmeldet, speist zusätzlich eigene Markdown-Dokumente
ein.

## Stack

- Next.js 16 mit TypeScript (App Router, gestreamte Antworten)
- PostgreSQL mit pgvector auf Neon für Embeddings und die hybride Suche
- Voyage AI (`voyage-3.5`, 1024 Dimensionen) für die Embeddings
- Groq (`llama-3.3-70b-versatile`) für die Antwort-Generierung im Stream
- Auth.js (NextAuth v5) für Login und Gast-Modus

## Wie es funktioniert

Eine RAG-Pipeline hat vier Stellen, an denen sich die Qualität entscheidet. Jede
liegt in einer eigenen Datei:

| # | Stelle | Datei |
|---|--------|-------|
| 1 | Chunking. Schneidet an Überschriften, splittet zu lange Abschnitte mit Overlap und zieht die Überschrift ins Embedding. | [`src/lib/ingest/chunk.ts`](src/lib/ingest/chunk.ts) |
| 2 | Embedding-Call. Voyage über REST, in Batches, mit Retry und Backoff bei 429 und 5xx. | [`src/lib/embed.ts`](src/lib/embed.ts) |
| 3 | Hybride Suche. pgvector nach Cosinus plus Postgres-Volltext, zusammengeführt per Reciprocal Rank Fusion. | [`src/lib/retrieval/search.ts`](src/lib/retrieval/search.ts) |
| 4 | Evaluation. Testfragen mit bekannter Gold-Quelle, gemessen auf zwei Ebenen. | [`scripts/evaluate.ts`](scripts/evaluate.ts) |

## Standard-Bibliothek (MDN)

Die MDN-Dokus kommen als tausende `index.md`-Dateien und werden einmal unter
`user_id = "seed"` eingespeist. Diesen Korpus durchsucht jeder Nutzer zusätzlich
zur eigenen Bibliothek. Der Ordner `mdn/` bleibt aus dem Repo draußen (CC-BY-SA,
28 MB) und wird lokal über `npm run ingest:mdn` eingespeist.

## Design-Entscheidungen

**MDN-Vorverarbeitung** ([`src/lib/ingest/preprocessMdn.ts`](src/lib/ingest/preprocessMdn.ts)).
MDN-Markdown steckt voller Macros wie `{{cssxref("color")}}` oder `{{Compat}}` und
trägt YAML-Frontmatter. Roh eingespeist landen kaputte Platzhalter in den Chunks
und ziehen das Retrieval runter. Die Vorverarbeitung arbeitet in zwei Stufen:
Referenz-Macros geben ihren inneren Fachbegriff frei (`color`,
`Array.prototype.map()`), Block-Macros fliegen ganz raus. Der `slug` aus dem
Frontmatter wird zum `source_path` und damit zum Zitier-Schlüssel und Deep-Link
auf `developer.mozilla.org/en-US/docs/{slug}`. Über den ganzen Korpus von 2833
Seiten bleibt kein einziges Macro übrig.

**Die Volltext-Config folgt der Sprache des Inhalts, nicht der Frage.** Der Korpus
ist englisch, die Fragen sind deutsch. Postgres-FTS auf `'german'` stemmt den
englischen Text falsch. Dazu verknüpft `plainto_tsquery` alle Terme mit UND,
sodass ein deutsches Füllwort jeden Treffer abwürgt. Die Lösung:
`to_tsvector('english', …)` und eine ODER-tsquery auf der Query-Seite. So reicht
ein einzelner Fachbegriff wie `reviver` oder `z-index`, um den passenden Chunk
hochzuziehen. Das Ganze läuft über einen GIN-Expression-Index statt über eine
materialisierte Spalte und spart so Speicher, weil der HNSW-Index die DB nah ans
Neon-Limit bringt.

**Die Evaluation misst zwei Ebenen.** Eine einzige strikte Metrik über Seite und
Abschnitt würde „richtige Seite, Nachbar-Abschnitt" genauso hart abwerten wie
einen kompletten Fehlgriff und damit das Bild verzerren. Deshalb getrennt:

| Ebene | Bedeutung | Hit@1 | Hit@3 | Hit@5 | MRR |
|-------|-----------|:-----:|:-----:|:-----:|:---:|
| Dokument | richtige Quellseite, also die Zitier-Qualität | 79 % | 92 % | 96 % | 0,86 |
| Sektion | exakt richtiger Abschnitt, die Feinschärfe | 54 % | 67 % | 71 % | 0,61 |

24 Testfragen über CSS, HTML und JavaScript, hybride Suche. Für die
Zitier-Qualität zählt die Dokument-Ebene. Die Sektions-Ebene ist die offen
ausgewiesene Grenze: dort verdrängen Intro- und Syntax-Chunks die spezifischen
Abschnitte.

## Auth und Gast-Modus

Der Login läuft über GitHub. Die User-ID hängt an der GitHub-Profil-ID, damit
Bibliothek und Verlauf über Ab- und Anmelden hinweg erhalten bleiben. Wer ohne
Konto testen will, bekommt einen Gast-Zugang mit flüchtiger ID. Für Gäste gelten
Grenzen: höchstens 3 Dokumente, 50 KB pro Datei, 20 Fragen pro Stunde, und nach
24 Stunden räumt die App die Gast-Daten wieder ab. Das 50-KB-Limit gilt auch für
angemeldete Nutzer.

## Setup

```bash
npm install
cp .env.example .env      # DATABASE_URL, VOYAGE_API_KEY, GROQ_API_KEY, Auth-Keys eintragen
npm run db:migrate        # Schema, pgvector und Indizes anlegen
npm run ingest:mdn        # MDN-Korpus einspeisen (einmalig)
npm run dev
```

In Produktion läuft die App auf Vercel mit Neon als Datenbank.

### Scripts

| Befehl | Zweck |
|--------|-------|
| `npm run db:migrate` | `db/schema.sql` gegen die DB ausführen (idempotent) |
| `npm run ingest:mdn` | MDN-Korpus einspeisen, mit `-- --skip-existing` zum Fortsetzen |
| `npm run eval` | Retrieval-Qualität auf zwei Ebenen messen |
| `npm test` | Unit-Tests für Chunking und MDN-Vorverarbeitung |
