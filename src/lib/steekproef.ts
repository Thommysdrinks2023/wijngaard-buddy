import type { RecordModel } from "pocketbase";
import type { FenologieMoment, Ras } from "./types";
import { ensureOnline, getPb } from "./data";
import { addToSyncQueue, getSyncQueue, removeFromSyncQueue, removeQueuedByLocalId } from "./sync";
import { logAudit } from "./audit";
import { naarPrullenbak } from "./prullenbak";

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

import { readLs, uid, writeLs } from "./opslag";

// ============= Planten =============
export function getSteekproefPlanten(): SteekproefPlant[] {
  return readLs<SteekproefPlant[]>(LS_PUNTEN, []);
}

// PB-first variant voor multi-device: leest de server en cachet lokaal.
// client_id (= het lokale id) is overal de canonieke sleutel, zodat
// meting→plant verwijzingen op elk apparaat blijven kloppen.
export async function fetchSteekproefPlanten(): Promise<SteekproefPlant[]> {
  const pb = getPb();
  if (pb && (await ensureOnline())) {
    try {
      const records = await pb.collection("steekproef_planten").getFullList({ sort: "created" });
      const mapped: SteekproefPlant[] = records.map((r: RecordModel) => ({
        id: r["client_id"] || r.id,
        naam: r["naam"],
        ras: r["ras"],
        rij: r["rij"] ?? "",
        rijnummer: r["rijnummer"],
        plant: r["plant"],
        created: r["created"],
      }));
      const pendingIds = new Set(
        getSyncQueue()
          .filter((q) => q.soort === "steekproef_plant" && (q.actie ?? "create") === "create")
          .map((q) => q.localId),
      );
      const lokaalPending = getSteekproefPlanten().filter((p) => pendingIds.has(p.id));
      const merged = [...mapped, ...lokaalPending];
      writeLs(LS_PUNTEN, merged);
      return merged;
    } catch {
      // fall through
    }
  }
  return getSteekproefPlanten();
}

export function createSteekproefPlant(
  input: Omit<SteekproefPlant, "id" | "created">,
): SteekproefPlant {
  const all = getSteekproefPlanten();
  const p: SteekproefPlant = { ...input, id: uid(), created: new Date().toISOString() };
  all.push(p);
  writeLs(LS_PUNTEN, all);
  addToSyncQueue(
    "steekproef_plant",
    p.id,
    {
      client_id: p.id,
      naam: p.naam,
      ras: p.ras,
      rij: p.rij,
      rijnummer: p.rijnummer,
      plant: p.plant,
    },
    { collection: "steekproef_planten", lsKey: LS_PUNTEN },
  );
  return p;
}

export function deleteSteekproefPlant(id: string) {
  // snapshot (plant + metingen) voor de prullenbak
  const plant = getSteekproefPlanten().find((p) => p.id === id);
  const plantMetingen = getSteekproefMetingen(id);
  if (plant) {
    naarPrullenbak(
      "Steekproefplant",
      `${plant.naam} · rij ${plant.rijnummer} · ${plant.ras} (${plantMetingen.length} metingen)`,
      { plant: { ...plant }, metingen: plantMetingen },
    );
    logAudit("verwijderd", "steekproef_planten", `${plant.naam} rij ${plant.rijnummer}`, plant);
  }
  const all = getSteekproefPlanten().filter((p) => p.id !== id);
  writeLs(LS_PUNTEN, all);
  // Cascade: verwijder bijbehorende metingen
  const metingen = getSteekproefMetingen().filter((m) => m.plantId !== id);
  writeLs(LS_METINGEN, metingen);
  // wachtende creates voor deze plant en zijn metingen uit de wachtrij halen
  const stondNogInWachtrij = removeQueuedByLocalId(id);
  getSyncQueue()
    .filter((q) => q.soort === "steekproef_meting" && q.payload["plant_client_id"] === id)
    .forEach((q) => removeFromSyncQueue(q.queueId));
  if (!stondNogInWachtrij) {
    // plant stond al op de server: daar ook verwijderen (op client_id)
    addToSyncQueue(
      "steekproef_plant",
      `del-${id}`,
      {},
      {
        collection: "steekproef_planten",
        actie: "delete",
        filter: `client_id='${id}'`,
      },
    );
    addToSyncQueue(
      "steekproef_meting",
      `del-metingen-${id}`,
      {},
      {
        collection: "steekproef_metingen",
        actie: "delete",
        filter: `plant_client_id='${id}'`,
      },
    );
  }
}

// Zet een verwijderde plant (incl. metingen) terug met de originele id's,
// zodat alle verwijzingen blijven kloppen — gebruikt door de prullenbak.
export function herstelSteekproefPlant(plant: SteekproefPlant, metingen: SteekproefMeting[]) {
  const planten = getSteekproefPlanten();
  if (!planten.some((p) => p.id === plant.id)) {
    planten.push(plant);
    writeLs(LS_PUNTEN, planten);
    addToSyncQueue(
      "steekproef_plant",
      plant.id,
      {
        client_id: plant.id,
        naam: plant.naam,
        ras: plant.ras,
        rij: plant.rij,
        rijnummer: plant.rijnummer,
        plant: plant.plant,
      },
      { collection: "steekproef_planten", lsKey: LS_PUNTEN },
    );
  }
  const alleMetingen = readLs<SteekproefMeting[]>(LS_METINGEN, []);
  for (const m of metingen) {
    if (alleMetingen.some((x) => x.id === m.id)) continue;
    alleMetingen.push(m);
    addToSyncQueue(
      "steekproef_meting",
      m.id,
      {
        client_id: m.id,
        plant_client_id: m.plantId,
        datum: m.datum,
        seizoen: m.seizoen,
        trosaantal: m.trosaantal ?? null,
        trosgewicht: m.trosgewicht ?? null,
        brix: m.brix ?? null,
        zuurgraad: m.zuurgraad ?? null,
        fenologie: m.fenologie ?? "",
        ziektedruk: m.ziektedruk ?? "",
        bladgroei: m.bladgroei ?? "",
        bodem: m.bodem ?? "",
        biodiversiteit: m.biodiversiteit ?? "",
        waterstress: m.waterstress ?? "",
        opbrengst_kg: m.opbrengst_kg ?? null,
        notitie: m.notitie ?? "",
        ingevoerd_door: m.ingevoerd_door,
      },
      { collection: "steekproef_metingen", lsKey: LS_METINGEN },
    );
  }
  writeLs(LS_METINGEN, alleMetingen);
  logAudit("teruggezet", "steekproef_planten", `${plant.naam} rij ${plant.rijnummer}`);
}

// ============= Metingen =============
export function getSteekproefMetingen(plantId?: string): SteekproefMeting[] {
  const all = readLs<SteekproefMeting[]>(LS_METINGEN, []);
  const f = plantId ? all.filter((m) => m.plantId === plantId) : all;
  return f.sort((a, b) => (a.datum < b.datum ? 1 : -1));
}

export async function fetchSteekproefMetingen(plantId?: string): Promise<SteekproefMeting[]> {
  const pb = getPb();
  if (pb && (await ensureOnline())) {
    try {
      const records = await pb.collection("steekproef_metingen").getFullList({ sort: "created" });
      const mapped: SteekproefMeting[] = records.map((r: RecordModel) => ({
        id: r["client_id"] || r.id,
        plantId: r["plant_client_id"],
        datum: r["datum"],
        seizoen: r["seizoen"],
        trosaantal: r["trosaantal"] ?? null,
        trosgewicht: r["trosgewicht"] ?? null,
        brix: r["brix"] ?? null,
        zuurgraad: r["zuurgraad"] ?? null,
        fenologie: r["fenologie"] || null,
        ziektedruk: r["ziektedruk"] || null,
        bladgroei: r["bladgroei"] || null,
        bodem: r["bodem"] || null,
        biodiversiteit: r["biodiversiteit"] || null,
        waterstress: r["waterstress"] || null,
        opbrengst_kg: r["opbrengst_kg"] ?? null,
        notitie: r["notitie"] ?? "",
        ingevoerd_door: r["ingevoerd_door"] ?? "",
        created: r["created"],
      }));
      const pendingIds = new Set(
        getSyncQueue()
          .filter((q) => q.soort === "steekproef_meting" && (q.actie ?? "create") === "create")
          .map((q) => q.localId),
      );
      const lokaalPending = readLs<SteekproefMeting[]>(LS_METINGEN, []).filter((m) =>
        pendingIds.has(m.id),
      );
      const merged = [...mapped, ...lokaalPending];
      writeLs(LS_METINGEN, merged);
      const f = plantId ? merged.filter((m) => m.plantId === plantId) : merged;
      return f.sort((a, b) => (a.datum < b.datum ? 1 : -1));
    } catch {
      // fall through
    }
  }
  return getSteekproefMetingen(plantId);
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
  addToSyncQueue(
    "steekproef_meting",
    m.id,
    {
      client_id: m.id,
      plant_client_id: m.plantId,
      datum: m.datum,
      seizoen: m.seizoen,
      trosaantal: m.trosaantal ?? null,
      trosgewicht: m.trosgewicht ?? null,
      brix: m.brix ?? null,
      zuurgraad: m.zuurgraad ?? null,
      fenologie: m.fenologie ?? "",
      ziektedruk: m.ziektedruk ?? "",
      bladgroei: m.bladgroei ?? "",
      bodem: m.bodem ?? "",
      biodiversiteit: m.biodiversiteit ?? "",
      waterstress: m.waterstress ?? "",
      opbrengst_kg: m.opbrengst_kg ?? null,
      notitie: m.notitie ?? "",
      ingevoerd_door: m.ingevoerd_door,
    },
    { collection: "steekproef_metingen", lsKey: LS_METINGEN },
  );
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
  // synct naar dezelfde oogst-collectie als de /oogst-pagina
  addToSyncQueue(
    "oogst",
    o.id,
    {
      rij: null,
      ras: o.ras,
      datum: o.datum,
      seizoen: o.seizoen,
      kg: o.kg,
      notitie: "",
      ingevoerd_door: "",
    },
    { collection: "oogst", lsKey: LS_OOGST },
  );
  return o;
}
