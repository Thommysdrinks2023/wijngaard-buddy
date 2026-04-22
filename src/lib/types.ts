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
  brix?: number | null;
  ph?: number | null;
  zuurgraad?: number | null;
  rijpheid_score: RijpheidScore;
  notitie?: string;
  foto?: string; // url or empty
  ingevoerd_door: string;
  created: string;
}

export type ObservatieType = "groei" | "ziekte" | "schade" | "uitval" | "anders";

export const OBSERVATIE_TYPES: { value: ObservatieType; label: string; emoji: string }[] = [
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
  type: ObservatieType;
  notitie: string;
  foto?: string;
  ingevoerd_door: string;
  created: string;
}
