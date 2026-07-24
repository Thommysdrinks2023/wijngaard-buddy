// Fase 10 Blok 3 — datalaag signaal_status: server-side snooze/dismiss.
// Bewust server-side i.p.v. localStorage (besluit Thomas): hij werkt op
// telefoon in de wijngaard én op desktop, en localStorage verdwijnt bij het
// legen van de cache. Zie ONTWERP-2-DATAMODEL.md §4.
//
// Deze laag is bewust NIET via haalLijst(): de collectie heeft OPEN_RULE en
// moet ook zonder sessie werken (de hub is publiek). Een fout hier mag de
// signalen zelf nooit blokkeren — vandaar de stille terugval op [].

import type { RecordModel } from "pocketbase";
import { ensureOnline, getPb } from "./data";

export type SignaalActie = "gesnoozed" | "genegeerd";

export interface SignaalStatus {
  id: string;
  signaal_id: string;
  actie: SignaalActie;
  snooze_tot?: string;
}

function statusFromPb(r: RecordModel): SignaalStatus {
  return {
    id: r.id,
    signaal_id: r["signaal_id"],
    actie: r["actie"],
    snooze_tot: r["snooze_tot"] ?? "",
  };
}

export async function fetchSignaalStatussen(): Promise<SignaalStatus[]> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) return [];
  try {
    const records = await pb
      .collection("signaal_status")
      .getFullList({ sort: "-created", requestKey: null });
    return records.map(statusFromPb);
  } catch {
    return []; // snooze-status is comfort, geen kernfunctie — nooit blokkeren
  }
}

export async function zetSignaalStatus(
  signaalId: string,
  actie: SignaalActie,
  snoozeTot?: string,
): Promise<void> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) throw new Error("Geen verbinding met de server.");
  // Upsert: één status per signaal_id. Bestaande eerst opzoeken, want
  // PocketBase kent geen native upsert.
  const bestaand = await pb
    .collection("signaal_status")
    .getFullList({ filter: pb.filter("signaal_id = {:id}", { id: signaalId }) });
  const data = { signaal_id: signaalId, actie, snooze_tot: snoozeTot ?? "" };
  if (bestaand.length > 0) {
    await pb.collection("signaal_status").update(bestaand[0].id, data);
    // eventuele dubbelen opruimen (kan ontstaan bij gelijktijdig snoozen op
    // twee apparaten - de collectie heeft bewust geen unique-index omdat
    // PocketBase daar bij een lege waarde lastig mee omgaat)
    for (const dubbel of bestaand.slice(1)) {
      await pb.collection("signaal_status").delete(dubbel.id);
    }
  } else {
    await pb.collection("signaal_status").create(data);
  }
}

// Verlopen snoozes opruimen (ONTWERP-2-DATAMODEL.md §7: gekoppeld aan het
// laden van de widget, nooit een los onbewaakt achtergrondproces).
export async function ruimVerlopenSnoozesOp(statussen: SignaalStatus[]): Promise<void> {
  const pb = getPb();
  if (!pb) return;
  const vandaag = new Date().toISOString().slice(0, 10);
  const verlopen = statussen.filter(
    (s) => s.actie === "gesnoozed" && s.snooze_tot && s.snooze_tot < vandaag,
  );
  for (const s of verlopen) {
    try {
      await pb.collection("signaal_status").delete(s.id);
    } catch {
      /* opschonen is nooit kritiek */
    }
  }
}

// Eenmalige migratie van de oude localStorage-afvinkstate (meldingen.tsx)
// naar de server-side collectie. De signaal-id's zijn bewust identiek
// gehouden, dus dit is een 1-op-1 sleutelkopie (ONTWERP-2-DATAMODEL.md §6).
// De oude sleutel blijft staan als terugvaloptie.
const LS_OUD = "wg.meldingen.afgevinkt.v1";
const LS_MIGRATIE_GEDAAN = "wg.signalen.migratie_v2_gedaan";

export async function migreerOudeAfvinkStatus(): Promise<number> {
  if (typeof localStorage === "undefined") return 0;
  if (localStorage.getItem(LS_MIGRATIE_GEDAAN)) return 0;
  let oud: string[] = [];
  try {
    oud = JSON.parse(localStorage.getItem(LS_OUD) ?? "[]");
  } catch {
    oud = [];
  }
  if (!Array.isArray(oud) || oud.length === 0) {
    localStorage.setItem(LS_MIGRATIE_GEDAAN, "1");
    return 0;
  }
  let gemigreerd = 0;
  for (const id of oud) {
    try {
      await zetSignaalStatus(String(id), "genegeerd");
      gemigreerd++;
    } catch {
      // Netwerkfout: migratievlag NIET zetten, volgende keer opnieuw proberen
      return gemigreerd;
    }
  }
  localStorage.setItem(LS_MIGRATIE_GEDAAN, "1");
  return gemigreerd;
}

// Filtert de signalen die door snooze/dismiss verborgen moeten blijven.
export function isVerborgen(signaalId: string, statussen: SignaalStatus[]): boolean {
  const status = statussen.find((s) => s.signaal_id === signaalId);
  if (!status) return false;
  if (status.actie === "genegeerd") return true;
  if (status.actie === "gesnoozed" && status.snooze_tot) {
    return new Date().toISOString().slice(0, 10) < status.snooze_tot;
  }
  return false;
}
