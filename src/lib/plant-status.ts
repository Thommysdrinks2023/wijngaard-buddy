import { differenceInDays, parseISO } from "date-fns";
import type { Meting, Observatie } from "./types";

export type PlantStatus = "groen" | "geel" | "oranje" | "rood" | "grijs";

export const STATUS_INFO: Record<
  PlantStatus,
  { color: string; label: string; description: string }
> = {
  groen: { color: "#4CAF50", label: "Gezond", description: "Geen bijzonderheden" },
  geel: { color: "#FFC107", label: "Observatie", description: "Groei of overige" },
  oranje: { color: "#FF9800", label: "Schade", description: "Schade geregistreerd" },
  rood: { color: "#F44336", label: "Ziekte / uitval", description: "Aandacht vereist" },
  grijs: { color: "#9E9E9E", label: "Onbekend", description: "Nog niet geregistreerd" },
};

interface SourceItem {
  datum: string;
  kind: "meting" | "observatie";
  obsType?: Observatie["type"];
  source: Meting | Observatie;
  fromPlant: boolean;
}

function statusFromItems(items: SourceItem[]): PlantStatus {
  if (items.length === 0) return "grijs";
  const latest = items.reduce((a, b) => (a.datum > b.datum ? a : b));
  if (latest.kind === "meting") return "groen";
  // observatie
  switch (latest.obsType) {
    case "ziekte":
    case "uitval":
      return "rood";
    case "schade":
      return "oranje";
    case "groei":
    case "anders":
    default:
      return "geel";
  }
}

export interface PlantStatusInfo {
  status: PlantStatus;
  latest?: {
    kind: "meting" | "observatie";
    datum: string;
    label: string;
    fromPlant: boolean;
  };
}

/**
 * Bepaal de status van een specifieke plant in een rij.
 * Plant-data heeft voorrang; als er geen plant-specifieke data is,
 * wordt rij-data (binnen het hele seizoen) als fallback gebruikt.
 */
export function computePlantStatus(
  rijId: string,
  plantNr: number,
  metingen: Meting[],
  observaties: Observatie[]
): PlantStatusInfo {
  const rijMetingen = metingen.filter((m) => m.rij === rijId);
  const rijObs = observaties.filter((o) => o.rij === rijId);

  const plantItems: SourceItem[] = [
    ...rijMetingen
      .filter((m) => m.plant === plantNr)
      .map((m) => ({ datum: m.datum, kind: "meting" as const, source: m, fromPlant: true })),
    ...rijObs
      .filter((o) => o.plant === plantNr)
      .map((o) => ({
        datum: o.datum,
        kind: "observatie" as const,
        obsType: o.type,
        source: o,
        fromPlant: true,
      })),
  ];

  const itemsToUse =
    plantItems.length > 0
      ? plantItems
      : [
          ...rijMetingen
            .filter((m) => m.plant == null)
            .map((m) => ({ datum: m.datum, kind: "meting" as const, source: m, fromPlant: false })),
          ...rijObs
            .filter((o) => o.plant == null)
            .map((o) => ({
              datum: o.datum,
              kind: "observatie" as const,
              obsType: o.type,
              source: o,
              fromPlant: false,
            })),
        ];

  const status = statusFromItems(itemsToUse);
  if (itemsToUse.length === 0) return { status };

  const latest = itemsToUse.reduce((a, b) => (a.datum > b.datum ? a : b));
  let label = "";
  if (latest.kind === "meting") {
    const m = latest.source as Meting;
    const parts: string[] = [];
    if (m.brix != null) parts.push(`Brix ${m.brix}`);
    if (m.ph != null) parts.push(`pH ${m.ph}`);
    parts.push(`Rijpheid ${m.rijpheid_score}/5`);
    if (m.notitie) parts.push(m.notitie);
    label = parts.join(" · ");
  } else {
    const o = latest.source as Observatie;
    label = `${o.type}${o.notitie ? " — " + o.notitie : ""}`;
  }

  return {
    status,
    latest: {
      kind: latest.kind,
      datum: latest.datum,
      label,
      fromPlant: latest.fromPlant,
    },
  };
}
