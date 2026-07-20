// Datalaag materieel & onderhoud (Eindsprint Blok M). Bewust een logboek,
// geen assetmanagement: twee collecties, vrij invoeren, nooit bewerken nodig.

import type { RecordModel } from "pocketbase";
import { ensureOnline, getPb, haalLijst } from "./data";
import { logAudit } from "./audit";

export type MaterieelType = "tractor" | "spuit" | "bottellijn" | "koeling" | "overig";
export const MATERIEEL_TYPES: { value: MaterieelType; label: string; emoji: string }[] = [
  { value: "tractor", label: "Tractor", emoji: "🚜" },
  { value: "spuit", label: "Spuit", emoji: "💨" },
  { value: "bottellijn", label: "Bottellijn", emoji: "🍾" },
  { value: "koeling", label: "Koeling", emoji: "❄️" },
  { value: "overig", label: "Overig", emoji: "🔧" },
];

export type OnderhoudType = "onderhoud" | "reparatie" | "keuring";
export const ONDERHOUD_TYPES: { value: OnderhoudType; label: string; emoji: string }[] = [
  { value: "onderhoud", label: "Onderhoud", emoji: "🛠️" },
  { value: "reparatie", label: "Reparatie", emoji: "🔩" },
  { value: "keuring", label: "Keuring", emoji: "📋" },
];

export interface Materieel {
  id: string;
  naam: string;
  type: MaterieelType | null;
  bouwjaar?: number | null;
  notities?: string;
}

export interface OnderhoudsRegel {
  id: string;
  materieel: string; // materieel id
  datum: string;
  type: OnderhoudType;
  omschrijving: string;
  kosten?: number | null;
  volgende_keer?: string;
  ingevoerd_door?: string;
  created: string;
}

function materieelFromPb(r: RecordModel): Materieel {
  return {
    id: r.id,
    naam: r["naam"],
    type: r["type"] || null,
    bouwjaar: r["bouwjaar"] || null,
    notities: r["notities"] ?? "",
  };
}

function onderhoudFromPb(r: RecordModel): OnderhoudsRegel {
  return {
    id: r.id,
    materieel: r["materieel"],
    datum: r["datum"],
    type: r["type"],
    omschrijving: r["omschrijving"],
    kosten: r["kosten"] || null,
    volgende_keer: r["volgende_keer"] ?? "",
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    created: r["created"],
  };
}

export async function fetchMaterieel(): Promise<Materieel[]> {
  return haalLijst("het machinepark", [], async (pb) => {
    const records = await pb.collection("materieel").getFullList({ sort: "naam" });
    return records.map(materieelFromPb);
  });
}

export async function createMaterieel(input: Omit<Materieel, "id">): Promise<Materieel> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) throw new Error("Geen verbinding met de server.");
  logAudit("aangemaakt", "materieel", input.naam);
  const r = await pb.collection("materieel").create({ ...input });
  return materieelFromPb(r);
}

export async function fetchOnderhoud(materieelId?: string): Promise<OnderhoudsRegel[]> {
  return haalLijst("het onderhoudslog", [], async (pb) => {
    const records = await pb.collection("onderhoudslog").getFullList({
      sort: "-datum,-created",
      filter: materieelId ? `materieel = "${materieelId}"` : "",
    });
    return records.map(onderhoudFromPb);
  });
}

export async function createOnderhoud(
  input: Omit<OnderhoudsRegel, "id" | "created">,
): Promise<OnderhoudsRegel> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) throw new Error("Geen verbinding met de server.");
  logAudit("aangemaakt", "onderhoudslog", `${input.type} · ${input.omschrijving}`);
  const r = await pb.collection("onderhoudslog").create({ ...input });
  return onderhoudFromPb(r);
}

// Widget "onderhoud binnenkort": jongste volgende_keer per materieel binnen N dagen.
export function onderhoudBinnenkort(
  regels: OnderhoudsRegel[],
  dagen = 30,
  vandaag = new Date(),
): OnderhoudsRegel[] {
  const grens = new Date(vandaag.getTime() + dagen * 86400000);
  const grensStr = grens.toISOString().slice(0, 10);
  const perMaterieel = new Map<string, OnderhoudsRegel>();
  for (const r of regels) {
    if (!r.volgende_keer) continue;
    const bestaand = perMaterieel.get(r.materieel);
    if (!bestaand || r.volgende_keer < (bestaand.volgende_keer as string))
      perMaterieel.set(r.materieel, r);
  }
  return Array.from(perMaterieel.values())
    .filter((r) => (r.volgende_keer as string) <= grensStr)
    .sort((a, b) => (a.volgende_keer as string).localeCompare(b.volgende_keer as string));
}
