import PocketBase from "pocketbase";
import type { Fenologie, FenologieMoment, Meting, Observatie, Ras, Rij } from "./types";
import { SEED_RIJEN } from "./seed-rijen";

const PB_URL = import.meta.env.VITE_POCKETBASE_URL as string | undefined;

let pbInstance: PocketBase | null = null;
let pbStatus: "unknown" | "online" | "offline" = "unknown";

export function getPb(): PocketBase | null {
  if (!PB_URL) return null;
  if (!pbInstance) pbInstance = new PocketBase(PB_URL);
  return pbInstance;
}

export function isPbConfigured(): boolean {
  return Boolean(PB_URL);
}

export function getPbStatus() {
  return pbStatus;
}

export async function pingPb(): Promise<boolean> {
  const pb = getPb();
  if (!pb) {
    pbStatus = "offline";
    return false;
  }
  try {
    await pb.health.check();
    pbStatus = "online";
    return true;
  } catch {
    pbStatus = "offline";
    return false;
  }
}

// ---------- localStorage helpers ----------
const LS_RIJEN = "wg.rijen.v1";
const LS_METINGEN = "wg.metingen.v1";
const LS_OBS = "wg.observaties.v1";
const LS_FENOLOGIE = "wg.fenologie.v1";
const LS_NAME = "wg.invoerder.v1";

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

export function getInvoerder(): string {
  return readLs<string>(LS_NAME, "");
}
export function setInvoerder(naam: string) {
  writeLs(LS_NAME, naam);
}

// ---------- Seed ----------
function ensureSeeded(): Rij[] {
  const existing = readLs<Rij[]>(LS_RIJEN, []);
  if (existing.length > 0) return existing;
  const seeded: Rij[] = SEED_RIJEN.map((r) => ({
    id: `local-${r.rijnummer}`,
    rijnummer: r.rijnummer,
    ras: r.ras,
    aantal_planten: r.aantal_planten,
  }));
  writeLs(LS_RIJEN, seeded);
  return seeded;
}

// ---------- API ----------
export async function fetchRijen(): Promise<Rij[]> {
  const pb = getPb();
  if (pb && (await pingPb())) {
    try {
      const records = await pb.collection("rijen").getFullList({ sort: "rijnummer" });
      return records.map((r) => ({
        id: r.id,
        rijnummer: r.rijnummer,
        ras: r.ras,
        aantal_planten: r.aantal_planten,
      }));
    } catch {
      // fall through to local
    }
  }
  return ensureSeeded().sort((a, b) => a.rijnummer - b.rijnummer);
}

export async function fetchMetingen(rijId?: string): Promise<Meting[]> {
  const pb = getPb();
  if (pb && pbStatus === "online") {
    try {
      const filter = rijId ? `rij = "${rijId}"` : "";
      const records = await pb.collection("metingen").getFullList({
        sort: "-datum,-created",
        filter,
      });
      return records.map((r) => ({
        id: r.id,
        rij: r.rij,
        plant: r.plant ?? null,
        datum: r.datum,
        brix: r.brix ?? null,
        ph: r.ph ?? null,
        zuurgraad: r.zuurgraad ?? null,
        rijpheid_score: r.rijpheid_score,
        notitie: r.notitie ?? "",
        foto: r.foto ? pb.files.getURL(r, r.foto) : undefined,
        ingevoerd_door: r.ingevoerd_door ?? "",
        created: r.created,
      }));
    } catch {
      // fall through
    }
  }
  const all = readLs<Meting[]>(LS_METINGEN, []);
  const filtered = rijId ? all.filter((m) => m.rij === rijId) : all;
  return filtered.sort((a, b) => (a.datum < b.datum ? 1 : -1));
}

export async function fetchObservaties(rijId?: string): Promise<Observatie[]> {
  const pb = getPb();
  if (pb && pbStatus === "online") {
    try {
      const filter = rijId ? `rij = "${rijId}"` : "";
      const records = await pb.collection("observaties").getFullList({
        sort: "-datum,-created",
        filter,
      });
      return records.map((r) => ({
        id: r.id,
        rij: r.rij,
        plant: r.plant ?? null,
        datum: r.datum,
        type: r.type,
        notitie: r.notitie ?? "",
        foto: r.foto ? pb.files.getURL(r, r.foto) : undefined,
        ingevoerd_door: r.ingevoerd_door ?? "",
        created: r.created,
      }));
    } catch {
      // fall through
    }
  }
  const all = readLs<Observatie[]>(LS_OBS, []);
  const filtered = rijId ? all.filter((o) => o.rij === rijId) : all;
  return filtered.sort((a, b) => (a.datum < b.datum ? 1 : -1));
}

export interface MetingInput {
  rij: string;
  plant?: number | null;
  datum: string;
  brix?: number | null;
  ph?: number | null;
  zuurgraad?: number | null;
  rijpheid_score: number;
  notitie?: string;
  fotoFile?: File | null;
  ingevoerd_door: string;
}

export async function createMeting(input: MetingInput): Promise<Meting> {
  const pb = getPb();
  if (pb && pbStatus === "online") {
    try {
      const fd = new FormData();
      fd.append("rij", input.rij);
      if (input.plant != null) fd.append("plant", String(input.plant));
      fd.append("datum", input.datum);
      if (input.brix != null) fd.append("brix", String(input.brix));
      if (input.ph != null) fd.append("ph", String(input.ph));
      if (input.zuurgraad != null) fd.append("zuurgraad", String(input.zuurgraad));
      fd.append("rijpheid_score", String(input.rijpheid_score));
      if (input.notitie) fd.append("notitie", input.notitie);
      if (input.fotoFile) fd.append("foto", input.fotoFile);
      fd.append("ingevoerd_door", input.ingevoerd_door);
      const r = await pb.collection("metingen").create(fd);
      return {
        id: r.id,
        rij: r.rij,
        plant: r.plant ?? null,
        datum: r.datum,
        brix: r.brix ?? null,
        ph: r.ph ?? null,
        zuurgraad: r.zuurgraad ?? null,
        rijpheid_score: r.rijpheid_score,
        notitie: r.notitie ?? "",
        foto: r.foto ? pb.files.getURL(r, r.foto) : undefined,
        ingevoerd_door: r.ingevoerd_door,
        created: r.created,
      };
    } catch {
      // fall through to local
    }
  }
  const meting: Meting = {
    id: uid(),
    rij: input.rij,
    plant: input.plant ?? null,
    datum: input.datum,
    brix: input.brix ?? null,
    ph: input.ph ?? null,
    zuurgraad: input.zuurgraad ?? null,
    rijpheid_score: input.rijpheid_score as 1 | 2 | 3 | 4 | 5,
    notitie: input.notitie,
    ingevoerd_door: input.ingevoerd_door,
    created: new Date().toISOString(),
  };
  const all = readLs<Meting[]>(LS_METINGEN, []);
  all.push(meting);
  writeLs(LS_METINGEN, all);
  return meting;
}

export interface ObservatieInput {
  rij: string;
  plant?: number | null;
  datum: string;
  type: string;
  notitie: string;
  fotoFile?: File | null;
  ingevoerd_door: string;
}

export async function createObservatie(input: ObservatieInput): Promise<Observatie> {
  const pb = getPb();
  if (pb && pbStatus === "online") {
    try {
      const fd = new FormData();
      fd.append("rij", input.rij);
      if (input.plant != null) fd.append("plant", String(input.plant));
      fd.append("datum", input.datum);
      fd.append("type", input.type);
      fd.append("notitie", input.notitie);
      if (input.fotoFile) fd.append("foto", input.fotoFile);
      fd.append("ingevoerd_door", input.ingevoerd_door);
      const r = await pb.collection("observaties").create(fd);
      return {
        id: r.id,
        rij: r.rij,
        plant: r.plant ?? null,
        datum: r.datum,
        type: r.type,
        notitie: r.notitie,
        foto: r.foto ? pb.files.getURL(r, r.foto) : undefined,
        ingevoerd_door: r.ingevoerd_door,
        created: r.created,
      };
    } catch {
      // fall through
    }
  }
  const obs: Observatie = {
    id: uid(),
    rij: input.rij,
    plant: input.plant ?? null,
    datum: input.datum,
    type: input.type as Observatie["type"],
    notitie: input.notitie,
    ingevoerd_door: input.ingevoerd_door,
    created: new Date().toISOString(),
  };
  const all = readLs<Observatie[]>(LS_OBS, []);
  all.push(obs);
  writeLs(LS_OBS, all);
  return obs;
}

// ============= Fenologie =============
export async function fetchFenologie(rijId?: string): Promise<Fenologie[]> {
  const pb = getPb();
  if (pb && pbStatus === "online") {
    try {
      const filter = rijId ? `rij = "${rijId}"` : "";
      const records = await pb.collection("fenologie").getFullList({
        sort: "-datum,-created",
        filter,
      });
      return records.map((r) => ({
        id: r.id,
        rij: r.rij,
        ras: r.ras,
        moment: r.moment,
        datum: r.datum,
        notitie: r.notitie ?? "",
        ingevoerd_door: r.ingevoerd_door ?? "",
        created: r.created,
      }));
    } catch {
      // fall through
    }
  }
  const all = readLs<Fenologie[]>(LS_FENOLOGIE, []);
  const filtered = rijId ? all.filter((f) => f.rij === rijId) : all;
  return filtered.sort((a, b) => (a.datum < b.datum ? 1 : -1));
}

export interface FenologieInput {
  rij: string;
  ras: Ras;
  moment: FenologieMoment;
  datum: string;
  notitie?: string;
  ingevoerd_door: string;
}

export async function createFenologie(input: FenologieInput): Promise<Fenologie> {
  const pb = getPb();
  if (pb && pbStatus === "online") {
    try {
      const r = await pb.collection("fenologie").create({
        rij: input.rij,
        ras: input.ras,
        moment: input.moment,
        datum: input.datum,
        notitie: input.notitie ?? "",
        ingevoerd_door: input.ingevoerd_door,
      });
      return {
        id: r.id,
        rij: r.rij,
        ras: r.ras,
        moment: r.moment,
        datum: r.datum,
        notitie: r.notitie ?? "",
        ingevoerd_door: r.ingevoerd_door ?? "",
        created: r.created,
      };
    } catch {
      // fall through to local
    }
  }
  const fen: Fenologie = {
    id: uid(),
    rij: input.rij,
    ras: input.ras,
    moment: input.moment,
    datum: input.datum,
    notitie: input.notitie,
    ingevoerd_door: input.ingevoerd_door,
    created: new Date().toISOString(),
  };
  const all = readLs<Fenologie[]>(LS_FENOLOGIE, []);
  all.push(fen);
  writeLs(LS_FENOLOGIE, all);
  return fen;
}
