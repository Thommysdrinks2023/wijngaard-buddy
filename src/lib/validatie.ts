import type { MetingInput, ObservatieInput, FenologieInput } from "./data";
import type { PartijInput } from "./partijen-data";
import type {
  AnalyseInput,
  BoekingInput,
  BottelrondeInput,
  KelderlogInput,
  TankInput,
  VoedingswaardeInput,
  VoorraadMutatieInput,
} from "./kelder-data";

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

export function valideerPartij(input: Partial<PartijInput>): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];
  if (!input.naam?.trim()) fouten.push({ veld: "naam", bericht: "Naam is verplicht" });
  if (!input.jaargang || input.jaargang < 2000 || input.jaargang > 2100)
    fouten.push({ veld: "jaargang", bericht: "Vul een geldige jaargang in" });
  if (!input.type) fouten.push({ veld: "type", bericht: "Kies een type" });
  if (!input.status) fouten.push({ veld: "status", bericht: "Kies een status" });
  if (input.start_volume_l != null && input.start_volume_l < 0)
    fouten.push({ veld: "start_volume_l", bericht: "Startvolume kan niet negatief zijn" });
  return fouten;
}

export function valideerTank(input: Partial<TankInput>): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];
  if (!input.code?.trim()) fouten.push({ veld: "code", bericht: "Code is verplicht" });
  if (input.capaciteit_l != null && input.capaciteit_l < 0)
    fouten.push({ veld: "capaciteit_l", bericht: "Capaciteit kan niet negatief zijn" });
  if (!input.status) fouten.push({ veld: "status", bericht: "Kies een status" });
  return fouten;
}

export function valideerBoeking(input: Partial<BoekingInput>): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];
  if (!input.partij) fouten.push({ veld: "partij", bericht: "Kies een partij" });
  if (!input.actie) fouten.push({ veld: "actie", bericht: "Kies een actie" });
  checkDatum(input.datum, fouten);
  if (input.volume_l == null || Number.isNaN(input.volume_l) || input.volume_l < 0)
    fouten.push({ veld: "volume_l", bericht: "Vul een geldig volume in (liter)" });
  if (input.actie === "overhevelen" && (!input.van_tank || !input.naar_tank))
    fouten.push({ veld: "van_tank", bericht: "Overhevelen vereist een van- én naar-tank" });
  if (input.actie === "vullen" && !input.naar_tank)
    fouten.push({ veld: "naar_tank", bericht: "Vullen vereist een naar-tank" });
  if (!input.verantwoordelijke?.trim())
    fouten.push({ veld: "verantwoordelijke", bericht: "Verantwoordelijke is verplicht" });
  return fouten;
}

export function valideerAnalyse(input: Partial<AnalyseInput>): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];
  if (!input.partij) fouten.push({ veld: "partij", bericht: "Kies een partij" });
  checkDatum(input.datum, fouten);
  if (input.ph != null && (input.ph < 2 || input.ph > 5))
    fouten.push({ veld: "ph", bericht: "pH moet tussen 2 en 5 liggen" });
  if (input.alcohol_pct != null && (input.alcohol_pct < 0 || input.alcohol_pct > 25))
    fouten.push({ veld: "alcohol_pct", bericht: "Alcohol moet tussen 0 en 25 % liggen" });
  if (input.so2_vrij != null && (input.so2_vrij < 0 || input.so2_vrij > 300))
    fouten.push({ veld: "so2_vrij", bericht: "Vrije SO₂ moet tussen 0 en 300 mg/L liggen" });
  if (input.so2_totaal != null && (input.so2_totaal < 0 || input.so2_totaal > 500))
    fouten.push({ veld: "so2_totaal", bericht: "Totaal SO₂ moet tussen 0 en 500 mg/L liggen" });
  if (
    input.dichtheid_oechsle != null &&
    (input.dichtheid_oechsle < -20 || input.dichtheid_oechsle > 200)
  )
    fouten.push({ veld: "dichtheid_oechsle", bericht: "°Oechsle moet tussen -20 en 200 liggen" });
  if (input.temperatuur_c != null && (input.temperatuur_c < -5 || input.temperatuur_c > 45))
    fouten.push({ veld: "temperatuur_c", bericht: "Temperatuur moet tussen -5 en 45 °C liggen" });
  if (!input.ingevoerd_door?.trim())
    fouten.push({ veld: "ingevoerd_door", bericht: "Invoerder is verplicht" });
  return fouten;
}

export function valideerKelderlog(input: Partial<KelderlogInput>): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];
  checkDatum(input.datum, fouten);
  if (!input.actie) fouten.push({ veld: "actie", bericht: "Kies een actie" });
  if (!input.partij && !input.tank)
    fouten.push({ veld: "partij", bericht: "Kies minstens een partij of een tank" });
  if (input.hoeveelheid != null && input.hoeveelheid < 0)
    fouten.push({ veld: "hoeveelheid", bericht: "Hoeveelheid kan niet negatief zijn" });
  if (!input.ingevoerd_door?.trim())
    fouten.push({ veld: "ingevoerd_door", bericht: "Invoerder is verplicht" });
  return fouten;
}

export function valideerVoedingswaarde(input: Partial<VoedingswaardeInput>): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];
  if (!input.partij) fouten.push({ veld: "partij", bericht: "Kies een partij" });
  checkDatum(input.berekening_datum, fouten);
  const velden: { key: keyof VoedingswaardeInput; label: string }[] = [
    { key: "alcohol_gram_liter", label: "alcohol" },
    { key: "restsuiker_gram_liter", label: "restsuiker" },
    { key: "zuur_gram_liter", label: "zuur" },
    { key: "glycerine_gram_liter", label: "glycerine" },
  ];
  for (const v of velden) {
    const waarde = input[v.key];
    if (typeof waarde !== "number" || Number.isNaN(waarde) || waarde < 0)
      fouten.push({
        veld: v.key,
        bericht: `Vul een geldige waarde in voor ${v.label} (g/L)`,
      });
  }
  return fouten;
}

export function valideerBottelronde(input: Partial<BottelrondeInput>): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];
  if (!input.partij) fouten.push({ veld: "partij", bericht: "Partij ontbreekt" });
  if (!input.van_tank) fouten.push({ veld: "van_tank", bericht: "Kies een tank" });
  checkDatum(input.botteldatum, fouten);
  if (!input.aantal_flessen || input.aantal_flessen <= 0)
    fouten.push({ veld: "aantal_flessen", bericht: "Vul een geldig aantal flessen in" });
  if (!input.flesinhoud_ml || input.flesinhoud_ml <= 0)
    fouten.push({ veld: "flesinhoud_ml", bericht: "Vul een geldige flesinhoud in (ml)" });
  if (!input.ingevoerd_door?.trim())
    fouten.push({ veld: "ingevoerd_door", bericht: "Invoerder is verplicht" });
  return fouten;
}

export function valideerVoorraadMutatie(input: Partial<VoorraadMutatieInput>): ValidatieFout[] {
  const fouten: ValidatieFout[] = [];
  if (!input.voorraad) fouten.push({ veld: "voorraad", bericht: "Voorraadrecord ontbreekt" });
  if (!input.mutatie_type) fouten.push({ veld: "mutatie_type", bericht: "Kies een type" });
  checkDatum(input.datum, fouten);
  // "correctie" mag negatief zijn (extra afboeken na een telfout); de andere
  // vier types zijn altijd een afname en de UI vraagt dus altijd een positief
  // aantal — de server normaliseert dat zelf naar negatief.
  if (input.aantal == null || Number.isNaN(input.aantal) || input.aantal === 0)
    fouten.push({ veld: "aantal", bericht: "Vul een geldig, niet-nul aantal in" });
  else if (input.mutatie_type !== "correctie" && input.aantal < 0)
    fouten.push({ veld: "aantal", bericht: "Vul een positief aantal in" });
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
