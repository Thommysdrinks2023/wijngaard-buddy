// Datalaag kelder Fase 0–2: producenten, tanks, tankboek, analyses, kelderlog.
// Bewust online-only en zonder sync-wachtrij: tankboek-boekingen vereisen
// server-side atomiciteit (pb_hooks/kelder.pb.js) — zie ARCHITECTURE.md §7.6.

import type { RecordModel } from "pocketbase";
import type {
  Analyse,
  AnalyseMethode,
  KelderlogActie,
  KelderlogEenheid,
  KelderlogRegel,
  Producent,
  Tank,
  TankboekActie,
  TankboekRegel,
  TankStatus,
} from "./types";
import type { PartijInput } from "./partijen-data";
import { ensureOnline, getPb } from "./data";
import { logAudit } from "./audit";

const GEEN_VERBINDING = "Geen verbinding — kelderboekingen vereisen de server.";

async function pbOfFout() {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) throw new Error(GEEN_VERBINDING);
  return pb;
}

// ============= Producenten =============
function producentFromPb(r: RecordModel): Producent {
  return {
    id: r.id,
    naam: r["naam"],
    soort: r["soort"],
    actief: r["actief"] ?? true,
    notitie: r["notitie"] ?? "",
  };
}

export async function fetchProducenten(): Promise<Producent[]> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) return [];
  const records = await pb.collection("producenten").getFullList({ sort: "naam" });
  return records.map(producentFromPb);
}

// ============= Tanks =============
function tankFromPb(r: RecordModel): Tank {
  return {
    id: r.id,
    code: r["code"],
    soort: r["soort"] ?? "",
    capaciteit_l: r["capaciteit_l"] ?? 0,
    status: r["status"],
    huidige_partij: r["huidige_partij"] || null,
    huidig_volume_l: r["huidig_volume_l"] ?? 0,
    locatie: r["locatie"] ?? "",
    notitie: r["notitie"] ?? "",
  };
}

// sorteert "2" vóór "10", en letters (IBC1) achteraan
export function tankCodeVergelijk(a: Tank, b: Tank): number {
  const na = Number(a.code);
  const nb = Number(b.code);
  const aNum = Number.isFinite(na);
  const bNum = Number.isFinite(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.code.localeCompare(b.code);
}

export async function fetchTanks(): Promise<Tank[]> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) return [];
  const records = await pb.collection("tanks").getFullList({ sort: "code" });
  return records.map(tankFromPb).sort(tankCodeVergelijk);
}

export interface TankInput {
  code: string;
  soort?: string;
  capaciteit_l: number;
  status: TankStatus;
  locatie?: string;
  notitie?: string;
}

export async function createTank(input: TankInput): Promise<Tank> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "tanks", `${input.code} · ${input.capaciteit_l}L`);
  const r = await pb.collection("tanks").create({
    ...input,
    soort: input.soort ?? "",
    huidig_volume_l: 0,
    locatie: input.locatie ?? "",
    notitie: input.notitie ?? "",
  });
  return tankFromPb(r);
}

export async function updateTank(
  id: string,
  input: Partial<Pick<TankInput, "soort" | "capaciteit_l" | "status" | "locatie" | "notitie">>,
): Promise<void> {
  const pb = await pbOfFout();
  logAudit("gewijzigd", "tanks", "Tank bijgewerkt");
  await pb.collection("tanks").update(id, input);
}

// ============= Tankboek (alleen lezen + boeken via endpoint) =============
function tankboekFromPb(r: RecordModel): TankboekRegel {
  return {
    id: r.id,
    datum: r["datum"],
    tijd: r["tijd"] ?? "",
    partij: r["partij"],
    producent: r["producent"] || null,
    actie: r["actie"],
    van_tank: r["van_tank"] || null,
    naar_tank: r["naar_tank"] || null,
    volume_l: r["volume_l"] ?? 0,
    middel: r["middel"] ?? "",
    dosering: r["dosering"] ?? "",
    verantwoordelijke: r["verantwoordelijke"] ?? "",
    corrigeert: r["corrigeert"] || null,
    notitie: r["notitie"] ?? "",
    created: r["created"],
  };
}

export interface TankboekFilter {
  partij?: string;
  tank?: string; // matcht van_tank óf naar_tank
  producent?: string;
  vanaf?: string; // datum >=
  tot?: string; // datum <=
}

export async function fetchTankboek(filter?: TankboekFilter): Promise<TankboekRegel[]> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) return [];
  const delen: string[] = [];
  if (filter?.partij) delen.push(`partij = "${filter.partij}"`);
  if (filter?.tank) delen.push(`(van_tank = "${filter.tank}" || naar_tank = "${filter.tank}")`);
  if (filter?.producent) delen.push(`producent = "${filter.producent}"`);
  if (filter?.vanaf) delen.push(`datum >= "${filter.vanaf}"`);
  if (filter?.tot) delen.push(`datum <= "${filter.tot}"`);
  const records = await pb.collection("tankboek").getFullList({
    sort: "-datum,-tijd,-created",
    filter: delen.join(" && "),
  });
  return records.map(tankboekFromPb);
}

export interface BoekingInput {
  datum: string;
  tijd?: string;
  partij: string;
  producent?: string;
  actie: TankboekActie;
  van_tank?: string;
  naar_tank?: string;
  volume_l: number;
  middel?: string;
  dosering?: string;
  verantwoordelijke: string;
  corrigeert?: string;
  notitie?: string;
}

export interface BoekingResultaat {
  ok: boolean;
  waarschuwing: string;
  regelId?: string;
}

export async function boekTankboek(input: BoekingInput): Promise<BoekingResultaat> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "tankboek", `${input.actie} · ${input.volume_l}L · ${input.datum}`);
  return await pb.send("/api/tappenmars/tankboek-boeking", {
    method: "POST",
    body: input,
  });
}

export interface PartijMetVullingInput extends PartijInput {
  start_tank?: string;
  verantwoordelijke?: string;
}

export async function createPartijViaEndpoint(
  input: PartijMetVullingInput,
): Promise<{ ok: boolean; id: string; waarschuwing: string }> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "partijen", `${input.naam} · ${input.jaargang}`);
  return await pb.send("/api/tappenmars/partij-aanmaken", {
    method: "POST",
    body: input,
  });
}

export async function herberekenTanks(): Promise<{ ok: boolean; tanks_bijgewerkt: number }> {
  const pb = await pbOfFout();
  logAudit("gewijzigd", "tanks", "Herberekening tankcaches vanuit tankboek");
  return await pb.send("/api/tappenmars/tanks-herbereken", { method: "POST", body: {} });
}

// ============= Analyses =============
function analyseFromPb(r: RecordModel): Analyse {
  return {
    id: r.id,
    datum: r["datum"],
    tijd: r["tijd"] ?? "",
    partij: r["partij"],
    tank: r["tank"] || null,
    dichtheid_oechsle: r["dichtheid_oechsle"] ?? null,
    dichtheid_brix: r["dichtheid_brix"] ?? null,
    dichtheid_sg: r["dichtheid_sg"] ?? null,
    ph: r["ph"] ?? null,
    alcohol_pct: r["alcohol_pct"] ?? null,
    restsuiker_g_l: r["restsuiker_g_l"] ?? null,
    totaalzuur_g_l: r["totaalzuur_g_l"] ?? null,
    vluchtig_zuur_g_l: r["vluchtig_zuur_g_l"] ?? null,
    so2_vrij: r["so2_vrij"] ?? null,
    so2_totaal: r["so2_totaal"] ?? null,
    methode: r["methode"] || null,
    bestand: r["bestand"] ? getPb()?.files.getURL(r, r["bestand"]) : "",
    notitie: r["notitie"] ?? "",
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    created: r["created"],
  };
}

export async function fetchAnalyses(partijId?: string): Promise<Analyse[]> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) return [];
  const records = await pb.collection("analyses").getFullList({
    sort: "-datum,-tijd,-created",
    filter: partijId ? `partij = "${partijId}"` : "",
  });
  return records.map(analyseFromPb);
}

export interface AnalyseInput {
  datum: string;
  tijd?: string;
  partij: string;
  tank?: string | null;
  dichtheid_oechsle?: number | null;
  dichtheid_brix?: number | null;
  dichtheid_sg?: number | null;
  ph?: number | null;
  alcohol_pct?: number | null;
  restsuiker_g_l?: number | null;
  totaalzuur_g_l?: number | null;
  vluchtig_zuur_g_l?: number | null;
  so2_vrij?: number | null;
  so2_totaal?: number | null;
  methode?: AnalyseMethode | null;
  notitie?: string;
  ingevoerd_door?: string;
}

export async function createAnalyse(input: AnalyseInput): Promise<Analyse> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "analyses", `${input.datum} · partij ${input.partij}`);
  const r = await pb.collection("analyses").create({ ...input });
  return analyseFromPb(r);
}

// ============= Kelderlog =============
function kelderlogFromPb(r: RecordModel): KelderlogRegel {
  return {
    id: r.id,
    datum: r["datum"],
    partij: r["partij"] || null,
    tank: r["tank"] || null,
    actie: r["actie"],
    middel: r["middel"] ?? "",
    hoeveelheid: r["hoeveelheid"] ?? null,
    eenheid: r["eenheid"] || null,
    notitie: r["notitie"] ?? "",
    foto: r["foto"] ? getPb()?.files.getURL(r, r["foto"]) : "",
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    created: r["created"],
  };
}

export async function fetchKelderlog(partijId?: string): Promise<KelderlogRegel[]> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) return [];
  const records = await pb.collection("kelderlog").getFullList({
    sort: "-datum,-created",
    filter: partijId ? `partij = "${partijId}"` : "",
  });
  return records.map(kelderlogFromPb);
}

export interface KelderlogInput {
  datum: string;
  partij?: string | null;
  tank?: string | null;
  actie: KelderlogActie;
  middel?: string;
  hoeveelheid?: number | null;
  eenheid?: KelderlogEenheid | null;
  notitie?: string;
  ingevoerd_door?: string;
}

export async function createKelderlog(input: KelderlogInput): Promise<KelderlogRegel> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "kelderlog", `${input.actie} · ${input.datum}`);
  const r = await pb.collection("kelderlog").create({ ...input });
  return kelderlogFromPb(r);
}
