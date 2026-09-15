// Datalaag bodem_observaties (Fase 7 Blok B; collectie bestond al sinds de
// eindsprint-schema-run). Online-only, zelfde patroon als kelder-data.ts.

import type { RecordModel } from "pocketbase";
import { ensureOnline, getPb, haalLijst } from "./data";
import { logAudit } from "./audit";

export const BODEMVOCHT_OPTIES = ["droog", "vochtig", "nat", "verzadigd"] as const;
export type Bodemvocht = (typeof BODEMVOCHT_OPTIES)[number];

export const GEBREK_OPTIES = ["N", "Mg", "K", "Fe", "B", "Zn", "Mn"] as const;
export type Gebrek = (typeof GEBREK_OPTIES)[number];

export interface BodemObservatie {
  id: string;
  rij: string;
  datum: string;
  seizoen: number;
  bodemvocht: Bodemvocht | null;
  bodemvocht_pct: number | null;
  ph_veld: number | null;
  structuur?: string;
  verslemping: boolean;
  gebreksverschijnselen: Gebrek | null;
  notitie?: string;
  ingevoerd_door?: string;
}

function fromPb(r: RecordModel): BodemObservatie {
  return {
    id: r.id,
    rij: r["rij"],
    datum: r["datum"],
    seizoen: r["seizoen"],
    bodemvocht: r["bodemvocht"] || null,
    bodemvocht_pct: r["bodemvocht_pct"] > 0 ? r["bodemvocht_pct"] : null,
    ph_veld: r["ph_veld"] > 0 ? r["ph_veld"] : null,
    structuur: r["structuur"] ?? "",
    verslemping: !!r["verslemping"],
    // PocketBase-multiselect geeft een array terug; wij tonen er hooguit één
    gebreksverschijnselen: Array.isArray(r["gebreksverschijnselen"])
      ? ((r["gebreksverschijnselen"][0] as Gebrek) ?? null)
      : r["gebreksverschijnselen"] || null,
    notitie: r["notitie"] ?? "",
    ingevoerd_door: r["ingevoerd_door"] ?? "",
  };
}

export async function fetchBodemObservaties(): Promise<BodemObservatie[]> {
  return haalLijst("bodemobservaties", [], async (pb) => {
    const records = await pb
      .collection("bodem_observaties")
      .getFullList({ sort: "-datum,-created" });
    return records.map(fromPb);
  });
}

export interface BodemObservatieInput {
  rij: string;
  datum: string;
  bodemvocht?: Bodemvocht | "";
  ph_veld?: number | null;
  verslemping?: boolean;
  gebreksverschijnselen?: Gebrek | "";
  notitie?: string;
  ingevoerd_door?: string;
}

export async function createBodemObservatie(input: BodemObservatieInput): Promise<void> {
  const pb = getPb();
  if (!pb || !(await ensureOnline()))
    throw new Error("Geen verbinding — bodemobservaties vereisen de server.");
  logAudit("aangemaakt", "bodem_observaties", `rij ${input.rij} ${input.datum}`);
  await pb.collection("bodem_observaties").create({
    ...input,
    gebreksverschijnselen: input.gebreksverschijnselen ? [input.gebreksverschijnselen] : [],
    seizoen: new Date(input.datum).getFullYear(),
  });
}

// Laatste observatie per rij (voor de perceelkaart-inkleuring)
export function laatstePerRij(observaties: BodemObservatie[]): Map<string, BodemObservatie> {
  const map = new Map<string, BodemObservatie>();
  for (const o of observaties) {
    // observaties komen gesorteerd -datum binnen; eerste per rij = nieuwste
    if (!map.has(o.rij)) map.set(o.rij, o);
  }
  return map;
}
