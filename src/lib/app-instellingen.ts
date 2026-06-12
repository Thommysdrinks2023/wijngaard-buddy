// Algemene app-instellingen en seizoensnotities (localStorage).

import { ensureOnline, getPb } from "./data";
import { addToSyncQueue, getSyncQueue } from "./sync";

const LS_DREMPEL = "wg.instellingen.meting_drempel.v1";
const LS_NOTITIES = "wg.seizoen_notities";
const LS_OPPERVLAKTE = "wg.instellingen.oppervlakte_ha.v1";

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
  // sync als append-only logboek: nieuwste notitie per seizoen wint
  addToSyncQueue(
    "notitie",
    `notitie-${jaar}-${Date.now()}`,
    { seizoen: jaar, tekst },
    { collection: "notities" },
  );
  return entry;
}

// PB-first variant: nieuwste notitie per seizoen van de server,
// aangevuld met nog niet gesynchroniseerde lokale notities.
export async function fetchSeizoenNotities(): Promise<Record<string, SeizoenNotitie>> {
  const pb = getPb();
  if (pb && (await ensureOnline())) {
    try {
      const records = await pb.collection("notities").getFullList({ sort: "created" });
      const map: Record<string, SeizoenNotitie> = {};
      records.forEach((r) => {
        map[String(r["seizoen"])] = { tekst: r["tekst"] ?? "", updated: r["created"] };
      });
      getSyncQueue()
        .filter((q) => q.soort === "notitie")
        .forEach((q) => {
          map[String(q.payload["seizoen"])] = {
            tekst: String(q.payload["tekst"] ?? ""),
            updated: q.aangemaakt,
          };
        });
      if (typeof window !== "undefined") {
        localStorage.setItem(LS_NOTITIES, JSON.stringify(map));
      }
      return map;
    } catch {
      // fall through
    }
  }
  return notitiesAll();
}

// ============= Uurloon (optioneel, voor kostenberekening) =============
const LS_UURLOON = "wg.instellingen.uurloon.v1";

export function getUurloon(): number {
  if (typeof window === "undefined") return 0;
  const n = Number(localStorage.getItem(LS_UURLOON));
  if (Number.isFinite(n) && n >= 0 && n <= 1000) return n;
  return 0; // 0 = kostenberekening uit
}
export function setUurloon(euroPerUur: number) {
  if (typeof window === "undefined") return;
  const v = Math.max(0, Math.min(1000, euroPerUur));
  localStorage.setItem(LS_UURLOON, String(v));
}

// ============= Perceeloppervlakte =============
export function getPerceelOppervlakte(): number {
  if (typeof window === "undefined") return 1.5;
  const n = Number(localStorage.getItem(LS_OPPERVLAKTE));
  if (Number.isFinite(n) && n > 0 && n < 1000) return n;
  return 1.5; // hectare — De Tappenmars
}
export function setPerceelOppervlakte(ha: number) {
  if (typeof window === "undefined") return;
  const v = Math.max(0.01, Math.min(1000, ha));
  localStorage.setItem(LS_OPPERVLAKTE, String(v));
}
