import type { Page } from "@playwright/test";

// INLOGGEN WEER VERWIJDERD (besluit Thomas, 22 augustus 2026, zie CLAUDE.md).
// Deze functie heette logIn() en vulde e-mail + wachtwoord op /login. Die
// route bestaat niet meer en de API-regels staan open, dus er valt niets
// meer in te loggen.
//
// De functie zelf blijft bestaan onder een eerlijke naam: élke rooktest moet
// nog steeds de onboarding-dialoog wegzetten vóór hij iets aanklikt. Op een
// vers apparaat legt die dialoog zich over het scherm en vangt alle kliks af —
// dat was de oorspronkelijke reden dat hier een reload in zit, en die reden
// staat los van het inloggen.
export async function openApp(page: Page, pad = "/") {
  await page.goto(pad);
  await page.evaluate(() => localStorage.setItem("wg.onboarding.gezien.v1", "1"));
  await page.reload();
}

// Records die een test aanmaakt, weer opruimen — de tests draaien tegen de
// echte lokale PocketBase, dus ze mogen geen rommel achterlaten.
export async function ruimOp(page: Page, collectie: string, invoerder: string) {
  await page.evaluate(
    async ([col, wie]) => {
      // Geen Authorization-header meer: het inloggen is verwijderd en de
      // API-regels staan open (22 augustus 2026). Een meegestuurd leeg token
      // zou hier stilletjes een lege lijst opleveren — dan zou de opruiming
      // "slagen" zonder iets te verwijderen.
      const basis = "http://127.0.0.1:8090/api/collections/" + col + "/records";
      const filter = encodeURIComponent(`ingevoerd_door="${wie}"`);
      const lijst = await (await fetch(`${basis}?perPage=200&filter=${filter}`)).json();
      for (const r of lijst.items ?? []) {
        await fetch(`${basis}/${r.id}`, { method: "DELETE" });
      }
    },
    [collectie, invoerder] as const,
  );
}

// React-gestuurde velden vullen op een manier die React's onChange oppikt.
// Een kale .value = "..." werkt niet: React ziet die wijziging niet.
export async function vulReactVeld(page: Page, selector: string, waarde: string) {
  await page.evaluate(
    ([sel, val]) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) throw new Error("veld niet gevonden: " + sel);
      const proto =
        el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    [selector, waarde] as const,
  );
}
