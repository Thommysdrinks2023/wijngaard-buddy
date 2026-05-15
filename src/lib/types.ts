import type { Ras } from "./seed-rijen";

export type { Ras };

export interface Rij {
  id: string;
  rijnummer: number;
  ras: Ras;
  aantal_planten: number;
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
  ingevoerd_door: string;
  created: string;
}

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
export type FenologieMoment =
  | "Knopbreek"
  | "Bloei"
  | "Zetting"
  | "Véraison"
  | "Oogstrijp";

export const FENOLOGIE_MOMENTEN: { value: FenologieMoment; emoji: string; description: string }[] = [
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
