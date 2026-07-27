# Asynchrones JavaScript: Promises und async/await

JavaScript ist single-threaded. Damit langlaufende Operationen — Netzwerk-Requests,
Datei-Zugriffe, Timer — den einzigen Thread nicht blockieren, laufen sie
asynchron. Das Ergebnis kommt später, nicht sofort.

## Das Problem: Callbacks

Früher wurde Asynchronität über Callback-Funktionen gelöst. Eine Funktion nimmt
einen Callback entgegen, der aufgerufen wird, sobald das Ergebnis da ist.

```js
readFile("data.txt", function (err, data) {
  if (err) {
    handleError(err);
    return;
  }
  process(data);
});
```

Verschachtelt man mehrere solcher Aufrufe, entsteht die berüchtigte "Callback Hell":
tief eingerückter Code, bei dem Fehlerbehandlung in jeder Ebene wiederholt werden
muss. Der Kontrollfluss ist schwer zu lesen.

## Promises

Ein Promise ist ein Objekt, das einen zukünftigen Wert repräsentiert. Es befindet
sich in genau einem von drei Zuständen:

- **pending** — das Ergebnis steht noch aus.
- **fulfilled** — die Operation war erfolgreich, ein Wert liegt vor.
- **rejected** — die Operation ist fehlgeschlagen, ein Fehler liegt vor.

Ein Promise wechselt genau einmal von `pending` zu `fulfilled` oder `rejected`
und bleibt danach unverändert (es "settelt").

### Verkettung mit then

Mit `.then()` reagiert man auf Erfolg, mit `.catch()` auf Fehler. Da `.then()`
selbst wieder ein Promise zurückgibt, lassen sich Aufrufe verketten:

```js
fetch("/api/user")
  .then((response) => response.json())
  .then((user) => console.log(user.name))
  .catch((error) => console.error("Fehlgeschlagen:", error));
```

Ein einziger `.catch()` am Ende fängt Fehler aus allen vorherigen Schritten der
Kette. Das ist ein wesentlicher Vorteil gegenüber Callbacks, wo jede Ebene ihre
eigene Fehlerbehandlung braucht.

## async/await

`async`/`await` ist syntaktischer Zucker über Promises. Er lässt asynchronen Code
aussehen und sich lesen wie synchronen — ohne die Verkettung.

Eine mit `async` markierte Funktion gibt immer ein Promise zurück. Innerhalb einer
solchen Funktion pausiert `await` die Ausführung, bis das erwartete Promise
gesettelt ist, und liefert dann dessen Wert.

```js
async function loadUser() {
  const response = await fetch("/api/user");
  const user = await response.json();
  return user;
}
```

### Fehlerbehandlung mit try/catch

Weil `await` bei einem rejecteten Promise den Fehler wirft, nutzt man das normale
`try`/`catch` — dasselbe Konstrukt wie bei synchronem Code:

```js
async function loadUser() {
  try {
    const response = await fetch("/api/user");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Konnte User nicht laden:", error);
    return null;
  }
}
```

Ein häufiger Fehler ist, das `await` zu vergessen: Dann arbeitet der Code mit dem
Promise-Objekt selbst statt mit dem aufgelösten Wert, und ein `try`/`catch` fängt
den späteren Fehler nicht mehr.

## Parallel statt seriell: Promise.all

Mehrere `await` hintereinander laufen **seriell** — jeder wartet auf den
vorherigen. Sind die Operationen voneinander unabhängig, ist das verschwendete
Zeit. `Promise.all` startet sie gleichzeitig und wartet auf alle:

```js
const [user, posts] = await Promise.all([
  fetch("/api/user").then((r) => r.json()),
  fetch("/api/posts").then((r) => r.json()),
]);
```

`Promise.all` rejectet, sobald **ein** Promise rejectet. Soll stattdessen auf alle
gewartet werden — egal ob Erfolg oder Fehler — nutzt man `Promise.allSettled`.

## Zusammenfassung

| Ansatz         | Lesbarkeit | Fehlerbehandlung        |
| -------------- | ---------- | ----------------------- |
| Callbacks      | schlecht   | pro Ebene wiederholt    |
| Promises       | mittel     | ein `.catch()` am Ende  |
| async/await    | gut        | vertrautes `try`/`catch`|

Unter der Haube bleibt alles ein Promise. `async`/`await` ändert nur, wie der Code
geschrieben und gelesen wird — nicht, was tatsächlich passiert.
