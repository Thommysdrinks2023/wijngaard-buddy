import { useEffect, useState } from "react";
import { toast } from "sonner";

// ============= Seizoen (jaar) helper =============
// Centraal beheer van het actieve seizoen (jaar) voor de hele app.

const LS_SELECTED = "wg.seizoen.selected.v1";
const LS_LASTSEEN = "wg.seizoen.lastseen.v1";
const LS_MIGRATED = "wg.seizoen.migrated.v1";

// Fallback seizoen voor records die nog geen seizoen-veld hebben.
export const FALLBACK_SEIZOEN = 2025;

export function getCurrentSeizoen(): number {
  return new Date().getFullYear();
}

// Migratie: voegt seizoen=2025 toe aan alle bestaande records die het nog niet hebben.
let migrated = false;
export function migrateSeizoen() {
  if (typeof window === "undefined" || migrated) return;
  if (localStorage.getItem(LS_MIGRATED)) {
    migrated = true;
    return;
  }
  const keys = [
    "wg.metingen.v1",
    "wg.observaties.v1",
    "wg.fenologie.v1",
    "wg.steekproef_metingen.v1",
  ];
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) continue;
      let changed = false;
      for (const item of arr) {
        if (item && typeof item === "object" && (item as { seizoen?: number }).seizoen == null) {
          // Probeer eerst uit datum
          let seizoen: number = FALLBACK_SEIZOEN;
          const datum = (item as { datum?: string }).datum;
          if (typeof datum === "string") {
            const y = Number(datum.slice(0, 4));
            if (!Number.isNaN(y) && y > 2000 && y < 3000) seizoen = y;
          }
          (item as { seizoen?: number }).seizoen = seizoen;
          changed = true;
        }
      }
      if (changed) localStorage.setItem(k, JSON.stringify(arr));
    } catch {
      // ignore
    }
  }
  localStorage.setItem(LS_MIGRATED, "1");
  migrated = true;
}

// Laat één keer per jaar een toast zien op 1 januari.
let greetingChecked = false;
export function checkNewYearGreeting() {
  if (typeof window === "undefined" || greetingChecked) return;
  greetingChecked = true;
  const cur = getCurrentSeizoen();
  const last = Number(localStorage.getItem(LS_LASTSEEN) ?? 0);
  if (last && last < cur) {
    toast.success(`Nieuw seizoen gestart — welkom in ${cur}!`, { duration: 6000 });
  }
  if (last !== cur) localStorage.setItem(LS_LASTSEEN, String(cur));
}

// Hook: gedeeld actief seizoen (gepersisteerd in localStorage).
export function useSeizoen(): [number, (j: number) => void] {
  const [jaar, setJaar] = useState<number>(getCurrentSeizoen());
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_SELECTED);
      if (stored) {
        const n = Number(stored);
        if (!Number.isNaN(n)) setJaar(n);
      }
    } catch {
      // ignore
    }
  }, []);
  const update = (j: number) => {
    setJaar(j);
    try {
      localStorage.setItem(LS_SELECTED, String(j));
    } catch {
      // ignore
    }
  };
  return [jaar, update];
}

export function useBeschikbareJaren(extra: number[] = []): number[] {
  const cur = getCurrentSeizoen();
  const set = new Set<number>([cur, FALLBACK_SEIZOEN, ...extra]);
  return Array.from(set).sort((a, b) => b - a);
}
