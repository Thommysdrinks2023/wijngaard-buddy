// Fase 11 Blok 1 — genereert een volledig fictief seizoen met realistische
// volumes voor De Tappenmars, om de app te testen onder een datavolume dat
// lijkt op een echt jaar (tot nu toe is alles getest met een handvol records).
//
// MARKERING: elk gegenereerd record krijgt vineyard_id = "SEED-FASE11".
// Dat veld bestaat op álle datacollecties (multi-tenant-voorbereiding) en
// wordt door de app nergens gefilterd, dus het is een veilige, volledige
// en niet-storende markering. --cleanup verwijdert exact die records en
// verifieert daarna dat er niets achterblijft, inclusief tankcaches.
//
// Gebruik:
//   node scripts/seed-seizoen.mjs <url> <admin-email> <admin-wachtwoord>
//   node scripts/seed-seizoen.mjs <url> <admin-email> <admin-wachtwoord> --cleanup
//
// Superuser is nodig: tankboek/bottelrondes/voorraad hebben createRule: null
// (alleen hooks mogen schrijven). Na het seeden van tankboekregels roept het
// script /api/tappenmars/tanks-herbereken aan zodat de tankcaches kloppen —
// precies zoals de hook dat in productie zou doen.

const [, , urlArg, email, wachtwoord, ...rest] = process.argv;
const PB = urlArg || "http://127.0.0.1:8090";
const CLEANUP = rest.includes("--cleanup");
const MARKER = "SEED-FASE11";
const PREFIX = "[SEED-F11]";

if (!email || !wachtwoord) {
  console.error("Gebruik: node scripts/seed-seizoen.mjs <url> <admin-email> <admin-wachtwoord> [--cleanup]");
  process.exit(1);
}

let token = "";
async function api(pad, opties = {}) {
  const res = await fetch(`${PB}${pad}`, {
    ...opties,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
      ...opties.headers,
    },
    body: opties.body ? JSON.stringify(opties.body) : undefined,
  });
  if (!res.ok) {
    const tekst = await res.text();
    const e = new Error(`${opties.method || "GET"} ${pad}: ${res.status} ${tekst}`);
    e.status = res.status;
    throw e;
  }
  return res.status === 204 ? null : res.json();
}

// ---------- deterministische pseudo-random (reproduceerbare seed) ----------
let zaad = 20260724;
function rnd() {
  zaad = (zaad * 1103515245 + 12345) & 0x7fffffff;
  return zaad / 0x7fffffff;
}
const kies = (arr) => arr[Math.floor(rnd() * arr.length)];
const tussen = (a, b) => a + rnd() * (b - a);
const rond = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const geheel = (a, b) => Math.floor(tussen(a, b + 1));

function datum(maand, dag) {
  return `2026-${String(maand).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
}
// verdeelt n records over een periode (maand a t/m maand b)
function spreidDatums(n, maandVan, maandTot) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const m = geheel(maandVan, maandTot);
    out.push(datum(m, geheel(1, 28)));
  }
  return out.sort();
}

// beperkte parallelliteit: sneller dan sequentieel, zonder de server te overspoelen
async function inBatches(items, grootte, fn) {
  let klaar = 0;
  for (let i = 0; i < items.length; i += grootte) {
    await Promise.all(items.slice(i, i + grootte).map(fn));
    klaar += Math.min(grootte, items.length - i);
    process.stdout.write(`\r    ${klaar}/${items.length}`);
  }
  process.stdout.write("\n");
}

async function alleRecords(collectie, filter = "") {
  const uit = [];
  let page = 1;
  for (;;) {
    const q = `?page=${page}&perPage=500${filter ? `&filter=${encodeURIComponent(filter)}` : ""}`;
    const j = await api(`/api/collections/${collectie}/records${q}`);
    uit.push(...(j.items || []));
    if (page >= (j.totalPages || 1)) break;
    page++;
  }
  return uit;
}

// ============================= CLEANUP =============================
const SEED_COLLECTIES = [
  "metingen", "observaties", "fenologie", "gezondheid", "oogst",
  "analyses", "kelderlog", "tankboek", "voorraad_mutaties",
  "voorraad_flessen", "bottelrondes", "orders", "klanten", "partijen",
];

async function cleanup() {
  console.log(`Opruimen van alle records met vineyard_id = "${MARKER}"...\n`);
  let totaal = 0;
  for (const col of SEED_COLLECTIES) {
    const recs = await alleRecords(col, `vineyard_id = "${MARKER}"`);
    if (recs.length === 0) {
      console.log(`  ${col}: niets te verwijderen`);
      continue;
    }
    console.log(`  ${col}: ${recs.length} verwijderen`);
    await inBatches(recs, 10, (r) =>
      api(`/api/collections/${col}/records/${r.id}`, { method: "DELETE" }),
    );
    totaal += recs.length;
  }

  // Tankcaches terugzetten: het tankboek is nu weer leeg voor deze partijen,
  // dus laat de server de volumes/statussen opnieuw afleiden uit wat er nog is.
  console.log("\n  Tankcaches herberekenen uit het resterende tankboek...");
  const herb = await api("/api/tappenmars/tanks-herbereken", { method: "POST", body: {} });
  console.log(`  ✓ ${herb.tanks_bijgewerkt} tanks bijgewerkt`);

  // Verificatie: is alles echt weg?
  console.log("\nVerificatie:");
  let rest = 0;
  for (const col of SEED_COLLECTIES) {
    const over = await alleRecords(col, `vineyard_id = "${MARKER}"`);
    if (over.length > 0) {
      console.log(`  ✗ ${col}: ${over.length} records BLIJVEN OVER`);
      rest += over.length;
    }
  }
  const tanks = await alleRecords("tanks");
  const bezet = tanks.filter((t) => t.huidig_volume_l > 0 || t.status === "in_gebruik");
  console.log(`  tanks in gebruik na opruimen: ${bezet.length}`);
  bezet.forEach((t) => console.log(`    tank ${t.code}: ${t.huidig_volume_l} L (${t.status})`));

  if (rest === 0) {
    console.log(`\n✅ Opruimen compleet: ${totaal} records verwijderd, 0 achtergebleven.`);
  } else {
    console.log(`\n❌ LET OP: ${rest} records niet verwijderd.`);
    process.exit(1);
  }
}

// ============================= SEED =============================
async function seed() {
  console.log("Seizoen 2026 seeden (fictief, gemarkeerd als SEED-FASE11)...\n");
  const t0 = Date.now();

  const rijen = await alleRecords("rijen");
  if (rijen.length === 0) throw new Error("Geen rijen gevonden — draai eerst setup-pocketbase.mjs.");
  const tanks = (await alleRecords("tanks")).filter((t) => t.capaciteit_l > 0);
  const producenten = await alleRecords("producenten");
  const producent = producenten[0]?.id || "";
  console.log(`  basis: ${rijen.length} rijen, ${tanks.length} bruikbare tanks\n`);

  const V = { vineyard_id: MARKER };
  const INVOERDERS = ["Thomas", "Invoerder 1", "Invoerder 2"];

  // ---------- metingen (~400, april–oktober; brix loopt op door het seizoen)
  console.log("  metingen (400)");
  const metingDatums = spreidDatums(400, 4, 10);
  await inBatches(metingDatums, 12, (d) => {
    const rij = kies(rijen);
    const maand = Number(d.slice(5, 7));
    // brix loopt realistisch op van ~5 (juli) naar ~22 (oktober)
    const brix = maand <= 6 ? 0 : rond(tussen(4 + (maand - 7) * 5, 8 + (maand - 7) * 5), 1);
    return api("/api/collections/metingen/records", {
      method: "POST",
      body: {
        ...V,
        rij: rij.id,
        datum: d,
        seizoen: 2026,
        brix: brix > 0 ? Math.min(brix, 24) : 0,
        ph: rond(tussen(2.9, 3.6), 2),
        zuurgraad: rond(tussen(5, 14), 1),
        rijpheid_score: geheel(1, 5),
        temperatuur: rond(tussen(8, 30), 1),
        neerslag: kies(["Geen", "Geen", "Geen", "Lichte regen", "Matige regen", "Zware regen"]),
        ingevoerd_door: kies(INVOERDERS),
        notitie: `${PREFIX} routinemeting`,
      },
    });
  });

  // ---------- observaties (~150, april–november)
  console.log("  observaties (150)");
  const obsDatums = spreidDatums(150, 4, 11);
  await inBatches(obsDatums, 12, (d) =>
    api("/api/collections/observaties/records", {
      method: "POST",
      body: {
        ...V,
        rij: kies(rijen).id,
        datum: d,
        seizoen: 2026,
        type: kies(["gezond", "gezond", "groei", "ziekte", "schade", "uitval", "anders"]),
        notitie: `${PREFIX} ${kies(["valse meeldauw gezien", "bladluis", "goede stand", "hagelschade", "stok dood", "wildvraat"])}`,
        ingevoerd_door: kies(INVOERDERS),
      },
    }),
  );

  // ---------- fenologie (alle 5 momenten × alle 7 rassen, meerdere rijen)
  console.log("  fenologie");
  const MOMENTEN = [
    ["Knopbreek", 4], ["Bloei", 6], ["Zetting", 7], ["Véraison", 8], ["Oogstrijp", 9],
  ];
  const fenoTaken = [];
  for (const [moment, maand] of MOMENTEN) {
    for (const rij of rijen.filter((_, i) => i % 5 === 0)) {
      fenoTaken.push({ moment, maand, rij });
    }
  }
  await inBatches(fenoTaken, 12, (t) =>
    api("/api/collections/fenologie/records", {
      method: "POST",
      body: {
        ...V,
        rij: t.rij.id,
        ras: t.rij.ras,
        moment: t.moment,
        datum: datum(t.maand, geheel(1, 28)),
        seizoen: 2026,
        notitie: `${PREFIX} ${t.moment.toLowerCase()} waargenomen`,
        ingevoerd_door: kies(INVOERDERS),
      },
    }),
  );

  // ---------- gezondheid (winter/vroege voorjaarsmetingen)
  console.log("  gezondheid (60)");
  const gezTaken = rijen.filter((_, i) => i % 1.15 < 1).slice(0, 60);
  await inBatches(gezTaken, 12, (rij) =>
    api("/api/collections/gezondheid/records", {
      method: "POST",
      body: {
        ...V,
        rij: rij.id,
        datum: datum(geheel(2, 4), geheel(1, 28)),
        seizoen: 2026,
        vigor: geheel(1, 5),
        snoeigewicht: rond(tussen(0.3, 1.8), 2),
        dode_planten: geheel(0, 3),
        korte_scheuten: geheel(0, 8),
        notitie: `${PREFIX} wintercontrole`,
        ingevoerd_door: kies(INVOERDERS),
      },
    }),
  );

  // ---------- partijen (8) + oogst gekoppeld
  console.log("  partijen (8) + oogst");
  const RAS_PARTIJ = [
    ["Souvignier Gris", "wit"], ["Johanniter", "wit"], ["Muscaris", "wit"],
    ["Chardonnay", "wit"], ["Pinot Noir", "rood"], ["Regent", "rood"],
    ["Pinotin", "rood"], ["Souvignier Gris", "rosé"],
  ];
  const partijen = [];
  for (let i = 0; i < RAS_PARTIJ.length; i++) {
    const [ras, type] = RAS_PARTIJ[i];
    const startVol = geheel(400, 1400);
    const oe = geheel(68, 92);
    const p = await api("/api/collections/partijen/records", {
      method: "POST",
      body: {
        ...V,
        naam: `${PREFIX} ${ras} 2026-${i + 1}`,
        jaargang: 2026,
        type,
        status: i < 4 ? "gebotteld" : kies(["gisting", "opvoeding", "klaar_voor_botteling"]),
        samenstelling: `100% ${ras}`,
        start_volume_l: startVol,
        producent,
        opdracht_type: "eigen_wijn",
        lotnummer: `L26-F11-${String(i + 1).padStart(2, "0")}`,
        pers_datum: datum(9, geheel(5, 28)),
        gist: kies(["Oenoferm Freddo", "Lalvin QA23", "Uvaferm 43", "spontaan"]),
        start_dichtheid_oechsle: oe,
        start_dichtheid_brix: rond(261.3 * (1 - 1 / (1 + oe / 1000)), 1),
        start_dichtheid_sg: rond(1 + oe / 1000, 4),
        notitie: `${PREFIX} testpartij seizoen 2026`,
      },
    });
    partijen.push({ ...p, ras, startVol });
  }

  // oogstregels: 3–6 rijen per partij
  const oogstTaken = [];
  for (const p of partijen) {
    const rijenVanRas = rijen.filter((r) => r.ras === p.ras);
    for (const rij of rijenVanRas.slice(0, geheel(3, 6))) {
      oogstTaken.push({ p, rij });
    }
  }
  await inBatches(oogstTaken, 12, (t) =>
    api("/api/collections/oogst/records", {
      method: "POST",
      body: {
        ...V,
        rij: t.rij.id,
        ras: t.p.ras,
        datum: t.p.pers_datum,
        seizoen: 2026,
        kg: rond(tussen(35, 180), 1),
        partij: t.p.id,
        notitie: `${PREFIX} pluk`,
        ingevoerd_door: kies(INVOERDERS),
      },
    }),
  );

  // ---------- tankboek (~200) met kloppende volumeboekhouding per partij
  console.log("  tankboek (~200)");
  const tankboekRegels = [];
  let tankIdx = 0;
  for (const p of partijen) {
    const tankA = tanks[tankIdx++ % tanks.length];
    const tankB = tanks[tankIdx++ % tanks.length];
    const vol = Math.min(p.startVol, tankA.capaciteit_l, tankB.capaciteit_l);
    const basis = { partij: p.id, producent, verantwoordelijke: kies(INVOERDERS) };
    // 1. vullen
    tankboekRegels.push({ ...basis, actie: "vullen", naar_tank: tankA.id, volume_l: vol, datum: p.pers_datum, notitie: `${PREFIX} most naar tank` });
    // 2. toevoegingen (geen volume-effect)
    for (let i = 0; i < 4; i++) {
      tankboekRegels.push({ ...basis, actie: "toevoeging", naar_tank: tankA.id, volume_l: 0, datum: datum(9, geheel(10, 28)), middel: kies(["KMS", "Bentoniet", "Gistvoeding", "Pectolytisch enzym"]), dosering: `${geheel(2, 30)} g/hL`, notitie: `${PREFIX} toevoeging` });
    }
    // 3. monsters (kleine afname)
    for (let i = 0; i < 3; i++) {
      tankboekRegels.push({ ...basis, actie: "monster", van_tank: tankA.id, volume_l: 0.5, datum: datum(10, geheel(1, 28)), notitie: `${PREFIX} monster voor analyse` });
    }
    // 4. overheveling naar tank B
    const naB = rond(vol - 8, 1);
    tankboekRegels.push({ ...basis, actie: "overhevelen", van_tank: tankA.id, naar_tank: tankB.id, volume_l: naB, datum: datum(11, geheel(1, 20)), notitie: `${PREFIX} van droesem` });
    // 5. nazorg op B
    for (let i = 0; i < 5; i++) {
      tankboekRegels.push({ ...basis, actie: kies(["toevoeging", "monster"]), van_tank: tankB.id, naar_tank: tankB.id, volume_l: 0.5, datum: datum(11, geheel(20, 28)), notitie: `${PREFIX} nazorg` });
    }
    // 6. verlies
    tankboekRegels.push({ ...basis, actie: "verlies", van_tank: tankB.id, volume_l: rond(tussen(1, 6), 1), datum: datum(12, geheel(1, 10)), notitie: `${PREFIX} verdamping/droesem` });
    p.tankA = tankA;
    p.tankB = tankB;
    p.volInB = naB;
  }
  // opvullen tot ~200 met extra monsters
  while (tankboekRegels.length < 200) {
    const p = kies(partijen);
    tankboekRegels.push({ partij: p.id, producent, verantwoordelijke: kies(INVOERDERS), actie: "monster", van_tank: p.tankB.id, volume_l: 0.2, datum: datum(geheel(10, 12), geheel(1, 28)), notitie: `${PREFIX} extra monster` });
  }
  await inBatches(tankboekRegels, 10, (r) =>
    api("/api/collections/tankboek/records", { method: "POST", body: { ...V, ...r, tijd: `${String(geheel(8, 18)).padStart(2, "0")}:${kies(["00", "15", "30", "45"])}` } }),
  );

  // ---------- analyses (~60)
  console.log("  analyses (60)");
  const analyseTaken = [];
  for (const p of partijen) for (let i = 0; i < 8; i++) analyseTaken.push({ p, i });
  await inBatches(analyseTaken.slice(0, 60), 10, (t) => {
    const oe = Math.max(0, t.p.start_dichtheid_oechsle - t.i * 11);
    return api("/api/collections/analyses/records", {
      method: "POST",
      body: {
        ...V,
        datum: datum(geheel(9, 12), geheel(1, 28)),
        partij: t.p.id,
        tank: t.p.tankB.id,
        dichtheid_oechsle: oe,
        dichtheid_brix: rond(261.3 * (1 - 1 / (1 + oe / 1000)), 1),
        dichtheid_sg: rond(1 + oe / 1000, 4),
        ph: rond(tussen(3.0, 3.7), 2),
        alcohol_pct: rond(tussen(0, 13), 1),
        restsuiker_g_l: rond(tussen(0, 90), 1),
        totaalzuur_g_l: rond(tussen(4, 11), 1),
        so2_vrij: geheel(10, 40),
        so2_totaal: geheel(40, 130),
        methode: kies(["eigen_meting", "eigen_meting", "extern_lab"]),
        notitie: `${PREFIX} analyse`,
        ingevoerd_door: kies(INVOERDERS),
      },
    });
  });

  // ---------- kelderlog (~100)
  console.log("  kelderlog (100)");
  const KL_ACTIES = ["ontstelen", "persen", "gisting_start", "roeren", "overhevelen", "filtreren", "klaring", "toevoeging", "koeling", "proeven", "reiniging"];
  const klTaken = Array.from({ length: 100 }, () => kies(partijen));
  await inBatches(klTaken, 10, (p) =>
    api("/api/collections/kelderlog/records", {
      method: "POST",
      body: {
        ...V,
        datum: datum(geheel(9, 12), geheel(1, 28)),
        partij: p.id,
        tank: p.tankB.id,
        actie: kies(KL_ACTIES),
        middel: kies(["", "", "KMS", "Bentoniet"]),
        hoeveelheid: rond(tussen(0, 50), 1),
        eenheid: kies(["g", "kg", "ml", "l", "g_hl"]),
        notitie: `${PREFIX} kelderwerk`,
        ingevoerd_door: kies(INVOERDERS),
      },
    }),
  );

  // ---------- bottelrondes (4) + voorraad + mutaties
  console.log("  bottelrondes (4) + voorraad + mutaties");
  const gebotteld = partijen.slice(0, 4);
  const voorraden = [];
  for (const p of gebotteld) {
    const flessen = Math.floor((p.volInB * 0.95) / 0.75);
    const br = await api("/api/collections/bottelrondes/records", {
      method: "POST",
      body: {
        ...V,
        partij: p.id, producent, van_tank: p.tankB.id,
        botteldatum: datum(12, geheel(10, 20)),
        aantal_flessen: flessen, flesinhoud_ml: 750,
        flestype: "Bordeaux", kleur_fles: kies(["groen", "bruin"]),
        parelwijn: false, lotnummer: p.lotnummer,
        notities: `${PREFIX} bottelronde`, ingevoerd_door: kies(INVOERDERS),
      },
    });
    // bijbehorende tankboek-botteling zodat de tank leegloopt
    await api("/api/collections/tankboek/records", {
      method: "POST",
      body: { ...V, partij: p.id, producent, actie: "botteling", van_tank: p.tankB.id, volume_l: rond(flessen * 0.75, 1), datum: br.botteldatum, verantwoordelijke: kies(INVOERDERS), notitie: `${PREFIX} gebotteld` },
    });
    const vr = await api("/api/collections/voorraad_flessen/records", {
      method: "POST",
      body: {
        ...V,
        bottelronde: br.id, partij: p.id, producent,
        wijnnaam: p.naam.replace(PREFIX + " ", ""), jaargang: 2026,
        aantal_beginvoorraad: flessen, aantal_huidig: flessen,
        locatie: `${PREFIX} stelling ${geheel(1, 6)}`, status: "op_voorraad",
      },
    });
    voorraden.push({ ...vr, flessen });
  }

  // voorraadmutaties: verkoop/eigen gebruik/breuk
  const mutTaken = [];
  for (const v of voorraden) {
    for (let i = 0; i < 8; i++) {
      const type = kies(["verkocht", "verkocht", "verkocht", "eigen_gebruik", "kapot", "weggegeven"]);
      mutTaken.push({ v, type, aantal: -geheel(1, 12) });
    }
  }
  await inBatches(mutTaken, 10, (t) =>
    api("/api/collections/voorraad_mutaties/records", {
      method: "POST",
      body: {
        ...V,
        voorraad: t.v.id, mutatie_type: t.type, aantal: t.aantal,
        datum: datum(12, geheel(15, 28)),
        afnemer_of_reden: `${PREFIX} ${kies(["wijnwinkel Den Ham", "restaurant De Linde", "proeverij", "eigen gebruik", "gebroken bij transport"])}`,
        ingevoerd_door: kies(INVOERDERS),
        notities: `${PREFIX} mutatie`,
      },
    }),
  );
  // aantal_huidig bijwerken zodat de cache klopt met de mutaties
  for (const v of voorraden) {
    const muts = await alleRecords("voorraad_mutaties", `voorraad = "${v.id}"`);
    const saldo = v.flessen + muts.reduce((a, m) => a + m.aantal, 0);
    await api(`/api/collections/voorraad_flessen/records/${v.id}`, {
      method: "PATCH",
      body: { aantal_huidig: Math.max(0, saldo), status: saldo > 0 ? "op_voorraad" : "uitverkocht" },
    });
  }

  // ---------- klanten (6) + orders (10)
  console.log("  klanten (6) + orders (10)");
  const klanten = [];
  for (const [naam, type] of [
    ["Wijnwinkel Den Ham", "winkel"], ["Restaurant De Linde", "horeca"],
    ["Slijterij Overijssel", "winkel"], ["Fam. Jansen", "particulier"],
    ["Wijnfestival Twente", "evenement"], ["Café De Druif", "horeca"],
  ]) {
    klanten.push(await api("/api/collections/klanten/records", {
      method: "POST",
      body: { ...V, naam: `${PREFIX} ${naam}`, type, contact: "test@voorbeeld.nl", notities: `${PREFIX} testklant` },
    }));
  }
  for (let i = 0; i < 10; i++) {
    const v = kies(voorraden);
    await api("/api/collections/orders/records", {
      method: "POST",
      body: {
        ...V,
        klant: kies(klanten).id,
        datum: datum(12, geheel(18, 28)),
        regels: [{ voorraad: v.id, aantal: geheel(6, 24), prijs: geheel(9, 18) }],
        status: kies(["concept", "concept", "geleverd"]),
        notities: `${PREFIX} testorder`,
        ingevoerd_door: kies(INVOERDERS),
      },
    });
  }

  // ---------- tankcaches synchroniseren (zoals de hook in productie doet)
  console.log("\n  Tankcaches herberekenen uit het tankboek...");
  const herb = await api("/api/tappenmars/tanks-herbereken", { method: "POST", body: {} });
  console.log(`  ✓ ${herb.tanks_bijgewerkt} tanks bijgewerkt`);

  // ---------- eindtelling
  console.log("\nResultaat:");
  let totaal = 0;
  for (const col of SEED_COLLECTIES) {
    const n = (await alleRecords(col, `vineyard_id = "${MARKER}"`)).length;
    totaal += n;
    console.log(`  ${col.padEnd(20)} ${n}`);
  }
  console.log(`\n✅ ${totaal} records geseed in ${Math.round((Date.now() - t0) / 1000)}s.`);
  console.log(`   Opruimen: node scripts/seed-seizoen.mjs ${PB} <email> <ww> --cleanup`);
}

// ============================= MAIN =============================
const auth = await api("/api/collections/_superusers/auth-with-password", {
  method: "POST",
  body: { identity: email, password: wachtwoord },
});
token = auth.token;
console.log(`✓ ingelogd op ${PB}\n`);

if (CLEANUP) await cleanup();
else await seed();
