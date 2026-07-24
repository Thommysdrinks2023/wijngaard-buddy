// Fase 11 Blok 6 — de vijf manieren waarop een lees-actie kan mislukken, uit
// elkaar gehouden. Dit is de vierde fase waarin hetzelfde patroon toesloeg
// (Fase 3, 8, 10, en in Blok 2 van deze fase opnieuw): een scherm blijft leeg
// of toont "kon niet laden", en de oorzaak is niet uit de melding af te leiden.
// De vorige `catch { throw new Error("Kon X niet laden") }` gooide een
// geannuleerd verzoek, een weggevallen netwerk, een verlopen sessie en een
// serverfout allemaal op één hoop.
//
// De vijf gevallen:
//   niet_ingelogd    — geen of verlopen sessie (401/403)
//   geen_verbinding  — server onbereikbaar (status 0, fetch mislukt)
//   geannuleerd      — PocketBase's auto-cancellation kaapte het verzoek
//   server_fout      — server antwoordde met 5xx
//   onbekend         — al het overige (bug in de app, onverwacht antwoord)
//
// Een LEGE LIJST is bewust géén geval hier: dat is een geslaagd antwoord, geen
// fout. Het onderscheid tussen "echt niets" en "leeg gefilterd door een
// API-rule" wordt bovenstrooms afgevangen doordat haalLijst gooit zodra er geen
// sessie is — precies de bug uit Fase 8, waar een anoniem verzoek een geldige
// 200 met een lege lijst kreeg en dat als "geen data" werd getoond.

export type LaadFoutSoort =
  | "niet_ingelogd"
  | "geen_verbinding"
  | "geannuleerd"
  | "server_fout"
  | "onbekend";

export class LaadFout extends Error {
  readonly soort: LaadFoutSoort;
  /** Geannuleerde verzoeken zijn geen echte storing: niet aan de gebruiker tonen. */
  readonly toonAanGebruiker: boolean;

  constructor(soort: LaadFoutSoort, bericht: string) {
    super(bericht);
    this.name = "LaadFout";
    this.soort = soort;
    this.toonAanGebruiker = soort !== "geannuleerd";
  }
}

interface PbFoutVorm {
  status?: number;
  isAbort?: boolean;
  name?: string;
  message?: string;
}

/**
 * Bepaalt wélke van de vijf storingen dit is. Puur, zodat het te testen is
 * zonder server: alleen de vorm van de fout telt.
 */
export function classificeerLeesfout(fout: unknown, wat: string): LaadFout {
  const f = (fout ?? {}) as PbFoutVorm;

  // PocketBase zet isAbort op een geannuleerd verzoek; een echte AbortError
  // kan ook via de naam binnenkomen.
  if (f.isAbort === true || f.name === "AbortError") {
    return new LaadFout(
      "geannuleerd",
      `Het ophalen van ${wat} werd onderbroken door een nieuwer verzoek.`,
    );
  }

  const status = typeof f.status === "number" ? f.status : undefined;

  if (status === 401 || status === 403) {
    return new LaadFout(
      "niet_ingelogd",
      `Je sessie is verlopen — log opnieuw in om ${wat} te zien.`,
    );
  }

  // status 0 is PocketBase's code voor "de fetch is niet aangekomen": geen
  // bereik, server uit, DNS stuk. Nadrukkelijk iets anders dan een serverfout.
  if (status === 0 || status === undefined) {
    return new LaadFout(
      "geen_verbinding",
      `Geen verbinding met de server — kon ${wat} niet laden. Controleer je bereik.`,
    );
  }

  if (status >= 500) {
    return new LaadFout(
      "server_fout",
      `De server gaf een fout bij het laden van ${wat} (${status}). Probeer het zo nog eens.`,
    );
  }

  return new LaadFout("onbekend", `Kon ${wat} niet laden (${status}) — probeer het opnieuw.`);
}
