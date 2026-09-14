import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pauze } from "node:timers/promises";

// Geen productie-URL of bestaande database als argument: deze test maakt
// altijd zelf een lege omgeving. Tijdelijke data blijven voor diagnose staan.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const map = await mkdtemp(join(tmpdir(), "tappenmars-kelder-test-"));
const hooks = join(map, "hooks");
await Promise.all(["hooks", "data", "migrations", "public"].map((m) => mkdir(join(map, m))));
for (const naam of ["test.pb.js", "scenario.js", "flessen_logica.js"])
  await copyFile(join(root, "scripts/fixtures/kelder-integratie", naam), join(hooks, naam));
await copyFile(join(root, "pocketbase/pb_hooks/kelder_logica.js"), join(hooks, "kelder_logica.js"));
await copyFile(join(root, "pocketbase/pb_hooks/flessen_logica.js"), join(hooks, "flessen_echt.js"));

const reservering = createServer();
await new Promise((ok, fout) => {
  reservering.once("error", fout);
  reservering.listen(0, "127.0.0.1", ok);
});
const poort = reservering.address().port;
await new Promise((ok) => reservering.close(ok));
const token = randomUUID();
const server = spawn(
  join(root, "pocketbase", process.platform === "win32" ? "pocketbase.exe" : "pocketbase"),
  [
    "serve",
    `--http=127.0.0.1:${poort}`,
    `--dir=${join(map, "data")}`,
    `--hooksDir=${hooks}`,
    `--migrationsDir=${join(map, "migrations")}`,
    `--publicDir=${join(map, "public")}`,
  ],
  { cwd: map, windowsHide: true, env: { ...process.env, KELDER_TEST_TOKEN: token } },
);
let log = "";
server.stdout.on("data", (s) => {
  log = (log + s).slice(-12000);
});
server.stderr.on("data", (s) => {
  log = (log + s).slice(-12000);
});
let startFout;
server.on("error", (e) => {
  startFout = e;
});
const afgesloten = new Promise((ok) => server.once("close", ok));
const basis = `http://127.0.0.1:${poort}`;
try {
  let klaar = false;
  for (let poging = 0; poging < 100; poging++) {
    if (startFout) throw startFout;
    if (server.exitCode !== null) throw new Error(`Testserver stopte: ${log}`);
    try {
      const r = await fetch(`${basis}/api/test/ready`, { signal: AbortSignal.timeout(1000) });
      klaar = r.ok && (await r.json()).token === token;
    } catch {
      /* Server is nog aan het opstarten. */
    }
    if (klaar) break;
    await pauze(200);
  }
  assert(klaar, `Geïsoleerde testserver niet klaar: ${log}`);
  const response = await fetch(`${basis}/api/test/run`, {
    method: "POST",
    headers: { "X-Test-Token": token },
    signal: AbortSignal.timeout(30000),
  });
  const resultaat = await response.json();
  assert.equal(response.status, 200, JSON.stringify(resultaat));
  assert.equal(resultaat.ok, true);
  console.log(JSON.stringify(resultaat, null, 2));
} finally {
  server.kill();
  await Promise.race([afgesloten, pauze(10000)]);
  if (server.exitCode === null && server.signalCode === null)
    throw new Error(`Testserver ${server.pid} sluit niet af; controleer dit proces.`);
  console.log(`Uitsluitend synthetische testdata: ${map}`);
}
