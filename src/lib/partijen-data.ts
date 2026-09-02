// Datalaag voor partijen (wijngaard → kelder overdracht).
// Bewust GEEN offline-fallback/sync-wachtrij — partijen vereisen de server.
// Aanmaken loopt via het atomische endpoint (zie kelder-data.ts:
// createPartijViaEndpoint), zodat partij + eerste vulling samen slagen of falen.

import type { RecordModel } from "pocketbase";
import type { OpdrachtType, Partij, PartijStatus, PartijType } from "./types";
import { ensureOnline, getPb, isIngelogd } from "./data";

function partijFromPb(r: RecordModel): Partij {
  return {
    id: r.id,
    naam: r["naam"],
    jaargang: r["jaargang"],
    type: r["type"],
    status: r["status"],
    samenstelling: r["samenstelling"] ?? "",
    start_volume_l: r["start_volume_l"] ?? null,
    notitie: r["notitie"] ?? "",
    eigenaar: r["eigenaar"] || null,
    opdracht_type: r["opdracht_type"] || null,
    ouder_partij: r["ouder_partij"] || null,
    lotnummer: r["lotnummer"] ?? "",
    pers_datum: r["pers_datum"] ?? "",
    gist: r["gist"] ?? "",
    start_dichtheid_oechsle: r["start_dichtheid_oechsle"] ?? null,
    start_dichtheid_brix: r["start_dichtheid_brix"] ?? null,
    start_dichtheid_sg: r["start_dichtheid_sg"] ?? null,
    start_tank: r["start_tank"] || null,
    ontstelen: r["ontstelen"] ?? false,
    voorklaren: r["voorklaren"] ?? false,
    ph_bij_aanmaak: r["ph_bij_aanmaak"] ?? null,
    totaal_zuur_bij_aanmaak: r["totaal_zuur_bij_aanmaak"] ?? null,
    standtijd: r["standtijd"] ?? "",
    koeling: r["koeling"] ?? "",
    nfc_tag: r["nfc_tag"] ?? "",
    // json-veld: leeg = geen programma ingesteld, niet "leeg object"
    temperatuur_programma:
      r["temperatuur_programma"] && Object.keys(r["temperatuur_programma"]).length > 0
        ? r["temperatuur_programma"]
        : null,
    created: r["created"],
    updated: r["updated"],
  };
}

export async function fetchPartijen(): Promise<Partij[]> {
  const pb = getPb();
  if (!pb) return [];
  // Zie kelder-data.ts (fetchEigenaars/fetchTanks): zonder deze check gaf
  // een niet-ingelogde sessie hier stil een lege lijst terug in plaats van
  // een herkenbare fout.
  if (!isIngelogd()) throw new Error("Log opnieuw in om partijen te kunnen laden.");
  if (!(await ensureOnline()))
    throw new Error("Geen verbinding met de server — kon partijen niet laden.");
  try {
    // requestKey: null — signaalproducenten en pagina's vragen deze lijst
    // tegelijk op (PocketBase auto-cancellation-valkuil, zie CLAUDE.md).
    const records = await pb
      .collection("partijen")
      .getFullList({ sort: "-jaargang,naam", requestKey: null });
    return records.map(partijFromPb);
  } catch {
    throw new Error("Kon partijen niet laden — probeer het opnieuw.");
  }
}

export async function fetchPartijById(id: string): Promise<Partij | null> {
  const pb = getPb();
  if (!pb) return null;
  if (!isIngelogd()) throw new Error(`Log opnieuw in om de partij te kunnen laden.`);
  if (!(await ensureOnline()))
    throw new Error(`Geen verbinding met de server — kon de partij niet laden.`);
  try {
    const r = await pb.collection("partijen").getOne(id);
    return partijFromPb(r);
  } catch {
    return null;
  }
}

// Fase 17 Blok F — een run wordt gestart op lotnummer, niet op partij-id:
// dit is de client-side "voorbeeld"-lookup vóór het starten (toont eigenaar/
// product/laatste logboekregels ter bevestiging). De atomische start zelf
// zoekt SERVER-side nogmaals op lotnummer (pasteurisatie_logica.js) — geen
// race-conditie omdat de server de bron van waarheid is.
export async function fetchPartijByLotnummer(lotnummer: string): Promise<Partij | null> {
  const pb = getPb();
  if (!pb) return null;
  if (!(await ensureOnline()))
    throw new Error("Geen verbinding met de server — kon niet op lotnummer zoeken.");
  try {
    const r = await pb
      .collection("partijen")
      .getFirstListItem(pb.filter("lotnummer = {:lot}", { lot: lotnummer }), { requestKey: null });
    return partijFromPb(r);
  } catch {
    return null;
  }
}

export interface PartijInput {
  naam: string;
  jaargang: number;
  type: PartijType;
  status: PartijStatus;
  samenstelling?: string;
  start_volume_l?: number | null;
  notitie?: string;
  eigenaar?: string | null;
  opdracht_type?: OpdrachtType | null;
  lotnummer?: string;
  pers_datum?: string;
  gist?: string;
  start_dichtheid_oechsle?: number | null;
  start_dichtheid_brix?: number | null;
  start_dichtheid_sg?: number | null;
  ontstelen?: boolean;
  voorklaren?: boolean;
  ph_bij_aanmaak?: number | null;
  totaal_zuur_bij_aanmaak?: number | null;
  standtijd?: string;
  koeling?: string;
}

export interface PartijUpdateInput {
  status?: PartijStatus;
  samenstelling?: string;
  notitie?: string;
  lotnummer?: string;
  gist?: string;
  nfc_tag?: string;
  temperatuur_programma?: import("./temperatuurprogramma").TemperatuurProgramma | null;
}

export async function updatePartij(id: string, input: PartijUpdateInput): Promise<void> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) {
    throw new Error("Geen verbinding — partijen vereisen internet in deze fase.");
  }
  await pb.collection("partijen").update(id, input);
}
