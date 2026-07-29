"use client";

import { useSyncExternalStore } from "react";

/**
 * Schaltet zwischen Hell- und Dunkelmodus. Die Wahrheit über das aktuelle Theme
 * lebt außerhalb von React (die `.dark`-Klasse auf <html>), daher lesen wir sie
 * über useSyncExternalStore statt über useState/useEffect — der saubere Weg für
 * externen State und ohne set-state-in-effect. Der Initialzustand wird vom
 * Anti-Flash-Script im Layout gesetzt; hier wird er nur ge­lesen und getoggelt.
 */

const THEME_EVENT = "themechange";

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

// Auf dem Server ist das DOM unbekannt -> hell annehmen (das Icon korrigiert
// sich nach der Hydration; die Klasse selbst setzt bereits das Script vorab).
function getServerSnapshot() {
  return false;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Hell/Dunkel umschalten"
      aria-label={dark ? "Zu hellem Modus wechseln" : "Zu dunklem Modus wechseln"}
      className="flex items-center justify-center rounded-lg border border-neutral-300 p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      {/* Flache Stroke-Icons (currentColor). Kann zwischen SSR und Client kurz
          abweichen -> Hydration-Warnung am Wrapper unterdrücken. */}
      <span suppressHydrationWarning className="flex">
        {dark ? (
          // Sonne
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        ) : (
          // Mond
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </span>
    </button>
  );
}
