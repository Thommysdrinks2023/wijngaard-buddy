// Blok E (mega-prompt v2, WERKLOG.md) — lotnummerconventie L<jj>-<PARTIJCODE>-<volgnr>,
// bevestigd in ARCHITECTURE.md v1.1 (besluit A2). Pure functie zonder serverstaat,
// zelfde soort module als dichtheid.ts/voedingswaarde.ts — roept zelf niets aan,
// de aanroeper levert de bestaande lotnummers aan om het volgnummer te bepalen.

function partijCode(naam: string): string {
  const eersteWoord = naam.trim().split(/\s+/)[0] ?? "";
  const letters = eersteWoord.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (!letters) return "ALG";
  return letters.slice(0, 3).padEnd(3, "X");
}

/**
 * Stelt het volgende vrije lotnummer voor volgens L<jj>-<CODE>-<volgnr>,
 * bijv. "L26-JOH-01". <CODE> komt van de eerste drie letters van het eerste
 * woord in `naam` (bijv. "Johanniter 2026" -> "JOH"); <volgnr> is het laagste
 * nog niet gebruikte nummer binnen dezelfde jaargang+code.
 */
export function genereerLotnummer(
  naam: string,
  jaargang: number,
  bestaandeLotnummers: string[],
): string {
  const jj = String(jaargang).slice(-2).padStart(2, "0");
  const code = partijCode(naam);
  const prefix = `L${jj}-${code}-`;
  const bezet = new Set(
    bestaandeLotnummers
      .filter((l) => l.startsWith(prefix))
      .map((l) => Number(l.slice(prefix.length)))
      .filter((n) => Number.isInteger(n) && n > 0),
  );
  let volgnr = 1;
  while (bezet.has(volgnr)) volgnr++;
  return `${prefix}${String(volgnr).padStart(2, "0")}`;
}
