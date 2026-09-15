// Fase 21 — gedeeld contract voor wat-als-simulaties.
//
// Bewust GEEN gedeelde uitvoeringsmotor (zie ONTWERP-SIMULATIE-1-ARCHITECTUUR.md,
// weerwoord 1b.1): de drie domeinen die ooit hierop aansluiten — pasteurisatie
// (minuten, fysisch), gisting (dagen, statistisch) en rijping (weken, warmtesom)
// — hebben elk hun eigen, al bestaande rekenkern. Wat ze wél delen is hoe een
// hypothetische uitkomst gepresenteerd en gekwalificeerd wordt. Dat is dit
// bestand: een type, drie constructors, geen rekenwerk.
//
// Alleen pasteurisatie gebruikt dit vandaag. Gisting en rijping kunnen pas
// aansluiten nadat hun ontbrekende domeinmodellen bestaan (temperatuur ->
// gistingssnelheid, weer/GDD -> rijpheid) — zie ONTWERP-SIMULATIE-2, sectie
// "Toekomstig werk".

export type SimulatieStatus =
  /** Het model bestaat, de invoer is toereikend, er is een uitkomst. */
  | "ok"
  /** Het model bestaat, maar er is te weinig data/historie om het te voeden. */
  | "onvoldoende_data"
  /**
   * Er bestaat (nog) geen rekenmodel voor deze vraag. Wezenlijk anders dan
   * "onvoldoende_data": geen hoeveelheid extra metingen lost dit op, er moet
   * eerst een formule bij. Vandaag onbereikbaar voor pasteurisatie; bestaat
   * zodat gisting/rijping straks eerlijk kunnen zeggen dat een
   * temperatuur- of rijpheidsvraag simpelweg niet te beantwoorden is.
   */
  | "model_ontbreekt";

/** Onder- en bovengrens rond een puntschatting. Nooit als "precisie" tonen. */
export interface Bandbreedte {
  ondergrens: number;
  bovengrens: number;
  /**
   * Waar deze band over gaat, inclusief eenheid (bijv. "verwachte flesdruk in
   * bar"). Verplicht omdat een simulatie-uitkomst vaak een samengesteld object
   * is: zonder label is een losse band dubbelzinnig, en een dubbelzinnig
   * getal is precies wat dit ontwerp probeert te voorkomen.
   */
  waarvan: string;
}

export interface SimulatieResultaat<T> {
  status: SimulatieStatus;
  /** Alleen gevuld bij status "ok". */
  waarde?: T;
  /** Reden bij "onvoldoende_data"/"model_ontbreekt" — altijd in gewone taal. */
  reden?: string;
  bandbreedte?: Bandbreedte;
  /**
   * Wat deze uitkomst aanneemt, in gewone taal, om als lijst bij het resultaat
   * te tonen. Verplicht (mag leeg zijn) zodat het tonen van aannames de
   * standaard is en het weglaten ervan een bewuste keuze.
   */
  aannames: string[];
  /**
   * Is het ONDERLIGGENDE rekenmodel nagemeten tegen de werkelijkheid? Voor
   * pasteurisatie/druk staat dit vandaag hard op false (zie Fase 17: het
   * drukmodel is nooit tegen een echte gemeten flesdruk geijkt). Een
   * simulatie op een ongevalideerd model is dubbel onzeker en moet dat ook
   * dubbel zeggen — de UI toont daarom de niet-gevalideerd-tekst NAAST de
   * simulatiemarkering, nooit in plaats daarvan.
   */
  gevalideerd: boolean;
}

export function simulatieOk<T>(
  waarde: T,
  opties: { aannames?: string[]; bandbreedte?: Bandbreedte; gevalideerd?: boolean } = {},
): SimulatieResultaat<T> {
  return {
    status: "ok",
    waarde,
    bandbreedte: opties.bandbreedte,
    aannames: opties.aannames ?? [],
    gevalideerd: opties.gevalideerd ?? false,
  };
}

export function simulatieOnvoldoendeData<T>(
  reden: string,
  aannames: string[] = [],
): SimulatieResultaat<T> {
  return { status: "onvoldoende_data", reden, aannames, gevalideerd: false };
}

export function simulatieModelOntbreekt<T>(
  reden: string,
  aannames: string[] = [],
): SimulatieResultaat<T> {
  return { status: "model_ontbreekt", reden, aannames, gevalideerd: false };
}
