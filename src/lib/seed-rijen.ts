export type Ras =
  | "Muscaris"
  | "Souveginier Gris"
  | "Johanniter"
  | "Regent"
  | "Pinot Noir"
  | "Chardonnay"
  | "Pinotin";

export interface SeedRij {
  rijnummer: number;
  ras: Ras;
  aantal_planten: number;
}

const data: SeedRij[] = [
  // Muscaris
  { rijnummer: 1, ras: "Muscaris", aantal_planten: 10 },
  { rijnummer: 2, ras: "Muscaris", aantal_planten: 15 },
  { rijnummer: 3, ras: "Muscaris", aantal_planten: 20 },
  { rijnummer: 4, ras: "Muscaris", aantal_planten: 25 },
  { rijnummer: 5, ras: "Muscaris", aantal_planten: 30 },
  // Souveginier Gris
  { rijnummer: 6, ras: "Souveginier Gris", aantal_planten: 34 },
  { rijnummer: 7, ras: "Souveginier Gris", aantal_planten: 39 },
  { rijnummer: 8, ras: "Souveginier Gris", aantal_planten: 43 },
  { rijnummer: 9, ras: "Souveginier Gris", aantal_planten: 49 },
  { rijnummer: 10, ras: "Souveginier Gris", aantal_planten: 49 },
  { rijnummer: 11, ras: "Souveginier Gris", aantal_planten: 49 },
  { rijnummer: 12, ras: "Souveginier Gris", aantal_planten: 50 },
  { rijnummer: 13, ras: "Souveginier Gris", aantal_planten: 50 },
  { rijnummer: 14, ras: "Souveginier Gris", aantal_planten: 50 },
  { rijnummer: 15, ras: "Souveginier Gris", aantal_planten: 56 },
  { rijnummer: 16, ras: "Souveginier Gris", aantal_planten: 58 },
  { rijnummer: 17, ras: "Souveginier Gris", aantal_planten: 59 },
  { rijnummer: 18, ras: "Souveginier Gris", aantal_planten: 60 },
  { rijnummer: 19, ras: "Souveginier Gris", aantal_planten: 61 },
  { rijnummer: 20, ras: "Souveginier Gris", aantal_planten: 63 },
  { rijnummer: 21, ras: "Souveginier Gris", aantal_planten: 63 },
  // Johanniter
  { rijnummer: 22, ras: "Johanniter", aantal_planten: 64 },
  { rijnummer: 23, ras: "Johanniter", aantal_planten: 66 },
  { rijnummer: 24, ras: "Johanniter", aantal_planten: 67 },
  { rijnummer: 25, ras: "Johanniter", aantal_planten: 68 },
  { rijnummer: 26, ras: "Johanniter", aantal_planten: 70 },
  { rijnummer: 27, ras: "Johanniter", aantal_planten: 72 },
  { rijnummer: 28, ras: "Johanniter", aantal_planten: 74 },
  { rijnummer: 29, ras: "Johanniter", aantal_planten: 75 },
  { rijnummer: 30, ras: "Johanniter", aantal_planten: 75 },
  { rijnummer: 31, ras: "Johanniter", aantal_planten: 77 },
  { rijnummer: 32, ras: "Johanniter", aantal_planten: 79 },
  { rijnummer: 33, ras: "Johanniter", aantal_planten: 81 },
  { rijnummer: 34, ras: "Johanniter", aantal_planten: 82 },
  { rijnummer: 35, ras: "Johanniter", aantal_planten: 83 },
  { rijnummer: 36, ras: "Johanniter", aantal_planten: 84 },
  { rijnummer: 37, ras: "Johanniter", aantal_planten: 85 },
  { rijnummer: 38, ras: "Johanniter", aantal_planten: 85 },
  { rijnummer: 39, ras: "Johanniter", aantal_planten: 86 },
  { rijnummer: 40, ras: "Johanniter", aantal_planten: 87 },
  // Regent
  { rijnummer: 41, ras: "Regent", aantal_planten: 88 },
  { rijnummer: 42, ras: "Regent", aantal_planten: 88 },
  { rijnummer: 43, ras: "Regent", aantal_planten: 89 },
  { rijnummer: 44, ras: "Regent", aantal_planten: 89 },
  { rijnummer: 46, ras: "Regent", aantal_planten: 90 },
  { rijnummer: 47, ras: "Regent", aantal_planten: 90 },
  // Pinot Noir
  { rijnummer: 45, ras: "Pinot Noir", aantal_planten: 90 },
  { rijnummer: 65, ras: "Pinot Noir", aantal_planten: 87 },
  { rijnummer: 68, ras: "Pinot Noir", aantal_planten: 36 },
  // Chardonnay
  { rijnummer: 48, ras: "Chardonnay", aantal_planten: 90 },
  { rijnummer: 49, ras: "Chardonnay", aantal_planten: 91 },
  { rijnummer: 50, ras: "Chardonnay", aantal_planten: 91 },
  { rijnummer: 51, ras: "Chardonnay", aantal_planten: 91 },
  { rijnummer: 52, ras: "Chardonnay", aantal_planten: 91 },
  { rijnummer: 53, ras: "Chardonnay", aantal_planten: 91 },
  { rijnummer: 54, ras: "Chardonnay", aantal_planten: 90 },
  { rijnummer: 55, ras: "Chardonnay", aantal_planten: 90 },
  { rijnummer: 56, ras: "Chardonnay", aantal_planten: 90 },
  // Pinotin
  { rijnummer: 57, ras: "Pinotin", aantal_planten: 90 },
  { rijnummer: 58, ras: "Pinotin", aantal_planten: 90 },
  { rijnummer: 59, ras: "Pinotin", aantal_planten: 89 },
  { rijnummer: 60, ras: "Pinotin", aantal_planten: 89 },
  { rijnummer: 61, ras: "Pinotin", aantal_planten: 89 },
  { rijnummer: 62, ras: "Pinotin", aantal_planten: 88 },
  { rijnummer: 63, ras: "Pinotin", aantal_planten: 88 },
  { rijnummer: 64, ras: "Pinotin", aantal_planten: 87 },
  { rijnummer: 66, ras: "Pinotin", aantal_planten: 87 },
  { rijnummer: 67, ras: "Pinotin", aantal_planten: 87 },
];

data.sort((a, b) => a.rijnummer - b.rijnummer);

export const SEED_RIJEN: SeedRij[] = data;

export const RAS_OPTIONS: Ras[] = [
  "Muscaris",
  "Souveginier Gris",
  "Johanniter",
  "Regent",
  "Pinot Noir",
  "Chardonnay",
  "Pinotin",
];
