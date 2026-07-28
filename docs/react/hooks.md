# React Hooks

Hooks sind Funktionen, mit denen Funktionskomponenten Zustand und weitere
React-Features nutzen können — ohne Klassen. Sie beginnen per Konvention mit
`use`.

## useState

`useState` hält einen Wert fest, der sich über die Zeit ändert und bei einer
Änderung ein **Re-Render** der Komponente auslöst. Er gibt den aktuellen Wert
und eine Setter-Funktion zurück:

```jsx
const [count, setCount] = useState(0);

return <button onClick={() => setCount(count + 1)}>{count}</button>;
```

Der Startwert wird nur beim ersten Render verwendet. Der Setter ersetzt den
Wert und plant ein neues Render ein.

## useEffect

`useEffect` führt einen **Nebeneffekt** aus — etwas, das außerhalb des reinen
Renderns passiert, z.B. Daten laden, ein Abo aufsetzen oder das DOM anfassen.
Das Dependency-Array steuert, *wann* der Effekt läuft:

```jsx
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id); // Cleanup
}, []); // leeres Array = nur einmal nach dem Mount
```

Ändert sich ein Wert im Dependency-Array, läuft der Effekt erneut. Die
zurückgegebene Funktion räumt vor dem nächsten Lauf (oder beim Unmount) auf.

## useContext

`useContext` liest einen Wert aus einem React-Context — nützlich, um Daten
**tief durch den Komponentenbaum** zu reichen, ohne Props über viele Ebenen
durchzuschleifen ("prop drilling"):

```jsx
const theme = useContext(ThemeContext);
```

Der nächste passende Provider weiter oben im Baum liefert den Wert.

## useMemo und useCallback

`useMemo` merkt sich das **Ergebnis einer teuren Berechnung** und rechnet nur
neu, wenn sich eine Abhängigkeit ändert — statt bei jedem Render:

```jsx
const sorted = useMemo(() => expensiveSort(items), [items]);
```

`useCallback` macht dasselbe für *Funktionen*, damit Kind-Komponenten nicht
unnötig neu rendern. Beides sind Optimierungen — nicht per Default nötig.

## Eigene Hooks (Custom Hooks)

Wiederkehrende Hook-Logik lässt sich in eine eigene `use`-Funktion auslagern und
wiederverwenden. Ein Custom Hook ist einfach eine Funktion, die andere Hooks
aufruft:

```jsx
function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}
```

## Die Rules of Hooks

Hooks unterliegen zwei festen Regeln:

1. **Nur auf oberster Ebene aufrufen** — niemals in Schleifen, Bedingungen oder
   verschachtelten Funktionen. React ordnet Hooks über ihre Aufrufreihenfolge zu.
2. **Nur aus React-Funktionen** — aus Komponenten oder anderen Hooks, nicht aus
   normalen JavaScript-Funktionen.

Verstößt man dagegen, verliert React die Zuordnung des Zustands und es kommt zu
schwer auffindbaren Fehlern.
