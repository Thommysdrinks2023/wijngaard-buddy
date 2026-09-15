// Fase 15 Blok A/B — Flessenvoorraad (lege flessen). Bewust online-only en
// zonder sync-wachtrij: mutaties vereisen server-side atomiciteit
// (pb_hooks/flessen.pb.js), zelfde reden als kelder-data.ts.

import type { RecordModel } from "pocketbase";
import type { AccijnsCategorie, Flestype, FlessenMutatie, FlessenMutatieType } from "./types";
import { ensureOnline, getPb, haalLijst } from "./data";
import { logAudit } from "./audit";

const GEEN_VERBINDING = "Geen verbinding — flessenmutaties vereisen de server.";

async function pbOfFout() {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) throw new Error(GEEN_VERBINDING);
  return pb;
}

// ============= Flestypes =============
function flestypeFromPb(r: RecordModel): Flestype {
  return {
    id: r.id,
    vorm: r["vorm"],
    inhoud_ml: r["inhoud_ml"] ?? 0,
    kleur: r["kleur"] ?? "",
    sluiting: r["sluiting"] ?? "",
    omschrijving: r["omschrijving"] ?? "",
    leverancier: r["leverancier"] ?? "",
    standaard_aantal_per_pallet: r["standaard_aantal_per_pallet"] ?? null,
    actief: r["actief"] ?? true,
    created: r["created"],
  };
}

export async function fetchFlestypes(opties?: { alleenActief?: boolean }): Promise<Flestype[]> {
  return haalLijst("flestypes", [], async (pb) => {
    const records = await pb.collection("flestypes").getFullList({
      sort: "vorm,inhoud_ml",
      filter: opties?.alleenActief ? pb.filter("actief = true") : "",
    });
    return records.map(flestypeFromPb);
  });
}

export interface FlestypeInput {
  vorm: string;
  inhoud_ml: number;
  kleur?: string;
  sluiting?: string;
  leverancier?: string;
  standaard_aantal_per_pallet?: number;
  actief?: boolean;
}

// Zelfde formattering als flestypeOmschrijving() in scripts/setup-pocketbase.mjs
// (dat script mag niet uit de frontend-broncode importeren).
export function omschrijvingVoor(input: {
  kleur?: string;
  sluiting?: string;
  inhoud_ml: number;
}): string {
  const liter = String(input.inhoud_ml / 1000).replace(".", ",");
  return [input.kleur, input.sluiting, `${liter} L`].filter(Boolean).join(" ");
}

export async function createFlestype(input: FlestypeInput): Promise<Flestype> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "flestypes", `${input.vorm} · ${input.inhoud_ml}ml`);
  const r = await pb.collection("flestypes").create({
    ...input,
    omschrijving: omschrijvingVoor(input),
    actief: input.actief ?? true,
  });
  return flestypeFromPb(r);
}

export async function updateFlestype(id: string, input: Partial<FlestypeInput>): Promise<Flestype> {
  const pb = await pbOfFout();
  logAudit("gewijzigd", "flestypes", id);
  const bestaand = await pb.collection("flestypes").getOne(id);
  const samengevoegd = { ...flestypeFromPb(bestaand), ...input };
  const r = await pb.collection("flestypes").update(id, {
    ...input,
    omschrijving: omschrijvingVoor(samengevoegd as FlestypeInput),
  });
  return flestypeFromPb(r);
}

export async function zetFlestypeActief(id: string, actief: boolean): Promise<void> {
  const pb = await pbOfFout();
  logAudit("gewijzigd", "flestypes", `${id} · actief=${actief}`);
  await pb.collection("flestypes").update(id, { actief });
}

// ============= Mutaties =============
function mutatieFromPb(r: RecordModel): FlessenMutatie {
  return {
    id: r.id,
    flestype: r["flestype"],
    mutatie_type: r["mutatie_type"],
    aantal: r["aantal"] ?? 0,
    datum: r["datum"],
    bottelronde: r["bottelronde"] || null,
    leverancier: r["leverancier"] ?? "",
    aantal_pallets: r["aantal_pallets"] ?? null,
    toelichting: r["toelichting"] ?? "",
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    created: r["created"],
  };
}

export interface FlessenMutatieFilter {
  flestype?: string;
  mutatie_type?: FlessenMutatieType;
  vanaf?: string;
  tot?: string;
}

export async function fetchFlessenMutaties(
  filter?: FlessenMutatieFilter,
): Promise<FlessenMutatie[]> {
  return haalLijst("flessenmutaties", [], async (pb) => {
    const delen: string[] = [];
    if (filter?.flestype)
      delen.push(pb.filter("flestype = {:flestype}", { flestype: filter.flestype }));
    if (filter?.mutatie_type)
      delen.push(pb.filter("mutatie_type = {:mt}", { mt: filter.mutatie_type }));
    if (filter?.vanaf) delen.push(pb.filter("datum >= {:vanaf}", { vanaf: filter.vanaf }));
    if (filter?.tot) delen.push(pb.filter("datum <= {:tot}", { tot: filter.tot }));
    const records = await pb.collection("flessen_mutaties").getFullList({
      sort: "-datum,-created",
      filter: delen.join(" && "),
    });
    return records.map(mutatieFromPb);
  });
}

// Standen per flestype-id, berekend server-side (som van alle mutaties).
export async function fetchFlessenStanden(): Promise<Record<string, number>> {
  const pb = getPb();
  if (!pb) return {};
  if (!(await ensureOnline()))
    throw new Error("Geen verbinding — kon de voorraadstand niet laden.");
  const resp = await pb.send<{ standen: Record<string, number> }>(
    "/api/tappenmars/flessen-standen",
    { method: "GET" },
  );
  return resp.standen;
}

export interface FlessenMutatieInput {
  flestype: string;
  mutatie_type: FlessenMutatieType;
  aantal: number;
  datum: string;
  bottelronde?: string;
  leverancier?: string;
  aantal_pallets?: number;
  toelichting?: string;
  ingevoerd_door?: string;
}

export interface FlessenMutatieResultaat {
  ok: boolean;
  regelId: string;
  nieuweStand: number;
}

export async function boekFlessenMutatie(
  input: FlessenMutatieInput,
): Promise<FlessenMutatieResultaat> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "flessen_mutaties", `${input.mutatie_type} · ${input.aantal}`);
  return await pb.send("/api/tappenmars/flessen-mutatie", { method: "POST", body: input });
}

export interface TelcorrectieInput {
  flestype: string;
  geteld_aantal: number;
  datum: string;
  toelichting?: string;
  ingevoerd_door?: string;
}

export async function boekTelcorrectie(input: TelcorrectieInput): Promise<FlessenMutatieResultaat> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "flessen_mutaties", `telcorrectie · ${input.geteld_aantal}`);
  return await pb.send("/api/tappenmars/flessen-telcorrectie", { method: "POST", body: input });
}

// ============= Accijnscategorieën (Fase 15 Blok C/D) =============
function accijnsCategorieFromPb(r: RecordModel): AccijnsCategorie {
  return {
    id: r.id,
    naam: r["naam"],
    tariefsleutel: r["tariefsleutel"],
    heffing: r["heffing"],
    mousserend: r["mousserend"] ?? false,
    alcohol_bereik: r["alcohol_bereik"] ?? "",
    volgorde: r["volgorde"] ?? null,
    actief: r["actief"] ?? true,
  };
}

export async function fetchAccijnsCategorieen(): Promise<AccijnsCategorie[]> {
  return haalLijst("accijnscategorieën", [], async (pb) => {
    const records = await pb.collection("accijns_categorieen").getFullList({
      sort: "volgorde",
      filter: pb.filter("actief = true"),
    });
    return records.map(accijnsCategorieFromPb);
  });
}

/**
 * Stelt een categorie VOOR op basis van alcoholpercentage en parelwijn.
 * Bewust alleen een voorstel: de indeling "wijn" versus "overige gegiste
 * drank" volgt uit de productiewijze, en dat kan de app niet weten — Thomas
 * bevestigt bij het bottelen. Geeft null als er niets zinnigs te zeggen is
 * (geen alcoholpercentage bekend).
 */
export function stelCategorieVoor(
  categorieen: AccijnsCategorie[],
  opties: { alcoholPct: number | null; parelwijn: boolean },
): AccijnsCategorie | null {
  if (opties.alcoholPct == null) return null;
  const bereik = opties.alcoholPct <= 8.5 ? "laag" : "hoog";
  // Voorstel gaat altijd naar "wijn" (het gangbare geval voor De Tappenmars);
  // overige gegiste drank vergt een bewuste keuze van Thomas.
  return (
    categorieen.find(
      (c) =>
        c.heffing === "accijns" &&
        c.mousserend === opties.parelwijn &&
        c.alcohol_bereik === bereik &&
        c.naam.startsWith("Wijn"),
    ) ?? null
  );
}
