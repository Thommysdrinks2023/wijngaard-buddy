// Audit-log: wie deed wat, wanneer. Lokaal de laatste 200 acties,
// en via de sync-wachtrij ook naar de audit_log-collectie in PocketBase
// zodat het overzicht op elk apparaat compleet is.

import { readLs, writeLs } from "./opslag";
import { addToSyncQueue } from "./sync";

const LS_AUDIT = "wg.audit.v1";
const MAX_LOKAAL = 200;

export type AuditActie = "aangemaakt" | "gewijzigd" | "verwijderd" | "teruggezet";

export interface AuditRegel {
  tijd: string; // ISO
  gebruiker: string;
  actie: AuditActie;
  collectie: string;
  samenvatting: string;
  oudeWaarde?: string;
}

function huidigeGebruiker(): string {
  if (typeof window === "undefined") return "";
  try {
    return JSON.parse(localStorage.getItem("wg.invoerder.v1") ?? '""') || "Onbekend";
  } catch {
    return "Onbekend";
  }
}

export function logAudit(
  actie: AuditActie,
  collectie: string,
  samenvatting: string,
  oudeWaarde?: unknown,
) {
  if (typeof window === "undefined") return;
  const regel: AuditRegel = {
    tijd: new Date().toISOString(),
    gebruiker: huidigeGebruiker(),
    actie,
    collectie,
    samenvatting: samenvatting.slice(0, 200),
    oudeWaarde: oudeWaarde ? JSON.stringify(oudeWaarde).slice(0, 500) : undefined,
  };
  const regels = readLs<AuditRegel[]>(LS_AUDIT, []);
  regels.push(regel);
  writeLs(LS_AUDIT, regels.slice(-MAX_LOKAAL));
  // ook naar de server (append-only via de wachtrij; werkt dus ook offline)
  addToSyncQueue(
    "audit",
    `audit-${regel.tijd}-${Math.random().toString(36).slice(2, 6)}`,
    {
      tijd: regel.tijd,
      gebruiker: regel.gebruiker,
      actie: regel.actie,
      collectie: regel.collectie,
      samenvatting: regel.samenvatting,
      oude_waarde: regel.oudeWaarde ?? "",
    },
    { collection: "audit_log" },
  );
}

export function getAuditLog(): AuditRegel[] {
  return readLs<AuditRegel[]>(LS_AUDIT, []).slice().reverse();
}
