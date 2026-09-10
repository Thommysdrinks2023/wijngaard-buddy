// Fase 11 Blok 5 — zes rooktests over de kernstromen.
// Uitgangspunt: een rooktest die alleen controleert of een pagina "iets" toont,
// vangt precies de storingen niet die ertoe doen. Waar het kan controleert een
// test daarom of een record ECHT op de server is aangekomen, of een lijst ECHT
// gevuld is — niet of er een bevestigingsmelding op het scherm stond.

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openApp, ruimOp, vulReactVeld } from "./hulp";

const TESTINVOERDER = "e2e-rooktest";

// Sommige collecties (tankboek, agent_acties, pasteurisatie_runs, …) hebben
// bewust deleteRule=null — schrijven kan alleen via de gecontroleerde
// server-endpoints of superuser-API, nooit rechtstreeks door een gewone
// aanvrager. Opruimen na een test die zo'n collectie raakt kan dus niet met
// de gedeelde ruimOp()/telOpServer() (die zonder auth-header werken, met
// opzet — zie hulp.ts). credentials.txt is dezelfde, al door Thomas
// geautoriseerde beheerderscredential als scripts/setup-pocketbase.mjs
// gebruikt (zie CLAUDE.md, "Superuser-credentials").
async function verwijderAlsSuperuser(collectie: string, id: string) {
  const [email, wachtwoord] = readFileSync(
    new URL("../pocketbase/backup-credentials.txt", import.meta.url),
    "utf8",
  )
    .trim()
    .split(/\r?\n/);
  const auth = await fetch("http://127.0.0.1:8090/api/collections/_superusers/auth-with-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password: wachtwoord }),
  }).then((r) => r.json());
  await fetch(`http://127.0.0.1:8090/api/collections/${collectie}/records/${id}`, {
    method: "DELETE",
    headers: { Authorization: auth.token },
  });
}

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

// klanten/materieel hebben geen ingevoerd_door-veld (bewuste keuze van de
// app, zie verkoop-data.ts/materieel-data.ts) — daarom hier op naam zoeken/
// opruimen in plaats van via de gedeelde ruimOp()/telOpServer(), die op
// ingevoerd_door filteren.
async function telOpServerOpNaam(
  page: import("@playwright/test").Page,
  collectie: string,
  naam: string,
) {
  return page.evaluate(
    async ([col, n]) => {
      const filter = encodeURIComponent(`naam="${n}"`);
      const r = await fetch(
        `http://127.0.0.1:8090/api/collections/${col}/records?perPage=1&filter=${filter}`,
      );
      return ((await r.json()).totalItems as number) ?? 0;
    },
    [collectie, naam] as const,
  );
}

async function ruimOpOpNaam(
  page: import("@playwright/test").Page,
  collectie: string,
  naam: string,
) {
  await page.evaluate(
    async ([col, n]) => {
      const filter = encodeURIComponent(`naam="${n}"`);
      const lijst = await (
        await fetch(
          `http://127.0.0.1:8090/api/collections/${col}/records?perPage=200&filter=${filter}`,
        )
      ).json();
      for (const r of lijst.items ?? []) {
        await fetch(`http://127.0.0.1:8090/api/collections/${col}/records/${r.id}`, {
          method: "DELETE",
        });
      }
    },
    [collectie, naam] as const,
  );
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

test("7 — een wat-als-simulatie is altijd als simulatie gemarkeerd", async ({ page }) => {
  // Fase 21. Dit is geen "laadt de pagina"-test maar de bewaking van een harde
  // ontwerpeis: een doorrekening mag nooit voor een meting kunnen doorgaan.
  // Bewust zonder flestype/sluiting te kiezen — de PU-tak werkt zonder
  // serverdata, dus deze test is niet afhankelijk van wat er toevallig in de
  // database staat (zelfde les als bij test 6).
  await page.goto("/pasteurisatie/plannen");

  const knop = page.getByRole("button", { name: /simuleer volledige curve/i });
  await expect(knop).toBeVisible({ timeout: 15_000 });
  await knop.click();

  // De markering zelf: zonder deze tekst is de simulatie niet te onderscheiden
  // van een echte meting, en dat is precies wat niet mag.
  await expect(page.getByText(/simulatie — geen meting/i)).toBeVisible();
  await expect(page.getByText(/niets gemeten en niets opgeslagen/i)).toBeVisible();

  // Er komt ook echt een uitkomst uit, geen leeg paneel.
  await expect(page.getByText(/totale pu over de curve/i)).toBeVisible();
  await expect(page.getByText(/waar deze doorrekening van uitgaat/i)).toBeVisible();

  // Geen foutstatus op dit scherm (zelfde bewaking als test 6).
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test("8 — twee wat-als-scenario's kunnen naast elkaar vergeleken worden", async ({ page }) => {
  // Fase 21 (uitbreiding). Bewaakt dat scenario B écht onafhankelijk is van
  // scenario A (dezelfde fout als bij één simulatie zou hier zijn: twee
  // uitkomsten die stiekem hetzelfde getal tonen omdat B nooit echt apart
  // wordt doorgerekend).
  await page.goto("/pasteurisatie/plannen");

  await page.getByRole("button", { name: /simuleer volledige curve/i }).click();
  await expect(page.getByText(/totale pu over de curve/i)).toBeVisible();

  const vergelijkKnop = page.getByRole("button", { name: /vergelijk met een tweede scenario/i });
  await expect(vergelijkKnop).toBeVisible();
  await vergelijkKnop.click();

  // "Scenario B" staat zowel als kop als in de vergelijkingskaart — de kop
  // is uniek genoeg om op te wachten zonder in een strict-mode-conflict te
  // lopen.
  await expect(page.getByRole("heading", { name: "Scenario B" })).toBeVisible();

  // Startpunt: B is een kopie van A (zelfde 48 °C), dus beide kaarten tonen
  // dezelfde PU-uitkomst.
  await expect(page.getByText("● Scenario A (48 °C) ·")).toBeVisible();

  // Scenario B's houdtemperatuur aanpassen naar een bekende, sterk afwijkende
  // waarde — de uitkomst moet dan écht opnieuw berekend zijn (117,9 PU bij
  // 65 °C met de standaard 15/20/20-curve), niet stiekem hetzelfde getal als
  // scenario A blijven tonen.
  const houdVeldB = page.getByLabel("Houd (°C)");
  await houdVeldB.fill("65");
  await expect(page.getByText("● Scenario A (48 °C) · ● Scenario B (65 °C)")).toBeVisible();
  await expect(page.getByText("117.9 PU")).toBeVisible();

  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test("9 — een nieuwe klant op /verkoop komt echt op de server aan", async ({ page }) => {
  // Voorheen geen enkele rooktest voor /verkoop — een regressie in deze
  // kernflow (klant aanmaken, de basis voor elke order) zou daardoor
  // onopgemerkt blijven. Naam met een tijdstempel zodat herhaald draaien
  // nooit met een vorige testrun botst.
  const naam = `E2E Testklant ${Date.now()}`;
  await page.goto("/verkoop");

  await page.getByRole("button", { name: /nieuwe klant/i }).click();
  const naamVeld = page.getByLabel("Naam").first();
  await naamVeld.fill(naam);
  await page.getByRole("button", { name: /klant opslaan/i }).click();

  await expect
    .poll(() => telOpServerOpNaam(page, "klanten", naam), { timeout: 15_000 })
    .toBeGreaterThan(0);
  await ruimOpOpNaam(page, "klanten", naam);

  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test("10 — een nieuwe machine op /materieel komt echt op de server aan", async ({ page }) => {
  // Voorheen geen enkele rooktest voor /materieel.
  const naam = `E2E Testmachine ${Date.now()}`;
  await page.goto("/materieel");

  await page.getByRole("button", { name: /nieuwe machine/i }).click();
  const naamVeld = page.getByLabel("Naam").first();
  await naamVeld.fill(naam);
  await page.getByRole("button", { name: /machine opslaan/i }).click();

  await expect
    .poll(() => telOpServerOpNaam(page, "materieel", naam), { timeout: 15_000 })
    .toBeGreaterThan(0);
  await ruimOpOpNaam(page, "materieel", naam);

  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test("11 — een pasteurisatierun starten op lotnummer komt echt op de server aan", async ({
  page,
}) => {
  // Voorheen alleen indirecte dekking via de wat-als-simulatie (test 7/8) —
  // de echte kernflow (run starten op een bestaand lotnummer, atomisch met
  // een kelderlog-openingsregel) had geen enkele test. Gebruikt het
  // bestaande, geseede lotnummer "260101" (Johanniter, klaar_voor_botteling)
  // i.p.v. een nieuwe partij aan te maken — dat houdt de test klein en de
  // opruiming exact (alleen de run zelf en de kelderlogregel, geen partij).
  await page.goto("/pasteurisatie/run/nieuw");

  await page.getByPlaceholder("bijv. L26-JOH-01").fill("260101");
  await page.getByRole("button", { name: /zoeken/i }).click();
  await expect(page.getByText(/partij gevonden/i)).toBeVisible({ timeout: 15_000 });

  // Zelfde flestype/sluiting-combinatie als in de wat-als-tests (test 7/8):
  // bij 48 °C, 225 ml vulling en 1,0 bar carbonatie bij 10 °C bekend "veilig"
  // — dus geen akkoord-ondanks-oordeel-vinkje nodig voor deze test.
  // Bewuste keuze voor de vaste seed-id's van "transparant kroonkurk 250 ml"
  // en "Kroonkurk 26 mm" (zelfde combinatie als de wat-als-tests, 7/8) — een
  // label-match is broos zodra er tussentijds een flestype bij komt met een
  // vergelijkbare naam. Op labelnaam i.p.v. positie: "Product" staat vóór
  // "Flestype" op dit scherm, anders dan op de planner.
  await page.getByLabel("Flestype").selectOption("eh4t5hp7az0182b");
  await page.getByLabel("Sluiting").selectOption("wq11z854nle558t");

  await page.getByLabel("Aantal flessen").fill("12");
  await page.getByLabel("Vulvolume (ml)").fill("225");
  await page.getByLabel("Naam (invoerder)").fill(TESTINVOERDER);

  const startKnop = page.getByRole("button", { name: /run starten/i });
  await expect(startKnop).toBeEnabled({ timeout: 15_000 });
  await startKnop.click();

  // (?!nieuw) is nodig: we starten al op /pasteurisatie/run/nieuw, wat
  // zonder die uitsluiting zelf al aan het patroon voldoet — waitForURL zou
  // dan meteen terugkeren zonder op de echte navigatie te wachten, en
  // page.url() zou daarna nog steeds "nieuw" als id opleveren.
  await page.waitForURL(/\/pasteurisatie\/run\/(?!nieuw)[^/]+$/, { timeout: 15_000 });
  const runId = page.url().split("/").pop()!;

  // Echt op de server: de run-monitor haalt zijn data op via genau dit id,
  // dus een geslaagde navigatie bewijst het al impliciet — hier expliciet
  // bevestigd, zelfde discipline als de rest van dit bestand.
  await expect
    .poll(
      async () => {
        const r = await page.evaluate(
          (id) =>
            fetch(`http://127.0.0.1:8090/api/collections/pasteurisatie_runs/records/${id}`).then(
              (res) => res.status,
            ),
          runId,
        );
        return r;
      },
      { timeout: 15_000 },
    )
    .toBe(200);

  // Opruimen: precies deze ene run (op id, geen filter — dit lotnummer is
  // een echte, herbruikte productiepartij) plus de bijbehorende
  // kelderlog-openingsregel (via ingevoerd_door, zelfde patroon als elders).
  // pasteurisatie_runs heeft deleteRule=null, dus dit MOET met de
  // superuser-credential — een gewone DELETE zou hier stil (403, niet
  // gecontroleerd) mislukken.
  await verwijderAlsSuperuser("pasteurisatie_runs", runId);
  await ruimOp(page, "kelderlog", TESTINVOERDER);

  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test("12 — een order (concept) op /verkoop komt echt op de server aan", async ({ page }) => {
  // Bewust GEEN levering: /api/tappenmars/order-leveren muteert echte
  // voorraad atomisch en onomkeerbaar — geen testcyclus om dat terug te
  // draaien. Een concept-order zelf raakt de voorraad niet aan (zie
  // createOrder() in verkoop-data.ts: gewone .create(), geen mutatie), dus
  // dat is het stuk dat hier getest wordt.
  const klantnaam = `E2E Testklant Order ${Date.now()}`;
  await page.goto("/verkoop");

  await page.getByRole("button", { name: /nieuwe klant/i }).click();
  await page.getByLabel("Naam").first().fill(klantnaam);
  await page.getByRole("button", { name: /klant opslaan/i }).click();
  await expect
    .poll(() => telOpServerOpNaam(page, "klanten", klantnaam), { timeout: 15_000 })
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: /nieuwe order/i }).click();
  await page.getByLabel("Klant").selectOption({ label: klantnaam });
  // "Sg 2025" (840 op voorraad in de seed) — ruim genoeg dat de exacte stand
  // niet uitmaakt en de optie niet uit de lijst valt tijdens de test.
  await page.locator("select").filter({ hasText: "Kies wijn…" }).selectOption("e2mqw1jt7uqcrb4");
  await page.getByPlaceholder("aantal").fill("2");
  await page.getByLabel("Ingevoerd door").first().fill(TESTINVOERDER);
  await page.getByRole("button", { name: /order opslaan als concept/i }).click();

  await expect.poll(() => telOpServer(page, "orders"), { timeout: 15_000 }).toBeGreaterThan(0);

  // Opruimen: eerst de order (open deleteRule, zelfde ingevoerd_door-patroon
  // als de rest van dit bestand), dan de klant.
  await ruimOp(page, "orders", TESTINVOERDER);
  await ruimOpOpNaam(page, "klanten", klantnaam);

  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test("13 — een onderhoudsregel op /materieel komt echt op de server aan", async ({ page }) => {
  const machinenaam = `E2E Testmachine Onderhoud ${Date.now()}`;
  await page.goto("/materieel");

  await page.getByRole("button", { name: /nieuwe machine/i }).click();
  await page.getByLabel("Naam").first().fill(machinenaam);
  await page.getByRole("button", { name: /machine opslaan/i }).click();
  await expect
    .poll(() => telOpServerOpNaam(page, "materieel", machinenaam), { timeout: 15_000 })
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: /onderhoud loggen/i }).click();
  await page.getByLabel("Machine").selectOption({ label: machinenaam });
  await page.getByLabel("Omschrijving").fill("e2e-rooktest: oliepeil gecontroleerd");
  await page.getByLabel("Ingevoerd door").fill(TESTINVOERDER);
  await page.getByRole("button", { name: /onderhoudsregel opslaan/i }).click();

  await expect
    .poll(() => telOpServer(page, "onderhoudslog"), { timeout: 15_000 })
    .toBeGreaterThan(0);

  await ruimOp(page, "onderhoudslog", TESTINVOERDER);
  await ruimOpOpNaam(page, "materieel", machinenaam);

  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

// De koppeling oogst.partij bestaat sinds Fase 13 maar werd tot september 2026
// nergens teruggelezen — "uit welke rijen komt dit lot" was onbeantwoordbaar
// terwijl de data er stond. Deze test bewaakt dat de herkomstsectie de
// gekoppelde oogst ook echt TOONT; een sectie die stil leeg blijft is precies
// het faalpatroon dat hier drie jaar onopgemerkt bleef.
test("14 — de herkomst van een partij toont de gekoppelde oogstrijen", async ({ page }) => {
  await page.goto("/kelder");

  const gemaakt = await page.evaluate(async (invoerder) => {
    const haal = async (col: string) =>
      (await (await fetch(`http://127.0.0.1:8090/api/collections/${col}/records?perPage=1`)).json())
        .items?.[0];
    const partij = await haal("partijen");
    const rij = await haal("rijen");
    if (!partij || !rij) return null;
    const oogst = await (
      await fetch("http://127.0.0.1:8090/api/collections/oogst/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rij: rij.id,
          ras: rij.ras,
          datum: "2026-09-15",
          seizoen: 2026,
          kg: 137.5,
          partij: partij.id,
          ingevoerd_door: invoerder,
        }),
      })
    ).json();
    return { partijId: partij.id, rijnummer: rij.rijnummer, oogstId: oogst.id };
  }, TESTINVOERDER);

  expect(gemaakt, "er moet minstens één partij en één rij op de server staan").not.toBeNull();

  await page.goto(`/kelder/partijen/${gemaakt!.partijId}`);
  const herkomst = page.locator("section", {
    has: page.getByRole("heading", { name: "Herkomst" }),
  });
  await expect(herkomst).toBeVisible({ timeout: 15_000 });
  await expect(herkomst.getByRole("link", { name: `Rij ${gemaakt!.rijnummer}` })).toBeVisible();
  await expect(herkomst).toContainText("137.5 kg");

  await ruimOp(page, "oogst", TESTINVOERDER);

  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

// Voorstel 2 uit het keldermanager-onderzoek: een analyse vastleggen was de
// meest voorkomende kelderhandeling én kostte 6+ stappen via de partijpagina.
// Deze test loopt de korte weg: vanaf de tank zelf. Hij controleert dat het
// record ECHT op de server staat, inclusief de tankkoppeling — een analyse die
// zonder tank wordt opgeslagen is niet terug te vinden waar je hem zoekt.
test("15 — een analyse vanaf de tank komt echt op de server aan", async ({ page }) => {
  await page.goto("/kelder/tanks");

  const tankId = await page.evaluate(async () => {
    const filter = encodeURIComponent("huidige_partij!=''");
    const r = await fetch(
      `http://127.0.0.1:8090/api/collections/tanks/records?perPage=1&filter=${filter}`,
    );
    return ((await r.json()).items?.[0]?.id as string) ?? "";
  });
  expect(tankId, "er moet een tank met een gekoppelde partij op de server staan").not.toBe("");

  // Dit paneel heeft bewust geen "Ingevoerd door"-veld — net als Reiniging en
  // Peiling op ditzelfde scherm gebruikt het de app-brede invoerder. Die wordt
  // hier vooraf gezet, zodat de opruiming op ingevoerd_door kan blijven werken.
  await page.evaluate(
    (naam) => localStorage.setItem("wg.invoerder.v1", JSON.stringify(naam)),
    TESTINVOERDER,
  );
  await page.goto(`/kelder/tanks/${tankId}`);
  await page.getByRole("button", { name: "Analyse", exact: true }).click();
  await page.getByLabel("°Oechsle").fill("78");
  await page.getByLabel("Temperatuur (°C)").fill("19.4");
  await page.getByRole("button", { name: /analyse opslaan/i }).click();

  await expect.poll(() => telOpServer(page, "analyses"), { timeout: 15_000 }).toBeGreaterThan(0);

  // De temperatuur moet als gemeten waarde herkenbaar zijn, niet als de 0 die
  // PocketBase van een leeg getalveld maakt (zie meetwaarde.ts).
  const opgeslagen = await page.evaluate(async () => {
    const filter = encodeURIComponent(`ingevoerd_door="e2e-rooktest"`);
    const r = await fetch(
      `http://127.0.0.1:8090/api/collections/analyses/records?perPage=1&sort=-created&filter=${filter}`,
    );
    return (await r.json()).items?.[0];
  });
  expect(opgeslagen.temperatuur_c).toBe(19.4);
  expect(opgeslagen.tank).toBe(tankId);
  expect(opgeslagen.gemeten_velden).toContain("temperatuur_c");

  await ruimOp(page, "analyses", TESTINVOERDER);

  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

// Voorstel 5 uit het keldermanager-onderzoek. Het `foto`-veld op kelderlog
// bestond al in het schema en werd al uitgelezen; alleen de upload-UI ontbrak.
// Deze test controleert het deel dat stil kan falen: dat er daadwerkelijk een
// bestand aan het record hangt. Een groene toast bewijst dat niet — de
// PocketBase-SDK moet de payload als FormData versturen, en doet dat alleen
// als er echt een File in zit.
test("16 — een foto bij een kelderlogregel komt echt op de server aan", async ({ page }) => {
  const notitie = `e2e-rooktest foto ${Date.now()}`;
  const haalRecord = () =>
    page.evaluate(async (n) => {
      const filter = encodeURIComponent(`notitie="${n}"`);
      const r = await fetch(
        `http://127.0.0.1:8090/api/collections/kelderlog/records?perPage=1&filter=${filter}`,
      );
      return (await r.json()).items?.[0] ?? null;
    }, notitie);

  const partijId = await page.evaluate(async () => {
    const r = await fetch("http://127.0.0.1:8090/api/collections/partijen/records?perPage=1");
    return ((await r.json()).items?.[0]?.id as string) ?? "";
  });
  expect(partijId, "er moet een partij op de server staan").not.toBe("");

  await page.goto(`/kelder/partijen/${partijId}`);
  await page.getByRole("button", { name: "Logboek", exact: true }).click();

  // Een echte JPEG, geen lege buffer: comprimeerFoto() tekent hem op een canvas
  // (dat is meteen de EXIF-strip) en zou op onleesbare bytes stukslaan.
  // De input zit verborgen in een label, dus hier rechtstreeks aangesproken.
  await page.locator('section input[type="file"]').setInputFiles({
    name: "rooktest.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
      "base64",
    ),
  });
  await expect(page.getByText("rooktest.jpg")).toBeVisible({ timeout: 10_000 });

  await page.getByLabel("Notitie").fill(notitie);
  await page.getByRole("button", { name: /logregel opslaan/i }).click();

  await expect.poll(haalRecord, { timeout: 20_000 }).not.toBeNull();
  const record = await haalRecord();
  expect(record.foto, "er moet een bestandsnaam aan het record hangen").toBeTruthy();

  await page.evaluate(async (id) => {
    await fetch(`http://127.0.0.1:8090/api/collections/kelderlog/records/${id}`, {
      method: "DELETE",
    });
  }, record.id);

  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

// Integriteitsgarantie uit de pentest van 10 sep. 2026 (bevinding 1): een
// boeking IN een tank zonder ingestelde capaciteit (pulptank/koeltank, bewust
// capaciteit 0) moet worden geweigerd — anders kan een fysiek onmogelijk,
// ongelimiteerd volume in het onwijzigbare tankboek belanden. Deze test spreekt
// het endpoint rechtstreeks aan; er komt geen UI aan te pas en er wordt bij
// succes-verwachting (400) niets weggeschreven dat opgeruimd moet worden.
test("17 — boeken in een tank zonder capaciteit wordt geweigerd", async ({ page }) => {
  await page.goto("/kelder");

  const uitkomst = await page.evaluate(async () => {
    const base = "http://127.0.0.1:8090";
    const tanks = await (
      await fetch(
        `${base}/api/collections/tanks/records?perPage=1&filter=${encodeURIComponent("capaciteit_l=0")}`,
      )
    ).json();
    const partij = await (await fetch(`${base}/api/collections/partijen/records?perPage=1`)).json();
    const tank = tanks.items?.[0];
    const p = partij.items?.[0];
    if (!tank || !p) return { overgeslagen: true };
    const res = await fetch(`${base}/api/tappenmars/tankboek-boeking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        datum: "2026-09-10",
        partij: p.id,
        actie: "vullen",
        naar_tank: tank.id,
        volume_l: 1000,
        verantwoordelijke: "e2e-capaciteit-guard",
      }),
    });
    const body = await res.json();
    return { status: res.status, message: body.message ?? "", tankCode: tank.code };
  });

  expect(uitkomst.overgeslagen, "er moet een tank met capaciteit 0 bestaan").toBeFalsy();
  expect(uitkomst.status).toBe(400);
  expect(uitkomst.message).toContain("geen capaciteit");

  // Extra zekerheid: er is niets in het tankboek geschreven.
  const geschreven = await page.evaluate(async () => {
    const r = await fetch(
      `http://127.0.0.1:8090/api/collections/tankboek/records?perPage=1&filter=${encodeURIComponent("verantwoordelijke='e2e-capaciteit-guard'")}`,
    );
    return ((await r.json()).totalItems as number) ?? 0;
  });
  expect(geschreven).toBe(0);

  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});
