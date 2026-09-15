// Fase 11 Blok 1 — deelVerzoek bundelt gelijktijdige identieke verzoeken.
// Achtergrond: op de hub bleken 8 van de 22 API-calls exacte duplicaten,
// doordat elke signaalproducent dezelfde instellingenlijst zelfstandig ophaalt.

import { describe, expect, it } from "vitest";
import { deelVerzoek } from "./data";

describe("deelVerzoek", () => {
  it("voert bij gelijktijdige aanroepen met dezelfde sleutel maar één verzoek uit", async () => {
    let aanroepen = 0;
    const maak = () =>
      new Promise<string>((resolve) => {
        aanroepen++;
        setTimeout(() => resolve("data"), 10);
      });

    const resultaten = await Promise.all([
      deelVerzoek("test-a", maak),
      deelVerzoek("test-a", maak),
      deelVerzoek("test-a", maak),
    ]);

    expect(aanroepen).toBe(1);
    expect(resultaten).toEqual(["data", "data", "data"]);
  });

  it("houdt verschillende sleutels gescheiden", async () => {
    let aanroepen = 0;
    const maak = (waarde: string) => () =>
      new Promise<string>((resolve) => {
        aanroepen++;
        setTimeout(() => resolve(waarde), 10);
      });

    const [een, twee] = await Promise.all([
      deelVerzoek("test-b1", maak("een")),
      deelVerzoek("test-b2", maak("twee")),
    ]);

    expect(aanroepen).toBe(2);
    expect(een).toBe("een");
    expect(twee).toBe("twee");
  });

  it("cachet niet: een aanroep ná afronding haalt opnieuw op", async () => {
    let aanroepen = 0;
    const maak = async () => {
      aanroepen++;
      return "data";
    };

    await deelVerzoek("test-c", maak);
    await deelVerzoek("test-c", maak);

    expect(aanroepen).toBe(2);
  });

  it("laat een fout door aan alle wachtende aanroepers en blokkeert de sleutel niet", async () => {
    let aanroepen = 0;
    const faalt = async () => {
      aanroepen++;
      throw new Error("stuk");
    };

    const uitkomsten = await Promise.allSettled([
      deelVerzoek("test-d", faalt),
      deelVerzoek("test-d", faalt),
    ]);
    expect(aanroepen).toBe(1);
    expect(uitkomsten.every((u) => u.status === "rejected")).toBe(true);

    // sleutel moet vrijgegeven zijn, anders blijft een mislukte fetch plakken
    await expect(deelVerzoek("test-d", async () => "ok")).resolves.toBe("ok");
  });
});
