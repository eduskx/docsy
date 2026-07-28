# JavaScript: Grundlagen

JavaScript ist eine dynamisch typisierte, interpretierte Programmiersprache, die
im Browser und (via Node.js) auf dem Server läuft. Diese Referenz deckt die
Kernkonzepte der Sprache ab.

## Variablen: let, const und var

Variablen werden mit `let`, `const` oder (veraltet) `var` deklariert.

- **`const`** — für Werte, die nicht neu zugewiesen werden. Standardwahl.
- **`let`** — für Werte, die sich ändern.
- **`var`** — funktions-gescoped und veraltet; vermeiden.

```js
const pi = 3.14159;
let zaehler = 0;
zaehler = zaehler + 1;
```

`let` und `const` sind **block-gescoped** (`{ }`), `var` nicht. `const`
verhindert die Neuzuweisung, macht Objekte aber nicht unveränderlich.

## Primitive Datentypen

JavaScript kennt sieben primitive Typen: `string`, `number`, `boolean`,
`null`, `undefined`, `bigint` und `symbol`. Alles andere ist ein `object`.

```js
typeof "text";     // "string"
typeof 42;         // "number"
typeof true;       // "boolean"
typeof undefined;  // "undefined"
```

`null` steht für „bewusst kein Wert", `undefined` für „nicht gesetzt". Zahlen
sind immer Fließkommazahlen (es gibt keinen separaten Integer-Typ außer `bigint`).

## Objekte

Ein Objekt ist eine Sammlung von Schlüssel-Wert-Paaren.

```js
const user = {
  name: "Ada",
  alter: 36,
  gruessen() {
    return `Hallo, ${this.name}`;
  },
};

user.name;        // "Ada"
user["alter"];    // 36
```

Auf Eigenschaften greift man per Punkt- oder Klammer-Notation zu. `this`
verweist innerhalb einer Methode auf das Objekt.

## Arrays

Ein Array ist eine geordnete Liste. Die wichtigsten Methoden sind funktional
(sie erzeugen neue Arrays statt zu mutieren):

```js
const zahlen = [1, 2, 3, 4];
zahlen.map((n) => n * 2);        // [2, 4, 6, 8]
zahlen.filter((n) => n % 2 === 0); // [2, 4]
zahlen.reduce((summe, n) => summe + n, 0); // 10
```

`push`/`pop` und `shift`/`unshift` mutieren dagegen das Array. `find`, `some`,
`every` und `includes` durchsuchen es.

## Funktionen

Funktionen sind in JavaScript Werte (First-Class): man kann sie in Variablen
speichern, übergeben und zurückgeben.

```js
function addiere(a, b) {
  return a + b;
}

const multipliziere = function (a, b) {
  return a * b;
};
```

Parameter können Default-Werte haben (`function f(x = 1)`), und der
Rest-Parameter (`...args`) sammelt beliebig viele Argumente in ein Array.

## Arrow Functions

Arrow Functions sind eine kürzere Schreibweise. Sie haben **kein eigenes
`this`**, sondern übernehmen es aus dem umgebenden Kontext — praktisch in
Callbacks.

```js
const quadrat = (x) => x * x;
const summe = (a, b) => a + b;
zahlen.forEach((n) => console.log(n));
```

Bei einer einzelnen Ausdrucks-Rückgabe kann man `return` und geschweifte
Klammern weglassen.

## Kontrollfluss

Bedingungen mit `if`/`else` und `switch`, Schleifen mit `for`, `while` und
`for...of`:

```js
for (const n of zahlen) {
  if (n > 2) {
    console.log(n);
  }
}
```

`for...of` iteriert über Werte (Arrays, Strings), `for...in` über Schlüssel.
Wichtig: In Vergleichen `===` (strikt) statt `==` (mit Typumwandlung) nutzen.

## Destrukturierung und Spread

Destrukturierung entpackt Werte aus Arrays oder Objekten in Variablen:

```js
const [erstes, zweites] = zahlen;
const { name, alter } = user;
```

Der Spread-Operator (`...`) kopiert bzw. verteilt Elemente:

```js
const kopie = [...zahlen];
const zusammen = { ...user, aktiv: true };
```

## Klassen

Klassen sind syntaktischer Zucker über der Prototyp-Vererbung.

```js
class Tier {
  constructor(name) {
    this.name = name;
  }
  sprechen() {
    return `${this.name} macht ein Geräusch`;
  }
}

class Hund extends Tier {
  sprechen() {
    return `${this.name} bellt`;
  }
}
```

`extends` erbt von einer Basisklasse, `super()` ruft deren Konstruktor auf.

## Module: import und export

Code wird über ES-Module organisiert. Man exportiert Werte und importiert sie
anderswo:

```js
// mathe.js
export function addiere(a, b) {
  return a + b;
}
export const pi = 3.14159;

// app.js
import { addiere, pi } from "./mathe.js";
```

Ein `export default` erlaubt einen Standard-Export pro Datei, der beim Import
ohne geschweifte Klammern benannt wird.

## Fehlerbehandlung

Fehler wirft man mit `throw` und fängt sie mit `try`/`catch`:

```js
function teile(a, b) {
  if (b === 0) {
    throw new Error("Division durch null");
  }
  return a / b;
}

try {
  teile(10, 0);
} catch (fehler) {
  console.error(fehler.message);
}
```

Der optionale `finally`-Block läuft immer — egal ob ein Fehler auftrat oder
nicht.

## Asynchronität

Langlaufende Operationen (Netzwerk, Timer) laufen asynchron über Promises und
`async`/`await`. Eine `async`-Funktion gibt ein Promise zurück; `await`
pausiert, bis es aufgelöst ist:

```js
async function ladeDaten() {
  const antwort = await fetch("/api/daten");
  return antwort.json();
}
```

Details zu Promises, Fehlerbehandlung mit `try`/`catch` und paralleler
Ausführung mit `Promise.all` behandelt die separate async/await-Dokumentation.
