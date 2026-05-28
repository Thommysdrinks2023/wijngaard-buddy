import type { Ras } from "./seed-rijen";

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
}

export function deleteWerkEntry(ras: Ras, kolom: WerkKolom, jaar: number) {
  const all = readAll().filter(
    (e) => !(e.ras === ras && e.kolom === kolom && e.jaar === jaar),
  );
  writeAll(all);
}
