import PocketBase from "pocketbase";
import type {
  Fenologie,
  FenologieMoment,
  Meting,
  NeerslagType,
  Observatie,
  Ras,
  Rij,
} from "./types";
import { SEED_RIJEN } from "./seed-rijen";
import {
  addToSyncQueue,
  getSyncQueue,
  registreerSyncFout,
  removeFromSyncQueue,
  removeQueuedByLocalId,
  syncQueueCount,
  updateQueuedCreate,
} from "./sync";
import { classificeerLeesfout, LaadFout } from "./laadfout";
import { deleteOfflineFoto, getOfflineFoto, saveOfflineFoto } from "./foto-opslag";
import { naarPrullenbak, verwijderUitPrullenbak } from "./prullenbak";
import { logAudit } from "./audit";
import { toast } from "sonner";

const PB_URL = import.meta.env.VITE_POCKETBASE_URL as string | undefined;

let pbInstance: PocketBase | null = null;
let pbStatus: "unknown" | "online" | "offline" = "unknown";

export function getPb(): PocketBase | null {
  if (!PB_URL) return null;
  if (!pbInstance) {
    pbInstance = new PocketBase(PB_URL);
  }
  return pbInstance;
}

export function isPbConfigured(): boolean {
  return Boolean(PB_URL);
}

export function getPbStatus() {
  return pbStatus;
}

// Wanneer is de status voor het laatst vastgesteld? Nodig om een "offline"
// niet oneindig te laten plakken — zie ensureOnline() hieronder.
let pbStatusSinds = 0;

function setPbStatus(nieuw: "online" | "offline") {
  const veranderd = pbStatus !== nieuw;
  pbStatus = nieuw;
  pbStatusSinds = Date.now();
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
    // maximaal 3,5s wachten: in het veld zonder bereik mag de app niet blijven hangen.
    // requestKey: null schakelt PocketBase's auto-cancellation uit voor deze call —
    // zonder die vlag annuleert een tweede gelijktijdige pingPb()-aanroep (bv. de
    // VerbindingBadge in AppHeader naast een paginaquery die zelf ensureOnline()
    // aanroept) de eerste, die dan als "offline" wordt gerapporteerd terwijl de
    // server prima bereikbaar is. Ontdekt bij Fase 3 (agent-gesprekkenlijst leek na
    // een herlaad leeg), maar gold voor de hele app. Zie DECISIONS-FASE3.md.
    //
    // Promise.race alleen is niet genoeg: die laat de verliezer gewoon
    // doorlopen, dus bij een timeout bleef het health-verzoek openstaan tot de
    // browser het zelf opgaf. Op een trage verbinding stapelen die zich op.
    // Daarom een AbortController, zodat de fetch bij de timeout echt stopt.
    // (Gevonden door Codex bij review van deze functie, 13 september 2026.)
    const afbreker = new AbortController();
    const tijdklok = setTimeout(() => afbreker.abort(), 3500);
    try {
      await pb.health.check({ requestKey: null, signal: afbreker.signal });
    } finally {
      clearTimeout(tijdklok);
    }
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
// Hoe lang een vastgestelde "offline" geldig blijft voordat ensureOnline()
// opnieuw wil pingen. Zonder deze grens bleef één trage ping (de timeout is
// 3,5s) de status tot 30 seconden op "offline" zetten — de hersteltik zit in
// VerbindingBadge en draait maar elke 30s. Gevolg: op een trage verbinding in
// de kelder faalden ALLE online-only schermen tegelijk, en hielp opnieuw
// proberen de eerste halve minuut niet, ook al was de server gewoon bereikbaar.
const OFFLINE_HERKANSING_MS = 5000;

export async function ensureOnline(): Promise<boolean> {
  if (!getPb()) return false;
  if (pbStatus === "online") return true;
  // Verse "offline" vertrouwen we; een oudere krijgt een herkansing in plaats
  // van blind `false` terug te geven.
  if (pbStatus === "offline" && Date.now() - pbStatusSinds < OFFLINE_HERKANSING_MS) {
    return false;
  }
  if (!pingInFlight) {
    pingInFlight = pingPb().finally(() => {
      pingInFlight = null;
    });
  }
  return pingInFlight;
}

// Fase 11 Blok 1 — verzoeken bundelen. Op de hub bleken 8 van de 22 API-calls
// exacte duplicaten (app_instellingen 5x, regelgeving_instellingen 3x): elke
// signaalproducent haalt dezelfde instellingenlijst zelfstandig op. Eerder was
// dat onzichtbaar doordat PocketBase's auto-cancellation ze wegkaapte — met
// `requestKey: null` (de fix daarvoor) vuren ze nu allemaal echt af. Bundelen
// lost beide problemen tegelijk op: één lopend verzoek dat de aanroepers delen,
// dus geen annulering en geen duplicaat. Zelfde patroon als pingInFlight.
const lopendeVerzoeken = new Map<string, Promise<unknown>>();
export function deelVerzoek<T>(sleutel: string, maak: () => Promise<T>): Promise<T> {
  const lopend = lopendeVerzoeken.get(sleutel);
  if (lopend) return lopend as Promise<T>;
  const verzoek = maak().finally(() => {
    lopendeVerzoeken.delete(sleutel);
  });
  lopendeVerzoeken.set(sleutel, verzoek);
  return verzoek;
}

// INLOGGEN WEER VERWIJDERD (besluit Thomas, 22 augustus 2026 — zie CLAUDE.md
// "Inloggen verwijderd"). De app kent geen accounts meer; alle API-regels
// staan open. Deze functie geeft daarom altijd true terug in plaats van te
// verdwijnen: de signaalproducenten en datalagen gebruiken hem als "mag ik de
// server bevragen?"-poortje, en dat antwoord is nu onvoorwaardelijk ja. Zo
// blijft één plek de schakelaar als het inloggen ooit terugkomt (verplicht
// vóór de Pi of pb.tappenmars.nl).
export function isIngelogd(): boolean {
  return true;
}

// Fase 8 — gedeelde leeshelper voor de ONLINE-ONLY datalagen (kelder, verkoop,
// materieel, regelgeving, bodem, middelen, proefnotities, partijen). Root
// cause van de dropdown-bug: PocketBase's listRule ("@request.auth.id != ''")
// beantwoordt een anoniem verzoek met een geldige 200 + lege items-lijst, en
// het oude patroon `if (!pb || !(await ensureOnline())) return []` gaf dat
// stil door — react-query zag een geslaagde lege query, nooit een fout.
// Deze helper gooit in plaats daarvan een leesbare Nederlandse Error bij een
// ontbrekende sessie, een onbereikbare server of een mislukte fetch, zodat
// de aanroepende query.isError wordt en de UI het kan tonen.
// NB: bewust NIET gebruiken voor de offline-first wijngaard-datalagen
// (data.ts/extra-data.ts/steekproef.ts/…) — stil terugvallen op localStorage
// is dáár het ontwerp. Ook niet voor agent-data.ts (bewust login-vrij).
export async function haalLijst<T>(
  wat: string,
  leeg: T,
  lees: (pb: PocketBase) => Promise<T>,
): Promise<T> {
  const pb = getPb();
  if (!pb) return leeg; // geen server geconfigureerd — lege staat is dan correct
  // Hier stond een sessiecontrole; die is vervallen met het verwijderen van het
  // inloggen (22 augustus 2026). De rest van deze helper blijft onverminderd nodig:
  // een onbereikbare server en een mislukte fetch moeten nog steeds een echte
  // fout opleveren in plaats van een stille lege lijst.
  if (!(await ensureOnline()))
    throw new LaadFout(
      "geen_verbinding",
      `Geen verbinding met de server — kon ${wat} niet laden. Controleer je bereik.`,
    );
  try {
    return await lees(pb);
  } catch (fout) {
    // Fase 11 Blok 6: niet meer alles op één hoop. Zie laadfout.ts voor waarom
    // dit ertoe doet — de oude generieke melding maakte vier verschillende
    // oorzaken ononderscheidbaar, en dat heeft in vier fases bugs gekost.
    const geclassificeerd = classificeerLeesfout(fout, wat);

    // Een geannuleerd verzoek is geen storing maar een botsing tussen twee
    // gelijktijdige aanroepen: de server is bereikbaar en de gebruiker is
    // ingelogd. Eén keer opnieuw proberen lost dat op in plaats van er een
    // foutmelding van te maken. Dit is de vangnetlaag onder deelVerzoek() en
    // requestKey: null — die voorkomen de botsing, dit vangt af wat er alsnog
    // doorheen glipt.
    if (geclassificeerd.soort === "geannuleerd") {
      try {
        return await lees(pb);
      } catch (tweedeFout) {
        throw classificeerLeesfout(tweedeFout, wat);
      }
    }

    throw geclassificeerd;
  }
}

// ---------- localStorage helpers ----------
// v3: actuele rijdata (69 rijen, juiste plantaantallen + notities). Het ophogen
// van de versie zorgt dat bestaande apparaten de oude seed automatisch vervangen.
const LS_RIJEN = "wg.rijen.v3";
const LS_METINGEN = "wg.metingen.v1";
const LS_OBS = "wg.observaties.v1";
const LS_FENOLOGIE = "wg.fenologie.v1";
const LS_NAME = "wg.invoerder.v1";

import { readLs, uid, writeLs } from "./opslag";

export function getInvoerder(): string {
  return readLs<string>(LS_NAME, "invoerder1@tappenmars.nl");
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
    notitie: r.notitie,
    planten_per_vak: r.planten_per_vak,
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
        notitie: r.notitie || undefined,
        planten_per_vak: r.planten_per_vak || undefined,
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
      const filter = rijId ? pb.filter("rij = {:rijId}", { rijId }) : "";
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
        getSyncQueue()
          .filter((q) => q.soort === "meting")
          .map((q) => q.localId),
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
      const filter = rijId ? pb.filter("rij = {:rijId}", { rijId }) : "";
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
        getSyncQueue()
          .filter((q) => q.soort === "observatie")
          .map((q) => q.localId),
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
  logAudit(
    "aangemaakt",
    "metingen",
    `Meting ${input.datum}${input.brix != null ? ` · brix ${input.brix}` : ""} · rijpheid ${input.rijpheid_score}/5`,
  );
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
  // in de wachtrij zetten voor synchronisatie zodra de server bereikbaar is;
  // een eventuele foto gaat naar IndexedDB en wordt bij de sync meegestuurd
  if (input.fotoFile) {
    void saveOfflineFoto(meting.id, input.fotoFile);
  }
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
    __fotoOffline: Boolean(input.fotoFile),
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
  logAudit(
    "aangemaakt",
    "observaties",
    `${input.type} · ${input.datum} · ${input.notitie.slice(0, 60)}`,
  );
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
  if (input.fotoFile) {
    void saveOfflineFoto(obs.id, input.fotoFile);
  }
  addToSyncQueue("observatie", obs.id, {
    rij: input.rij,
    plant: input.plant ?? null,
    datum: input.datum,
    seizoen: obs.seizoen,
    type: input.type,
    notitie: input.notitie,
    ingevoerd_door: input.ingevoerd_door,
    __fotoOffline: Boolean(input.fotoFile),
  });
  return obs;
}

// ============= Fenologie =============
export async function fetchFenologie(rijId?: string): Promise<Fenologie[]> {
  const pb = getPb();
  if (pb && (await ensureOnline())) {
    try {
      const filter = rijId ? pb.filter("rij = {:rijId}", { rijId }) : "";
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
        getSyncQueue()
          .filter((q) => q.soort === "fenologie")
          .map((q) => q.localId),
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
  logAudit("aangemaakt", "fenologie", `${input.moment} · ${input.ras} · ${input.datum}`);
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

export async function updateFenologie(id: string, input: FenologieUpdateInput): Promise<Fenologie> {
  const oude = readLs<Fenologie[]>(LS_FENOLOGIE, []).find((f) => f.id === id);
  logAudit("gewijzigd", "fenologie", `${input.moment} · ${input.datum}`, oude);
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

// Pagina's kunnen hierop luisteren om hun gegevens te verversen
// (gebruikt door "Ongedaan maken" in de prullenbak-flow)
export function meldDataGewijzigd() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("wg.data.changed"));
  }
}

export async function deleteFenologie(id: string): Promise<void> {
  // snapshot voor de prullenbak + ongedaan maken
  const huidige = readLs<Fenologie[]>(LS_FENOLOGIE, []).find((f) => f.id === id);
  if (huidige) {
    const prullenbakId = naarPrullenbak(
      "Fenologie",
      `${huidige.moment} · ${huidige.ras} · ${huidige.datum}`,
      { ...huidige },
    );
    logAudit(
      "verwijderd",
      "fenologie",
      `${huidige.moment} ${huidige.ras} ${huidige.datum}`,
      huidige,
    );
    toast("Fenologie verwijderd", {
      duration: 5000,
      action: {
        label: "Ongedaan maken",
        onClick: () => {
          void createFenologie({
            rij: huidige.rij,
            ras: huidige.ras,
            moment: huidige.moment,
            datum: huidige.datum,
            notitie: huidige.notitie,
            ingevoerd_door: huidige.ingevoerd_door,
          }).then(() => {
            verwijderUitPrullenbak(prullenbakId);
            logAudit("teruggezet", "fenologie", `${huidige.moment} ${huidige.ras}`);
            meldDataGewijzigd();
          });
        },
      },
    });
  }
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
      // requestKey: null — zonder dit kan een gelijktijdige pingPb() deze check
      // annuleren, waarna de flush denkt dat de server offline is en de hele
      // wachtrij ongemoeid laat terwijl er niets aan de hand is. Zelfde
      // auto-cancellation-valkuil als in pingPb() zelf, zie CLAUDE.md.
      await pb.health.check({ requestKey: null });
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
          const heeftOfflineFoto = payload.__fotoOffline === true;
          delete payload.__fotoOffline;
          // vooraf bepaald id meesturen: maakt een herhaalde poging herkenbaar
          // in plaats van een duplicaat (zie recordId in sync.ts)
          if (item.recordId) payload.id = item.recordId;
          let body: Record<string, unknown> | FormData = payload;
          if (heeftOfflineFoto) {
            // foto uit IndexedDB ophalen en als multipart meesturen
            const foto = await getOfflineFoto(item.localId);
            const fd = new FormData();
            for (const [sleutel, waarde] of Object.entries(payload)) {
              if (waarde === null || waarde === undefined || waarde === "") continue;
              fd.append(sleutel, typeof waarde === "string" ? waarde : String(waarde));
            }
            if (foto) fd.append("foto", foto);
            body = fd;
          }
          await pb.collection(collection).create(body);
          removeFromSyncQueue(item.queueId);
          if (lsKey) removeLocalRecord(lsKey, item.localId);
          if (heeftOfflineFoto) void deleteOfflineFoto(item.localId);
        } else if (actie === "update") {
          if (item.remoteId) {
            // conflictdetectie: is het record ondertussen door een ander
            // apparaat gewijzigd? Laatste schrijver wint, maar wel melden.
            try {
              const huidig = await pb.collection(collection).getOne(item.remoteId);
              const serverGewijzigd = huidig["updated"] as string | undefined;
              if (serverGewijzigd && new Date(serverGewijzigd) > new Date(item.aangemaakt)) {
                toast.warning(
                  "Let op: een record was ondertussen op een ander apparaat gewijzigd. Jouw versie is nu leidend.",
                  { duration: 8000 },
                );
              }
            } catch {
              // record bestaat niet meer of niet leesbaar — update-call hieronder handelt dat af
            }
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
        const velden = (err as { response?: { data?: Record<string, { code?: string }> } }).response
          ?.data;

        // Het record bestaat al met precies dit id: een eerdere poging IS
        // aangekomen, alleen ging het antwoord verloren. Dus geslaagd, niet
        // mislukt — anders zou elke nieuwe poging een duplicaat opleveren.
        if (status === 400 && velden?.id?.code === "validation_not_unique") {
          removeFromSyncQueue(item.queueId);
          const lsKey = item.lsKey ?? SOORT_LS_KEY[item.soort];
          if (lsKey) removeLocalRecord(lsKey, item.localId);
          verzonden++;
          continue;
        }

        // 400 = blijvende validatiefout: uit de wachtrij (lokale kopie blijft).
        // 401/403 (niet ingelogd) en netwerk-/serverfouten blijven staan voor
        // een nieuwe poging na inloggen of als de server weer bereikbaar is.
        if (status === 400 || status === 404) {
          removeFromSyncQueue(item.queueId);
          // niet stil laten verdwijnen: registreren en melden. PocketBase zet
          // de bruikbare informatie in response.data per veld; de bovenliggende
          // message is altijd het nietszeggende "Failed to create record."
          const veldFouten = velden
            ? Object.entries(velden)
                .map(([veld, f]) => `${veld}: ${(f as { message?: string }).message ?? f.code}`)
                .join("; ")
            : "";
          const bericht = veldFouten || (err as { message?: string }).message || "Onbekende fout";
          registreerSyncFout(item, status, bericht);
          if (item.soort !== "audit") {
            toast.error(
              `Eén record (${item.soort}) kon niet gesynchroniseerd worden en blijft alleen lokaal. Zie instellingen → Sync-problemen.`,
              { duration: 8000 },
            );
          }
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
