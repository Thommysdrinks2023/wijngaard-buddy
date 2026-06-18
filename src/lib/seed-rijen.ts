export type Ras =
  | "Muscaris"
  | "Souvignier Gris"
  | "Johanniter"
  | "Regent"
  | "Pinot Noir"
  | "Chardonnay"
  | "Pinotin";

export interface SeedRij {
  rijnummer: number;
  ras: Ras;
  aantal_planten: number;
  // optionele veldnotitie bij deze rij
  notitie?: string;
  // aantal planten per vak tussen de palen (standaard 5)
  planten_per_vak?: number;
}

// Herbruikbare notitie-teksten
const VAK4 = "4 planten per vak (i.p.v. standaard 5)";
const VAK6 = "Laatste vak heeft 6 planten, zelfde rijlengte";

const data: SeedRij[] = [
  // Muscaris
  { rijnummer: 1, ras: "Muscaris", aantal_planten: 10 },
  { rijnummer: 2, ras: "Muscaris", aantal_planten: 15 },
  { rijnummer: 3, ras: "Muscaris", aantal_planten: 20 },
  { rijnummer: 4, ras: "Muscaris", aantal_planten: 25 },
  { rijnummer: 5, ras: "Muscaris", aantal_planten: 30 },
  // Souvignier Gris
  { rijnummer: 6, ras: "Souvignier Gris", aantal_planten: 34 },
  { rijnummer: 7, ras: "Souvignier Gris", aantal_planten: 39 },
  { rijnummer: 8, ras: "Souvignier Gris", aantal_planten: 43 },
  { rijnummer: 9, ras: "Souvignier Gris", aantal_planten: 49 },
  { rijnummer: 10, ras: "Souvignier Gris", aantal_planten: 49 },
  { rijnummer: 11, ras: "Souvignier Gris", aantal_planten: 49 },
  { rijnummer: 12, ras: "Souvignier Gris", aantal_planten: 49 },
  { rijnummer: 13, ras: "Souvignier Gris", aantal_planten: 50 },
  { rijnummer: 14, ras: "Souvignier Gris", aantal_planten: 50 },
  { rijnummer: 15, ras: "Souvignier Gris", aantal_planten: 51 },
  { rijnummer: 16, ras: "Souvignier Gris", aantal_planten: 52 },
  { rijnummer: 17, ras: "Souvignier Gris", aantal_planten: 53 },
  { rijnummer: 18, ras: "Souvignier Gris", aantal_planten: 55 },
  { rijnummer: 19, ras: "Souvignier Gris", aantal_planten: 56 },
  { rijnummer: 20, ras: "Souvignier Gris", aantal_planten: 58 },
  { rijnummer: 21, ras: "Souvignier Gris", aantal_planten: 59 },
  { rijnummer: 22, ras: "Souvignier Gris", aantal_planten: 60 },
  // Johanniter
  { rijnummer: 23, ras: "Johanniter", aantal_planten: 50, planten_per_vak: 4, notitie: VAK4 },
  { rijnummer: 24, ras: "Johanniter", aantal_planten: 51, planten_per_vak: 4, notitie: VAK4 },
  { rijnummer: 25, ras: "Johanniter", aantal_planten: 65 },
  { rijnummer: 26, ras: "Johanniter", aantal_planten: 67 },
  { rijnummer: 27, ras: "Johanniter", aantal_planten: 68 },
  { rijnummer: 28, ras: "Johanniter", aantal_planten: 70 },
  { rijnummer: 29, ras: "Johanniter", aantal_planten: 71, notitie: VAK6 },
  { rijnummer: 30, ras: "Johanniter", aantal_planten: 72 },
  { rijnummer: 31, ras: "Johanniter", aantal_planten: 73 },
  { rijnummer: 32, ras: "Johanniter", aantal_planten: 74 },
  { rijnummer: 33, ras: "Johanniter", aantal_planten: 76, notitie: VAK6 },
  { rijnummer: 34, ras: "Johanniter", aantal_planten: 77 },
  { rijnummer: 35, ras: "Johanniter", aantal_planten: 78 },
  { rijnummer: 36, ras: "Johanniter", aantal_planten: 79 },
  { rijnummer: 37, ras: "Johanniter", aantal_planten: 80 },
  { rijnummer: 38, ras: "Johanniter", aantal_planten: 81, notitie: VAK6 },
  { rijnummer: 39, ras: "Johanniter", aantal_planten: 81 },
  // Regent / Pinot Noir (afwisselend in dit blok)
  { rijnummer: 40, ras: "Regent", aantal_planten: 82 },
  { rijnummer: 41, ras: "Pinot Noir", aantal_planten: 83 },
  { rijnummer: 42, ras: "Regent", aantal_planten: 83 },
  { rijnummer: 43, ras: "Regent", aantal_planten: 84 },
  { rijnummer: 44, ras: "Regent", aantal_planten: 84 },
  { rijnummer: 45, ras: "Regent", aantal_planten: 85 },
  { rijnummer: 46, ras: "Regent", aantal_planten: 85 },
  { rijnummer: 47, ras: "Regent", aantal_planten: 86, notitie: VAK6 },
  // Chardonnay
  { rijnummer: 48, ras: "Chardonnay", aantal_planten: 86, notitie: VAK6 },
  { rijnummer: 49, ras: "Chardonnay", aantal_planten: 86, notitie: VAK6 },
  { rijnummer: 50, ras: "Chardonnay", aantal_planten: 86, notitie: VAK6 },
  { rijnummer: 51, ras: "Chardonnay", aantal_planten: 86, notitie: VAK6 },
  { rijnummer: 52, ras: "Chardonnay", aantal_planten: 86, notitie: VAK6 },
  { rijnummer: 53, ras: "Chardonnay", aantal_planten: 86, notitie: VAK6 },
  { rijnummer: 54, ras: "Chardonnay", aantal_planten: 86, notitie: VAK6 },
  // Pinotin
  { rijnummer: 55, ras: "Pinotin", aantal_planten: 85 },
  { rijnummer: 56, ras: "Pinotin", aantal_planten: 85 },
  { rijnummer: 57, ras: "Pinotin", aantal_planten: 85 },
  { rijnummer: 58, ras: "Pinotin", aantal_planten: 85 },
  { rijnummer: 59, ras: "Pinotin", aantal_planten: 84 },
  { rijnummer: 60, ras: "Pinotin", aantal_planten: 84 },
  { rijnummer: 61, ras: "Pinotin", aantal_planten: 84 },
  { rijnummer: 62, ras: "Pinotin", aantal_planten: 83 },
  { rijnummer: 63, ras: "Pinotin", aantal_planten: 83 },
  { rijnummer: 64, ras: "Pinotin", aantal_planten: 82 },
  { rijnummer: 65, ras: "Pinotin", aantal_planten: 82 },
  { rijnummer: 66, ras: "Pinot Noir", aantal_planten: 82 },
  { rijnummer: 67, ras: "Pinotin", aantal_planten: 81, notitie: VAK6 },
  { rijnummer: 68, ras: "Pinotin", aantal_planten: 81, notitie: VAK6 },
  { rijnummer: 69, ras: "Pinot Noir", aantal_planten: 36, notitie: VAK6 },
];

data.sort((a, b) => a.rijnummer - b.rijnummer);

export const SEED_RIJEN: SeedRij[] = data;

export const RAS_OPTIONS: Ras[] = [
  "Muscaris",
  "Souvignier Gris",
  "Johanniter",
  "Regent",
  "Pinot Noir",
  "Chardonnay",
  "Pinotin",
];
