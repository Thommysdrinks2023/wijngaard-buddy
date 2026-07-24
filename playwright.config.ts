import { defineConfig, devices } from "@playwright/test";

// Fase 11 Blok 5 — rooktests tegen de PRODUCTIEBUILD, niet de dev-server.
// Reden: bij de prestatiemeting in Blok 1 bleek de dev-server tot 8x langzamer
// en gedraagt hij zich anders (geen SSR-bundel, andere modulelading). Een test
// die alleen op de dev-server groen is, zegt weinig over wat Thomas draait.
//
// De tests gaan ervan uit dat PocketBase draait op 127.0.0.1:8090 (Taakplanner-
// taak "PocketBase Tappenmars"). Draait die niet, dan falen ze — terecht, want
// dan werkt de app ook niet.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // tests delen één PocketBase; volgorde houdt de data voorspelbaar
  forbidOnly: Boolean(process.env.CI),
  retries: 0, // een wisselvallige test is een bevinding, geen ruis om weg te retryen
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "telefoon",
      // Thomas werkt in de wijngaard op zijn telefoon — dat is het formaat
      // waarop de rooktests moeten slagen, niet een breed bureaubladscherm.
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run build && npx vite preview --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
