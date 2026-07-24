import { describe, expect, it } from "vitest";
import { isVerborgen, type SignaalStatus } from "./signaal-status-data";

const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const gisteren = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

describe("isVerborgen", () => {
  it("normaal geval: geen status -> zichtbaar", () => {
    expect(isVerborgen("sig-1", [])).toBe(false);
  });

  it("normaal geval: genegeerd -> permanent verborgen", () => {
    const statussen: SignaalStatus[] = [{ id: "1", signaal_id: "sig-1", actie: "genegeerd" }];
    expect(isVerborgen("sig-1", statussen)).toBe(true);
  });

  it("normaal geval: gesnoozed met datum in de toekomst -> verborgen", () => {
    const statussen: SignaalStatus[] = [
      { id: "1", signaal_id: "sig-1", actie: "gesnoozed", snooze_tot: morgen },
    ];
    expect(isVerborgen("sig-1", statussen)).toBe(true);
  });

  it("randgeval: verlopen snooze -> weer zichtbaar", () => {
    const statussen: SignaalStatus[] = [
      { id: "1", signaal_id: "sig-1", actie: "gesnoozed", snooze_tot: gisteren },
    ];
    expect(isVerborgen("sig-1", statussen)).toBe(false);
  });

  it("randgeval: gesnoozed zonder datum -> zichtbaar (geen eindeloze snooze)", () => {
    const statussen: SignaalStatus[] = [{ id: "1", signaal_id: "sig-1", actie: "gesnoozed" }];
    expect(isVerborgen("sig-1", statussen)).toBe(false);
  });

  it("randgeval: status van een ander signaal raakt dit signaal niet", () => {
    const statussen: SignaalStatus[] = [{ id: "1", signaal_id: "sig-2", actie: "genegeerd" }];
    expect(isVerborgen("sig-1", statussen)).toBe(false);
  });
});
