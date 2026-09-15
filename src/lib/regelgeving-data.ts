// Datalaag regelgeving_instellingen (Eindsprint Blok K). De sleutels zijn
// geseed zonder bedragen; Thomas vult ze na Douane-verificatie. De app rekent
// pas met een tarief als waarde > 0 én laatst_gecontroleerd ingevuld is
// (zie tariefGeverifieerd in accijns.ts).

import type { RecordModel } from "pocketbase";
import { deelVerzoek, ensureOnline, getPb, haalLijst } from "./data";
import { logAudit } from "./audit";

export interface RegelgevingInstelling {
  id: string;
  sleutel: string;
  waarde: number | null;
  eenheid?: string;
  geldig_vanaf?: string;
  laatst_gecontroleerd?: string;
  bron?: string;
  /** Voor instellingen die geen getal zijn (bv. accijns_belastbaar_moment). */
  waarde_tekst?: string;
}

export const REGELGEVING_SLEUTELS = {
  accijnsStil: "accijns_stille_wijn_per_hl",
  accijnsMousserend: "accijns_mousserende_wijn_per_hl",
  agpDrempel: "agp_drempel_liters_per_jaar",
  agentLimiet: "agent_berichten_per_uur_per_ip",
  belastbaarMoment: "accijns_belastbaar_moment",
} as const;

function instellingFromPb(r: RecordModel): RegelgevingInstelling {
  return {
    id: r.id,
    sleutel: r["sleutel"],
    // PocketBase-nummerveld zonder waarde = 0; hier betekent 0 "niet ingevuld"
    waarde: r["waarde"] > 0 ? r["waarde"] : null,
    eenheid: r["eenheid"] ?? "",
    geldig_vanaf: r["geldig_vanaf"] ?? "",
    laatst_gecontroleerd: r["laatst_gecontroleerd"] ?? "",
    bron: r["bron"] ?? "",
    waarde_tekst: r["waarde_tekst"] ?? "",
  };
}

export async function fetchRegelgevingInstellingen(): Promise<RegelgevingInstelling[]> {
  // requestKey: null voorkomt dat gelijktijdige aanroepers elkaars identieke
  // GET annuleren (PocketBase auto-cancellation, zie CLAUDE.md); deelVerzoek
  // voorkomt dat het er dan drie worden. Zie deelVerzoek in data.ts.
  return deelVerzoek("regelgeving_instellingen", () =>
    haalLijst("de regelgeving-instellingen", [], async (pb) => {
      const records = await pb
        .collection("regelgeving_instellingen")
        .getFullList({ sort: "sleutel", requestKey: null });
      return records.map(instellingFromPb);
    }),
  );
}

export async function updateRegelgevingInstelling(
  id: string,
  input: Partial<Omit<RegelgevingInstelling, "id" | "sleutel">>,
): Promise<void> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) throw new Error("Geen verbinding met de server.");
  logAudit("gewijzigd", "regelgeving_instellingen", JSON.stringify(input));
  await pb.collection("regelgeving_instellingen").update(id, input);
}
