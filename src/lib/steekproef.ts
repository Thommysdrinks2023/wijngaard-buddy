import type { FenologieMoment, Ras } from "./types";

// ============= Types =============
export type ZiekteDruk = "Geen" | "Licht" | "Matig" | "Zwaar";
export type BladGroei = "Zwak" | "Normaal" | "Sterk";
export type BodemConditie = "Droog" | "Normaal" | "Nat" | "Verdicht";
export type Biodiversiteit = "Laag" | "Gemiddeld" | "Hoog";
export type WaterStress = "Geen" | "Licht" | "Matig" | "Ernstig";

export const ZIEKTEDRUK_OPTIES: ZiekteDruk[] = ["Geen", "Licht", "Matig", "Zwaar"];
export const BLADGROEI_OPTIES: BladGroei[] = ["Zwak", "Normaal", "Sterk"];
export const BODEM_OPTIES: BodemConditie[] = ["Droog", "Normaal", "Nat", "Verdicht"];
export const BIODIV_OPTIES: Biodiversiteit[] = ["Laag", "Gemiddeld", "Hoog"];
export const WATERSTRESS_OPTIES: WaterStress[] = ["Geen", "Licht", "Matig", "Ernstig"];

export const ZIEKTEDRUK_KLEUR: Record<ZiekteDruk, string> = {
  Geen: "#22c55e",
  Licht: "#eab308",
  Matig: "#f97316",
  Zwaar: "#dc2626",
};

export interface SteekproefPlant {
  id: string;
  naam: string;
  ras: Ras;
  rij: string; // rij id
  rijnummer: number;
  plant: number;
  created: string;
}

export interface SteekproefMeting {
  id: string;
  plantId: string; // SteekproefPlant id
  datum: string;
  seizoen: number;
  trosaantal?: number | null;
  trosgewicht?: number | null; // gram
  brix?: number | null;
  zuurgraad?: number | null;
  fenologie?: FenologieMoment | null;
  ziektedruk?: ZiekteDruk | null;
  bladgroei?: BladGroei | null;
  bodem?: BodemConditie | null;
  biodiversiteit?: Biodiversiteit | null;
  waterstress?: WaterStress | null;
  opbrengst_kg?: number | null;
  notitie?: string;
  ingevoerd_door: string;
  created: string;
}

export interface OogstRegistratie {
  id: string;
  ras: Ras;
  seizoen: number;
  kg: number;
  datum: string;
  created: string;
}

// ============= LS helpers =============
const LS_PUNTEN = "wg.steekproef_planten.v1";
const LS_METINGEN = "wg.steekproef_metingen.v1";
const LS_OOGST = "wg.oogst.v1";

function readLs<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLs<T>(key: string, val: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(val));
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ============= Planten =============
export function getSteekproefPlanten(): SteekproefPlant[] {
  return readLs<SteekproefPlant[]>(LS_PUNTEN, []);
}

export function createSteekproefPlant(
  input: Omit<SteekproefPlant, "id" | "created">,
): SteekproefPlant {
  const all = getSteekproefPlanten();
  const p: SteekproefPlant = { ...input, id: uid(), created: new Date().toISOString() };
  all.push(p);
  writeLs(LS_PUNTEN, all);
  return p;
}

export function deleteSteekproefPlant(id: string) {
  const all = getSteekproefPlanten().filter((p) => p.id !== id);
  writeLs(LS_PUNTEN, all);
  // Cascade: verwijder bijbehorende metingen
  const metingen = getSteekproefMetingen().filter((m) => m.plantId !== id);
  writeLs(LS_METINGEN, metingen);
}

// ============= Metingen =============
export function getSteekproefMetingen(plantId?: string): SteekproefMeting[] {
  const all = readLs<SteekproefMeting[]>(LS_METINGEN, []);
  const f = plantId ? all.filter((m) => m.plantId === plantId) : all;
  return f.sort((a, b) => (a.datum < b.datum ? 1 : -1));
}

export function createSteekproefMeting(
  input: Omit<SteekproefMeting, "id" | "created" | "seizoen"> & { seizoen?: number },
): SteekproefMeting {
  const all = readLs<SteekproefMeting[]>(LS_METINGEN, []);
  const seizoen = input.seizoen ?? new Date(input.datum).getFullYear();
  const m: SteekproefMeting = {
    ...input,
    seizoen,
    id: uid(),
    created: new Date().toISOString(),
  };
  all.push(m);
  writeLs(LS_METINGEN, all);
  return m;
}

// ============= Oogst =============
export function getOogst(seizoen?: number): OogstRegistratie[] {
  const all = readLs<OogstRegistratie[]>(LS_OOGST, []);
  return seizoen ? all.filter((o) => o.seizoen === seizoen) : all;
}

export function createOogst(input: Omit<OogstRegistratie, "id" | "created">): OogstRegistratie {
  const all = getOogst();
  const o: OogstRegistratie = { ...input, id: uid(), created: new Date().toISOString() };
  all.push(o);
  writeLs(LS_OOGST, all);
  return o;
}
