import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readLs, uid, writeLs } from "./opslag";

// Deze tests draaien in een kale Node-omgeving (zie vitest.config.ts: geen
// jsdom). `window` en `localStorage` bestaan daar niet, dus we zetten ze zelf
// neer — dat maakt ook meteen zichtbaar dat de helpers een SSR-render zonder
// window netjes overleven, wat in deze app echt gebeurt.
type Opslag = {
  store: Map<string, string>;
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
};

function maakOpslag(setItem?: (k: string, v: string) => void): Opslag {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: setItem ?? ((k, v) => void store.set(k, v)),
  };
}

function zetOmgevingNeer(opslag: Opslag | null) {
  if (opslag === null) {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).localStorage;
    return;
  }
  (globalThis as Record<string, unknown>).window = {};
  (globalThis as Record<string, unknown>).localStorage = opslag;
}

afterEach(() => {
  zetOmgevingNeer(null);
  vi.restoreAllMocks();
});

describe("readLs", () => {
  beforeEach(() => zetOmgevingNeer(maakOpslag()));

  it("geeft de terugvalwaarde als de sleutel niet bestaat", () => {
    expect(readLs("wg.bestaat.niet", { leeg: true })).toEqual({ leeg: true });
  });

  it("leest terug wat er geschreven is", () => {
    writeLs("wg.test.v1", [1, 2, 3]);
    expect(readLs<number[]>("wg.test.v1", [])).toEqual([1, 2, 3]);
  });

  // Een half weggeschreven of handmatig aangepaste sleutel mag de app niet
  // laten klappen: de cache is dan gewoon onbruikbaar, geen ramp.
  it("gooit niet op corrupte JSON, maar geeft de terugvalwaarde", () => {
    (globalThis as Record<string, unknown>).localStorage = maakOpslag();
    (globalThis.localStorage as unknown as Opslag).store.set("wg.kapot.v1", "{niet: geldig");
    expect(() => readLs("wg.kapot.v1", "terugval")).not.toThrow();
    expect(readLs("wg.kapot.v1", "terugval")).toBe("terugval");
  });

  it("geeft de terugvalwaarde zonder window (server-render)", () => {
    zetOmgevingNeer(null);
    expect(readLs("wg.test.v1", "terugval")).toBe("terugval");
  });
});

describe("writeLs", () => {
  it("schrijft en meldt succes", () => {
    zetOmgevingNeer(maakOpslag());
    expect(writeLs("wg.test.v1", { a: 1 })).toBe(true);
    expect(readLs("wg.test.v1", null)).toEqual({ a: 1 });
  });

  // De kern van de fix. Volle telefoonopslag of een privévenster laat
  // localStorage.setItem gooien. Dat liet eerder het opslaan van een meting
  // klappen met een cryptische browserfout, terwijl offline-first juist zou
  // moeten redden. Falen mag, maar dan zichtbaar via de retourwaarde.
  it("gooit niet bij een volle opslag, maar meldt dat het mislukt is", () => {
    zetOmgevingNeer(
      maakOpslag(() => {
        const fout = new Error("QuotaExceededError");
        fout.name = "QuotaExceededError";
        throw fout;
      }),
    );
    expect(() => writeLs("wg.test.v1", { a: 1 })).not.toThrow();
    expect(writeLs("wg.test.v1", { a: 1 })).toBe(false);
  });

  it("meldt onsuccesvol zonder window (server-render), zonder te gooien", () => {
    zetOmgevingNeer(null);
    expect(() => writeLs("wg.test.v1", 1)).not.toThrow();
    expect(writeLs("wg.test.v1", 1)).toBe(false);
  });
});

describe("uid", () => {
  it("levert unieke, niet-lege sleutels", () => {
    const gezien = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const id = uid();
      expect(id.length).toBeGreaterThan(0);
      gezien.add(id);
    }
    expect(gezien.size).toBe(500);
  });
});
