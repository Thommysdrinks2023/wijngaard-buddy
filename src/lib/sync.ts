// Offline-first sync-wachtrij (outbox).
// Records die offline worden aangemaakt komen in deze wachtrij en worden
// naar PocketBase gestuurd zodra de server weer bereikbaar is.

export type SyncSoort = "meting" | "observatie" | "fenologie";

export interface SyncItem {
  queueId: string;
  soort: SyncSoort;
  // id van het lokale record dat als fallback is opgeslagen
  localId: string;
  // JSON-serialiseerbare invoer (foto's kunnen niet offline in de wachtrij)
  payload: Record<string, unknown>;
  aangemaakt: string;
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
) {
  const items = readQueue();
  items.push({
    queueId: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    soort,
    localId,
    payload,
    aangemaakt: new Date().toISOString(),
  });
  writeQueue(items);
}

export function removeFromSyncQueue(queueId: string) {
  writeQueue(readQueue().filter((i) => i.queueId !== queueId));
}
