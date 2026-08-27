// Fase 11 Blok 5 — zes rooktests over de kernstromen.
// Uitgangspunt: een rooktest die alleen controleert of een pagina "iets" toont,
// vangt precies de storingen niet die ertoe doen. Waar het kan controleert een
// test daarom of een record ECHT op de server is aangekomen, of een lijst ECHT
// gevuld is — niet of er een bevestigingsmelding op het scherm stond.

import { expect, test } from "@playwright/test";
import { openApp, ruimOp, vulReactVeld } from "./hulp";

const TESTINVOERDER = "e2e-rooktest";

async function telOpServer(page: import("@playwright/test").Page, collectie: string) {
  return page.evaluate(async (col) => {
    // Geen Authorization-header: inloggen is verwijderd (22 augustus 2026) en de
    // API-regels staan open. Belangrijk voor de betrouwbaarheid van deze
    // telling: een ONGELDIG token levert bij PocketBase geen 401 op maar een
    // 200 met een lege lijst, dus meesturen "voor de zekerheid" zou hier tot
    // een stille 0 leiden en de test valselijk laten slagen.
    const filter = encodeURIComponent('ingevoerd_door="e2e-rooktest"');
    const r = await fetch(
      `http://127.0.0.1:8090/api/collections/${col}/records?perPage=1&filter=${filter}`,
    );
    return ((await r.json()).totalItems as number) ?? 0;
  }, collectie);
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("1 — de hub laadt met echte cijfers, niet een lege huls", async ({ page }) => {
  await page.goto("/");
  // "69 rijen" komt uit de database; ontbreekt dit, dan laadt de datalaag niet
  await expect(page.getByText(/\d+ rijen/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /kelder/i })).toBeVisible();
});

test("2 — een Brix-meting komt echt op de server aan", async ({ page }) => {
  await page.goto("/snel");
  await page.evaluate(
    (wie) => localStorage.setItem("wg.invoerder.v1", JSON.stringify(wie)),
    TESTINVOERDER,
  );
  await page.reload();

  const rijSelect = page.locator("select").first();
  await expect(rijSelect).toBeVisible({ timeout: 15_000 });
  const eersteRij = await rijSelect.locator("option").nth(1).getAttribute("value");
  await rijSelect.selectOption(eersteRij!);

  await vulReactVeld(page, 'input[type="number"]', "19.4");
  await page.getByRole("button", { name: /opslaan/i }).click();

  await expect.poll(() => telOpServer(page, "metingen"), { timeout: 15_000 }).toBeGreaterThan(0);
  await ruimOp(page, "metingen", TESTINVOERDER);
});

test("3 — oogstinvoer springt door naar de volgende rij", async ({ page }) => {
  await page.goto("/oogst");

  const rijSelect = page.locator("select").filter({ hasText: "Kies rij" }).first();
  await expect(rijSelect).toBeVisible({ timeout: 15_000 });
  const eersteRij = await rijSelect.locator("option").nth(1).getAttribute("value");
  await rijSelect.selectOption(eersteRij!);

  await vulReactVeld(page, 'input[placeholder="bijv. 12.5"]', "33.3");
  await vulReactVeld(page, 'input[placeholder="Je naam"]', TESTINVOERDER);

  await page.getByRole("button", { name: /oogst opslaan/i }).click();

  // de kern van Blok 4: na opslaan staat er een ándere rij geselecteerd
  await expect.poll(() => rijSelect.inputValue(), { timeout: 15_000 }).not.toBe(eersteRij);
  await expect.poll(() => telOpServer(page, "oogst"), { timeout: 15_000 }).toBeGreaterThan(0);

  await ruimOp(page, "oogst", TESTINVOERDER);
});

test("4 — de kelder toont tanks en een partij is te openen", async ({ page }) => {
  await page.goto("/kelder/tanks");
  const tankLinks = page.locator("a[href^='/kelder/tanks/']");
  // 48 tanks staan in de seed; een (bijna) lege lijst betekent een falende datalaag
  await expect.poll(() => tankLinks.count(), { timeout: 15_000 }).toBeGreaterThan(10);

  await page.goto("/kelder/partijen");
  const partijLinks = page.locator("a[href^='/kelder/partijen/']");
  await expect.poll(() => partijLinks.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  await partijLinks.first().click();
  await expect(page).toHaveURL(/\/kelder\/partijen\/.+/);
});

test("5 — een wachtend offline record laat de sync-balk verschijnen", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem(
      "wg.sync.queue.v1",
      JSON.stringify([
        {
          queueId: "e2e-wachtrij",
          soort: "meting",
          localId: "local-e2e",
          recordId: "e2eaaaaaaaaaaaa",
          payload: { notitie: "e2e" },
          aangemaakt: new Date().toISOString(),
        },
      ]),
    );
    window.dispatchEvent(new CustomEvent("wg.sync.changed"));
  });

  await expect(page.getByRole("button", { name: /wacht op sync/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.evaluate(() => localStorage.removeItem("wg.sync.queue.v1"));
});

test("6 — geen enkel hoofdscherm toont een foutmelding", async ({ page }) => {
  // Dit is de test tegen het faalpatroon uit Fase 8 en Fase 10: de datalaag
  // faalt (geen sessie, geannuleerd verzoek, lege lijst door een permissiefilter)
  // en het scherm toont een ErrorState. Die heeft role="alert", dus één
  // controle dekt alle schermen. Ook de Vandaag-widget hoort erbij: verdwijnt
  // de kop "VANDAAG", dan is de signaallaag stuk zonder dat er iets rood wordt.
  //
  // Die widget-controle verwachtte eerst simpelweg dat er ALTIJD een signaal
  // is. Dat bleek data-afhankelijk: op 26 augustus 2026 was de laatste bron
  // weg (de twee resterende signalen waren op 26 juli met de hand genegeerd,
  // de wachttijd was verlopen en de backup was vers) en faalde deze test
  // terwijl de signaallaag prima werkte. Een test die afgaat op wat er
  // toevallig in de database staat, meet niet wat hij belooft — daarom zet
  // hij nu zelf een signaal klaar en ruimt het daarna weer op.
  const schermen = [
    "/",
    "/voorraad",
    "/perceelkaart",
    "/kelder",
    "/kelder/tanks",
    "/kelder/partijen",
    "/oogst",
  ];

  for (const pad of schermen) {
    // Op een koude server (eerste run na een build) kan een nog lopende
    // client-side navigatie van het vorige scherm deze goto onderbreken:
    // "Navigation to X is interrupted by another navigation to Y". Dat is een
    // race in de test, geen fout in de app — één keer opnieuw proberen maakt
    // hem stabiel zonder een echte storing weg te maskeren (de foutcontrole
    // hieronder blijft onverkort gelden).
    try {
      await page.goto(pad);
    } catch (fout) {
      if (!/interrupted by another navigation/.test(String(fout))) throw fout;
      await page.goto(pad);
    }
    await page.waitForLoadState("networkidle");
    const meldingen = page.getByRole("alert");
    const aantal = await meldingen.count();
    if (aantal > 0) {
      throw new Error(`Foutmelding op ${pad}: "${await meldingen.first().innerText()}"`);
    }
  }

  // Eigen signaal klaarzetten (sensor_alerts is de generieke ingang van de
  // signaallaag, zie ARCHITECTURE.md §8.4) zodat de assertie hieronder over de
  // WERKING van de widget gaat en niet over de toevallige inhoud van de database.
  const alertId = await page.evaluate(async () => {
    const r = await fetch("http://127.0.0.1:8090/api/collections/sensor_alerts/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signaal_id: "e2e-rooktest-vandaag",
        ernst: "waarschuwing",
        titel: "Rooktest: signaallaag",
        waarom: "Tijdelijk signaal van de rooktest; wordt aan het eind opgeruimd.",
        bron_type: "kelder",
        actief: true,
      }),
    });
    return (await r.json()).id as string;
  });

  try {
    await page.goto("/");
    await expect(page.getByText("VANDAAG").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Rooktest: signaallaag")).toBeVisible({ timeout: 15_000 });
  } finally {
    // In een finally: ook als de assertie faalt mag er geen testsignaal
    // achterblijven dat Thomas morgen op zijn startscherm ziet staan.
    await page.evaluate(
      (id) =>
        fetch("http://127.0.0.1:8090/api/collections/sensor_alerts/records/" + id, {
          method: "DELETE",
        }),
      alertId,
    );
  }
});
