// Fase 7 Blok G — sensoriek: één simpel proefformulier per partij (bewust
// geen aromawielen; uitbreidbaar later). "gebotteld_exemplaar" markeert een
// proef uit de fles, zodat flesrijping later te volgen is.

import type { RecordModel } from "pocketbase";
import { ensureOnline, getPb } from "./data";
import { logAudit } from "./audit";

export interface Proefnotitie {
  id: string;
  partij: string;
  datum: string;
  proever: string;
  helderheid?: string;
  kleur?: string;
  geur?: string;
  smaak?: string;
  balans?: string;
  score: number | null;
  gebotteld_exemplaar: boolean;
  notities?: string;
  created: string;
}

function fromPb(r: RecordModel): Proefnotitie {
  return {
    id: r.id,
    partij: r["partij"],
    datum: r["datum"],
    proever: r["proever"],
    helderheid: r["helderheid"] ?? "",
    kleur: r["kleur"] ?? "",
    geur: r["geur"] ?? "",
    smaak: r["smaak"] ?? "",
    balans: r["balans"] ?? "",
    score: r["score"] > 0 ? r["score"] : null,
    gebotteld_exemplaar: !!r["gebotteld_exemplaar"],
    notities: r["notities"] ?? "",
    created: r["created"],
  };
}

export async function fetchProefnotities(partijId?: string): Promise<Proefnotitie[]> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) return [];
  const records = await pb.collection("proefnotities").getFullList({
    sort: "-datum,-created",
    filter: partijId ? `partij = "${partijId}"` : "",
  });
  return records.map(fromPb);
}

export async function createProefnotitie(
  input: Omit<Proefnotitie, "id" | "created" | "score"> & { score?: number | null },
): Promise<void> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) throw new Error("Geen verbinding met de server.");
  logAudit("aangemaakt", "proefnotities", `${input.datum} · ${input.proever}`);
  await pb.collection("proefnotities").create({ ...input });
}
