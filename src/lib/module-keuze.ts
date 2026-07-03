// Onthoudt de laatst gekozen module op het hub-scherm (/) en of de app
// er automatisch naartoe mag springen i.p.v. de tegels te tonen.

import { readLs, writeLs } from "./opslag";

export type ModuleKeuze = "wijngaard" | "kelder" | "assistent" | "voorraad";

export const MODULE_ROUTES: Record<ModuleKeuze, string> = {
  wijngaard: "/wijngaard",
  kelder: "/kelder",
  assistent: "/assistent",
  voorraad: "/voorraad",
};

export const MODULE_LABELS: Record<ModuleKeuze, string> = {
  wijngaard: "Wijngaard",
  kelder: "Kelder",
  assistent: "Assistent",
  voorraad: "Voorraad",
};

const LS_LAATSTE_MODULE = "wg.instellingen.laatste_module.v1";
const LS_AUTO_START = "wg.instellingen.auto_start_module.v1";

export function getLaatsteModule(): ModuleKeuze | null {
  const v = readLs<string>(LS_LAATSTE_MODULE, "");
  return v && v in MODULE_ROUTES ? (v as ModuleKeuze) : null;
}

export function setLaatsteModule(m: ModuleKeuze) {
  writeLs(LS_LAATSTE_MODULE, m);
}

export function getAutoStartModule(): boolean {
  return readLs<boolean>(LS_AUTO_START, false);
}

export function setAutoStartModule(v: boolean) {
  writeLs(LS_AUTO_START, v);
}
