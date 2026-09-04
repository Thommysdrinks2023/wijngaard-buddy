import type { Ras } from "./seed-rijen";

export type { Ras };

export interface Rij {
  id: string;
  rijnummer: number;
  ras: Ras;
  aantal_planten: number;
  // optionele veldnotitie bij deze rij
  notitie?: string;
  // aantal planten per vak tussen de palen (standaard 5)
  planten_per_vak?: number;
}

export type RijpheidScore = 1 | 2 | 3 | 4 | 5;

export interface Meting {
  id: string;
  rij: string; // rij id
  plant?: number | null; // optioneel: plantnummer binnen de rij
  datum: string; // ISO date
  seizoen?: number;
  brix?: number | null;
  ph?: number | null;
  zuurgraad?: number | null;
  rijpheid_score: RijpheidScore;
  notitie?: string;
  foto?: string; // url or empty
  temperatuur?: number | null;
  neerslag?: NeerslagType | null;
  ingevoerd_door: string;
  created: string;
}

export type NeerslagType = "Geen" | "Lichte regen" | "Matige regen" | "Zware regen" | "Onweer";
export const NEERSLAG_OPTIES: NeerslagType[] = [
  "Geen",
  "Lichte regen",
  "Matige regen",
  "Zware regen",
  "Onweer",
];

export type ObservatieType = "gezond" | "groei" | "ziekte" | "schade" | "uitval" | "anders";

export const OBSERVATIE_TYPES: { value: ObservatieType; label: string; emoji: string }[] = [
  { value: "gezond", label: "Gezond", emoji: "✅" },
  { value: "groei", label: "Groei", emoji: "🌱" },
  { value: "ziekte", label: "Ziekte", emoji: "🦠" },
  { value: "schade", label: "Schade", emoji: "⚠️" },
  { value: "uitval", label: "Uitval", emoji: "💀" },
  { value: "anders", label: "Anders", emoji: "📝" },
];

export interface Observatie {
  id: string;
  rij: string;
  plant?: number | null;
  datum: string;
  seizoen?: number;
  type: ObservatieType;
  notitie: string;
  foto?: string;
  ingevoerd_door: string;
  created: string;
}

// ============= Fenologie =============
export type FenologieMoment = "Knopbreek" | "Bloei" | "Zetting" | "Véraison" | "Oogstrijp";

export const FENOLOGIE_MOMENTEN: { value: FenologieMoment; emoji: string; description: string }[] =
  [
    { value: "Knopbreek", emoji: "🌱", description: "Eerste knopbreek" },
    { value: "Bloei", emoji: "🌸", description: "Bloeiende bloemen" },
    { value: "Zetting", emoji: "🍇", description: "Vruchtzetting" },
    { value: "Véraison", emoji: "🍷", description: "Kleuromslag" },
    { value: "Oogstrijp", emoji: "🧺", description: "Klaar voor oogst" },
  ];

export interface Fenologie {
  id: string;
  rij: string;
  ras: Ras;
  moment: FenologieMoment;
  datum: string; // ISO date
  seizoen?: number;
  notitie?: string;
  ingevoerd_door: string;
  created: string;
}

// ============= Partijen (wijngaard → kelder overdracht) =============
// Vroeg-stadium concept: een partij volgt geoogste druiven vóór tanktoewijzing.
// Koppeling met wijnbatches/tanks is toekomstig werk.
export type PartijType = "wit" | "rood" | "rosé" | "mousserend" | "overig";
export const PARTIJ_TYPES: PartijType[] = ["wit", "rood", "rosé", "mousserend", "overig"];

export type PartijStatus =
  | "most"
  | "gisting"
  | "opvoeding"
  | "klaar_voor_botteling"
  | "gebotteld"
  | "afgevoerd";

export const PARTIJ_STATUSSEN: { value: PartijStatus; label: string; emoji: string }[] = [
  { value: "most", label: "Most", emoji: "🍇" },
  { value: "gisting", label: "Gisting", emoji: "🔥" },
  { value: "opvoeding", label: "Opvoeding", emoji: "😴" },
  { value: "klaar_voor_botteling", label: "Klaar voor botteling", emoji: "🧪" },
  { value: "gebotteld", label: "Gebotteld", emoji: "🍾" },
  { value: "afgevoerd", label: "Afgevoerd", emoji: "🗑️" },
];

export interface Partij {
  id: string;
  naam: string;
  jaargang: number;
  type: PartijType;
  status: PartijStatus;
  samenstelling?: string;
  start_volume_l?: number | null;
  notitie?: string;
  // kelder Fase 0–2
  eigenaar?: string | null; // eigenaar id
  opdracht_type?: OpdrachtType | null;
  ouder_partij?: string | null; // partij id — genealogie (cuvée/splitsing, UI later)
  lotnummer?: string;
  pers_datum?: string;
  gist?: string;
  start_dichtheid_oechsle?: number | null;
  start_dichtheid_brix?: number | null;
  start_dichtheid_sg?: number | null;
  start_tank?: string | null; // tank id
  // kelderuitbreiding: velden uit Logboek_leeg.xlsx (boven de eerste analyse ingevuld)
  ontstelen?: boolean;
  voorklaren?: boolean;
  ph_bij_aanmaak?: number | null;
  totaal_zuur_bij_aanmaak?: number | null;
  standtijd?: string;
  koeling?: string;
  // Fase 14 Blok B/C
  nfc_tag?: string;
  temperatuur_programma?: import("./temperatuurprogramma").TemperatuurProgramma | null;
  created: string;
  updated?: string;
}

export type OpdrachtType = "eigen_wijn" | "drank" | "loonproductie" | "bottelservice";
export const OPDRACHT_TYPES: { value: OpdrachtType; label: string }[] = [
  { value: "eigen_wijn", label: "Eigen wijn" },
  { value: "drank", label: "Drankproductie" },
  { value: "loonproductie", label: "Loonproductie" },
  { value: "bottelservice", label: "Bottelservice" },
];

// ============= Eigenaars =============
// Fase 16: heette eerder "producent". Dat was het verkeerde woord — De
// Tappenmars bottelt en verwerkt ook voor andere wijngaarden en fruittelers,
// en die klanten zijn geen producent maar EIGENAAR van hun eigen product
// terwijl het hier in de kelder staat.
export type EigenaarSoort = "eigen_wijngaard" | "drankproductie" | "extern_klant";

export interface Eigenaar {
  id: string;
  naam: string;
  /**
   * Tweecijferige administratiecode (De Tappenmars = 01, Thommy's Drinks =
   * 07). Leeg bij eigenaars die van vóór Fase 16 dateren en waarvan de code
   * nog opgezocht moet worden — zie de overgangsregel in
   * pocketbase/pb_hooks/eigenaars.pb.js. Nieuwe eigenaars krijgen hem verplicht.
   */
  code?: string;
  soort: EigenaarSoort;
  actief: boolean;
  notitie?: string;
}

/** "01 — De Tappenmars", of alleen de naam als de code nog ontbreekt. */
export function eigenaarLabel(e: { naam: string; code?: string }): string {
  return e.code ? `${e.code} — ${e.naam}` : e.naam;
}

// ============= Tanks =============
export type TankStatus = "leeg" | "in_gebruik" | "reiniging" | "defect";
export const TANK_STATUSSEN: { value: TankStatus; label: string; emoji: string }[] = [
  { value: "leeg", label: "Leeg", emoji: "⚪" },
  { value: "in_gebruik", label: "In gebruik", emoji: "🍷" },
  { value: "reiniging", label: "Reiniging", emoji: "🧽" },
  { value: "defect", label: "Defect", emoji: "⚠️" },
];

export interface Tank {
  id: string;
  code: string;
  soort?: string; // bv. IM530 (zwemdeksel), Pulptank, koeltank, IBC1000
  capaciteit_l: number;
  status: TankStatus;
  huidige_partij?: string | null; // cache — waarheid is het tankboek
  huidig_volume_l: number; // cache — waarheid is het tankboek
  locatie?: string;
  notitie?: string;
  // Fase 14 Blok B
  nfc_tag?: string;
}

// ============= Tankboek =============
export type TankboekActie =
  | "vullen"
  | "overhevelen"
  | "toevoeging"
  | "monster"
  | "botteling"
  | "verlies"
  | "correctie"
  | "overig";

export const TANKBOEK_ACTIES: { value: TankboekActie; label: string; emoji: string }[] = [
  { value: "vullen", label: "Vullen", emoji: "🍇" },
  { value: "overhevelen", label: "Overhevelen", emoji: "🔁" },
  { value: "toevoeging", label: "Toevoeging", emoji: "🧪" },
  { value: "monster", label: "Monster", emoji: "🥃" },
  { value: "botteling", label: "Botteling", emoji: "🍾" },
  { value: "verlies", label: "Verlies", emoji: "💧" },
  { value: "correctie", label: "Correctie", emoji: "✏️" },
  { value: "overig", label: "Overig", emoji: "📝" },
];

export interface TankboekRegel {
  id: string;
  datum: string;
  tijd?: string;
  partij: string; // partij id
  eigenaar?: string | null;
  actie: TankboekActie;
  van_tank?: string | null;
  naar_tank?: string | null;
  volume_l: number;
  middel?: string;
  dosering?: string;
  verantwoordelijke: string;
  corrigeert?: string | null; // tankboek id bij actie "correctie"
  notitie?: string;
  created: string;
}

// ============= Analyses (kelder) =============
export type AnalyseMethode = "eigen_meting" | "extern_lab";

export interface Analyse {
  id: string;
  datum: string;
  tijd?: string;
  partij: string;
  tank?: string | null; // snapshot: waar de partij lag
  dichtheid_oechsle?: number | null;
  dichtheid_brix?: number | null;
  dichtheid_sg?: number | null;
  ph?: number | null;
  alcohol_pct?: number | null;
  restsuiker_g_l?: number | null;
  totaalzuur_g_l?: number | null;
  vluchtig_zuur_g_l?: number | null;
  so2_vrij?: number | null;
  so2_totaal?: number | null;
  methode?: AnalyseMethode | null;
  bestand?: string;
  notitie?: string;
  ingevoerd_door?: string;
  created: string;
  /**
   * Fase 13 Blok A — kommagescheiden lijst van de velden die bij deze analyse
   * daadwerkelijk zijn ingevuld. Nodig omdat PocketBase een leeg getalveld als
   * 0 teruggeeft; zonder dit is "vrij SO₂ = 0" niet te onderscheiden van "vrij
   * SO₂ niet gemeten". Leeg bij analyses van vóór deze versie — zie meetwaarde.ts.
   */
  gemeten_velden?: string;
}

// ============= Kelderlog (werklogboek) =============
export type KelderlogActie =
  | "ontstelen"
  | "persen"
  | "voorklaren"
  | "gisting_start"
  | "gisting_einde"
  | "roeren"
  | "overhevelen"
  | "filtreren"
  | "klaring"
  | "toevoeging"
  | "koeling"
  | "proeven"
  | "reiniging"
  | "botteling"
  | "pasteurisatie"
  | "overig";

export const KELDERLOG_ACTIES: { value: KelderlogActie; label: string; emoji: string }[] = [
  { value: "ontstelen", label: "Ontstelen", emoji: "🍇" },
  { value: "persen", label: "Persen", emoji: "🫸" },
  { value: "voorklaren", label: "Voorklaren", emoji: "🫧" },
  { value: "gisting_start", label: "Gisting start", emoji: "🔥" },
  { value: "gisting_einde", label: "Gisting einde", emoji: "🏁" },
  { value: "roeren", label: "Roeren", emoji: "🌀" },
  { value: "overhevelen", label: "Overhevelen", emoji: "🔁" },
  { value: "filtreren", label: "Filtreren", emoji: "🧫" },
  { value: "klaring", label: "Klaring", emoji: "✨" },
  { value: "toevoeging", label: "Toevoeging", emoji: "🧪" },
  { value: "koeling", label: "Koeling", emoji: "❄️" },
  { value: "proeven", label: "Proeven", emoji: "👅" },
  { value: "reiniging", label: "Reiniging", emoji: "🧽" },
  { value: "botteling", label: "Botteling", emoji: "🍾" },
  { value: "pasteurisatie", label: "Pasteurisatie", emoji: "🌡️" },
  { value: "overig", label: "Overig", emoji: "📝" },
];

export type KelderlogEenheid = "g" | "kg" | "ml" | "l" | "g_hl" | "mg_l";
export const KELDERLOG_EENHEDEN: { value: KelderlogEenheid; label: string }[] = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "l", label: "L" },
  { value: "g_hl", label: "g/hL" },
  { value: "mg_l", label: "mg/L" },
];

export interface KelderlogRegel {
  id: string;
  datum: string;
  partij?: string | null;
  tank?: string | null;
  actie: KelderlogActie;
  middel?: string;
  hoeveelheid?: number | null;
  eenheid?: KelderlogEenheid | null;
  notitie?: string;
  foto?: string;
  ingevoerd_door?: string;
  created: string;
  // Fase 13 Blok C — alleen gevuld bij regels waarvan de notitie met "TAAK:"
  // begint. De afronding staat náást de notitie; die wordt nooit herschreven.
  taak_status?: string; // "" | "open" | "afgerond"
  taak_afgerond_op?: string;
  taak_afgerond_door?: string;
  /** "<soort>:<veld>", bijv. "analyse:so2_vrij" — zie src/lib/taken.ts */
  taak_sluit_bij?: string;
}

// ============= Partij-toevoegingen (kelderuitbreiding) =============
// Vrije lijst i.p.v. vaste velden per middel (Bentoniet/Sulfiet/...): Thomas kan
// zelf nieuwe toevoegingen invoeren zonder schemawijziging. VEELGEBRUIKTE_TOEVOEGINGEN
// is puur een autocomplete-suggestielijst, geen enum — het naam-veld blijft vrije tekst.
export const VEELGEBRUIKTE_TOEVOEGINGEN = [
  "Bentoniet",
  "Oenopur",
  "Go-Ferm",
  "Pro-ferm",
  "Sulfiet",
  "Aktivkohle",
  "Panzym extract",
  "Ao/Fo",
];

// ============= Voedingswaarde-/etiketberekening (kelderuitbreiding) =============
// Losstaande rekentool gekoppeld aan een partij; elke berekening is een los,
// nooit overschreven record (historie) — zie src/lib/voedingswaarde.ts voor de
// rekenlogica.
export interface VoedingswaardeBerekening {
  id: string;
  partij: string; // partij id
  berekening_datum: string;
  alcohol_gram_liter?: number | null;
  restsuiker_gram_liter?: number | null;
  zuur_gram_liter?: number | null;
  glycerine_gram_liter?: number | null;
  kcal_totaal?: number | null;
  kj_totaal?: number | null;
  etiket_tekst?: string;
  /** Fase 20 — mag off-label via QR-code (Vo. (EU) 2021/2117, art. 119). */
  ingredienten_tekst?: string;
  /** Fase 20 — bijv. "Bevat sulfieten"; hoort in de praktijk ook fysiek op het etiket. */
  allergenen?: string;
  ingevoerd_door?: string;
  created: string;
}

// ============= Botteling & Voorraad (Fase 4) =============
// Bottelen is een tankboek-mutatie (actie "botteling", bestond al) plus een
// atomische cascade die er een bottelronde- en voorraadrecord bij aanmaakt —
// zie DECISIONS-FASE4.md. Alle drie collecties zijn endpoint-only voor
// schrijven (createRule/updateRule/deleteRule = null), zelfde patroon als
// tankboek: nooit rechtstreeks via de PocketBase-SDK aanmaken/wijzigen.

export interface Bottelronde {
  id: string;
  partij: string; // partij id
  eigenaar?: string | null;
  van_tank: string; // tank id
  botteldatum: string;
  aantal_flessen: number;
  flesinhoud_ml: number;
  /**
   * Fase 15 Blok C — het exacte aantal gevulde flessen (na bottelverlies).
   * Leidend vanaf Fase 15; `aantal_flessen` blijft de terugval voor records
   * van vóór die fase en voor de agent-actieflow.
   */
  aantal_flessen_gevuld?: number | null;
  flessen_breuk?: number | null;
  /** Volume dat uit de tank ging — verschil met het gebottelde volume is het bottelverlies. */
  volume_uit_tank_l?: number | null;
  /** Wat er in de flessen zit; hierover is bij botteling accijns afgedragen. */
  accijnsplichtig_volume_l?: number | null;
  /** Relatie naar flestypes (Fase 15). Het oude tekstveld `flestype` blijft voor historie. */
  flestype_ref?: string | null;
  accijns_categorie?: string | null;
  flestype?: string;
  kleur_fles?: string;
  parelwijn?: boolean;
  lotnummer?: string;
  voedingswaarde_berekening?: string | null; // voedingswaarde_berekeningen id
  notities?: string;
  ingevoerd_door?: string;
  deleted?: boolean;
  created: string;
  updated?: string;
}

export type VoorraadStatus = "op_voorraad" | "uitverkocht";
export const VOORRAAD_STATUSSEN: { value: VoorraadStatus; label: string; emoji: string }[] = [
  { value: "op_voorraad", label: "Op voorraad", emoji: "🍾" },
  { value: "uitverkocht", label: "Uitverkocht", emoji: "🚫" },
];

export interface VoorraadFles {
  id: string;
  bottelronde: string; // bottelronde id
  partij: string; // partij id
  eigenaar?: string | null;
  wijnnaam: string;
  jaargang?: number | null;
  aantal_beginvoorraad: number;
  aantal_huidig: number; // cache — waarheid is voorraad_mutaties; nooit direct aanpasbaar
  // Fase 10: onder dit aantal verschijnt een voorraad-bijna-op-signaal.
  // null/leeg = gebruik de globale standaard uit app_instellingen.
  drempel_aantal?: number | null;
  locatie?: string;
  status: VoorraadStatus;
  created: string;
  updated?: string;
}

export type VoorraadMutatieType =
  | "verkocht"
  | "eigen_gebruik"
  | "kapot"
  | "weggegeven"
  | "correctie";
export const VOORRAAD_MUTATIE_TYPES: {
  value: VoorraadMutatieType;
  label: string;
  emoji: string;
}[] = [
  { value: "verkocht", label: "Verkocht", emoji: "💶" },
  { value: "eigen_gebruik", label: "Eigen gebruik", emoji: "🍷" },
  { value: "kapot", label: "Kapot", emoji: "💔" },
  { value: "weggegeven", label: "Weggegeven", emoji: "🎁" },
  { value: "correctie", label: "Correctie", emoji: "✏️" },
];

export interface VoorraadMutatie {
  id: string;
  voorraad: string; // voorraad_flessen id
  mutatie_type: VoorraadMutatieType;
  aantal: number; // getekend — negatief bij afname
  datum: string;
  afnemer_of_reden?: string;
  ingevoerd_door?: string;
  notities?: string;
  created: string;
}

// Suggesties voor autocomplete (vrije tekst, geen enum — zelfde patroon als
// VEELGEBRUIKTE_TOEVOEGINGEN uit de kelder-uitbreiding).
export const VEELGEBRUIKTE_FLESINHOUD_ML = [375, 500, 750, 1500];
export const VEELGEBRUIKTE_FLESTYPES = [
  "Bordeaux-fles",
  "Bourgogne-fles",
  "Slank-fles",
  "Bocksbeutel",
];
export const VEELGEBRUIKTE_FLESKLEUREN = ["Antiek groen", "Wit", "Bruin", "Transparant"];

// ============= Flessenvoorraad — lege flessen (Fase 15 Blok A/B) =============
// Omkering t.o.v. Bottelronde/VoorraadFles hierboven: die gaan over VOLLE
// flessen (uitgefaseerd, zie Fase 15 Blok E — nog niet uitgevoerd). Dit
// model gaat over de LEGE-flessenvoorraad, de administratie die Thomas al
// sinds 2011 in Flessen_admin.xlsx bijhoudt. "Glas is glas": één stapel per
// flestype, niet per merk/klant.
export interface Flestype {
  id: string;
  vorm: string;
  inhoud_ml: number;
  kleur?: string;
  sluiting?: string;
  omschrijving?: string;
  leverancier?: string;
  standaard_aantal_per_pallet?: number | null;
  actief: boolean;
  created: string;
}

export const VEELGEBRUIKTE_FLESVORMEN = ["bordeaux", "bourgogne", "alamos", "hugo", "schlegel"];
export const VEELGEBRUIKTE_FLESKLEUREN_LEEG = ["transparant", "wit", "groen", "mat"];
export const VEELGEBRUIKTE_FLESSLUITINGEN = ["schroef", "kurk", "vinolok"];

export type FlessenMutatieType =
  | "ontvangst"
  | "verbruik_botteling"
  | "breuk"
  | "telcorrectie"
  | "overig";
export const FLESSEN_MUTATIE_TYPES: {
  value: FlessenMutatieType;
  label: string;
  emoji: string;
}[] = [
  { value: "ontvangst", label: "Ontvangst", emoji: "📦" },
  { value: "verbruik_botteling", label: "Verbruik (botteling)", emoji: "🍾" },
  { value: "breuk", label: "Breuk", emoji: "💔" },
  { value: "telcorrectie", label: "Telcorrectie", emoji: "🔢" },
  { value: "overig", label: "Overig", emoji: "📝" },
];

// ============= Accijnscategorieën (Fase 15 Blok C/D) =============
// Beheerbare lijst, geen enum: de indeling wijn vs. overige gegiste drank
// hangt af van de PRODUCTIEWIJZE, niet alleen van het alcoholpercentage —
// de app stelt voor, Thomas bevestigt bij het bottelen.
export type AccijnsHeffing = "accijns" | "verbruiksbelasting";

export interface AccijnsCategorie {
  id: string;
  naam: string;
  /** Sleutel in regelgeving_instellingen waar het tarief staat (EUR/hl). */
  tariefsleutel: string;
  heffing: AccijnsHeffing;
  mousserend: boolean;
  /** "laag" = ≤ 8,5% vol, "hoog" = > 8,5% vol, leeg = beide/n.v.t. */
  alcohol_bereik?: "laag" | "hoog" | "";
  volgorde?: number | null;
  actief: boolean;
}

export interface FlessenMutatie {
  id: string;
  flestype: string; // flestype id
  mutatie_type: FlessenMutatieType;
  aantal: number; // getekend — negatief bij verbruik/breuk
  datum: string;
  bottelronde?: string | null; // bottelronde id, gevuld bij verbruik_botteling
  leverancier?: string;
  aantal_pallets?: number | null;
  toelichting?: string;
  ingevoerd_door?: string;
  created: string;
}

// ============= AI-agent (Fase 3) =============

export type AgentRol = "user" | "assistant" | "tool";

export type AgentActieType =
  | "tankboek_boeking"
  | "observatie"
  | "uitval"
  | "kelderlog"
  | "analyse"
  | "bottelronde"
  | "voorraad_mutatie"
  | "order"
  | "onderhoud"
  | "meting"
  | "oogst"
  | "fenologie"
  | "gezondheid"
  | "werkuren"
  | "bodem"
  | "proefnotitie";

export type AgentActieStatus = "voorgesteld" | "bevestigd" | "afgewezen" | "uitgevoerd" | "mislukt";

export type AdviesOordeel = "klopte" | "klopte_niet" | "deels";

export interface AgentGesprek {
  id: string;
  titel: string;
  laatste_bericht_op: string;
  created: string;
}

export interface AgentToolCall {
  naam: string;
  input: Record<string, unknown>;
}

export interface AgentToolResultaat {
  naam: string;
  resultaat: string;
}

export interface AgentBericht {
  id: string;
  gesprek_id: string;
  rol: AgentRol;
  inhoud: string;
  tool_calls?: AgentToolCall[];
  tool_resultaten?: AgentToolResultaat[];
  foto?: string;
  created: string;
}

export interface AgentActie {
  id: string;
  gesprek_id: string;
  bericht_id: string;
  actie_type: AgentActieType;
  payload: Record<string, unknown>;
  samenvatting: string;
  status: AgentActieStatus;
  fout?: string;
  uitgevoerd_record_id?: string;
  created: string;
}

export interface AdviesFeedback {
  id: string;
  bericht_id: string;
  oordeel: AdviesOordeel;
  toelichting?: string;
  created: string;
}

// visuele indeling van bevestigingskaarten: elk actietype een eigen randkleur
// (bestaande CSS-variabelen, geen nieuwe kleuren) zodat Thomas in één oogopslag
// ziet wat voor voorstel het is
export const AGENT_ACTIE_CONFIG: Record<
  AgentActieType,
  { label: string; emoji: string; randKlasse: string }
> = {
  tankboek_boeking: { label: "Tankboek-boeking", emoji: "🛢️", randKlasse: "border-primary" },
  observatie: { label: "Observatie", emoji: "🌿", randKlasse: "border-warning" },
  uitval: { label: "Uitval", emoji: "💀", randKlasse: "border-destructive" },
  kelderlog: { label: "Kelderlog", emoji: "📓", randKlasse: "border-accent-gold" },
  analyse: { label: "Analyse", emoji: "🧪", randKlasse: "border-success" },
  bottelronde: { label: "Bottelronde", emoji: "🍾", randKlasse: "border-primary" },
  voorraad_mutatie: { label: "Voorraadmutatie", emoji: "📦", randKlasse: "border-accent-gold" },
  order: { label: "Conceptorder", emoji: "🧾", randKlasse: "border-primary" },
  onderhoud: { label: "Onderhoud", emoji: "🔧", randKlasse: "border-warning" },
  // Fase 13 Blok G
  meting: { label: "Meting", emoji: "🧪", randKlasse: "border-primary" },
  oogst: { label: "Oogst", emoji: "🍇", randKlasse: "border-accent-gold" },
  // Assistent over de hele app (besluit Thomas, 26 juli 2026)
  fenologie: { label: "Fenologie", emoji: "🌸", randKlasse: "border-success" },
  gezondheid: { label: "Gezondheid", emoji: "❤️", randKlasse: "border-warning" },
  werkuren: { label: "Werkuren", emoji: "⏱️", randKlasse: "border-border" },
  bodem: { label: "Bodem", emoji: "🌍", randKlasse: "border-accent-gold" },
  proefnotitie: { label: "Proefnotitie", emoji: "👃", randKlasse: "border-success" },
};

/**
 * Veilige opzoeking voor de bevestigingskaart.
 *
 * WAAROM DIT BESTAAT (gevonden 26 juli 2026): een nieuw actie_type moet op DRIE
 * plekken geregistreerd worden — de tooldefinitie in agent_logica.js, de
 * keuzelijst in setup-pocketbase.mjs, en deze config. Vergeet je de laatste,
 * dan is het gevolg niet een lelijke kaart maar een WITTE PAGINA: de agent doet
 * netjes zijn werk, de kaart probeert te renderen en het hele scherm klapt om
 * met "Cannot read properties of undefined (reading 'randKlasse')". Precies dat
 * gebeurde bij het toevoegen van "meting" en "oogst".
 *
 * Een onbekend type hoort een saaie kaart op te leveren, geen crash. De
 * TypeScript-typering vangt dit niet: het actie_type komt als string van de
 * server, dus de compiler ziet nooit dat er een sleutel ontbreekt.
 */
export function agentActieConfig(type: string): {
  label: string;
  emoji: string;
  randKlasse: string;
} {
  return (
    AGENT_ACTIE_CONFIG[type as AgentActieType] ?? {
      label: type || "Voorstel",
      emoji: "📋",
      randKlasse: "border-border",
    }
  );
}

// ============= Verkoop licht (Eindsprint Blok L) =============
// Geen facturatie/btw — de voorraadmutatie blijft de bron van waarheid;
// de order is administratie eromheen (zie order-leveren in voorraad.pb.js).
export type KlantType = "particulier" | "horeca" | "winkel" | "evenement";
export const KLANT_TYPES: { value: KlantType; label: string; emoji: string }[] = [
  { value: "particulier", label: "Particulier", emoji: "🧑" },
  { value: "horeca", label: "Horeca", emoji: "🍽️" },
  { value: "winkel", label: "Winkel", emoji: "🏪" },
  { value: "evenement", label: "Evenement", emoji: "🎪" },
];

export interface Klant {
  id: string;
  naam: string;
  type: KlantType | null;
  contact?: string;
  notities?: string;
  created?: string;
}

export interface OrderRegel {
  voorraad: string; // voorraad_flessen id
  aantal: number;
  prijs: number; // per fles, EUR
}

export type OrderStatus = "concept" | "geleverd" | "betaald";
export const ORDER_STATUSSEN: { value: OrderStatus; label: string; emoji: string }[] = [
  { value: "concept", label: "Concept", emoji: "📝" },
  { value: "geleverd", label: "Geleverd", emoji: "🚚" },
  { value: "betaald", label: "Betaald", emoji: "✅" },
];

export interface Order {
  id: string;
  klant: string; // klant id
  datum: string;
  regels: OrderRegel[];
  status: OrderStatus;
  notities?: string;
  ingevoerd_door?: string;
  created: string;
}

// ============= Pasteurisatie (Fase 17) =============
export type SluitingType = "kroonkurk" | "schroefdop" | "vinolok" | "kurk";
export const SLUITING_TYPES: { value: SluitingType; label: string }[] = [
  { value: "kroonkurk", label: "Kroonkurk" },
  { value: "schroefdop", label: "Schroefdop" },
  { value: "vinolok", label: "Vinolok" },
  { value: "kurk", label: "Kurk" },
];

export interface Sluiting {
  id: string;
  naam: string;
  type: SluitingType;
  /**
   * 0 betekent hier "onbekend", niet "geen druk aankan" — PocketBase geeft
   * een leeg number-veld altijd als 0 terug (zelfde valkuil als elders in dit
   * project). Gebruik `maxDrukBekend()` i.p.v. rechtstreeks op dit veld te
   * vertrouwen.
   */
  max_druk_bar: number;
  geschikt_voor_gecarboniseerd: boolean;
  liner?: string;
  leverancier?: string;
  notities?: string;
  actief: boolean;
}

export function maxDrukBekend(sluiting: Pick<Sluiting, "max_druk_bar">): boolean {
  return sluiting.max_druk_bar > 0;
}

export type ProductSoort = "wijn" | "sap" | "overige_gegiste_drank";
export const PRODUCT_SOORTEN: { value: ProductSoort; label: string }[] = [
  { value: "wijn", label: "Wijn" },
  { value: "sap", label: "Sap" },
  { value: "overige_gegiste_drank", label: "Overige gegiste drank" },
];

export type PasteurisatieOordeel = "veilig" | "marginaal" | "onveilig";
export const PASTEURISATIE_OORDELEN: {
  value: PasteurisatieOordeel;
  label: string;
  emoji: string;
}[] = [
  { value: "veilig", label: "Veilig", emoji: "✅" },
  { value: "marginaal", label: "Marginaal", emoji: "⚠️" },
  { value: "onveilig", label: "Onveilig", emoji: "🛑" },
];

export type PasteurisatieRunStatus = "gepland" | "actief" | "afgerond" | "afgebroken";
export const PASTEURISATIE_RUN_STATUSSEN: {
  value: PasteurisatieRunStatus;
  label: string;
  emoji: string;
}[] = [
  { value: "gepland", label: "Gepland", emoji: "🗓️" },
  { value: "actief", label: "Actief", emoji: "🔴" },
  { value: "afgerond", label: "Afgerond", emoji: "✅" },
  { value: "afgebroken", label: "Afgebroken", emoji: "🚫" },
];

export interface PasteurisatieRun {
  id: string;
  eigenaar?: string | null;
  partij: string;
  lotnummer?: string;
  bottelronde?: string | null;
  product_soort: ProductSoort;
  datum: string;
  starttijd?: string;
  eindtijd?: string;
  flestype?: string | null;
  sluiting?: string | null;
  aantal_flessen?: number | null;
  vulvolume_ml?: number | null;
  co2_gehalte_gl?: number | null;
  doel_pu_min: number;
  doel_pu_max: number;
  doeltemperatuur_c?: number | null;
  berekende_max_druk_bar?: number | null;
  veiligheidsoordeel?: PasteurisatieOordeel | null;
  oordeel_geaccepteerd_door?: string | null;
  sensor_positie?: string;
  totale_pu?: number | null;
  pu_opwarm?: number | null;
  pu_houd?: number | null;
  pu_afkoel?: number | null;
  piektemperatuur_c?: number | null;
  status: PasteurisatieRunStatus;
  opmerkingen?: string;
  uitgevoerd_door?: string | null;
  created: string;
  updated?: string;
}

export interface PasteurisatieCertificaat {
  id: string;
  run: string;
  uitgiftedatum: string;
  uitgegeven_door?: string;
  bestand?: string;
  versienummer: number;
  created: string;
}

export interface RekenmodelValidatie {
  id: string;
  model_sleutel: string;
  gevalideerd: boolean;
  gevalideerd_op?: string;
  gevalideerd_door?: string;
  toelichting?: string;
}
