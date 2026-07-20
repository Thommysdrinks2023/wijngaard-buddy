// Fase 7 Blok F1 — Ctgb-middelen: gevuld door scripts/import-ctgb.mjs uit een
// handmatig gedownloade Ctgb-export. De spuitregistratie gebruikt dit voor de
// automatische restrictie-check; een onbekend middel blijft gewoon mogelijk
// (vrije invoer) maar dan zonder check.

import type { RecordModel } from "pocketbase";
import { ensureOnline, getPb, haalLijst } from "./data";

export interface Middel {
  id: string;
  naam: string;
  toelatingsnummer: string;
  actieve_stof?: string;
  max_dosering: number | null;
  max_dosering_eenheid?: string;
  max_toepassingen_seizoen: number | null;
  veiligheidstermijn_dagen: number | null;
  herbetreding_uren: number | null;
  geldig_tot?: string;
  geimporteerd_op?: string;
}

function fromPb(r: RecordModel): Middel {
  return {
    id: r.id,
    naam: r["naam"],
    toelatingsnummer: r["toelatingsnummer"],
    actieve_stof: r["actieve_stof"] ?? "",
    max_dosering: r["max_dosering"] > 0 ? r["max_dosering"] : null,
    max_dosering_eenheid: r["max_dosering_eenheid"] ?? "",
    max_toepassingen_seizoen:
      r["max_toepassingen_seizoen"] > 0 ? r["max_toepassingen_seizoen"] : null,
    veiligheidstermijn_dagen:
      r["veiligheidstermijn_dagen"] > 0 ? r["veiligheidstermijn_dagen"] : null,
    herbetreding_uren: r["herbetreding_uren"] > 0 ? r["herbetreding_uren"] : null,
    geldig_tot: r["geldig_tot"] ?? "",
    geimporteerd_op: r["geimporteerd_op"] ?? "",
  };
}

export async function fetchMiddelen(): Promise<Middel[]> {
  return haalLijst("de Ctgb-middelenlijst", [], async (pb) => {
    const records = await pb.collection("middelen").getFullList({ sort: "naam" });
    return records.map(fromPb);
  });
}

// Vind het Ctgb-middel dat bij een vrij ingetypte naam hoort (ruime match)
export function vindMiddel(middelen: Middel[], invoer: string): Middel | null {
  const zoek = invoer.trim().toLowerCase();
  if (!zoek) return null;
  return (
    middelen.find((m) => m.naam.toLowerCase() === zoek) ??
    middelen.find(
      (m) => m.naam.toLowerCase().includes(zoek) || zoek.includes(m.naam.toLowerCase()),
    ) ??
    null
  );
}

// Restrictie-check: overschrijdt de ingevoerde dosering de Ctgb-max?
// Alleen vergelijkbaar bij dezelfde eenheid — anders geen oordeel (null).
export function doseringOverschrijdt(
  middel: Middel,
  dosering: number | null,
  eenheid: string,
): boolean | null {
  if (middel.max_dosering == null || dosering == null) return null;
  if ((middel.max_dosering_eenheid ?? "").toLowerCase() !== eenheid.toLowerCase()) return null;
  return dosering > middel.max_dosering;
}
