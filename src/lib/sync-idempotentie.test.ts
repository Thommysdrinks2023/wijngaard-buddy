// Fase 11 Blok 2 — idempotente sync-creates.
// Achtergrond: viel de verbinding weg NA het wegschrijven maar VÓÓR het
// antwoord, dan bleef het item in de wachtrij en maakte elke volgende poging
// een duplicaat. Live bewezen: 1 offline meting werd 3 records op de server.
// De oplossing is een vooraf bepaald record-id, zodat de server de tweede
// poging weigert met validation_not_unique in plaats van hem uit te voeren.

import { beforeEach, describe, expect, it, vi } from "vitest";

// sync.ts leest en schrijft localStorage achter een window-check; in de
// node-omgeving van vitest bestaat die niet, dus zetten we een minimale stub.
const opslag = new Map<string, string>();
vi.stubGlobal("window", {
  dispatchEvent: () => true,
});
vi.stubGlobal("localStorage", {
  getItem: (k: string) => opslag.get(k) ?? null,
  setItem: (k: string, v: string) => void opslag.set(k, v),
  removeItem: (k: string) => void opslag.delete(k),
});

const { addToSyncQueue, getSyncQueue, maakRecordId } = await import("./sync");

beforeEach(() => opslag.clear());

describe("maakRecordId", () => {
  it("voldoet aan het PocketBase-formaat: exact 15 tekens uit [a-z0-9]", () => {
    for (let i = 0; i < 200; i++) {
      const id = maakRecordId();
      expect(id).toHaveLength(15);
      expect(id).toMatch(/^[a-z0-9]{15}$/);
    }
  });

  it("levert geen botsingen op bij veel ids achter elkaar", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => maakRecordId()));
    expect(ids.size).toBe(5000);
  });
});

describe("addToSyncQueue", () => {
  it("geeft een create een vast record-id mee", () => {
    addToSyncQueue("meting", "local-1", { brix: 20 });
    const [item] = getSyncQueue();
    expect(item.recordId).toMatch(/^[a-z0-9]{15}$/);
  });

  it("geeft elke create een eigen id", () => {
    addToSyncQueue("meting", "local-1", { brix: 20 });
    addToSyncQueue("meting", "local-2", { brix: 21 });
    const [een, twee] = getSyncQueue();
    expect(een.recordId).not.toBe(twee.recordId);
  });

  it("geeft update en delete géén record-id: die zijn al idempotent", () => {
    addToSyncQueue("meting", "local-1", { brix: 20 }, { actie: "update", remoteId: "abc" });
    addToSyncQueue("meting", "local-2", {}, { actie: "delete", remoteId: "def" });
    for (const item of getSyncQueue()) {
      expect(item.recordId).toBeUndefined();
    }
  });
});
