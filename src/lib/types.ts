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
  producent?: string | null; // producent id
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

// ============= Producenten =============
export type ProducentSoort = "eigen_wijngaard" | "drankproductie" | "extern_klant";

export interface Producent {
  id: string;
  naam: string;
  soort: ProducentSoort;
  actief: boolean;
  notitie?: string;
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
  producent?: string | null;
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
  producent?: string | null;
  van_tank: string; // tank id
  botteldatum: string;
  aantal_flessen: number;
  flesinhoud_ml: number;
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
  producent?: string | null;
  wijnnaam: string;
  jaargang?: number | null;
  aantal_beginvoorraad: number;
  aantal_huidig: number; // cache — waarheid is voorraad_mutaties; nooit direct aanpasbaar
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
  | "onderhoud";

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
};

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
