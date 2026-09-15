// Gedeelde localStorage-helpers — één plek in plaats van drie kopieën
// (voorheen gedupliceerd in data.ts, steekproef.ts en extra-data.ts).

export function readLs<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Schrijft naar localStorage en meldt of dat gelukt is.
 *
 * localStorage kan echt weigeren: volle telefoonopslag (QuotaExceededError —
 * de wijngaard-caches groeien onbegrensd), of een privévenster waar schrijven
 * gewoon gooit. Zonder deze try/catch klapte een meting opslaan met een
 * cryptische browserfout, terwijl offline-first juist zou moeten redden.
 *
 * Voor caches is falen geen ramp (bij de volgende ophaalronde staat het er
 * weer) — daarom gooit dit niet, maar geeft het `false` terug. Waar het WEL
 * dataverlies zou zijn, hoort de aanroeper op die `false` te reageren; zie
 * `writeQueue()` in sync.ts, dat er bewust een leesbare fout van maakt.
 */
export function writeLs<T>(key: string, val: T): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
