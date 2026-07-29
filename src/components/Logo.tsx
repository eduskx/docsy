/**
 * docsy-Logo: ein Dokument mit kleinem Wissens-Graphen (Knoten) auf einer
 * Indigo-Kachel. Motiv „Dokument + KI/Vektorsuche" — dieselbe Grafik liegt als
 * Favicon in app/icon.svg. Rein dekorativ (die Wortmarke „docsy" liefert den
 * Namen) -> aria-hidden.
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect width="32" height="32" rx="7" fill="#5E6AD2" />
      {/* Dokument mit umgeknickter Ecke */}
      <path
        d="M11 6h9l5 5v13a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        stroke="#FFFFFF"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M20 6v5h5" stroke="#FFFFFF" strokeWidth="1.7" strokeLinejoin="round" />
      {/* Wissens-Graph: drei verbundene Knoten */}
      <path
        d="M13.5 18 17 15M17 15 19 19.5M13.5 18 19 19.5"
        stroke="#FFFFFF"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="13.5" cy="18" r="1.5" fill="#FFFFFF" />
      <circle cx="17" cy="15" r="1.5" fill="#FFFFFF" />
      <circle cx="19" cy="19.5" r="1.5" fill="#FFFFFF" />
    </svg>
  );
}
