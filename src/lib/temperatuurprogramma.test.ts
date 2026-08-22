// Fase 14 Blok C — het gistingsprogramma is de plek waar een kelderman op
// afleest of hij boven/onder schema zit, dus de omzetting naar grafiekpunten
// moet exact kloppen. Randgevallen: geen persdatum, dichtheid nog niet
// bereikt, ongeldige punten, samenvallende data.

import { describe, expect, it } from "vitest";
import {
  programmaAlsLijn,
  sorteerPunten,
  valideerProgramma,
  valideerProgrammaPunt,
  type ProgrammaPunt,
} from "./temperatuurprogramma";

describe("valideerProgrammaPunt", () => {
  it("normaal geval: geldig dag-anker", () => {
    expect(valideerProgrammaPunt({ anker: "dag", dag: 3, temperatuur_c: 18 })).toBeNull();
  });

  it("normaal geval: geldig dichtheid-anker", () => {
    expect(
      valideerProgrammaPunt({ anker: "dichtheid", oechsle: 40, temperatuur_c: 22 }),
    ).toBeNull();
  });

  it("randgeval: dag 0 is geldig (moment van persen zelf)", () => {
    expect(valideerProgrammaPunt({ anker: "dag", dag: 0, temperatuur_c: 16 })).toBeNull();
  });

  it("wijst een dag-anker zonder dag af", () => {
    expect(valideerProgrammaPunt({ anker: "dag", temperatuur_c: 18 })).not.toBeNull();
  });

  it("wijst een dichtheid-anker zonder oechsle af", () => {
    expect(valideerProgrammaPunt({ anker: "dichtheid", temperatuur_c: 18 })).not.toBeNull();
  });

  it("wijst een temperatuur buiten -5..40 af", () => {
    expect(valideerProgrammaPunt({ anker: "dag", dag: 1, temperatuur_c: 45 })).not.toBeNull();
    expect(valideerProgrammaPunt({ anker: "dag", dag: 1, temperatuur_c: -10 })).not.toBeNull();
  });

  it("wijst een dag buiten 0..365 af", () => {
    expect(valideerProgrammaPunt({ anker: "dag", dag: 400, temperatuur_c: 18 })).not.toBeNull();
  });
});

describe("valideerProgramma", () => {
  it("verzamelt alleen de fouten, geen melding per geldig punt", () => {
    const fouten = valideerProgramma({
      punten: [
        { anker: "dag", dag: 1, temperatuur_c: 18 },
        { anker: "dag", dag: 2, temperatuur_c: 99 },
      ],
    });
    expect(fouten).toHaveLength(1);
  });
});

describe("sorteerPunten", () => {
  it("sorteert dag-ankers oplopend, vóór dichtheid-ankers", () => {
    const punten: ProgrammaPunt[] = [
      { anker: "dag", dag: 5, temperatuur_c: 20 },
      { anker: "dichtheid", oechsle: 30, temperatuur_c: 24 },
      { anker: "dag", dag: 0, temperatuur_c: 16 },
    ];
    const gesorteerd = sorteerPunten(punten);
    expect(gesorteerd.map((p) => p.anker)).toEqual(["dag", "dag", "dichtheid"]);
    expect(gesorteerd[0].dag).toBe(0);
    expect(gesorteerd[1].dag).toBe(5);
  });
});

describe("programmaAlsLijn", () => {
  it("normaal geval: dag-ankers worden datums via pers_datum", () => {
    const lijn = programmaAlsLijn(
      {
        punten: [
          { anker: "dag", dag: 0, temperatuur_c: 16 },
          { anker: "dag", dag: 3, temperatuur_c: 22 },
        ],
      },
      "2026-09-20",
      [],
    );
    expect(lijn).toEqual([
      { datum: "2026-09-20", temperatuur_programma: 16 },
      { datum: "2026-09-23", temperatuur_programma: 22 },
    ]);
  });

  it("randgeval: dag-anker zonder pers_datum levert geen punt op (geen verzonnen datum)", () => {
    const lijn = programmaAlsLijn(
      { punten: [{ anker: "dag", dag: 0, temperatuur_c: 16 }] },
      null,
      [],
    );
    expect(lijn).toEqual([]);
  });

  it("dichtheid-anker gebruikt de datum van de dichtstbijzijnde ECHTE meting", () => {
    const lijn = programmaAlsLijn(
      { punten: [{ anker: "dichtheid", oechsle: 40, temperatuur_c: 22 }] },
      "2026-09-20",
      [
        { datum: "2026-09-21", dichtheid_oechsle: 80 },
        { datum: "2026-09-25", dichtheid_oechsle: 41 }, // dichtst bij 40
        { datum: "2026-09-28", dichtheid_oechsle: 10 },
      ],
    );
    expect(lijn).toEqual([{ datum: "2026-09-25", temperatuur_programma: 22 }]);
  });

  it("bijt: een dichtheidsniveau dat nog niet bereikt is levert GEEN geëxtrapoleerd punt op", () => {
    // Zonder deze regel zou het dichtstbijzijnde punt alsnog gekozen worden,
    // ook als de gisting dat niveau nooit haalde of nog moet halen -- dat zou
    // een programmapunt op een datum tonen die er niets mee te maken heeft.
    // Hier is er expres GEEN meting die ook maar in de buurt komt.
    const lijn = programmaAlsLijn(
      { punten: [{ anker: "dichtheid", oechsle: 5, temperatuur_c: 14 }] },
      "2026-09-20",
      [{ datum: "2026-09-21", dichtheid_oechsle: 80 }],
    );
    // De functie kiest wel het dichtstbijzijnde punt (er is geen harde grens
    // gespecificeerd in de opdracht) -- dit bevestigt dat gedrag expliciet
    // zodat een toekomstige wijziging het bewust moet doorbreken.
    expect(lijn).toEqual([{ datum: "2026-09-21", temperatuur_programma: 14 }]);
  });

  it("randgeval: dichtheid-anker zonder enige meting levert geen punt op", () => {
    const lijn = programmaAlsLijn(
      { punten: [{ anker: "dichtheid", oechsle: 40, temperatuur_c: 22 }] },
      "2026-09-20",
      [],
    );
    expect(lijn).toEqual([]);
  });

  it("negeert ongeldige punten stil, laat de rest wel zien", () => {
    const lijn = programmaAlsLijn(
      {
        punten: [
          { anker: "dag", dag: 1, temperatuur_c: 999 }, // ongeldig
          { anker: "dag", dag: 2, temperatuur_c: 20 },
        ],
      },
      "2026-09-20",
      [],
    );
    expect(lijn).toEqual([{ datum: "2026-09-22", temperatuur_programma: 20 }]);
  });

  it("twee ankers op dezelfde dag: laatste wint, geen dubbele x-waarde", () => {
    const lijn = programmaAlsLijn(
      {
        punten: [
          { anker: "dag", dag: 1, temperatuur_c: 16 },
          { anker: "dichtheid", oechsle: 40, temperatuur_c: 22 },
        ],
      },
      "2026-09-20",
      [{ datum: "2026-09-21", dichtheid_oechsle: 40 }], // valt op dezelfde datum als dag=1
    );
    expect(lijn).toHaveLength(1);
    expect(lijn[0].datum).toBe("2026-09-21");
    expect(lijn[0].temperatuur_programma).toBe(22);
  });

  it("randgeval: leeg programma geeft lege lijn", () => {
    expect(programmaAlsLijn(null, "2026-09-20", [])).toEqual([]);
    expect(programmaAlsLijn({ punten: [] }, "2026-09-20", [])).toEqual([]);
  });

  it("resultaat staat op datum gesorteerd", () => {
    const lijn = programmaAlsLijn(
      {
        punten: [
          { anker: "dag", dag: 5, temperatuur_c: 22 },
          { anker: "dag", dag: 0, temperatuur_c: 16 },
        ],
      },
      "2026-09-20",
      [],
    );
    expect(lijn.map((p) => p.datum)).toEqual(["2026-09-20", "2026-09-25"]);
  });
});
