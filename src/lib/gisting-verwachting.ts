// Fase 7 Blok F2 — voorspellende gistingscurve. Puur en Node-testbaar.
// Verwachtingslijn = gemiddelde dichtheidsdaling per dag over eerdere,
// vergelijkbare partijen (zelfde gist, anders zelfde wijntype). Bij minder
// dan 2 vergelijkbare partijen wordt er GEEN lijn verzonnen — de UI toont
// dan eerlijk dat er te weinig historie is.

export interface AnalysePunt {
  partij: string;
  datum: string; // yyyy-MM-dd
  oechsle: number;
}

export interface VerwachtingResultaat {
  status: "ok" | "te_weinig_historie";
  aantalVergelijkbaar: number;
  dalingPerDag?: number; // °Oe per dag (positief getal)
  // per datum van de huidige curve de verwachte °Oe
  verwachting?: { datum: string; verwacht_oechsle: number }[];
  achterstandDagen?: number; // >0 = huidige gisting loopt zoveel dagen achter
}

const MS_PER_DAG = 86400000;
const dagen = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / MS_PER_DAG);

// daling per dag van één historische partij; null als onbruikbaar
export function dalingVanPartij(punten: AnalysePunt[]): number | null {
  const met = punten.filter((p) => p.oechsle > 0).sort((a, b) => a.datum.localeCompare(b.datum));
  if (met.length < 2) return null;
  const eerste = met[0];
  const laatste = met[met.length - 1];
  const d = dagen(eerste.datum, laatste.datum);
  if (d < 2) return null;
  const daling = eerste.oechsle - laatste.oechsle;
  if (daling <= 0) return null; // geen gisting te zien
  return daling / d;
}

export function berekenVerwachting(
  huidigePartijId: string,
  allePunten: AnalysePunt[],
  vergelijkbarePartijIds: Set<string>,
): VerwachtingResultaat {
  const perPartij = new Map<string, AnalysePunt[]>();
  for (const p of allePunten) {
    if (!perPartij.has(p.partij)) perPartij.set(p.partij, []);
    perPartij.get(p.partij)!.push(p);
  }

  const dalingen: number[] = [];
  for (const [id, punten] of perPartij) {
    if (id === huidigePartijId || !vergelijkbarePartijIds.has(id)) continue;
    const d = dalingVanPartij(punten);
    if (d != null) dalingen.push(d);
  }

  if (dalingen.length < 2) {
    return { status: "te_weinig_historie", aantalVergelijkbaar: dalingen.length };
  }

  const dalingPerDag = dalingen.reduce((a, b) => a + b, 0) / dalingen.length;

  const huidige = (perPartij.get(huidigePartijId) ?? [])
    .filter((p) => p.oechsle > 0)
    .sort((a, b) => a.datum.localeCompare(b.datum));
  if (huidige.length === 0) {
    return { status: "ok", aantalVergelijkbaar: dalingen.length, dalingPerDag, verwachting: [] };
  }

  const start = huidige[0];
  const verwachting = huidige.map((p) => ({
    datum: p.datum,
    verwacht_oechsle: Math.max(
      0,
      Math.round((start.oechsle - dalingPerDag * dagen(start.datum, p.datum)) * 10) / 10,
    ),
  }));

  // achterstand: hoeveel dagen loopt de laatste echte meting achter op de lijn?
  const laatste = huidige[huidige.length - 1];
  const verwachtLaatste = verwachting[verwachting.length - 1].verwacht_oechsle;
  const achterstandOe = laatste.oechsle - verwachtLaatste;
  const achterstandDagen =
    dalingPerDag > 0 ? Math.round((achterstandOe / dalingPerDag) * 10) / 10 : 0;

  return {
    status: "ok",
    aantalVergelijkbaar: dalingen.length,
    dalingPerDag: Math.round(dalingPerDag * 100) / 100,
    verwachting,
    achterstandDagen: Math.max(0, achterstandDagen),
  };
}
