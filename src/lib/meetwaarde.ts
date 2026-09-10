// Fase 13 Blok A — onderscheid tussen "niet gemeten" en "gemeten, waarde 0".
//
// AANLEIDING: het partijdetail toonde pH 0, vrij SO₂ 0 en 0 °Oe voor analyses
// waarin die velden nooit zijn ingevuld. Voor een kelderman is "vrij SO₂ =
// 0 mg/L" een alarmtoestand (onbeschermde wijn), en 0 °Oe belandde als punt op
// de gistingscurve waarna de voorspelling meldde dat de gisting achterliep.
// Er stond een waarschuwing op een meting die nooit gedaan is.
//
// ONDERZOCHT (25 juli 2026, PocketBase 0.39): een optioneel `number`-veld komt
// ALTIJD als `0` terug, of je nu het veld weglaat, `null` stuurt, expliciet 0
// stuurt of een lege string. Alle vier de gevallen getest — identiek resultaat.
// Er is dus geen opslagniveau-onderscheid, en "oplossen aan de schrijfkant"
// door het veld weg te laten werkt aantoonbaar niet.
//
// OPLOSSING, in twee lagen:
//
//  1. Voor velden waar 0 FYSIEK ONMOGELIJK is (pH, °Oechsle, Brix, SG,
//     totaalzuur) is 0 bewijs van "niet gemeten". Dat geldt met terugwerkende
//     kracht voor alle bestaande analyses.
//
//  2. Voor velden waar 0 een GELDIGE UITKOMST is (alcohol in most, vrij/totaal
//     SO₂ in ongezwavelde wijn, restsuiker in droge wijn) kan geen enkele
//     heuristiek het verschil zien. Daarom legt de app vanaf nu expliciet vast
//     wélke velden zijn ingevuld, in het veld `gemeten_velden`.
//
// Voor oudere analyses zonder `gemeten_velden` valt laag 2 terug op de aanname
// "0 = niet gemeten". Dat is een AANNAME, geen waarheid: bij die records kan
// een echte nulmeting niet meer worden onderscheiden. Bewust zo gekozen omdat
// een onterecht getoonde 0 bij SO₂ tot een verkeerde kelderhandeling leidt en
// een onterecht getoonde "—" alleen tot een extra meting.

export type MeetVeld =
  | "dichtheid_oechsle"
  | "dichtheid_brix"
  | "dichtheid_sg"
  | "ph"
  | "alcohol_pct"
  | "restsuiker_g_l"
  | "totaalzuur_g_l"
  | "vluchtig_zuur_g_l"
  | "so2_vrij"
  | "so2_totaal"
  | "temperatuur_c";

interface VeldRegel {
  /** Kan dit veld in de praktijk werkelijk 0 zijn? */
  nulGeldig: boolean;
  /** Ondergrens waaronder een waarde niet fysiek plausibel is (exclusief). */
  min?: number;
  /** Bovengrens waarboven een waarde niet fysiek plausibel is (inclusief). */
  max?: number;
  label: string;
  eenheid: string;
}

// De grenzen zijn ruim genomen: ze dienen om onmogelijke waarden te herkennen,
// niet om de gebruiker te corrigeren. Een pH van 4,2 is ongebruikelijk maar
// mogelijk; een pH van 0 is dat niet.
export const MEETVELDEN: Record<MeetVeld, VeldRegel> = {
  dichtheid_oechsle: { nulGeldig: false, min: 0, max: 200, label: "Dichtheid", eenheid: "°Oe" },
  dichtheid_brix: { nulGeldig: false, min: 0, max: 45, label: "Brix", eenheid: "°Bx" },
  // SG onder 0,9 bestaat niet in most of wijn (water = 1,000; alcohol = 0,79)
  dichtheid_sg: { nulGeldig: false, min: 0.9, max: 1.25, label: "SG", eenheid: "" },
  ph: { nulGeldig: false, min: 2.0, max: 4.5, label: "pH", eenheid: "" },
  totaalzuur_g_l: { nulGeldig: false, min: 0, max: 30, label: "Totaal zuur", eenheid: "g/L" },
  // Vluchtig zuur is praktisch nooit exact 0, maar wel zeer laag. Ruime marge:
  // alles onder 0,05 g/L wordt als "niet gemeten" gelezen.
  vluchtig_zuur_g_l: {
    nulGeldig: false,
    min: 0.05,
    max: 5,
    label: "Vluchtig zuur",
    eenheid: "g/L",
  },

  // Hieronder is 0 een geldige uitkomst — deze leunen op `gemeten_velden`.
  alcohol_pct: { nulGeldig: true, min: -0.001, max: 25, label: "Alcohol", eenheid: "% vol" },
  restsuiker_g_l: { nulGeldig: true, min: -0.001, max: 400, label: "Restsuiker", eenheid: "g/L" },
  so2_vrij: { nulGeldig: true, min: -0.001, max: 200, label: "SO₂ vrij", eenheid: "mg/L" },
  so2_totaal: { nulGeldig: true, min: -0.001, max: 500, label: "SO₂ totaal", eenheid: "mg/L" },
  // 0 °C is theoretisch een geldige meting maar in een kelder praktisch nooit;
  // leunt daarom op gemeten_velden i.p.v. op de waarde zelf.
  temperatuur_c: { nulGeldig: true, min: -5, max: 45, label: "Temperatuur", eenheid: "°C" },
};

/** Bron waaruit blijkt welke velden zijn ingevuld (leeg bij oudere analyses). */
export function parseGemetenVelden(ruw: string | null | undefined): Set<string> {
  if (!ruw) return new Set();
  return new Set(
    ruw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function serialiseerGemetenVelden(velden: Iterable<string>): string {
  return [...new Set(velden)].filter(Boolean).sort().join(",");
}

/**
 * Is deze waarde een échte meting? Geeft de waarde terug, of null als het veld
 * niet gemeten is. `gemetenVelden` is leidend zodra het gevuld is.
 */
export function meetwaarde(
  veld: MeetVeld,
  waarde: number | null | undefined,
  gemetenVelden?: Set<string>,
): number | null {
  if (waarde === null || waarde === undefined || Number.isNaN(waarde)) return null;
  const regel = MEETVELDEN[veld];
  if (!regel) return waarde;

  // Buiten het fysiek mogelijke bereik: geen meting, ongeacht wat er vastligt.
  if (regel.min !== undefined && waarde < regel.min) return null;
  if (regel.max !== undefined && waarde > regel.max) return null;

  // Expliciete registratie is leidend. Staat het veld erin, dan is het gemeten
  // — óók als de waarde 0 is (een ongezwavelde most heeft echt 0 vrij SO₂).
  if (gemetenVelden && gemetenVelden.size > 0) {
    return gemetenVelden.has(veld) ? waarde : null;
  }

  // Geen registratie (oudere analyse): terugvallen op plausibiliteit.
  // Let op: voor BEIDE soorten velden wordt 0 hier als "niet gemeten" gelezen.
  // Bij nulGeldig=false is dat een feit (0 kan fysiek niet). Bij nulGeldig=true
  // is het een bewuste aanname — zie de toelichting bovenaan dit bestand: bij
  // oudere records is een echte nulmeting niet meer te onderscheiden, en een
  // onterecht getoonde 0 bij SO₂ is schadelijker dan een onterechte "—".
  if (waarde === 0) return null;
  return waarde;
}

/** Kortweg: is dit veld gemeten? */
export function isGemeten(
  veld: MeetVeld,
  waarde: number | null | undefined,
  gemetenVelden?: Set<string>,
): boolean {
  return meetwaarde(veld, waarde, gemetenVelden) !== null;
}

/**
 * Toonwaarde voor het scherm: het getal, of "—" als er niet gemeten is.
 * Nooit een 0 tonen die geen meting is.
 */
export function toonMeetwaarde(
  veld: MeetVeld,
  waarde: number | null | undefined,
  gemetenVelden?: Set<string>,
  decimalen?: number,
): string {
  const w = meetwaarde(veld, waarde, gemetenVelden);
  if (w === null) return "—";
  return decimalen === undefined ? String(w) : w.toFixed(decimalen);
}
