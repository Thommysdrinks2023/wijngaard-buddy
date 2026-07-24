import type { Page } from "@playwright/test";

// Inloggegevens komen uit de omgeving, niet uit dit bestand: dit is een
// gecommit bestand en een wachtwoord hoort daar niet in te staan.
// Zetten met:  $env:E2E_EMAIL="..."; $env:E2E_WACHTWOORD="..."
export const EMAIL = process.env.E2E_EMAIL ?? "";
export const WACHTWOORD = process.env.E2E_WACHTWOORD ?? "";

export function eisInloggegevens() {
  if (!EMAIL || !WACHTWOORD) {
    throw new Error(
      "Zet E2E_EMAIL en E2E_WACHTWOORD in de omgeving voordat je de rooktests draait (zie CLAUDE.md).",
    );
  }
}

export async function logIn(page: Page) {
  eisInloggegevens();
  // Op een vers apparaat verschijnt de onboarding-dialoog óver het inlogscherm
  // en vangt die alle kliks af. Een mens tikt "Overslaan"; de test zet de vlag
  // die dat zou zetten, zodat elke rooktest bij het inloggen zelf begint.
  await page.goto("/login");
  await page.evaluate(() => localStorage.setItem("wg.onboarding.gezien.v1", "1"));
  await page.reload();

  await page.getByLabel(/e-?mail/i).fill(EMAIL);
  await page.getByLabel(/wachtwoord/i).fill(WACHTWOORD);
  await page.getByRole("button", { name: /inloggen/i }).click();
  // de app stuurt na inloggen door naar de hub of de laatst gebruikte module
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 });
}

// Records die een test aanmaakt, weer opruimen — de tests draaien tegen de
// echte lokale PocketBase, dus ze mogen geen rommel achterlaten.
export async function ruimOp(page: Page, collectie: string, invoerder: string) {
  await page.evaluate(
    async ([col, wie]) => {
      const token = JSON.parse(localStorage.getItem("pocketbase_auth") ?? "{}").token ?? "";
      const basis = "http://127.0.0.1:8090/api/collections/" + col + "/records";
      const filter = encodeURIComponent(`ingevoerd_door="${wie}"`);
      const lijst = await (
        await fetch(`${basis}?perPage=200&filter=${filter}`, {
          headers: { Authorization: token },
        })
      ).json();
      for (const r of lijst.items ?? []) {
        await fetch(`${basis}/${r.id}`, { method: "DELETE", headers: { Authorization: token } });
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
