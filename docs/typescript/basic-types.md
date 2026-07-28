# TypeScript: Grundlegende Typen

TypeScript erweitert JavaScript um ein statisches Typsystem. Typen werden zur
Entwicklungszeit geprüft und verschwinden beim Kompilieren — zur Laufzeit läuft
reines JavaScript.

## Primitive Typen

Die Basis bilden `string`, `number` und `boolean`. Typen werden mit Doppelpunkt
annotiert, sind aber oft dank Inferenz überflüssig:

```ts
let name: string = "Ada";
let age = 36; // inferiert als number
let active: boolean = true;
```

Besondere Typen sind `null` und `undefined` sowie `any` (schaltet die Prüfung
ab — vermeiden) und `unknown` (typsicherer Ersatz für `any`).

## Arrays und Tupel

Ein Array hält beliebig viele Werte desselben Typs, geschrieben als `Typ[]`:

```ts
const scores: number[] = [10, 20, 30];
```

Ein **Tupel** ist ein Array fester Länge, bei dem jede Position einen eigenen Typ
hat — nützlich, wenn Reihenfolge und Anzahl bekannt sind:

```ts
const point: [number, number] = [12, 5];
const entry: [string, number] = ["age", 36];
```

## Interfaces und Type Aliases

Beide beschreiben die Struktur eines Objekts — welche Felder es hat und welche
Typen diese tragen. `interface` ist erweiterbar, `type` flexibler:

```ts
interface User {
  id: number;
  name: string;
  email?: string; // optional
}

type Point = { x: number; y: number };
```

Faustregel: `interface` für Objekt-Formen, `type` für alles andere (Unions,
Funktionssignaturen, Aliase).

## Union- und Intersection-Typen

Ein **Union**-Typ erlaubt, dass ein Wert *einer von mehreren* Typen ist —
geschrieben mit `|`. Gut, wenn eine Variable z.B. Text *oder* Zahl sein darf:

```ts
let id: string | number;
id = "abc";
id = 42;
```

Ein **Intersection**-Typ (`&`) kombiniert mehrere Typen zu einem, der *alle*
Eigenschaften hat.

## Generics

Ein **Generic** macht eine Funktion oder einen Typ wiederverwendbar für
*beliebige* Typen, ohne die Typsicherheit zu verlieren. Der Platzhalter (meist
`T`) wird beim Aufruf konkret gefüllt:

```ts
function first<T>(items: T[]): T {
  return items[0];
}

const n = first([1, 2, 3]);   // T = number
const s = first(["a", "b"]);  // T = string
```

So arbeitet dieselbe Funktion mit jedem Element-Typ und liefert trotzdem den
exakten Rückgabetyp.

## Type Narrowing

Innerhalb eines `if`-Blocks kann TypeScript einen Union-Typ auf einen konkreten
Typ **einengen** (narrowing), z.B. über `typeof`:

```ts
function print(value: string | number) {
  if (typeof value === "string") {
    value.toUpperCase(); // hier ist value ein string
  } else {
    value.toFixed(2);    // hier ist value eine number
  }
}
```

TypeScript versteht die Prüfung und weiß im jeweiligen Zweig den genauen Typ.
