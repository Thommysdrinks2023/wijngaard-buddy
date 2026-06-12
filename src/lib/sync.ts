// Offline-first sync-wachtrij (outbox).
// Records die offline worden aangemaakt komen in deze wachtrij en worden
// naar PocketBase gestuurd zodra de server weer bereikbaar is.

export type SyncSoort =
  | "meting"
  | "observatie"
  | "fenologie"
  | "gezondheid"
  | "oogst"
  | "werkuren"
  | "steekproef_plant"
  | "steekproef_meting"
  | "werkkalender"
  | "notitie"
  | "lab"
  | "rij_locatie";

export type SyncActie = "create" | "update" | "delete";

export interface SyncItem {
  queueId: string;
  soort: SyncSoort;
  // id van het lokale record dat als fallback is opgeslagen
  localId: string;
  // JSON-serialiseerbare invoer (foto's kunnen niet offline in de wachtrij)
  payload: Record<string, unknown>;
  aangemaakt: string;
  // optioneel: expliciete PocketBase-collectie en localStorage-sleutel
  // (voor nieuwere datatypes; oudere items vallen terug op de soort-mapping)
  collection?: string;
  lsKey?: string;
  // create (standaard), update of delete van een bestaand serverrecord
  actie?: SyncActie;
  // bij update/delete: het PocketBase-id van het record
  remoteId?: string;
  // bij delete zonder remoteId: PocketBase-filter om records te vinden
  filter?: string;
}

const LS_QUEUE = "wg.sync.queue.v1";
export const SYNC_CHANGED_EVENT = "wg.sync.changed";

function readQueue(): SyncItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_QUEUE);
    return raw ? (JSON.parse(raw) as SyncItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: SyncItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_QUEUE, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(SYNC_CHANGED_EVENT));
}

export function getSyncQueue(): SyncItem[] {
  return readQueue();
}

export function syncQueueCount(): number {
  return readQueue().length;
}

export function addToSyncQueue(
  soort: SyncSoort,
  localId: string,
  payload: Record<string, unknown>,
  opties?: { collection?: string; lsKey?: string; actie?: SyncActie; remoteId?: string; filter?: string },
) {
  const items = readQueue();
  items.push({
    queueId: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    soort,
    localId,
    payload,
    aangemaakt: new Date().toISOString(),
    collection: opties?.collection,
    lsKey: opties?.lsKey,
    actie: opties?.actie,
    remoteId: opties?.remoteId,
    filter: opties?.filter,
  });
  writeQueue(items);
}

export function removeFromSyncQueue(queueId: string) {
  writeQueue(readQueue().filter((i) => i.queueId !== queueId));
}

// Zoekt een nog niet gesynchroniseerde create voor dit lokale record
export function findQueuedCreate(localId: string): SyncItem | undefined {
  return readQueue().find(
    (i) => i.localId === localId && (i.actie ?? "create") === "create",
  );
}

// Werkt de payload van een wachtende create bij (offline bewerken vóór sync)
export function updateQueuedCreate(localId: string, wijzigingen: Record<string, unknown>): boolean {
  const items = readQueue();
  const idx = items.findIndex(
    (i) => i.localId === localId && (i.actie ?? "create") === "create",
  );
  if (idx === -1) return false;
  items[idx] = { ...items[idx], payload: { ...items[idx].payload, ...wijzigingen } };
  writeQueue(items);
  return true;
}

// Verwijdert alle wachtrij-items voor dit lokale record (offline verwijderen vóór sync)
export function removeQueuedByLocalId(localId: string): boolean {
  const items = readQueue();
  const rest = items.filter((i) => i.localId !== localId);
  if (rest.length === items.length) return false;
  writeQueue(rest);
  return true;
}
