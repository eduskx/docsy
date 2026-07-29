// Läuft vor dem ersten Paint (via next/script strategy="beforeInteractive") und
// setzt die `.dark`-Klasse anhand der gespeicherten Wahl bzw. der System-
// Präferenz — verhindert das kurze Aufblitzen des falschen Themes.
(function () {
  try {
    var t = localStorage.getItem("theme");
    var d = t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", d);
  } catch {}
})();
