// Algemene app-instellingen en seizoensnotities (localStorage).

const LS_DREMPEL = "wg.instellingen.meting_drempel.v1";
const LS_NOTITIES = "wg.seizoen_notities";

export const DREMPEL_OPTIES = [7, 14, 21, 30] as const;
export type DrempelDagen = (typeof DREMPEL_OPTIES)[number];

export function getMetingDrempel(): number {
  if (typeof window === "undefined") return 14;
  const raw = localStorage.getItem(LS_DREMPEL);
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 365) return Math.round(n);
  return 14;
}
export function setMetingDrempel(d: number) {
  if (typeof window === "undefined") return;
  const v = Math.max(1, Math.min(365, Math.round(d)));
  localStorage.setItem(LS_DREMPEL, String(v));
  window.dispatchEvent(new CustomEvent("wg.drempel.changed"));
}

export interface SeizoenNotitie {
  tekst: string;
  updated: string; // ISO datetime
}

function notitiesAll(): Record<string, SeizoenNotitie> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_NOTITIES);
    return raw ? (JSON.parse(raw) as Record<string, SeizoenNotitie>) : {};
  } catch {
    return {};
  }
}

export function getSeizoenNotitie(jaar: number): SeizoenNotitie | null {
  return notitiesAll()[String(jaar)] ?? null;
}

export function setSeizoenNotitie(jaar: number, tekst: string): SeizoenNotitie {
  const all = notitiesAll();
  const entry: SeizoenNotitie = { tekst, updated: new Date().toISOString() };
  all[String(jaar)] = entry;
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_NOTITIES, JSON.stringify(all));
  }
  return entry;
}
