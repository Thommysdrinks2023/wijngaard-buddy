// Datalaag voor gezondheid (vine health), oogst en werkuren.
// Zelfde offline-first patroon als data.ts: PocketBase wanneer online,
// localStorage als fallback, en de sync-wachtrij voor offline invoer.

import type { RecordModel } from "pocketbase";
import type { Ras } from "./types";
import { ensureOnline, getPb } from "./data";
import { addToSyncQueue, getSyncQueue } from "./sync";
import { logAudit } from "./audit";

import { readLs, uid, writeLs } from "./opslag";

interface EntityConfig<T extends { id: string; datum: string }> {
  collection: string;
  lsKey: string;
  soort: "gezondheid" | "oogst" | "werkuren" | "lab" | "rij_locatie";
  fromPb: (r: RecordModel) => T;
}

// Generieke fetch/create-fabriek zodat elke entiteit hetzelfde
// offline-first gedrag krijgt zonder drie keer dezelfde code.
function maakEntity<T extends { id: string; datum: string }>(cfg: EntityConfig<T>) {
  async function fetchAll(): Promise<T[]> {
    const pb = getPb();
    if (pb && (await ensureOnline())) {
      try {
        const records = await pb
          .collection(cfg.collection)
          .getFullList({ sort: "-datum,-created" });
        const mapped = records.map((r) => cfg.fromPb(r));
        const pendingIds = new Set(
          getSyncQueue()
            .filter((q) => q.soort === cfg.soort)
            .map((q) => q.localId),
        );
        const lokaalPending = readLs<T[]>(cfg.lsKey, []).filter((x) => pendingIds.has(x.id));
        const merged = [...mapped, ...lokaalPending];
        writeLs(cfg.lsKey, merged);
        return merged.sort((a, b) => (a.datum < b.datum ? 1 : -1));
      } catch {
        // fall through
      }
    }
    return readLs<T[]>(cfg.lsKey, []).sort((a, b) => (a.datum < b.datum ? 1 : -1));
  }

  async function create(zonderId: Omit<T, "id" | "created"> & { created?: string }): Promise<T> {
    const pb = getPb();
    const payload = { ...zonderId } as Record<string, unknown>;
    delete payload.created;
    logAudit(
      "aangemaakt",
      cfg.collection,
      `${cfg.collection}: ${String(payload.datum ?? "")} ${JSON.stringify(payload).slice(0, 80)}`,
    );
    if (pb && (await ensureOnline())) {
      try {
        const r = await pb.collection(cfg.collection).create(payload);
        const aangemaakt = cfg.fromPb(r);
        const cache = readLs<T[]>(cfg.lsKey, []);
        cache.push(aangemaakt);
        writeLs(cfg.lsKey, cache);
        return aangemaakt;
      } catch {
        // fall through naar lokaal
      }
    }
    const lokaal = {
      ...zonderId,
      id: uid(),
      created: new Date().toISOString(),
    } as unknown as T;
    const all = readLs<T[]>(cfg.lsKey, []);
    all.push(lokaal);
    writeLs(cfg.lsKey, all);
    addToSyncQueue(cfg.soort, lokaal.id, payload, {
      collection: cfg.collection,
      lsKey: cfg.lsKey,
    });
    return lokaal;
  }

  return { fetchAll, create };
}

// ============= Gezondheid (vine health) =============
export interface Gezondheid {
  id: string;
  rij: string;
  datum: string;
  seizoen?: number;
  vigor: number; // groeikracht 1-5
  snoeigewicht?: number | null; // gram per plant
  dode_planten?: number | null;
  korte_scheuten?: number | null; // percentage 0-100
  notitie?: string;
  ingevoerd_door: string;
  created: string;
}

const gezondheidEntity = maakEntity<Gezondheid>({
  collection: "gezondheid",
  lsKey: "wg.gezondheid.v1",
  soort: "gezondheid",
  fromPb: (r) => ({
    id: r["id"],
    rij: r["rij"],
    datum: r["datum"],
    seizoen: r["seizoen"] || undefined,
    vigor: r["vigor"],
    snoeigewicht: r["snoeigewicht"] ?? null,
    dode_planten: r["dode_planten"] ?? null,
    korte_scheuten: r["korte_scheuten"] ?? null,
    notitie: r["notitie"] ?? "",
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    created: r["created"],
  }),
});

export const fetchGezondheid = gezondheidEntity.fetchAll;
export const createGezondheid = gezondheidEntity.create;

// ============= Oogst =============
// Bouwt voort op de bestaande lokale oogstregistratie (wg.oogst.v1),
// uitgebreid met rij, notitie en invoerder + PocketBase-sync.
export interface OogstRecord {
  id: string;
  rij?: string | null;
  ras: Ras;
  datum: string;
  seizoen: number;
  kg: number;
  notitie?: string;
  ingevoerd_door?: string;
  created: string;
}

const oogstEntity = maakEntity<OogstRecord>({
  collection: "oogst",
  lsKey: "wg.oogst.v1",
  soort: "oogst",
  fromPb: (r) => ({
    id: r["id"],
    rij: r["rij"] || null,
    ras: r["ras"],
    datum: r["datum"],
    seizoen: r["seizoen"],
    kg: r["kg"],
    notitie: r["notitie"] ?? "",
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    created: r["created"],
  }),
});

export const fetchOogst = oogstEntity.fetchAll;
export const createOogstRecord = oogstEntity.create;

// Verwachte opbrengst per plant (kg) — eenvoudige vuistregel voor jonge
// aanplant; later te vervangen door een echte yield prediction.
export const VERWACHTE_KG_PER_PLANT = 1.5;

// ============= Werkuren =============
export const TAAK_TYPES = [
  "Snoeien",
  "Uitbreken",
  "Aanbinden",
  "Spuiten",
  "Maaien",
  "Bodembewerking",
  "Oogsten",
  "Overig",
] as const;
export type TaakType = (typeof TAAK_TYPES)[number];

export type DoseringEenheid = "ml/L" | "g/L" | "kg/ha" | "L/ha";
export const DOSERING_EENHEDEN: DoseringEenheid[] = ["ml/L", "g/L", "kg/ha", "L/ha"];
export type SpuitReden = "Preventief" | "Curatief";

// Veelgebruikte middelen in de (biologische) wijnbouw — vrij veld blijft mogelijk
export const MIDDEL_SUGGESTIES = [
  "Zwavel (spuitzwavel)",
  "Koper (koperoxychloride)",
  "Bicarbonaat (kaliumbicarbonaat)",
  "Plantversterker (algenextract)",
];

export interface Werkuur {
  id: string;
  datum: string;
  seizoen?: number;
  taak: TaakType;
  rij?: string | null;
  ras?: Ras | null;
  uren: number;
  notitie?: string;
  ingevoerd_door: string;
  // spuitregistratie (alleen bij taak "Spuiten"; wettelijk verplicht in NL)
  middel?: string;
  dosering?: number | null;
  dosering_eenheid?: DoseringEenheid | null;
  reden?: SpuitReden | null;
  wachttijd_dagen?: number | null;
  created: string;
}

// ============= Lab-resultaten =============
export type LabSoort = "Bodemanalyse" | "Sapanalyse" | "Anders";
export const LAB_SOORTEN: LabSoort[] = ["Bodemanalyse", "Sapanalyse", "Anders"];

export interface LabResultaat {
  id: string;
  datum: string;
  seizoen?: number;
  soort: LabSoort;
  // bodemanalyse
  ph?: number | null;
  organische_stof?: number | null; // %
  n?: number | null; // stikstof
  p?: number | null; // fosfor
  k?: number | null; // kalium
  // sapanalyse
  yan?: number | null;
  nh4?: number | null;
  nopa?: number | null;
  notitie?: string;
  bestand?: string; // url van geüpload rapport (pdf/foto)
  ingevoerd_door: string;
  created: string;
}

const labEntity = maakEntity<LabResultaat>({
  collection: "lab",
  lsKey: "wg.lab.v1",
  soort: "lab",
  fromPb: (r) => labEntityFromPb(r),
});

export const fetchLab = labEntity.fetchAll;

// Aanmaken met optioneel rapportbestand (pdf/foto). Bestanden kunnen alleen
// met verbinding worden geüpload; offline wordt het record zonder bestand
// bewaard en gesynchroniseerd.
export async function createLab(
  input: Omit<LabResultaat, "id" | "created" | "bestand"> & { bestandFile?: File | null },
): Promise<LabResultaat> {
  const pb = getPb();
  const { bestandFile, ...rest } = input;
  if (bestandFile && pb && (await ensureOnline())) {
    try {
      const fd = new FormData();
      for (const [sleutel, waarde] of Object.entries(rest)) {
        if (waarde === null || waarde === undefined || waarde === "") continue;
        fd.append(sleutel, typeof waarde === "string" ? waarde : String(waarde));
      }
      fd.append("bestand", bestandFile);
      const r = await pb.collection("lab").create(fd);
      const aangemaakt = labEntityFromPb(r);
      const cache = readLs<LabResultaat[]>("wg.lab.v1", []);
      cache.push(aangemaakt);
      writeLs("wg.lab.v1", cache);
      return aangemaakt;
    } catch {
      // fall through naar gewone create zonder bestand
    }
  }
  return labEntity.create(rest);
}

// hulpfunctie zodat de FormData-route dezelfde mapping gebruikt
function labEntityFromPb(r: RecordModel): LabResultaat {
  return {
    id: r.id,
    datum: r["datum"],
    seizoen: r["seizoen"] || undefined,
    soort: r["soort"],
    ph: r["ph"] ?? null,
    organische_stof: r["organische_stof"] ?? null,
    n: r["n"] ?? null,
    p: r["p"] ?? null,
    k: r["k"] ?? null,
    yan: r["yan"] ?? null,
    nh4: r["nh4"] ?? null,
    nopa: r["nopa"] ?? null,
    notitie: r["notitie"] ?? "",
    bestand: r["bestand"] ? getPb()!.files.getURL(r, r["bestand"]) : undefined,
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    created: r["created"],
  };
}

// ============= GPS-locaties per rij =============
// Op rijnummer (apparaat-onafhankelijk); nieuwste registratie per rij geldt.
export interface RijLocatie {
  id: string;
  rijnummer: number;
  lat: number;
  lon: number;
  datum: string;
  ingevoerd_door?: string;
  created: string;
}

const rijLocatieEntity = maakEntity<RijLocatie>({
  collection: "rij_locaties",
  lsKey: "wg.rij_locaties.v1",
  soort: "rij_locatie",
  fromPb: (r) => ({
    id: r.id,
    rijnummer: r["rijnummer"],
    lat: r["lat"],
    lon: r["lon"],
    datum: r["datum"],
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    created: r["created"],
  }),
});

export const fetchRijLocaties = rijLocatieEntity.fetchAll;
export const createRijLocatie = rijLocatieEntity.create;

// Nieuwste locatie per rijnummer
export function nieuwsteLocaties(locaties: RijLocatie[]): Map<number, RijLocatie> {
  const map = new Map<number, RijLocatie>();
  for (const l of locaties) {
    const cur = map.get(l.rijnummer);
    if (!cur || cur.created < l.created) map.set(l.rijnummer, l);
  }
  return map;
}

const werkurenEntity = maakEntity<Werkuur>({
  collection: "werkuren",
  lsKey: "wg.werkuren.v1",
  soort: "werkuren",
  fromPb: (r) => ({
    id: r["id"],
    datum: r["datum"],
    seizoen: r["seizoen"] || undefined,
    taak: r["taak"],
    rij: r["rij"] || null,
    ras: r["ras"] || null,
    uren: r["uren"],
    notitie: r["notitie"] ?? "",
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    middel: r["middel"] ?? "",
    dosering: r["dosering"] ?? null,
    dosering_eenheid: r["dosering_eenheid"] || null,
    reden: r["reden"] || null,
    wachttijd_dagen: r["wachttijd_dagen"] ?? null,
    created: r["created"],
  }),
});

export const fetchWerkuren = werkurenEntity.fetchAll;
export const createWerkuur = werkurenEntity.create;
