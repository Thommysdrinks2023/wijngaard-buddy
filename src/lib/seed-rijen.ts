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

// Helper to build evenly-spaced plant counts across a range
function spread(start: number, end: number, planten: number[]): SeedRij[] {
  const nums: number[] = [];
  for (let i = start; i <= end; i++) nums.push(i);
  return nums.map((n, i) => ({
    rijnummer: n,
    ras: "Muscaris" as Ras,
    aantal_planten: planten[i] ?? planten[planten.length - 1],
  }));
}

function linear(start: number, end: number, vStart: number, vEnd: number): number[] {
  const len = end - start + 1;
  if (len === 1) return [vStart];
  const step = (vEnd - vStart) / (len - 1);
  return Array.from({ length: len }, (_, i) => Math.round(vStart + step * i));
}

const rijen: SeedRij[] = [];

// Muscaris: rijen 1–4 (5, 10, 15, 20 planten)
[5, 10, 15, 20].forEach((p, i) =>
  rijen.push({ rijnummer: i + 1, ras: "Muscaris", aantal_planten: p })
);

// Souveginier Gris: rijen 5–21 (25 t/m 63)
linear(5, 21, 25, 63).forEach((p, i) =>
  rijen.push({ rijnummer: 5 + i, ras: "Souveginier Gris", aantal_planten: p })
);

// Johanniter: rijen 22–41 (64 t/m 87), rij 33 ontbreekt
{
  const nums = [];
  for (let n = 22; n <= 41; n++) if (n !== 33) nums.push(n);
  const planten = linear(0, nums.length - 1, 64, 87);
  nums.forEach((n, i) => rijen.push({ rijnummer: n, ras: "Johanniter", aantal_planten: planten[i] }));
}

// Regent: rijen 42–45, 47–48 (88–90)
{
  const nums = [42, 43, 44, 45, 47, 48];
  const planten = linear(0, nums.length - 1, 88, 90);
  nums.forEach((n, i) => rijen.push({ rijnummer: n, ras: "Regent", aantal_planten: planten[i] }));
}

// Pinot Noir: rijen 46, 66, 69 (90, 87, 36)
[
  { rijnummer: 46, aantal_planten: 90 },
  { rijnummer: 66, aantal_planten: 87 },
  { rijnummer: 69, aantal_planten: 36 },
].forEach((r) => rijen.push({ ...r, ras: "Pinot Noir" }));

// Chardonnay: rijen 49–57 (90–91)
linear(49, 57, 90, 91).forEach((p, i) =>
  rijen.push({ rijnummer: 49 + i, ras: "Chardonnay", aantal_planten: p })
);

// Pinotin: rijen 58–65, 67–68 (87–90)
{
  const nums = [58, 59, 60, 61, 62, 63, 64, 65, 67, 68];
  const planten = linear(0, nums.length - 1, 87, 90);
  nums.forEach((n, i) => rijen.push({ rijnummer: n, ras: "Pinotin", aantal_planten: planten[i] }));
}

rijen.sort((a, b) => a.rijnummer - b.rijnummer);

export const SEED_RIJEN: SeedRij[] = rijen;

export const RAS_OPTIONS: Ras[] = [
  "Muscaris",
  "Souveginier Gris",
  "Johanniter",
  "Regent",
  "Pinot Noir",
  "Chardonnay",
  "Pinotin",
];
