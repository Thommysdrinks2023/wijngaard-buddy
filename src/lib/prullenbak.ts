// Prullenbak: verwijderde records worden 30 dagen als snapshot bewaard
// (op dit apparaat) en kunnen worden teruggezet. Pas daarna zijn ze
// definitief weg. Terugzetten maakt het record opnieuw aan en synct het.

import { readLs, uid, writeLs } from "./opslag";

const LS_PRULLENBAK = "wg.prullenbak.v1";
const BEWAAR_DAGEN = 30;

export interface PrullenbakItem {
  id: string;
  soortLabel: string; // bijv. "Fenologie" of "Steekproefplant"
  omschrijving: string; // leesbare samenvatting
  verwijderdOp: string; // ISO
  // alles wat nodig is om terug te zetten
  herstelData: Record<string, unknown>;
}

export function getPrullenbak(): PrullenbakItem[] {
  return readLs<PrullenbakItem[]>(LS_PRULLENBAK, []).sort((a, b) =>
    a.verwijderdOp < b.verwijderdOp ? 1 : -1,
  );
}

export function naarPrullenbak(
  soortLabel: string,
  omschrijving: string,
  herstelData: Record<string, unknown>,
): string {
  const items = readLs<PrullenbakItem[]>(LS_PRULLENBAK, []);
  const item: PrullenbakItem = {
    id: uid(),
    soortLabel,
    omschrijving,
    verwijderdOp: new Date().toISOString(),
    herstelData,
  };
  items.push(item);
  writeLs(LS_PRULLENBAK, items);
  return item.id;
}

export function verwijderUitPrullenbak(id: string) {
  writeLs(
    LS_PRULLENBAK,
    readLs<PrullenbakItem[]>(LS_PRULLENBAK, []).filter((i) => i.id !== id),
  );
}

// Items ouder dan 30 dagen definitief opruimen (draait bij app-start)
export function ruimPrullenbakOp() {
  const grens = Date.now() - BEWAAR_DAGEN * 24 * 60 * 60 * 1000;
  const items = readLs<PrullenbakItem[]>(LS_PRULLENBAK, []);
  const rest = items.filter((i) => new Date(i.verwijderdOp).getTime() > grens);
  if (rest.length !== items.length) writeLs(LS_PRULLENBAK, rest);
}
