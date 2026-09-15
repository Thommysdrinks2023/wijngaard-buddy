import { expect, test } from "@playwright/test";
import { openApp } from "./hulp";

// Alleen lezen/navigeren: geen testboekingen in de bedrijfsadministratie.
for (const pad of [
  "/kelder",
  "/kelder/tanks",
  "/kelder/partijen",
  "/kelder/partijen/nieuw",
  "/kelder/overhevelen",
  "/kelder/tankboek",
  "/kelder/logboek",
  "/kelder/jaaroverzicht",
  "/kelder/accijns",
  "/voorraad/flessen",
]) {
  test(`kelderdoorloop: ${pad}`, async ({ page }) => {
    const fouten: string[] = [];
    page.on("pageerror", (e) => fouten.push(e.message));
    await openApp(page, pad);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByText("Pagina niet gevonden", { exact: true })).toHaveCount(0);
    expect(fouten).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `Horizontale overflow op ${pad}`).toBeLessThanOrEqual(1);
  });
}

test("kelderdoorloop: bestaand partijdossier naar bottelformulier", async ({ page }) => {
  await openApp(page, "/kelder/partijen");
  const partij = page
    .locator("a[href^='/kelder/partijen/']")
    .filter({ hasNotText: "Nieuwe partij" });
  await expect(partij.first()).toBeVisible();
  const hrefs = await partij.evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  const href = hrefs.find(
    (link) => link && /^\/kelder\/partijen\/[^/?]+$/.test(link) && !link.endsWith("/nieuw"),
  );
  expect(href, "Er moet een echt bestaand partijdossier zijn; /nieuw telt niet mee").toBeTruthy();
  await page.goto(href!);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.goto(`${href}/bottelen`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Pagina niet gevonden", { exact: true })).toHaveCount(0);
});
