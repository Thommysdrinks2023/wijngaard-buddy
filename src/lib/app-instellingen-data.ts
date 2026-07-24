// Fase 10 Blok 1 — datalaag app_instellingen: operationele voorkeuren
// (drempels, plafonds), bewust gescheiden van regelgeving_instellingen
// (die laatste blijft gereserveerd voor wettelijk/officieel geverifieerde
// waarden met bron + laatst_gecontroleerd). Zie ONTWERP-2-DATAMODEL.md §3.

import type { RecordModel } from "pocketbase";
import { haalLijst } from "./data";

export interface AppInstelling {
  id: string;
  sleutel: string;
  waarde: number | null;
  eenheid?: string;
  notitie?: string;
}

export const APP_INSTELLING_SLEUTELS = {
  backupWaarschuwingDagen: "backup_waarschuwing_dagen",
  agpWaarschuwingPercentage: "agp_waarschuwing_percentage",
  voorraadDrempelStandaard: "voorraad_drempel_standaard",
  signaalMaxZichtbaar: "signaal_max_zichtbaar",
} as const;

function instellingFromPb(r: RecordModel): AppInstelling {
  return {
    id: r.id,
    sleutel: r["sleutel"],
    waarde: r["waarde"] > 0 ? r["waarde"] : null,
    eenheid: r["eenheid"] ?? "",
    notitie: r["notitie"] ?? "",
  };
}

export async function fetchAppInstellingen(): Promise<AppInstelling[]> {
  return haalLijst("de app-instellingen", [], async (pb) => {
    const records = await pb.collection("app_instellingen").getFullList({ sort: "sleutel" });
    return records.map(instellingFromPb);
  });
}

export function vindWaarde(
  instellingen: AppInstelling[],
  sleutel: string,
  standaard: number,
): number {
  return instellingen.find((i) => i.sleutel === sleutel)?.waarde ?? standaard;
}
