import type PocketBase from "pocketbase";
import type { TankboekActie } from "./types";

export interface TankboekFilter {
  partij?: string;
  tank?: string;
  eigenaar?: string;
  actie?: TankboekActie;
  vanaf?: string;
  tot?: string;
}

export function leesTankboekSelectie(pb: PocketBase, filter?: TankboekFilter) {
  const delen: string[] = [];
  if (filter?.partij) delen.push(pb.filter("partij = {:partij}", { partij: filter.partij }));
  if (filter?.tank)
    delen.push(pb.filter("(van_tank = {:tank} || naar_tank = {:tank})", { tank: filter.tank }));
  if (filter?.eigenaar)
    delen.push(pb.filter("eigenaar = {:eigenaar}", { eigenaar: filter.eigenaar }));
  if (filter?.actie) delen.push(pb.filter("actie = {:actie}", { actie: filter.actie }));
  if (filter?.vanaf) delen.push(pb.filter("datum >= {:vanaf}", { vanaf: filter.vanaf }));
  if (filter?.tot) delen.push(pb.filter("datum <= {:tot}", { tot: filter.tot }));
  // Alle passende regels blijven nodig voor totalen/export: nooit afkappen
  // op de eerste pagina. De SDK haalt volgende pagina's automatisch op.
  return pb.collection("tankboek").getFullList({
    sort: "-datum,-tijd,-created,-id",
    filter: delen.join(" && "),
  });
}
