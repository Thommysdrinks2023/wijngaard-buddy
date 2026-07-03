// Voedingswaarde-/etiketberekening, overgenomen uit het "Voedingswaarden"-
// tabblad van Logboek_leeg.xlsx. Losstaande rekentool gekoppeld aan een
// partij (energielabel bij botteling) — géén bottelfunctionaliteit zelf.
//
// Volgorde is bewust gelijk aan de Excel: eerst de vier kcal-componenten
// ongerond optellen, dan pas de som afronden (niet per component afronden en
// die afgeronde waarden optellen — dat geeft bij sommige invoer een ander
// resultaat).

const KCAL_FACTOR_ALCOHOL = 7;
const KCAL_FACTOR_RESTSUIKER = 4;
const KCAL_FACTOR_GLYCERINE = 2.4;
const KCAL_FACTOR_ZUUR = 3;
const KCAL_NAAR_KJ = 4.25;

export const GLYCERINE_DEFAULT_GRAM_LITER = 8;

export interface VoedingswaardeInput {
  alcohol_gram_liter: number;
  restsuiker_gram_liter: number;
  zuur_gram_liter: number;
  glycerine_gram_liter: number;
}

export interface VoedingswaardeResultaat {
  kcal_totaal: number;
  kj_totaal: number;
  koolhydraten_totaal_per_100ml: number;
  restsuiker_per_100ml: number;
  etiket_tekst: string;
}

// Nederlandse decimaalnotatie (komma) — dit is letterlijk kopieerbare tekst
// voor een productetiket, niet een intern opgeslagen getal.
function komma(n: number, decimalen = 1): string {
  return n.toFixed(decimalen).replace(".", ",");
}

export function berekenVoedingswaarde(input: VoedingswaardeInput): VoedingswaardeResultaat {
  const alcoholPer100ml = input.alcohol_gram_liter / 10;
  const restsuikerPer100ml = input.restsuiker_gram_liter / 10;
  const zuurPer100ml = input.zuur_gram_liter / 10;
  const glycerinePer100ml = input.glycerine_gram_liter / 10;

  const kcalRuweSom =
    alcoholPer100ml * KCAL_FACTOR_ALCOHOL +
    restsuikerPer100ml * KCAL_FACTOR_RESTSUIKER +
    glycerinePer100ml * KCAL_FACTOR_GLYCERINE +
    zuurPer100ml * KCAL_FACTOR_ZUUR;

  const kcalTotaal = Math.round(kcalRuweSom);
  const kjTotaal = Math.round(kcalTotaal * KCAL_NAAR_KJ);
  const koolhydratenTotaalPer100ml = glycerinePer100ml + restsuikerPer100ml;

  const etiketTekst = [
    `E ${kcalTotaal} Kcal ${kjTotaal} Kj`,
    `Voedingswaarden Per 100 ML`,
    `Koolhydraten            ${komma(koolhydratenTotaalPer100ml)} gram`,
    `Waarvan suiker         ${komma(restsuikerPer100ml)} gram`,
    `Bevat te verwaarlozen hoeveelheden vet, verzadigd vet, eiwit en zout`,
  ].join("\n");

  return {
    kcal_totaal: kcalTotaal,
    kj_totaal: kjTotaal,
    koolhydraten_totaal_per_100ml: koolhydratenTotaalPer100ml,
    restsuiker_per_100ml: restsuikerPer100ml,
    etiket_tekst: etiketTekst,
  };
}

// Alcohol in analyses staat als volumepercentage (%vol), niet als g/l. Er
// bestaat geen direct g/l-veld in het bestaande analyses-schema — omrekenen
// met de standaard ethanoldichtheid (0,789 g/ml): %vol × 10 ml/L × 0,789 g/ml.
export function alcoholPctNaarGramLiter(alcoholPct: number): number {
  return alcoholPct * 7.89;
}
