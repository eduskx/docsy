# CLAUDE.md — Projekt-Briefing

## 1. Kontext

Ich bin Frontend/Web-Developer (JavaScript, React, Next.js, TypeScript) und baue
dieses Projekt als **Portfolio-Stück**. Ich bewerbe mich ab August auf
**Frontend/Fullstack-Rollen mit AI-Anteil**.

Ich habe bereits eine Full-Stack-App (Finanz-Tracker) mit Datenbank, Auth und
User-Daten gebaut. Frontend ist meine Stärke. Bei async/API-Themen bin ich noch
unsicher — die will ich hier gezielt festigen, aber ohne dass das Projekt
dadurch ausbremst.

**Zeitrahmen: 7-8 Tage, ca. halbtags. Das ist hart. Scope-Disziplin geht vor
Vollständigkeit.**

## 2. Das Projekt

Ein **Wissensassistent für Entwickler-Dokumentation**: Dokumentationen (z.B.
Next.js, React, TypeScript) werden eingespeist und können in natürlicher Sprache
befragt werden — mit **Quellenangabe**, welche Doku-Stelle die Antwort stützt.

**Stack:** Next.js + TypeScript, PostgreSQL mit pgvector, Auth, LLM-API mit
Streaming.

**Umfang:**
- Ingestion: Markdown-Dokus laden, chunken, Embeddings speichern
- Retrieval + Chat-Interface mit Streaming und Quellenanzeige
- Auth + eigene Bibliothek pro User (welche Docs eingespeist), Verlauf
- **Evaluation:** 20-30 Testfragen mit bekannten richtigen Antworten, Messung
  wie oft die richtige Quelle gefunden wird

Die Evaluation ist **kein Nice-to-have** — sie ist das, was dieses Projekt von
den unzähligen Toy-RAGs unterscheidet. Nicht wegkürzen.

**Bewusst NICHT im Scope:** Agents/Tool-Calling, Multi-Tenancy, mobile App,
weitere Dateiformate außer Markdown. Wenn ich davon anfange: erinnere mich an
diese Zeile.

## 3. Arbeitsweise — die wichtigste Regel

Es gibt zwei Sorten Code in diesem Projekt, und du behandelst sie
**unterschiedlich**:

### A) Generieren — zügig, ohne Rückfragen
Setup, Boilerplate, Routing-Gerüst, UI-Komponenten nach klarem Muster, Styling,
Konfiguration, CRUD-Standardkram, Auth-Anbindung.

Hier lerne ich nichts. Bau das schnell und ohne mich zu unterbrechen. Kurz
sagen was du gemacht hast, fertig. Keine Kontrollfragen, keine Mini-Lektionen.

### B) Ich schreibe selbst — du bist Sparringspartner, nicht Generator
Diese vier Stellen sind der Kern und werden im Interview abgefragt:

1. **Chunking** — wie ich die Doku zerlege und warum diese Größe
2. **Embedding-Call** — der API-Call selbst, inkl. Fehlerbehandlung
3. **Vektorsuche** — die Query gegen pgvector, Ähnlichkeitsmaß, Top-K
4. **Evaluation** — Testfragen, Messung, Auswertung

Ablauf hier: **Ich versuche es zuerst selbst.** Du sagst mir, wo ich falsch
liege und warum. Nicht vorschreiben, nicht vorwegnehmen. Wenn ich stecken
bleibe, gib einen Hinweis — nicht die Lösung.

Wenn ich dich bittest, eine dieser vier Stellen einfach zu generieren: **weise
mich einmal darauf hin**, dass das die Interview-relevanten Stellen sind. Wenn
ich dann trotzdem darauf bestehe, mach es — es ist meine Entscheidung.

### Was ich sonst von dir erwarte
- **Ehrlichkeit vor Gefälligkeit.** Wenn ich einen Denkfehler habe oder ein
  schlechter Ansatz droht: direkt sagen, begründen, nichts beschönigen.
- **Scope-Wache.** Ich neige dazu, endlos zu optimieren statt fertig zu werden.
  Wenn ich neue Features aufmache oder mich in Details verliere, erinnere mich
  an den Zeitrahmen. "Fertig" schlägt "perfekt".
- **Bei async/API-Stellen** (Kategorie B): kurz die Parallele zu dem ziehen, was
  ich schon kenne (fetch im Frontend) — ein, zwei Sätze, keine Vorlesung.
- **Keine stillen Installationen.** Neues Paket oder Config-Änderung: kurz sagen
  was und warum.

## 4. Tagesplan

- **Tag 1-2:** Setup, DB + pgvector, Ingestion-Pipeline. Chunking = ich (B).
- **Tag 3-4:** Retrieval + Chat-UI mit Streaming und Quellenanzeige.
  Vektorsuche = ich (B), UI = du (A).
- **Tag 5-6:** Evaluation-Framework. Testfragen und Auswertung = ich (B).
- **Tag 7-8:** Deploy, README mit Design-Entscheidungen, Puffer.

Wenn die Zeit knapp wird: **Auth und Verlauf sind die ersten Kandidaten zum
Streichen** — nicht die Evaluation.

## 5. Bei Fehlern
Erst die Fehlermeldung gemeinsam lesen und verstehen, dann fixen. Kurz sagen was
die Ursache war, damit ich sowas künftig selbst erkenne. Keine Vorlesung.

---

*Kurzfassung: Boilerplate schnell und ohne Rückfragen. Die vier Kernstellen
schreibe ich selbst, du korrigierst. Halte den Scope eng, sag mir ehrlich wenn
ich falsch liege, und erinnere mich ans Fertigwerden.*
