// Dichtheidsconversies voor most/wijn: °Oechsle ↔ Brix ↔ SG.
// °Oe is de primaire eenheid (beslissing Thomas); alle drie worden opgeslagen.
//
// Formules via SG (nauwkeurig genoeg voor kelderwerk):
//   SG   = 1 + °Oe/1000
//   Brix = 261,3 · (1 − 1/SG)
// De vaak geciteerde lineaire benadering (Brix ≈ °Oe/5 + 0,3) wijkt bij
// oogstdichtheden ~3 °Bx af en wordt daarom bewust niet gebruikt.

export interface Dichtheid {
  oechsle: number;
  brix: number;
  sg: number;
}

function rond(n: number, decimalen: number): number {
  const f = 10 ** decimalen;
  return Math.round(n * f) / f;
}

export function vanOechsle(oechsle: number): Dichtheid {
  const sg = 1 + oechsle / 1000;
  const brix = 261.3 * (1 - 1 / sg);
  return { oechsle: rond(oechsle, 1), brix: rond(brix, 1), sg: rond(sg, 4) };
}

export function vanBrix(brix: number): Dichtheid {
  const sg = 261.3 / (261.3 - brix);
  const oechsle = (sg - 1) * 1000;
  return { oechsle: rond(oechsle, 1), brix: rond(brix, 1), sg: rond(sg, 4) };
}

export function vanSg(sg: number): Dichtheid {
  const oechsle = (sg - 1) * 1000;
  const brix = 261.3 * (1 - 1 / sg);
  return { oechsle: rond(oechsle, 1), brix: rond(brix, 1), sg: rond(sg, 4) };
}
