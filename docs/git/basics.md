# Git: Grundlagen

Git ist ein verteiltes Versionskontrollsystem. Es speichert die Historie eines
Projekts als Folge von Momentaufnahmen (Commits) und erlaubt parallele
Entwicklungslinien.

## Commits

Ein **Commit** hält einen Zustand des Projekts fest — eine Momentaufnahme aller
zum Zeitpunkt gestageten Änderungen, versehen mit Autor, Zeitstempel und einer
Nachricht. Der typische Ablauf:

```bash
git add datei.txt      # Änderung in die Staging-Area
git commit -m "Nachricht"
```

Jeder Commit verweist auf seinen Vorgänger und bekommt eine eindeutige Hash-ID.
So entsteht eine lückenlose, nachvollziehbare Historie.

## Branches

Ein **Branch** ist eine unabhängige Entwicklungslinie — ein beweglicher Zeiger
auf einen Commit. Damit entwickelst du ein Feature isoliert, ohne den
Hauptzweig zu stören:

```bash
git branch feature-x     # neuen Branch anlegen
git switch feature-x     # dorthin wechseln
# oder in einem Schritt:
git switch -c feature-x
```

Branches sind in Git extrem leichtgewichtig — das Anlegen kostet praktisch
nichts.

## Merge und Rebase

Beide führen zwei getrennte Historien wieder zusammen, auf unterschiedliche Art.

Ein **Merge** verbindet zwei Branches mit einem neuen Merge-Commit und erhält die
Historie beider Seiten:

```bash
git switch main
git merge feature-x
```

Ein **Rebase** setzt deine Commits stattdessen neu auf die Spitze des anderen
Branches auf — die Historie wird linear, aber umgeschrieben:

```bash
git switch feature-x
git rebase main
```

Faustregel: Merge für geteilte Branches, Rebase für lokale Aufräumarbeiten.

## Stash

Mit **Stash** legst du unfertige Änderungen kurz beiseite, ohne sie zu committen
— etwa um schnell den Branch zu wechseln:

```bash
git stash        # Änderungen wegpacken, Arbeitsverzeichnis sauber
git stash pop     # später zurückholen
```

Der Stash ist ein Stapel; du kannst mehrere Einträge ablegen und gezielt
zurückholen.

## Änderungen rückgängig machen

Je nachdem, was du zurücknehmen willst, gibt es verschiedene Wege:

- **Einen bereits gemachten Commit rückgängig machen**, ohne die Historie zu
  verändern: `git revert <hash>` erstellt einen neuen Commit, der die Änderung
  umkehrt.
- **Staging aufheben**: `git restore --staged datei.txt`.
- **Lokale Änderungen verwerfen**: `git restore datei.txt`.

`git revert` ist der sichere Weg für bereits geteilte Commits, weil es nichts
umschreibt, sondern eine Gegenbewegung anhängt.
