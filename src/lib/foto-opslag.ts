// Offline foto-opslag in IndexedDB.
// Foto's die zonder verbinding worden gemaakt, worden hier bewaard en
// automatisch meegestuurd zodra de sync-wachtrij wordt verwerkt.
// (localStorage is ongeschikt voor foto's: te klein en alleen tekst.)

const DB_NAAM = "wijngaard";
const STORE = "fotos";

interface OpgeslagenFoto {
  id: string; // localId van het record waar de foto bij hoort
  naam: string;
  type: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB niet beschikbaar"));
      return;
    }
    const req = indexedDB.open(DB_NAAM, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB openen mislukt"));
  });
}

export async function saveOfflineFoto(id: string, file: File): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      id,
      naam: file.name || "foto.jpg",
      type: file.type || "image/jpeg",
      blob: file,
    } satisfies OpgeslagenFoto);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Foto opslaan mislukt"));
  });
  db.close();
}

export async function getOfflineFoto(id: string): Promise<File | null> {
  try {
    const db = await openDb();
    const record = await new Promise<OpgeslagenFoto | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as OpgeslagenFoto | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record) return null;
    return new File([record.blob], record.naam, { type: record.type });
  } catch {
    return null;
  }
}

export async function deleteOfflineFoto(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // opruimen is best effort
  }
}
