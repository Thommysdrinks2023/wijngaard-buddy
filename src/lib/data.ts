import PocketBase from "pocketbase";
import type { Fenologie, FenologieMoment, Meting, NeerslagType, Observatie, Ras, Rij } from "./types";
import { SEED_RIJEN } from "./seed-rijen";
import {
  addToSyncQueue,
  getSyncQueue,
  removeFromSyncQueue,
  removeQueuedByLocalId,
  syncQueueCount,
  updateQueuedCreate,
} from "./sync";

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

function setPbStatus(nieuw: "online" | "offline") {
  const veranderd = pbStatus !== nieuw;
  pbStatus = nieuw;
  if (veranderd && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("wg.pbstatus.changed"));
  }
}

export async function pingPb(): Promise<boolean> {
  const pb = getPb();
  if (!pb) {
    setPbStatus("offline");
    return false;
  }
  try {
    // maximaal 3,5s wachten: in het veld zonder bereik mag de app niet blijven hangen
    await Promise.race([
      pb.health.check(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3500)),
    ]);
    setPbStatus("online");
    // server is weer bereikbaar: offline aangemaakte records op de achtergrond syncen
    if (!flushBezig && syncQueueCount() > 0) {
      void flushSyncQueue();
    }
    return true;
  } catch {
    setPbStatus("offline");
    return false;
  }
}

// Bug-fix eerste keer laden: alle data-functies wachten op één gedeelde ping
// in plaats van blind de (nog onbekende) status te lezen.
let pingInFlight: Promise<boolean> | null = null;
export async function ensureOnline(): Promise<boolean> {
  if (!getPb()) return false;
  if (pbStatus === "online") return true;
  if (pbStatus === "offline") return false;
  if (!pingInFlight) {
    pingInFlight = pingPb().finally(() => {
      pingInFlight = null;
    });
  }
  return pingInFlight;
}

export function isIngelogd(): boolean {
  const pb = getPb();
  return Boolean(pb?.authStore.isValid);
}

// ---------- localStorage helpers ----------
const LS_RIJEN = "wg.rijen.v2";
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
      const mapped: Rij[] = records.map((r) => ({
        id: r.id,
        rijnummer: r.rijnummer,
        ras: r.ras,
        aantal_planten: r.aantal_planten,
      }));
      if (mapped.length > 0) {
        // cache voor offline gebruik (vervangt lokale seed door echte server-ids)
        writeLs(LS_RIJEN, mapped);
        return mapped;
      }
    } catch {
      // fall through to local
    }
  }
  return ensureSeeded().sort((a, b) => a.rijnummer - b.rijnummer);
}

export async function fetchMetingen(rijId?: string): Promise<Meting[]> {
  const pb = getPb();
  if (pb && (await ensureOnline())) {
    try {
      const filter = rijId ? `rij = "${rijId}"` : "";
      const records = await pb.collection("metingen").getFullList({
        sort: "-datum,-created",
        filter,
      });
      const mapped: Meting[] = records.map((r) => ({
        id: r.id,
        rij: r.rij,
        plant: r.plant ?? null,
        datum: r.datum,
        seizoen: r.seizoen || undefined,
        brix: r.brix ?? null,
        ph: r.ph ?? null,
        zuurgraad: r.zuurgraad ?? null,
        rijpheid_score: r.rijpheid_score,
        notitie: r.notitie ?? "",
        foto: r.foto ? pb.files.getURL(r, r.foto) : undefined,
        temperatuur: r.temperatuur ?? null,
        neerslag: r.neerslag || null,
        ingevoerd_door: r.ingevoerd_door ?? "",
        created: r.created,
      }));
      // nog niet gesyncte lokale records meenemen in de weergave
      const pendingIds = new Set(
        getSyncQueue().filter((q) => q.soort === "meting").map((q) => q.localId),
      );
      const lokaalPending = readLs<Meting[]>(LS_METINGEN, []).filter((m) => pendingIds.has(m.id));
      const merged = [...mapped, ...lokaalPending.filter((m) => !rijId || m.rij === rijId)];
      if (!rijId) {
        // volledige lijst cachen voor offline gebruik
        writeLs(LS_METINGEN, [...mapped, ...lokaalPending]);
      }
      return merged.sort((a, b) => (a.datum < b.datum ? 1 : -1));
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
  if (pb && (await ensureOnline())) {
    try {
      const filter = rijId ? `rij = "${rijId}"` : "";
      const records = await pb.collection("observaties").getFullList({
        sort: "-datum,-created",
        filter,
      });
      const mapped: Observatie[] = records.map((r) => ({
        id: r.id,
        rij: r.rij,
        plant: r.plant ?? null,
        datum: r.datum,
        seizoen: r.seizoen || undefined,
        type: r.type,
        notitie: r.notitie ?? "",
        foto: r.foto ? pb.files.getURL(r, r.foto) : undefined,
        ingevoerd_door: r.ingevoerd_door ?? "",
        created: r.created,
      }));
      const pendingIds = new Set(
        getSyncQueue().filter((q) => q.soort === "observatie").map((q) => q.localId),
      );
      const lokaalPending = readLs<Observatie[]>(LS_OBS, []).filter((o) => pendingIds.has(o.id));
      const merged = [...mapped, ...lokaalPending.filter((o) => !rijId || o.rij === rijId)];
      if (!rijId) {
        writeLs(LS_OBS, [...mapped, ...lokaalPending]);
      }
      return merged.sort((a, b) => (a.datum < b.datum ? 1 : -1));
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
  temperatuur?: number | null;
  neerslag?: NeerslagType | null;
}

export async function createMeting(input: MetingInput): Promise<Meting> {
  const pb = getPb();
  if (pb && (await ensureOnline())) {
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
      fd.append("seizoen", String(new Date(input.datum).getFullYear()));
      const r = await pb.collection("metingen").create(fd);
      const aangemaakt: Meting = {
        id: r.id,
        rij: r.rij,
        plant: r.plant ?? null,
        datum: r.datum,
        seizoen: r.seizoen || undefined,
        brix: r.brix ?? null,
        ph: r.ph ?? null,
        zuurgraad: r.zuurgraad ?? null,
        rijpheid_score: r.rijpheid_score,
        notitie: r.notitie ?? "",
        foto: r.foto ? pb.files.getURL(r, r.foto) : undefined,
        ingevoerd_door: r.ingevoerd_door,
        created: r.created,
      };
      // lokale cache bijwerken zodat het record ook offline zichtbaar is
      const cache = readLs<Meting[]>(LS_METINGEN, []);
      cache.push(aangemaakt);
      writeLs(LS_METINGEN, cache);
      return aangemaakt;
    } catch {
      // fall through to local
    }
  }
  const meting: Meting = {
    id: uid(),
    rij: input.rij,
    plant: input.plant ?? null,
    datum: input.datum,
    seizoen: new Date(input.datum).getFullYear(),
    brix: input.brix ?? null,
    ph: input.ph ?? null,
    zuurgraad: input.zuurgraad ?? null,
    rijpheid_score: input.rijpheid_score as 1 | 2 | 3 | 4 | 5,
    notitie: input.notitie,
    temperatuur: input.temperatuur ?? null,
    neerslag: input.neerslag ?? null,
    ingevoerd_door: input.ingevoerd_door,
    created: new Date().toISOString(),
  };
  const all = readLs<Meting[]>(LS_METINGEN, []);
  all.push(meting);
  writeLs(LS_METINGEN, all);
  // in de wachtrij zetten voor synchronisatie zodra de server bereikbaar is
  // (foto's kunnen niet offline bewaard worden en gaan dus niet mee)
  addToSyncQueue("meting", meting.id, {
    rij: input.rij,
    plant: input.plant ?? null,
    datum: input.datum,
    seizoen: meting.seizoen,
    brix: input.brix ?? null,
    ph: input.ph ?? null,
    zuurgraad: input.zuurgraad ?? null,
    rijpheid_score: input.rijpheid_score,
    notitie: input.notitie ?? "",
    temperatuur: input.temperatuur ?? null,
    neerslag: input.neerslag ?? null,
    ingevoerd_door: input.ingevoerd_door,
  });
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
  if (pb && (await ensureOnline())) {
    try {
      const fd = new FormData();
      fd.append("rij", input.rij);
      if (input.plant != null) fd.append("plant", String(input.plant));
      fd.append("datum", input.datum);
      fd.append("type", input.type);
      fd.append("notitie", input.notitie);
      if (input.fotoFile) fd.append("foto", input.fotoFile);
      fd.append("ingevoerd_door", input.ingevoerd_door);
      fd.append("seizoen", String(new Date(input.datum).getFullYear()));
      const r = await pb.collection("observaties").create(fd);
      const aangemaakt: Observatie = {
        id: r.id,
        rij: r.rij,
        plant: r.plant ?? null,
        datum: r.datum,
        seizoen: r.seizoen || undefined,
        type: r.type,
        notitie: r.notitie,
        foto: r.foto ? pb.files.getURL(r, r.foto) : undefined,
        ingevoerd_door: r.ingevoerd_door,
        created: r.created,
      };
      const cache = readLs<Observatie[]>(LS_OBS, []);
      cache.push(aangemaakt);
      writeLs(LS_OBS, cache);
      return aangemaakt;
    } catch {
      // fall through
    }
  }
  const obs: Observatie = {
    id: uid(),
    rij: input.rij,
    plant: input.plant ?? null,
    datum: input.datum,
    seizoen: new Date(input.datum).getFullYear(),
    type: input.type as Observatie["type"],
    notitie: input.notitie,
    ingevoerd_door: input.ingevoerd_door,
    created: new Date().toISOString(),
  };
  const all = readLs<Observatie[]>(LS_OBS, []);
  all.push(obs);
  writeLs(LS_OBS, all);
  addToSyncQueue("observatie", obs.id, {
    rij: input.rij,
    plant: input.plant ?? null,
    datum: input.datum,
    seizoen: obs.seizoen,
    type: input.type,
    notitie: input.notitie,
    ingevoerd_door: input.ingevoerd_door,
  });
  return obs;
}

// ============= Fenologie =============
export async function fetchFenologie(rijId?: string): Promise<Fenologie[]> {
  const pb = getPb();
  if (pb && (await ensureOnline())) {
    try {
      const filter = rijId ? `rij = "${rijId}"` : "";
      const records = await pb.collection("fenologie").getFullList({
        sort: "-datum,-created",
        filter,
      });
      const mapped: Fenologie[] = records.map((r) => ({
        id: r.id,
        rij: r.rij,
        ras: r.ras,
        moment: r.moment,
        datum: r.datum,
        seizoen: r.seizoen || undefined,
        notitie: r.notitie ?? "",
        ingevoerd_door: r.ingevoerd_door ?? "",
        created: r.created,
      }));
      const pendingIds = new Set(
        getSyncQueue().filter((q) => q.soort === "fenologie").map((q) => q.localId),
      );
      const lokaalPending = readLs<Fenologie[]>(LS_FENOLOGIE, []).filter((f) =>
        pendingIds.has(f.id),
      );
      const merged = [...mapped, ...lokaalPending.filter((f) => !rijId || f.rij === rijId)];
      if (!rijId) {
        writeLs(LS_FENOLOGIE, [...mapped, ...lokaalPending]);
      }
      return merged.sort((a, b) => (a.datum < b.datum ? 1 : -1));
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
  if (pb && (await ensureOnline())) {
    try {
      const r = await pb.collection("fenologie").create({
        rij: input.rij,
        ras: input.ras,
        moment: input.moment,
        datum: input.datum,
        seizoen: new Date(input.datum).getFullYear(),
        notitie: input.notitie ?? "",
        ingevoerd_door: input.ingevoerd_door,
      });
      const aangemaakt: Fenologie = {
        id: r.id,
        rij: r.rij,
        ras: r.ras,
        moment: r.moment,
        datum: r.datum,
        seizoen: r.seizoen || undefined,
        notitie: r.notitie ?? "",
        ingevoerd_door: r.ingevoerd_door ?? "",
        created: r.created,
      };
      const cache = readLs<Fenologie[]>(LS_FENOLOGIE, []);
      cache.push(aangemaakt);
      writeLs(LS_FENOLOGIE, cache);
      return aangemaakt;
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
    seizoen: new Date(input.datum).getFullYear(),
    notitie: input.notitie,
    ingevoerd_door: input.ingevoerd_door,
    created: new Date().toISOString(),
  };
  const all = readLs<Fenologie[]>(LS_FENOLOGIE, []);
  all.push(fen);
  writeLs(LS_FENOLOGIE, all);
  addToSyncQueue("fenologie", fen.id, {
    rij: input.rij,
    ras: input.ras,
    moment: input.moment,
    datum: input.datum,
    seizoen: fen.seizoen,
    notitie: input.notitie ?? "",
    ingevoerd_door: input.ingevoerd_door,
  });
  return fen;
}

export interface FenologieUpdateInput {
  moment: FenologieMoment;
  datum: string;
  notitie?: string;
  ingevoerd_door: string;
}

export async function updateFenologie(
  id: string,
  input: FenologieUpdateInput,
): Promise<Fenologie> {
  const pb = getPb();
  if (pb && (await ensureOnline())) {
    try {
      const r = await pb.collection("fenologie").update(id, {
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
  const all = readLs<Fenologie[]>(LS_FENOLOGIE, []);
  const idx = all.findIndex((f) => f.id === id);
  if (idx === -1) throw new Error("Fenologie niet gevonden");
  all[idx] = {
    ...all[idx],
    moment: input.moment,
    datum: input.datum,
    notitie: input.notitie,
    ingevoerd_door: input.ingevoerd_door,
  };
  writeLs(LS_FENOLOGIE, all);
  // offline bewerking ook synchroniseren:
  // - record wacht nog op create → de wachtende payload bijwerken
  // - record bestaat al op de server → update-actie in de wachtrij
  const wijzigingen = {
    moment: input.moment,
    datum: input.datum,
    notitie: input.notitie ?? "",
    ingevoerd_door: input.ingevoerd_door,
  };
  if (!updateQueuedCreate(id, wijzigingen)) {
    addToSyncQueue("fenologie", id, wijzigingen, { actie: "update", remoteId: id });
  }
  return all[idx];
}

export async function deleteFenologie(id: string): Promise<void> {
  const pb = getPb();
  if (pb && (await ensureOnline())) {
    try {
      await pb.collection("fenologie").delete(id);
      return;
    } catch {
      // fall through
    }
  }
  const all = readLs<Fenologie[]>(LS_FENOLOGIE, []);
  writeLs(
    LS_FENOLOGIE,
    all.filter((f) => f.id !== id),
  );
  // offline verwijderen ook synchroniseren:
  // - record wachtte nog op create → gewoon uit de wachtrij halen
  // - record bestaat al op de server → delete-actie in de wachtrij
  if (!removeQueuedByLocalId(id)) {
    addToSyncQueue("fenologie", id, {}, { actie: "delete", remoteId: id });
  }
}

// ============= Offline sync =============
let flushBezig = false;

const SOORT_LS_KEY: Record<string, string> = {
  meting: LS_METINGEN,
  observatie: LS_OBS,
  fenologie: LS_FENOLOGIE,
};

const SOORT_COLLECTION: Record<string, string> = {
  meting: "metingen",
  observatie: "observaties",
  fenologie: "fenologie",
};

function removeLocalRecord(lsKey: string, localId: string) {
  // defensief: sommige sleutels (werkkalender, notities) bevatten geen
  // arrays-met-id; daar is lokaal opruimen niet nodig of mogelijk
  const all = readLs<unknown>(lsKey, []);
  if (!Array.isArray(all)) return;
  writeLs(
    lsKey,
    (all as Array<{ id?: string }>).filter((r) => r.id !== localId),
  );
}

// Stuurt offline aangemaakte records naar PocketBase.
// Records met een blijvende fout (bijv. validatie) verdwijnen uit de wachtrij
// maar blijven lokaal bewaard zodat er geen data verloren gaat.
export async function flushSyncQueue(): Promise<{ verzonden: number; mislukt: number }> {
  const pb = getPb();
  const queue = getSyncQueue();
  if (!pb || queue.length === 0) return { verzonden: 0, mislukt: 0 };
  if (flushBezig) return { verzonden: 0, mislukt: 0 };
  flushBezig = true;
  try {
    try {
      await pb.health.check();
      pbStatus = "online";
    } catch {
      pbStatus = "offline";
      return { verzonden: 0, mislukt: queue.length };
    }
    let verzonden = 0;
    let mislukt = 0;
    const rijen = readLs<Rij[]>(LS_RIJEN, []);
    for (const item of queue) {
      try {
        const payload = { ...item.payload };
        // records die offline tegen een seed-rij ("local-12") zijn aangemaakt,
        // koppelen aan de echte PocketBase-rij via het rijnummer
        if (typeof payload.rij === "string" && payload.rij.startsWith("local-")) {
          const nr = Number(payload.rij.slice("local-".length));
          const match = rijen.find((r) => r.rijnummer === nr && !r.id.startsWith("local-"));
          if (match) payload.rij = match.id;
        }
        const collection = item.collection ?? SOORT_COLLECTION[item.soort];
        const lsKey = item.lsKey ?? SOORT_LS_KEY[item.soort];
        if (!collection) {
          // onbekend item: verwijderen om een eeuwige wachtrij te voorkomen
          removeFromSyncQueue(item.queueId);
          continue;
        }
        const actie = item.actie ?? "create";
        if (actie === "create") {
          await pb.collection(collection).create(payload);
          removeFromSyncQueue(item.queueId);
          if (lsKey) removeLocalRecord(lsKey, item.localId);
        } else if (actie === "update") {
          if (item.remoteId) {
            await pb.collection(collection).update(item.remoteId, payload);
          }
          removeFromSyncQueue(item.queueId);
        } else {
          // delete: via remoteId, of via filter (bijv. client_id-records)
          if (item.remoteId) {
            await pb.collection(collection).delete(item.remoteId);
          } else if (item.filter) {
            const gevonden = await pb
              .collection(collection)
              .getList(1, 100, { filter: item.filter });
            for (const record of gevonden.items) {
              await pb.collection(collection).delete(record.id);
            }
          }
          removeFromSyncQueue(item.queueId);
        }
        verzonden++;
      } catch (err) {
        const status = (err as { status?: number }).status ?? 0;
        // 400 = blijvende validatiefout: uit de wachtrij (lokale kopie blijft).
        // 401/403 (niet ingelogd) en netwerk-/serverfouten blijven staan voor
        // een nieuwe poging na inloggen of als de server weer bereikbaar is.
        if (status === 400 || status === 404) {
          removeFromSyncQueue(item.queueId);
        }
        mislukt++;
      }
    }
    return { verzonden, mislukt };
  } finally {
    flushBezig = false;
  }
}

export async function fetchFenologieById(id: string): Promise<Fenologie | null> {
  const pb = getPb();
  if (pb && (await ensureOnline())) {
    try {
      const r = await pb.collection("fenologie").getOne(id);
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
      // fall through
    }
  }
  const all = readLs<Fenologie[]>(LS_FENOLOGIE, []);
  return all.find((f) => f.id === id) ?? null;
}
