import type { Ras } from "./seed-rijen";
import { ensureOnline, getPb } from "./data";
import { addToSyncQueue, getSyncQueue } from "./sync";

export type WerkKolom =
  | "snoei_start"
  | "snoei_einde"
  | "loofwerk_start"
  | "loofwerk_einde"
  | "oogst_start"
  | "oogst_einde";

export const WERK_KOLOMMEN: { value: WerkKolom; emoji: string; label: string }[] = [
  { value: "snoei_start", emoji: "🪚", label: "Snoei start" },
  { value: "snoei_einde", emoji: "🪚", label: "Snoei einde" },
  { value: "loofwerk_start", emoji: "🌿", label: "Loofwerk start" },
  { value: "loofwerk_einde", emoji: "🌿", label: "Loofwerk einde" },
  { value: "oogst_start", emoji: "🧺", label: "Oogst start" },
  { value: "oogst_einde", emoji: "🧺", label: "Oogst einde" },
];

export interface WerkEntry {
  ras: Ras;
  kolom: WerkKolom;
  jaar: number;
  datum: string; // ISO date
  notitie?: string;
}

const LS_KEY = "werkkalender";

function readAll(): WerkEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as WerkEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: WerkEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(entries));
}

export function getWerkkalender(): WerkEntry[] {
  return readAll();
}

export function getWerkEntry(
  ras: Ras,
  kolom: WerkKolom,
  jaar: number,
): WerkEntry | undefined {
  return readAll().find(
    (e) => e.ras === ras && e.kolom === kolom && e.jaar === jaar,
  );
}

export function upsertWerkEntry(entry: WerkEntry) {
  const all = readAll();
  const idx = all.findIndex(
    (e) => e.ras === entry.ras && e.kolom === entry.kolom && e.jaar === entry.jaar,
  );
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  writeAll(all);
  // sync als append-only logboek: nieuwste record per (ras, kolom, jaar) wint
  addToSyncQueue(
    "werkkalender",
    `wk-${entry.ras}-${entry.kolom}-${entry.jaar}-${Date.now()}`,
    {
      ras: entry.ras,
      kolom: entry.kolom,
      jaar: entry.jaar,
      datum: entry.datum,
      notitie: entry.notitie ?? "",
      verwijderd: false,
    },
    { collection: "werkkalender" },
  );
}

export function deleteWerkEntry(ras: Ras, kolom: WerkKolom, jaar: number) {
  const all = readAll().filter(
    (e) => !(e.ras === ras && e.kolom === kolom && e.jaar === jaar),
  );
  writeAll(all);
  // verwijdering als marker-record in het logboek
  addToSyncQueue(
    "werkkalender",
    `wk-del-${ras}-${kolom}-${jaar}-${Date.now()}`,
    { ras, kolom, jaar, datum: "", notitie: "", verwijderd: true },
    { collection: "werkkalender" },
  );
}

// PB-first variant: leest het serverlogboek, reduceert naar de actuele
// stand (nieuwste record per sleutel wint, verwijdermarkers verwijderen),
// past daarna nog niet gesynchroniseerde lokale wijzigingen toe en cachet.
export async function fetchWerkkalenderSync(): Promise<WerkEntry[]> {
  const pb = getPb();
  if (pb && (await ensureOnline())) {
    try {
      const records = await pb.collection("werkkalender").getFullList({ sort: "created" });
      const stand = new Map<string, WerkEntry>();
      const verwerk = (r: {
        ras: Ras;
        kolom: WerkKolom;
        jaar: number;
        datum: string;
        notitie?: string;
        verwijderd?: boolean;
      }) => {
        const sleutel = `${r.ras}|${r.kolom}|${r.jaar}`;
        if (r.verwijderd) stand.delete(sleutel);
        else
          stand.set(sleutel, {
            ras: r.ras,
            kolom: r.kolom,
            jaar: r.jaar,
            datum: r.datum,
            notitie: r.notitie || undefined,
          });
      };
      records.forEach((r) =>
        verwerk(r as unknown as Parameters<typeof verwerk>[0]),
      );
      // lokale wijzigingen die nog in de wachtrij staan, gelden als nieuwste
      getSyncQueue()
        .filter((q) => q.soort === "werkkalender")
        .forEach((q) => verwerk(q.payload as unknown as Parameters<typeof verwerk>[0]));
      const merged = Array.from(stand.values());
      writeAll(merged);
      return merged;
    } catch {
      // fall through
    }
  }
  return readAll();
}
