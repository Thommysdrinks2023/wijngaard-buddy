import { describe, expect, it } from "vitest";
import { csvAlsString } from "./csv-export";

describe("CSV-export", () => {
  it.each(["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)", "  =1", "\t=1", "\u0000=1"])(
    "neutraliseert formuletekst %j",
    (tekst) => {
      expect(csvAlsString(["Naam"], [[tekst]])).toBe("\uFEFFNaam\r\n'" + tekst);
    },
  );

  it("beschermt ook kolomkoppen en behoudt echte negatieve getallen", () => {
    expect(csvAlsString(["=kop"], [[-12.5], ["-12.5"]])).toBe("\uFEFF'=kop\r\n-12.5\r\n'-12.5");
  });

  it("escaped scheidingstekens, quotes en losse carriage returns", () => {
    expect(csvAlsString(["Naam"], [['a,"b"'], ["a\rb"], ["a\nb"]])).toBe(
      '\uFEFFNaam\r\n"a,""b"""\r\n"a\rb"\r\n"a\nb"',
    );
  });

  it("behoudt gewone tekst, lege waarden en Unicode", () => {
    expect(csvAlsString(["Wijn"], [["Rosé", null, undefined, 0]])).toBe("\uFEFFWijn\r\nRosé,,,0");
  });
});
