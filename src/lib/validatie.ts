import type { MetingInput, ObservatieInput, FenologieInput } from "./data";

export interface ValidatieFout {
  veld: string;
  bericht: string;
}

function checkDatum(datum: string | undefined, fouten: ValidatieFout[]) {
  if (!datum) {
    fouten.push({ veld: "datum", bericht: "Datum is verplicht" });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(datum)) {
    fouten.push({ veld: "datum", bericht: "Datum heeft ongeldig formaat" });
    return;
  }
  // veldregistraties kunnen niet in de toekomst liggen
  const vandaag = new Date();
  vandaag.setHours(23, 59, 59, 999);
  if (new Date(datum) > vandaag) {
    fouten.push({ veld: "datum", bericht: "Datum kan niet in de toekomst liggen" });
  }
}

export function valideerMeting(input: Partial<MetingInput>): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];

  if (!input.rij) fouten.push({ veld: "rij", bericht: "Rij is verplicht" });
  checkDatum(input.datum, fouten);

  if (input.brix != null && (input.brix < 0 || input.brix > 40))
    fouten.push({ veld: "brix", bericht: "Brix moet tussen 0 en 40 liggen" });

  if (input.ph != null && (input.ph < 2 || input.ph > 5))
    fouten.push({ veld: "ph", bericht: "pH moet tussen 2 en 5 liggen" });

  if (input.zuurgraad != null && (input.zuurgraad < 0 || input.zuurgraad > 20))
    fouten.push({ veld: "zuurgraad", bericht: "Zuurgraad moet tussen 0 en 20 g/L liggen" });

  if (input.rijpheid_score != null && (input.rijpheid_score < 1 || input.rijpheid_score > 5))
    fouten.push({ veld: "rijpheid_score", bericht: "Rijpheid moet tussen 1 en 5 zijn" });

  if (input.temperatuur != null && (input.temperatuur < -30 || input.temperatuur > 50))
    fouten.push({ veld: "temperatuur", bericht: "Temperatuur moet tussen -30 en 50 °C liggen" });

  if (!input.ingevoerd_door?.trim())
    fouten.push({ veld: "ingevoerd_door", bericht: "Invoerder is verplicht" });

  return fouten;
}

export function valideerObservatie(input: Partial<ObservatieInput>): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];

  if (!input.rij) fouten.push({ veld: "rij", bericht: "Rij is verplicht" });
  checkDatum(input.datum, fouten);
  if (!input.type) fouten.push({ veld: "type", bericht: "Type observatie is verplicht" });
  if (!input.notitie) fouten.push({ veld: "notitie", bericht: "Notitie is verplicht" });
  if (!input.ingevoerd_door?.trim())
    fouten.push({ veld: "ingevoerd_door", bericht: "Invoerder is verplicht" });

  return fouten;
}

export function valideerFenologie(input: Partial<FenologieInput>): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];

  if (!input.rij) fouten.push({ veld: "rij", bericht: "Rij is verplicht" });
  if (!input.ras) fouten.push({ veld: "ras", bericht: "Ras is verplicht" });
  if (!input.moment) fouten.push({ veld: "moment", bericht: "Fenologisch moment is verplicht" });
  checkDatum(input.datum, fouten);
  if (!input.ingevoerd_door?.trim())
    fouten.push({ veld: "ingevoerd_door", bericht: "Invoerder is verplicht" });

  return fouten;
}

export interface GezondheidValidatieInput {
  rij?: string;
  datum?: string;
  vigor?: number;
  snoeigewicht?: number | null;
  dode_planten?: number | null;
  korte_scheuten?: number | null;
  ingevoerd_door?: string;
}

export function valideerGezondheid(input: GezondheidValidatieInput): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];

  if (!input.rij) fouten.push({ veld: "rij", bericht: "Kies een rij" });
  checkDatum(input.datum, fouten);
  if (input.vigor == null || input.vigor < 1 || input.vigor > 5)
    fouten.push({ veld: "vigor", bericht: "Vigor moet tussen 1 en 5 zijn" });
  if (input.snoeigewicht != null && (input.snoeigewicht < 0 || input.snoeigewicht > 5000))
    fouten.push({ veld: "snoeigewicht", bericht: "Snoeigewicht moet tussen 0 en 5000 g liggen" });
  if (input.dode_planten != null && (input.dode_planten < 0 || input.dode_planten > 100))
    fouten.push({ veld: "dode_planten", bericht: "Dode planten moet tussen 0 en 100 liggen" });
  if (input.korte_scheuten != null && (input.korte_scheuten < 0 || input.korte_scheuten > 100))
    fouten.push({ veld: "korte_scheuten", bericht: "Korte scheuten moet tussen 0 en 100% liggen" });
  if (!input.ingevoerd_door?.trim())
    fouten.push({ veld: "ingevoerd_door", bericht: "Invoerder is verplicht" });

  return fouten;
}

export interface OogstValidatieInput {
  rij?: string | null;
  datum?: string;
  kg?: number;
  ingevoerd_door?: string;
}

export function valideerOogst(input: OogstValidatieInput): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];

  if (!input.rij) fouten.push({ veld: "rij", bericht: "Kies een rij" });
  checkDatum(input.datum, fouten);
  if (input.kg == null || Number.isNaN(input.kg) || input.kg <= 0)
    fouten.push({ veld: "kg", bericht: "Vul een geldig gewicht in (kg)" });
  else if (input.kg > 5000)
    fouten.push({ veld: "kg", bericht: "Gewicht lijkt onrealistisch hoog (max 5000 kg)" });
  if (!input.ingevoerd_door?.trim())
    fouten.push({ veld: "ingevoerd_door", bericht: "Invoerder is verplicht" });

  return fouten;
}

export interface WerkuurValidatieInput {
  taak?: string;
  datum?: string;
  uren?: number;
  ingevoerd_door?: string;
}

export function valideerWerkuur(input: WerkuurValidatieInput): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];

  if (!input.taak) fouten.push({ veld: "taak", bericht: "Kies een taaktype" });
  checkDatum(input.datum, fouten);
  if (input.uren == null || Number.isNaN(input.uren) || input.uren <= 0)
    fouten.push({ veld: "uren", bericht: "Vul een geldig aantal uren in" });
  else if (input.uren > 24)
    fouten.push({ veld: "uren", bericht: "Meer dan 24 uur op één dag kan niet" });
  if (!input.ingevoerd_door?.trim())
    fouten.push({ veld: "ingevoerd_door", bericht: "Invoerder is verplicht" });

  return fouten;
}

export function isGeldig(fouten: ValidatieFout[]): boolean {
  return fouten.length === 0;
}

// Hulpje voor formulieren: fouten omzetten naar een veld→bericht map
export function foutenPerVeld(fouten: ValidatieFout[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fouten) {
    if (!map[f.veld]) map[f.veld] = f.bericht;
  }
  return map;
}
