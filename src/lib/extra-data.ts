// Datalaag voor gezondheid (vine health), oogst en werkuren.
// Zelfde offline-first patroon als data.ts: PocketBase wanneer online,
// localStorage als fallback, en de sync-wachtrij voor offline invoer.

import type { RecordModel } from "pocketbase";
import type { Ras } from "./types";
import { getPb, getPbStatus } from "./data";
import { addToSyncQueue, getSyncQueue } from "./sync";

// ---------- gedeelde helpers ----------
function readLs<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLs<T>(key: string, val: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(val));
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface EntityConfig<T extends { id: string; datum: string }> {
  collection: string;
  lsKey: string;
  soort: "gezondheid" | "oogst" | "werkuren";
  fromPb: (r: RecordModel) => T;
}

// Generieke fetch/create-fabriek zodat elke entiteit hetzelfde
// offline-first gedrag krijgt zonder drie keer dezelfde code.
function maakEntity<T extends { id: string; datum: string }>(cfg: EntityConfig<T>) {
  async function fetchAll(): Promise<T[]> {
    const pb = getPb();
    if (pb && getPbStatus() === "online") {
      try {
        const records = await pb.collection(cfg.collection).getFullList({ sort: "-datum,-created" });
        const mapped = records.map((r) => cfg.fromPb(r));
        const pendingIds = new Set(
          getSyncQueue().filter((q) => q.soort === cfg.soort).map((q) => q.localId),
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
    if (pb && getPbStatus() === "online") {
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
  created: string;
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
    created: r["created"],
  }),
});

export const fetchWerkuren = werkurenEntity.fetchAll;
export const createWerkuur = werkurenEntity.create;
