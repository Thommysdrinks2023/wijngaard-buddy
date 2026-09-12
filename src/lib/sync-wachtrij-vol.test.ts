// Robuustheidsaudit 11 september 2026, bevinding 4.
//
// `writeLs` en de sync-wachtrij vingen een volle localStorage niet af. Voor de
// caches is dat geen ramp (die vullen zich opnieuw), maar voor de WACHTRIJ is
// het echt dataverlies: wat daar niet in komt, wordt nooit gesynchroniseerd en
// is stilzwijgend weg. Precies het scenario waarvoor offline-first bestaat —
// in het veld, zonder bereik, met een volle telefoon.
//
// Daarom gooit writeQueue() bewust WEL, met een Nederlandse melding die als
// toast bij Thomas landt, in plaats van stil te falen.

import { beforeEach, describe, expect, it, vi } from "vitest";

const opslag = new Map<string, string>();
let setItemGooit = false;

vi.stubGlobal("window", { dispatchEvent: () => true });
vi.stubGlobal("localStorage", {
  getItem: (k: string) => opslag.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (setItemGooit) {
      const fout = new Error("QuotaExceededError");
      fout.name = "QuotaExceededError";
      throw fout;
    }
    opslag.set(k, v);
  },
  removeItem: (k: string) => void opslag.delete(k),
});

const { addToSyncQueue, getSyncQueue } = await import("./sync");

beforeEach(() => {
  opslag.clear();
  setItemGooit = false;
});

describe("sync-wachtrij bij volle opslag", () => {
  it("zet een item normaal in de wachtrij als er ruimte is", () => {
    addToSyncQueue("meting", "lokaal-1", { brix: 18.5 }, { collection: "metingen" });
    expect(getSyncQueue()).toHaveLength(1);
  });

  it("gooit een leesbare Nederlandse fout als de opslag vol is", () => {
    setItemGooit = true;
    expect(() =>
      addToSyncQueue("meting", "lokaal-2", { brix: 19 }, { collection: "metingen" }),
    ).toThrow(/opslag van je telefoon zit vol/i);
  });

  // De kern: het mag geen kale browserfout zijn. Die landt als
  // "QuotaExceededError" in een toast en zegt Thomas niets over wat hij moet doen.
  it("geeft geen kale QuotaExceededError door", () => {
    setItemGooit = true;
    let bericht = "";
    try {
      addToSyncQueue("meting", "lokaal-3", { brix: 20 }, { collection: "metingen" });
    } catch (e) {
      bericht = e instanceof Error ? e.message : String(e);
    }
    expect(bericht).not.toMatch(/QuotaExceeded/i);
    expect(bericht.length).toBeGreaterThan(20);
  });

  it("laat de wachtrij ongemoeid als het wegschrijven mislukt", () => {
    addToSyncQueue("meting", "lokaal-4", { brix: 21 }, { collection: "metingen" });
    expect(getSyncQueue()).toHaveLength(1);

    setItemGooit = true;
    expect(() =>
      addToSyncQueue("meting", "lokaal-5", { brix: 22 }, { collection: "metingen" }),
    ).toThrow();

    // De eerder bewaarde invoer staat er nog: een mislukte schrijfactie mag
    // niet ook nog eens weghalen wat er al veilig stond.
    setItemGooit = false;
    expect(getSyncQueue()).toHaveLength(1);
  });
});
