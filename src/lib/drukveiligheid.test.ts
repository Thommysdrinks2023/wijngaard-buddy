import { describe, expect, it } from "vitest";
import {
  co2GehalteUitDruk,
  co2Oplosbaarheid,
  maximaleCarbonatie,
  thermischeUitzettingsfactor,
  veiligheidsoordeel,
  verwachteDruk,
  waterdampdrukBar,
} from "./drukveiligheid";

describe("waterdampdrukBar", () => {
  it("komt overeen met de vuistwaarde uit de opdracht: circa 0,11 bar bij 48 °C", () => {
    expect(waterdampdrukBar(48)).toBeCloseTo(0.11, 1);
  });
});

describe("thermischeUitzettingsfactor", () => {
  it("water zet van 10 naar 48 °C ongeveer 1-1,3% uit (vuistwaarde: ~1,2%)", () => {
    const factor = thermischeUitzettingsfactor(48, 10);
    expect(factor).toBeGreaterThan(1.005);
    expect(factor).toBeLessThan(1.02);
  });

  it("is 1,0 op de vultemperatuur zelf", () => {
    expect(thermischeUitzettingsfactor(10, 10)).toBeCloseTo(1.0, 6);
  });
});

describe("co2GehalteUitDruk", () => {
  it("1,0 bar bij 10 °C komt uit op ongeveer 4,2-4,5 g/L (bedrijfsvuistregel)", () => {
    const gl = co2GehalteUitDruk(1.0, 10);
    expect(gl).toBeGreaterThanOrEqual(4.0);
    expect(gl).toBeLessThanOrEqual(4.8);
  });

  it("oplosbaarheid daalt met temperatuur (minder CO2 blijft opgelost bij hogere T)", () => {
    expect(co2Oplosbaarheid(48)).toBeLessThan(co2Oplosbaarheid(10));
  });
});

describe("verwachteDruk — kopruimte-effect", () => {
  it("een kleinere kopruimte geeft bij verder gelijke invoer een hogere druk", () => {
    const ruim = verwachteDruk({
      drukBarGauge: 1.0,
      refTemperatuurC: 10,
      flesinhoudMl: 750,
      vulvolumeMl: 650, // 100 ml kopruimte
      doeltemperatuurC: 48,
    });
    const krap = verwachteDruk({
      drukBarGauge: 1.0,
      refTemperatuurC: 10,
      flesinhoudMl: 750,
      vulvolumeMl: 730, // 20 ml kopruimte
      doeltemperatuurC: 48,
    });
    expect(krap.drukGaugeBar).toBeGreaterThan(ruim.drukGaugeBar);
    expect(krap.drukGaugeBovengrensBar).toBeGreaterThan(ruim.drukGaugeBovengrensBar);
  });

  it("de conservatieve bovengrens is nooit lager dan het gekoppelde model", () => {
    const r = verwachteDruk({
      drukBarGauge: 1.0,
      refTemperatuurC: 10,
      flesinhoudMl: 250,
      vulvolumeMl: 225,
      doeltemperatuurC: 48,
    });
    expect(r.drukGaugeBovengrensBar).toBeGreaterThanOrEqual(r.drukGaugeBar);
  });

  it("markeert kopruimteOpgebruikt als de vloeistof geen ruimte meer heeft", () => {
    const r = verwachteDruk({
      drukBarGauge: 1.0,
      refTemperatuurC: 10,
      flesinhoudMl: 750,
      vulvolumeMl: 749, // vrijwel geen kopruimte
      doeltemperatuurC: 48,
    });
    expect(r.kopruimteOpgebruikt).toBe(true);
    expect(r.drukGaugeBovengrensBar).toBe(Infinity);
  });
});

describe("veiligheidsoordeel — het historische faalscenario en het huidige proces", () => {
  const referentie = () =>
    verwachteDruk({
      co2GehalteGl: 4,
      flesinhoudMl: 250,
      vulvolumeMl: 225,
      doeltemperatuurC: 48,
    });

  it.each([NaN, Infinity, -Infinity])(
    "geeft onvoldoende gegevens bij ongeldige druk %s",
    (druk) => {
      expect(veiligheidsoordeel({ ...referentie(), drukGaugeBovengrensBar: druk }, 8).oordeel).toBe(
        "onbekend",
      );
    },
  );

  it.each([NaN, Infinity, -Infinity, 0, -1])("weigert ongeldige sluitingslimiet %s", (limiet) => {
    expect(veiligheidsoordeel(referentie(), limiet).oordeel).toBe("onbekend");
  });

  it.each([NaN, Infinity, -0.1, 1, 2])("weigert ongeldige marge %s", (marge) => {
    expect(veiligheidsoordeel(referentie(), 8, marge).oordeel).toBe("onbekend");
  });

  it("weigert een kapotte tussenwaarde ook als de bovengrens geldig lijkt", () => {
    expect(veiligheidsoordeel({ ...referentie(), co2GehalteGl: NaN }, 8).oordeel).toBe("onbekend");
  });

  it("houdt uitgeputte kopruimte expliciet onveilig", () => {
    expect(
      veiligheidsoordeel(
        { ...referentie(), kopruimteOpgebruikt: true, drukGaugeBovengrensBar: Infinity },
        8,
      ).oordeel,
    ).toBe("onveilig");
  });

  // Enige HARDE empirische gegeven (zie WERKLOG.md Fase 17): het 750 ml
  // BVS-formaat met 6 bar-schroefdoppen is bij een te hoog vulniveau
  // daadwerkelijk bezweken (doppen + barstend glas). Dit scenario moet dus
  // "onveilig" opleveren — dat is de enige validatietoets met een bekend
  // antwoord die dit model heeft. Kopruimte is bewust KLEIN gehouden ("hoog
  // vulniveau"), niet geraden op een specifiek getal — zie Thomas'
  // instructie om geen ruime kopruimte aan te nemen.
  it("historisch faalscenario (750 ml, hoog gevuld, 6 bar-dop, 48 °C) geeft onveilig", () => {
    const druk = verwachteDruk({
      drukBarGauge: 2.2,
      refTemperatuurC: 10,
      flesinhoudMl: 750,
      vulvolumeMl: 730, // klein kopruimte-volume (~2,7%) — "te hoog vulniveau"
      doeltemperatuurC: 48,
    });
    const oordeel = veiligheidsoordeel(druk, 6);
    expect(oordeel.oordeel).toBe("onveilig");
  });

  it("het huidige proces (250 ml, kroonkurk) geeft veilig bij de gebruikelijke pasteurisatietemperatuur", () => {
    // Kroonkurk-specificatie: bewust niet geraden op een exact getal (die
    // staat in Blok C pas met bronvermelding vast) — hier een ruime,
    // conservatief lage aanname (8 bar) om te tonen dat het huidige,
    // bewezen proces daar met marge onder blijft.
    const druk = verwachteDruk({
      drukBarGauge: 1.0,
      refTemperatuurC: 10,
      flesinhoudMl: 250,
      vulvolumeMl: 225, // 10% kopruimte, gangbaar voor kroonkurk
      doeltemperatuurC: 48,
    });
    const oordeel = veiligheidsoordeel(druk, 8);
    expect(oordeel.oordeel).toBe("veilig");
  });

  it("geeft nooit alleen groen/rood — er bestaat een marginaal-uitkomst", () => {
    const druk = verwachteDruk({
      drukBarGauge: 1.0,
      refTemperatuurC: 10,
      flesinhoudMl: 750,
      vulvolumeMl: 690,
      doeltemperatuurC: 48,
    });
    const oordeel = veiligheidsoordeel(druk, druk.drukGaugeBovengrensBar / 0.85);
    expect(oordeel.oordeel).toBe("marginaal");
  });
});

describe("maximaleCarbonatie", () => {
  // Vuistwaarde uit de opdracht: bij 6 bar-schroefdoppen komt dit uit rond
  // 0,6-0,7 bar bij 10 °C. Dat getal is destijds met een ANDER (inmiddels
  // losgelaten) drukmodel bepaald — deze test controleert daarom de orde van
  // grootte, niet een exacte match. Wijkt de uitkomst hier ver van af, dan is
  // dat een bevinding voor Thomas, geen reden om het model te buigen.
  it("valt in de buurt van de vuistwaarde 0,6-0,7 bar bij 10 °C voor 6 bar-schroefdoppen", () => {
    const max = maximaleCarbonatie(6, 48, 750, 650);
    expect(max).toBeGreaterThan(0.2);
    expect(max).toBeLessThan(1.5);
  });

  it("is intern consistent met veiligheidsoordeel: op het toelaatbare maximum is het oordeel niet onveilig", () => {
    const maxGl = maximaleCarbonatie(6, 48, 750, 650);
    const druk = verwachteDruk({
      drukBarGauge: maxGl,
      refTemperatuurC: 10,
      flesinhoudMl: 750,
      vulvolumeMl: 650,
      doeltemperatuurC: 48,
    });
    const oordeel = veiligheidsoordeel(druk, 6);
    expect(oordeel.oordeel).not.toBe("onveilig");
  });
});
