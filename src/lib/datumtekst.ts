import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";

/**
 * Formatteert een datumstring veilig.
 *
 * Waarom dit bestaat: PocketBase geeft een niet-ingevuld tekstveld terug als
 * `""`, niet als `null`. `parseISO("")` levert een Invalid Date op en date-fns
 * v4 GOOIT daar een RangeError op. Omdat dat tijdens render gebeurt, haalt één
 * record met een leeg datumveld het complete scherm onderuit — de gebruiker
 * ziet dan de foutpagina in plaats van zijn lijst.
 *
 * Niet elk datumveld in het schema is verplicht (o.a.
 * `agent_gesprekken.laatste_bericht_op`, `werkkalender.datum`,
 * `rij_locaties.datum`, `partijen.pers_datum`, `sensor_metingen.gemeten_op`),
 * dus dit is geen theoretisch geval.
 *
 * Gebruik dit overal waar het datumveld NIET verplicht is. Bij een verplicht
 * veld mag `format(parseISO(...))` blijven staan: dan is een lege waarde een
 * echt datadefect dat je wilt zien, niet wilt wegpoetsen.
 */
export function datumTekst(
  waarde: string | null | undefined,
  patroon = "d MMM yyyy",
  leeg = "—",
): string {
  if (!waarde) return leeg;
  try {
    const d = parseISO(waarde);
    if (Number.isNaN(d.getTime())) return leeg;
    return format(d, patroon, { locale: nl });
  } catch {
    return leeg;
  }
}
