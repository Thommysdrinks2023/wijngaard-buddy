// Datalaag kelder Fase 0–2: producenten, tanks, tankboek, analyses, kelderlog.
// Bewust online-only en zonder sync-wachtrij: tankboek-boekingen vereisen
// server-side atomiciteit (pb_hooks/kelder.pb.js) — zie ARCHITECTURE.md §7.6.

import type { RecordModel } from "pocketbase";
import type {
  Analyse,
  AnalyseMethode,
  Bottelronde,
  KelderlogActie,
  KelderlogEenheid,
  KelderlogRegel,
  Producent,
  Tank,
  TankboekActie,
  TankboekRegel,
  TankStatus,
  VoedingswaardeBerekening,
  VoorraadFles,
  VoorraadMutatie,
  VoorraadMutatieType,
} from "./types";
import type { PartijInput } from "./partijen-data";
import { ensureOnline, getPb, haalLijst, isIngelogd } from "./data";
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
  if (!pb) return [];
  // Bug gevonden (Fase 7-nazorg): zonder deze expliciete check gaf een
  // niet-ingelogde sessie hier stil een lege lijst — de PocketBase-listRule
  // laat het verzoek gewoon door (200, items: []), dus dat werd nergens als
  // fout herkend. Nu een duidelijke fout die de aanroepende query.isError
  // maakt (zie kelder.partijen.nieuw.tsx).
  if (!isIngelogd()) throw new Error("Log opnieuw in om producenten te kunnen laden.");
  if (!(await ensureOnline()))
    throw new Error("Geen verbinding met de server — kon producenten niet laden.");
  try {
    const records = await pb.collection("producenten").getFullList({ sort: "naam" });
    return records.map(producentFromPb);
  } catch {
    throw new Error("Kon producenten niet laden — probeer het opnieuw.");
  }
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
  if (!pb) return [];
  if (!isIngelogd()) throw new Error("Log opnieuw in om tanks te kunnen laden.");
  if (!(await ensureOnline()))
    throw new Error("Geen verbinding met de server — kon tanks niet laden.");
  try {
    const records = await pb.collection("tanks").getFullList({ sort: "code" });
    return records.map(tankFromPb).sort(tankCodeVergelijk);
  } catch {
    throw new Error("Kon tanks niet laden — probeer het opnieuw.");
  }
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
  return haalLijst("het tankboek", [], async (pb) => {
    const delen: string[] = [];
    if (filter?.partij) delen.push(pb.filter("partij = {:partij}", { partij: filter.partij }));
    if (filter?.tank)
      delen.push(pb.filter("(van_tank = {:tank} || naar_tank = {:tank})", { tank: filter.tank }));
    if (filter?.producent)
      delen.push(pb.filter("producent = {:producent}", { producent: filter.producent }));
    if (filter?.vanaf) delen.push(pb.filter("datum >= {:vanaf}", { vanaf: filter.vanaf }));
    if (filter?.tot) delen.push(pb.filter("datum <= {:tot}", { tot: filter.tot }));
    const records = await pb.collection("tankboek").getFullList({
      sort: "-datum,-tijd,-created",
      filter: delen.join(" && "),
    });
    return records.map(tankboekFromPb);
  });
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
  return haalLijst("analyses", [], async (pb) => {
    const records = await pb.collection("analyses").getFullList({
      sort: "-datum,-tijd,-created",
      filter: partijId ? pb.filter("partij = {:partijId}", { partijId }) : "",
    });
    return records.map(analyseFromPb);
  });
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

export interface KelderlogFilter {
  partij?: string;
  tank?: string;
  actie?: string;
  vanaf?: string; // datum >=
  tot?: string; // datum <=
}

// Blok F — uitgebreid van een kale partijId-parameter naar een filterobject
// (zelfde patroon als fetchTankboek) zodat /kelder/logboek net als het
// tankboek filterbaar kan zijn op tank/actie/periode, niet alleen partij.
export async function fetchKelderlog(filter?: string | KelderlogFilter): Promise<KelderlogRegel[]> {
  return haalLijst("het kelderlog", [], async (pb) => {
    const f: KelderlogFilter = typeof filter === "string" ? { partij: filter } : (filter ?? {});
    const delen: string[] = [];
    if (f.partij) delen.push(`partij = "${f.partij}"`);
    if (f.tank) delen.push(`tank = "${f.tank}"`);
    if (f.actie) delen.push(`actie = "${f.actie}"`);
    if (f.vanaf) delen.push(`datum >= "${f.vanaf}"`);
    if (f.tot) delen.push(`datum <= "${f.tot}"`);
    const records = await pb.collection("kelderlog").getFullList({
      sort: "-datum,-created",
      filter: delen.join(" && "),
      // requestKey: null — de taak-signaalproducent en het partijdetail
      // vragen dit tegelijk op (auto-cancellation-valkuil, zie CLAUDE.md).
      requestKey: null,
    });
    return records.map(kelderlogFromPb);
  });
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

// ============= Voedingswaarde-/etiketberekeningen =============
// Zelfde patroon als analyses/kelderlog: vrij toevoegen,
// nooit bewerken/verwijderen — elke berekening is een los historisch record.
function voedingswaardeFromPb(r: RecordModel): VoedingswaardeBerekening {
  return {
    id: r.id,
    partij: r["partij"],
    berekening_datum: r["berekening_datum"],
    alcohol_gram_liter: r["alcohol_gram_liter"] ?? null,
    restsuiker_gram_liter: r["restsuiker_gram_liter"] ?? null,
    zuur_gram_liter: r["zuur_gram_liter"] ?? null,
    glycerine_gram_liter: r["glycerine_gram_liter"] ?? null,
    kcal_totaal: r["kcal_totaal"] ?? null,
    kj_totaal: r["kj_totaal"] ?? null,
    etiket_tekst: r["etiket_tekst"] ?? "",
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    created: r["created"],
  };
}

export async function fetchVoedingswaardeBerekeningen(
  partijId: string,
): Promise<VoedingswaardeBerekening[]> {
  return haalLijst("voedingswaardeberekeningen", [], async (pb) => {
    const records = await pb.collection("voedingswaarde_berekeningen").getFullList({
      sort: "-berekening_datum,-created",
      filter: pb.filter("partij = {:partijId}", { partijId }),
    });
    return records.map(voedingswaardeFromPb);
  });
}

export interface VoedingswaardeInput {
  partij: string;
  berekening_datum: string;
  alcohol_gram_liter?: number | null;
  restsuiker_gram_liter?: number | null;
  zuur_gram_liter?: number | null;
  glycerine_gram_liter?: number | null;
  kcal_totaal?: number | null;
  kj_totaal?: number | null;
  etiket_tekst?: string;
  ingevoerd_door?: string;
}

export async function createVoedingswaardeBerekening(
  input: VoedingswaardeInput,
): Promise<VoedingswaardeBerekening> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "voedingswaarde_berekeningen", `partij ${input.partij}`);
  const r = await pb.collection("voedingswaarde_berekeningen").create({ ...input });
  return voedingswaardeFromPb(r);
}

// ============= Bottelrondes (Fase 4) =============
// Aanmaken loopt uitsluitend via het atomische endpoint (zie
// bottelronde-aanmaken hieronder), zodat bottelronde + tankboekregel +
// voorraad_flessen samen slagen of falen — zelfde reden als partijen.
function bottelrondeFromPb(r: RecordModel): Bottelronde {
  return {
    id: r.id,
    partij: r["partij"],
    producent: r["producent"] || null,
    van_tank: r["van_tank"],
    botteldatum: r["botteldatum"],
    aantal_flessen: r["aantal_flessen"] ?? 0,
    flesinhoud_ml: r["flesinhoud_ml"] ?? 0,
    flestype: r["flestype"] ?? "",
    kleur_fles: r["kleur_fles"] ?? "",
    parelwijn: r["parelwijn"] ?? false,
    lotnummer: r["lotnummer"] ?? "",
    voedingswaarde_berekening: r["voedingswaarde_berekening"] || null,
    notities: r["notities"] ?? "",
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    deleted: r["deleted"] ?? false,
    created: r["created"],
    updated: r["updated"],
  };
}

export async function fetchBottelrondes(partijId?: string): Promise<Bottelronde[]> {
  return haalLijst("bottelrondes", [], async (pb) => {
    const records = await pb.collection("bottelrondes").getFullList({
      sort: "-botteldatum,-created",
      filter: partijId
        ? pb.filter("partij = {:partijId} && deleted != true", { partijId })
        : "deleted != true",
    });
    return records.map(bottelrondeFromPb);
  });
}

export async function fetchBottelrondeById(id: string): Promise<Bottelronde | null> {
  const pb = getPb();
  if (!pb) return null;
  if (!isIngelogd()) throw new Error(`Log opnieuw in om de bottelronde te kunnen laden.`);
  if (!(await ensureOnline()))
    throw new Error(`Geen verbinding met de server — kon de bottelronde niet laden.`);
  try {
    const r = await pb.collection("bottelrondes").getOne(id);
    return bottelrondeFromPb(r);
  } catch {
    return null;
  }
}

export interface BottelrondeInput {
  partij: string;
  producent?: string | null;
  van_tank: string;
  botteldatum: string;
  aantal_flessen: number;
  flesinhoud_ml: number;
  flestype?: string;
  kleur_fles?: string;
  parelwijn?: boolean;
  lotnummer?: string;
  voedingswaarde_berekening?: string | null;
  wijnnaam?: string;
  jaargang?: number;
  locatie?: string;
  notities?: string;
  ingevoerd_door?: string;
}

export interface BottelrondeResultaat {
  ok: boolean;
  id: string;
  voorraad_id: string;
  waarschuwing: string;
}

export async function createBottelrondeViaEndpoint(
  input: BottelrondeInput,
): Promise<BottelrondeResultaat> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "bottelrondes", `${input.aantal_flessen} fl. · partij ${input.partij}`);
  return await pb.send("/api/tappenmars/bottelronde-aanmaken", {
    method: "POST",
    body: input,
  });
}

// ============= Voorraad (Fase 4) =============
function voorraadFlesFromPb(r: RecordModel): VoorraadFles {
  return {
    id: r.id,
    bottelronde: r["bottelronde"],
    partij: r["partij"],
    producent: r["producent"] || null,
    wijnnaam: r["wijnnaam"] ?? "",
    jaargang: r["jaargang"] ?? null,
    aantal_beginvoorraad: r["aantal_beginvoorraad"] ?? 0,
    aantal_huidig: r["aantal_huidig"] ?? 0,
    locatie: r["locatie"] ?? "",
    status: r["status"],
    created: r["created"],
    updated: r["updated"],
  };
}

export interface VoorraadFilter {
  producent?: string;
  status?: string;
  partij?: string;
}

export async function fetchVoorraadFlessen(filter?: VoorraadFilter): Promise<VoorraadFles[]> {
  return haalLijst("de voorraad", [], async (pb) => {
    const delen: string[] = [];
    if (filter?.producent)
      delen.push(pb.filter("producent = {:producent}", { producent: filter.producent }));
    if (filter?.status) delen.push(pb.filter("status = {:status}", { status: filter.status }));
    if (filter?.partij) delen.push(pb.filter("partij = {:partij}", { partij: filter.partij }));
    const records = await pb.collection("voorraad_flessen").getFullList({
      sort: "-created",
      filter: delen.join(" && "),
    });
    return records.map(voorraadFlesFromPb);
  });
}

export async function fetchVoorraadFlesById(id: string): Promise<VoorraadFles | null> {
  const pb = getPb();
  if (!pb) return null;
  if (!isIngelogd()) throw new Error(`Log opnieuw in om de voorraad te kunnen laden.`);
  if (!(await ensureOnline()))
    throw new Error(`Geen verbinding met de server — kon de voorraad niet laden.`);
  try {
    const r = await pb.collection("voorraad_flessen").getOne(id);
    return voorraadFlesFromPb(r);
  } catch {
    return null;
  }
}

function voorraadMutatieFromPb(r: RecordModel): VoorraadMutatie {
  return {
    id: r.id,
    voorraad: r["voorraad"],
    mutatie_type: r["mutatie_type"],
    aantal: r["aantal"] ?? 0,
    datum: r["datum"],
    afnemer_of_reden: r["afnemer_of_reden"] ?? "",
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    notities: r["notities"] ?? "",
    created: r["created"],
  };
}

export async function fetchVoorraadMutaties(voorraadId: string): Promise<VoorraadMutatie[]> {
  return haalLijst("voorraadmutaties", [], async (pb) => {
    const records = await pb.collection("voorraad_mutaties").getFullList({
      sort: "-datum,-created",
      filter: pb.filter("voorraad = {:voorraadId}", { voorraadId }),
    });
    return records.map(voorraadMutatieFromPb);
  });
}

export interface VoorraadMutatieInput {
  voorraad: string;
  mutatie_type: VoorraadMutatieType;
  aantal: number;
  datum: string;
  afnemer_of_reden?: string;
  ingevoerd_door?: string;
  notities?: string;
}

export interface VoorraadMutatieResultaat {
  ok: boolean;
  waarschuwing: string;
  regelId: string;
  aantal_huidig: number;
  status: string;
}

export async function boekVoorraadMutatie(
  input: VoorraadMutatieInput,
): Promise<VoorraadMutatieResultaat> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "voorraad_mutaties", `${input.mutatie_type} · ${input.aantal}`);
  return await pb.send("/api/tappenmars/voorraad-mutatie", {
    method: "POST",
    body: input,
  });
}
