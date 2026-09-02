// Fase 17 — datalaag pasteurisatie. Bewust online-only en zonder sync-
// wachtrij: run starten/afronden vereist server-side atomiciteit
// (pb_hooks/pasteurisatie.pb.js), zelfde reden als kelder-data.ts.

import type { RecordModel } from "pocketbase";
import type {
  PasteurisatieCertificaat,
  PasteurisatieOordeel,
  PasteurisatieRun,
  PasteurisatieRunStatus,
  ProductSoort,
  RekenmodelValidatie,
  Sluiting,
} from "./types";
import { ensureOnline, getPb, haalLijst } from "./data";
import { logAudit } from "./audit";

const GEEN_VERBINDING = "Geen verbinding — pasteurisatie vereist de server.";

async function pbOfFout() {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) throw new Error(GEEN_VERBINDING);
  return pb;
}

// ============= Sluitingen =============
function sluitingFromPb(r: RecordModel): Sluiting {
  return {
    id: r.id,
    naam: r["naam"],
    type: r["type"],
    max_druk_bar: r["max_druk_bar"] ?? 0,
    geschikt_voor_gecarboniseerd: r["geschikt_voor_gecarboniseerd"] ?? false,
    liner: r["liner"] ?? "",
    leverancier: r["leverancier"] ?? "",
    notities: r["notities"] ?? "",
    actief: r["actief"] ?? true,
  };
}

export async function fetchSluitingen(opties?: { alleenActief?: boolean }): Promise<Sluiting[]> {
  return haalLijst("sluitingen", [], async (pb) => {
    const records = await pb.collection("sluitingen").getFullList({
      sort: "naam",
      filter: opties?.alleenActief ? pb.filter("actief = true") : "",
    });
    return records.map(sluitingFromPb);
  });
}

// ============= Runs =============
function runFromPb(r: RecordModel): PasteurisatieRun {
  return {
    id: r.id,
    eigenaar: r["eigenaar"] || null,
    partij: r["partij"],
    lotnummer: r["lotnummer"] ?? "",
    bottelronde: r["bottelronde"] || null,
    product_soort: r["product_soort"],
    datum: r["datum"],
    starttijd: r["starttijd"] ?? "",
    eindtijd: r["eindtijd"] ?? "",
    flestype: r["flestype"] || null,
    sluiting: r["sluiting"] || null,
    aantal_flessen: r["aantal_flessen"] || null,
    vulvolume_ml: r["vulvolume_ml"] || null,
    co2_gehalte_gl: r["co2_gehalte_gl"] || null,
    doel_pu_min: r["doel_pu_min"] ?? 100,
    doel_pu_max: r["doel_pu_max"] ?? 150,
    doeltemperatuur_c: r["doeltemperatuur_c"] || null,
    berekende_max_druk_bar: r["berekende_max_druk_bar"] || null,
    veiligheidsoordeel: r["veiligheidsoordeel"] || null,
    oordeel_geaccepteerd_door: r["oordeel_geaccepteerd_door"] || null,
    sensor_positie: r["sensor_positie"] ?? "",
    totale_pu: r["totale_pu"] || null,
    pu_opwarm: r["pu_opwarm"] || null,
    pu_houd: r["pu_houd"] || null,
    pu_afkoel: r["pu_afkoel"] || null,
    piektemperatuur_c: r["piektemperatuur_c"] || null,
    status: r["status"],
    opmerkingen: r["opmerkingen"] ?? "",
    uitgevoerd_door: r["uitgevoerd_door"] || null,
    created: r["created"],
    updated: r["updated"],
  };
}

export interface RunFilter {
  eigenaar?: string;
  partij?: string;
  status?: PasteurisatieRunStatus;
  vanaf?: string;
  tot?: string;
}

export async function fetchPasteurisatieRuns(filter?: RunFilter): Promise<PasteurisatieRun[]> {
  return haalLijst("pasteurisatieruns", [], async (pb) => {
    const delen: string[] = [];
    if (filter?.eigenaar) delen.push(pb.filter("eigenaar = {:e}", { e: filter.eigenaar }));
    if (filter?.partij) delen.push(pb.filter("partij = {:p}", { p: filter.partij }));
    if (filter?.status) delen.push(pb.filter("status = {:s}", { s: filter.status }));
    if (filter?.vanaf) delen.push(pb.filter("datum >= {:v}", { v: filter.vanaf }));
    if (filter?.tot) delen.push(pb.filter("datum <= {:t}", { t: filter.tot }));
    const records = await pb.collection("pasteurisatie_runs").getFullList({
      sort: "-datum,-created",
      filter: delen.join(" && "),
    });
    return records.map(runFromPb);
  });
}

export async function fetchPasteurisatieRunById(id: string): Promise<PasteurisatieRun | null> {
  const pb = getPb();
  if (!pb) return null;
  if (!(await ensureOnline())) throw new Error(GEEN_VERBINDING);
  try {
    return runFromPb(await pb.collection("pasteurisatie_runs").getOne(id));
  } catch {
    return null;
  }
}

export interface StartRunInput {
  lotnummer: string;
  partij?: string;
  nieuwe_partij?: { naam: string; jaargang: number; type?: string; opdracht_type?: string };
  eigenaar?: string;
  bottelronde?: string;
  product_soort: ProductSoort;
  datum?: string;
  flestype?: string;
  sluiting?: string;
  aantal_flessen?: number;
  vulvolume_ml?: number;
  co2_gehalte_gl?: number;
  doel_pu_min?: number;
  doel_pu_max?: number;
  doeltemperatuur_c: number;
  berekende_max_druk_bar?: number;
  veiligheidsoordeel?: PasteurisatieOordeel;
  oordeel_geaccepteerd_door?: string;
  sensor_positie?: string;
  uitgevoerd_door?: string;
  ingevoerd_door?: string;
}

export interface StartRunResultaat {
  ok: boolean;
  run_id: string;
  partij_id: string;
  partij_aangemaakt: boolean;
}

/** Retourneert bij een onbekend lotnummer een fout met partij_niet_gevonden=true (zie de UI: dan een nieuwe partij aanbieden). */
export async function startPasteurisatieRun(input: StartRunInput): Promise<StartRunResultaat> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "pasteurisatie_runs", `lot ${input.lotnummer}`);
  return await pb.send("/api/tappenmars/pasteurisatie-run-starten", {
    method: "POST",
    body: input,
  });
}

export interface AfrondRunInput {
  run_id: string;
  status?: "afgerond" | "afgebroken";
  eindtijd?: string;
  totale_pu: number;
  pu_opwarm: number;
  pu_houd: number;
  pu_afkoel: number;
  piektemperatuur_c?: number;
  aantal_flessen?: number;
  meetgaten?: number;
  uitgevoerd_door?: string;
  ingevoerd_door?: string;
}

export async function rondPasteurisatieRunAf(input: AfrondRunInput): Promise<{ ok: boolean }> {
  const pb = await pbOfFout();
  logAudit("gewijzigd", "pasteurisatie_runs", `${input.run_id} · ${input.totale_pu} PU`);
  return await pb.send("/api/tappenmars/pasteurisatie-run-afronden", {
    method: "POST",
    body: input,
  });
}

export interface MetingInput {
  run_id: string;
  temperatuur_c: number;
  sensor_label?: string;
  gemeten_op?: string;
}

export async function boekPasteurisatieMeting(
  input: MetingInput,
): Promise<{ ok: boolean; id: string }> {
  const pb = await pbOfFout();
  return await pb.send("/api/tappenmars/pasteurisatie-meting", { method: "POST", body: input });
}

export interface PasteurisatieMeting {
  id: string;
  temperatuurC: number;
  sensorLabel: string;
  tijdstip: Date;
}

export async function fetchPasteurisatieMetingen(runId: string): Promise<PasteurisatieMeting[]> {
  return haalLijst("pasteurisatiemetingen", [], async (pb) => {
    const records = await pb.collection("sensor_metingen").getFullList({
      sort: "gemeten_op",
      filter: pb.filter("bron_type = 'pasteurisatie_run' && bron_id = {:id}", { id: runId }),
      requestKey: null,
    });
    return records.map((r) => ({
      id: r.id,
      temperatuurC: r["waarde"] ?? r["temperatuur_c"] ?? 0,
      sensorLabel: r["sensor_label"] || "referentiefles",
      tijdstip: new Date(r["gemeten_op"] || r["created"]),
    }));
  });
}

// ============= Certificaten =============
function certificaatFromPb(r: RecordModel): PasteurisatieCertificaat {
  return {
    id: r.id,
    run: r["run"],
    uitgiftedatum: r["uitgiftedatum"],
    uitgegeven_door: r["uitgegeven_door"] ?? "",
    bestand: r["bestand"] ? getPb()?.files.getURL(r, r["bestand"]) : "",
    versienummer: r["versienummer"] ?? 1,
    created: r["created"],
  };
}

export async function fetchCertificatenVoorRun(runId: string): Promise<PasteurisatieCertificaat[]> {
  return haalLijst("certificaten", [], async (pb) => {
    const records = await pb.collection("pasteurisatie_certificaten").getFullList({
      sort: "-versienummer",
      filter: pb.filter("run = {:id}", { id: runId }),
    });
    return records.map(certificaatFromPb);
  });
}

export async function maakCertificaatRecord(
  runId: string,
  uitgegevenDoor: string,
  bestand: Blob,
  bestandsnaam: string,
): Promise<PasteurisatieCertificaat> {
  const pb = await pbOfFout();
  const bestaande = await fetchCertificatenVoorRun(runId);
  const versienummer =
    bestaande.length > 0 ? Math.max(...bestaande.map((c) => c.versienummer)) + 1 : 1;
  const formData = new FormData();
  formData.append("run", runId);
  formData.append("uitgiftedatum", new Date().toISOString().slice(0, 10));
  formData.append("uitgegeven_door", uitgegevenDoor);
  formData.append("versienummer", String(versienummer));
  formData.append("bestand", bestand, bestandsnaam);
  logAudit("aangemaakt", "pasteurisatie_certificaten", `run ${runId} · v${versienummer}`);
  const r = await pb.collection("pasteurisatie_certificaten").create(formData);
  return certificaatFromPb(r);
}

// ============= Rekenmodel-validaties (Blok I) =============
function validatieFromPb(r: RecordModel): RekenmodelValidatie {
  return {
    id: r.id,
    model_sleutel: r["model_sleutel"],
    gevalideerd: r["gevalideerd"] ?? false,
    gevalideerd_op: r["gevalideerd_op"] ?? "",
    gevalideerd_door: r["gevalideerd_door"] ?? "",
    toelichting: r["toelichting"] ?? "",
  };
}

export async function fetchRekenmodelValidaties(): Promise<RekenmodelValidatie[]> {
  return haalLijst("rekenmodelvalidaties", [], async (pb) => {
    const records = await pb
      .collection("rekenmodel_validaties")
      .getFullList({ sort: "model_sleutel" });
    return records.map(validatieFromPb);
  });
}

export async function zetRekenmodelValidatie(
  id: string,
  input: { gevalideerd: boolean; toelichting: string; gevalideerd_door: string },
): Promise<RekenmodelValidatie> {
  const pb = await pbOfFout();
  logAudit("gewijzigd", "rekenmodel_validaties", `${id} · gevalideerd=${input.gevalideerd}`);
  const r = await pb.collection("rekenmodel_validaties").update(id, {
    ...input,
    gevalideerd_op: new Date().toISOString().slice(0, 10),
  });
  return validatieFromPb(r);
}
