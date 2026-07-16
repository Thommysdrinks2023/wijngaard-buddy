// Gedeelde logica voor de AI-agent. Wordt via require() BINNEN elke handler
// geladen (JSVM-eigenaardigheid, zie kelder_logica.js/CLAUDE.md): top-level
// functies in *.pb.js-bestanden bestaan niet in de executor-VM's.

const MODEL = "claude-sonnet-5";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const MAX_TOOL_ITERATIES = 10;
const MAX_GESCHIEDENIS_BERICHTEN = 30;
const MAX_TOKENS = 2048; // Sonnet 5-tokenizer produceert ~30% meer tokens dan voorheen
const MAX_WEB_SEARCHES = 3; // Blok F: begrenst kosten/latency per beurt

// ============= Kleine hulpjes =============

function vandaagStr() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

// Handgeschreven base64-encoder: de JSVM (goja) heeft geen Buffer/btoa voor
// byte-arrays. $http.send() geeft de body terug als Array<number> (0-255).
function bytesNaarBase64(bytes) {
  const tabel = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : null;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : null;
    out += tabel[b0 >> 2];
    out += tabel[((b0 & 3) << 4) | (b1 === null ? 0 : b1 >> 4)];
    out += b1 === null ? "=" : tabel[((b1 & 15) << 2) | (b2 === null ? 0 : b2 >> 6)];
    out += b2 === null ? "=" : tabel[b2 & 63];
  }
  return out;
}

// °Oe <-> Brix <-> SG, zelfde SG-gebaseerde formule als src/lib/dichtheid.ts
// (bewust gedupliceerd: JSVM kan geen TS/ES-modules uit src/lib importeren).
function dichtheidVanOechsle(oe) {
  const sg = 1 + oe / 1000;
  const brix = 261.3 * (1 - 1 / sg);
  return { oechsle: round1(oe), brix: round1(brix), sg: round(sg, 4) };
}
function dichtheidVanBrix(brix) {
  const sg = 261.3 / (261.3 - brix);
  const oechsle = (sg - 1) * 1000;
  return { oechsle: round1(oechsle), brix: round1(brix), sg: round(sg, 4) };
}
function round(n, d) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
function round1(n) {
  return round(n, 1);
}

// ============= Resolvers: natuurlijke taal -> record-id's =============

function vindPartij(app, zoekterm) {
  if (!zoekterm) return null;
  try {
    return app.findFirstRecordByFilter("partijen", "naam ~ {:z} || lotnummer ~ {:z}", {
      z: zoekterm,
    });
  } catch (e) {
    return null;
  }
}

function vindTank(app, code) {
  if (!code) return null;
  // "tank 16", "Tank 16", "16" -> "16"
  const schoon = String(code).replace(/tank/i, "").trim();
  try {
    return app.findFirstRecordByFilter("tanks", "code = {:c}", { c: schoon });
  } catch (e) {
    return null;
  }
}

function vindRij(app, rijnummer) {
  if (rijnummer == null) return null;
  try {
    return app.findFirstRecordByFilter("rijen", "rijnummer = {:r}", { r: Number(rijnummer) });
  } catch (e) {
    return null;
  }
}

function vindMaterieel(app, naam) {
  if (!naam) return null;
  try {
    return app.findFirstRecordByFilter("materieel", "naam ~ {:n}", { n: naam });
  } catch (e) {
    return null;
  }
}

function vindKlant(app, naam) {
  if (!naam) return null;
  try {
    return app.findFirstRecordByFilter("klanten", "naam ~ {:n}", { n: naam });
  } catch (e) {
    return null;
  }
}

// Fase 4: net als partij_detail zoekt dit op leesbare tekst (wijnnaam), nooit
// op een kaal PocketBase-record-id — de agent kent geen id's uit vrije tekst.
function vindVoorraad(app, wijnnaam, jaargang) {
  if (!wijnnaam) return null;
  try {
    if (jaargang) {
      return app.findFirstRecordByFilter("voorraad_flessen", "wijnnaam ~ {:w} && jaargang = {:j}", {
        w: wijnnaam,
        j: Number(jaargang),
      });
    }
    return app.findFirstRecordByFilter("voorraad_flessen", "wijnnaam ~ {:w}", { w: wijnnaam });
  } catch (e) {
    return null;
  }
}

// ============= Tool-registry (H2, ARCHITECTURE.md §6.3) =============
// Eén array per module; een nieuwe module toevoegen = hier één blok bijzetten
// (+ de bijbehorende handlers in agent_uitvoering.js). bouwTools(), LEES_TOOLS
// en SCHRIJF_TOOL_INFO worden hieruit afgeleid — geen chirurgie in de
// hoofdlus. Elke entry heeft óf { lezen: true } (direct uitvoerbare lees-tool)
// óf { actie_type: "..." } (schrijf-tool die een bevestigbaar voorstel wordt),
// plus het letterlijke Anthropic-toolschema.

const KELDER_TOOLS = [
  {
    lezen: true,
    schema: {
      name: "zoek_partijen",
      description: "Zoek partijen op producent, ras/type, status of lotnummer.",
      input_schema: {
        type: "object",
        properties: {
          zoekterm: { type: "string", description: "Naam, lotnummer of ras (vrij zoeken)" },
          status: {
            type: "string",
            enum: [
              "most",
              "gisting",
              "opvoeding",
              "klaar_voor_botteling",
              "gebotteld",
              "afgevoerd",
            ],
          },
          jaargang: { type: "integer" },
        },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "partij_detail",
      description:
        "Volledige details van één partij: basisgegevens, laatste analyses, tankboek-historie, huidige tank.",
      input_schema: {
        type: "object",
        properties: { partij: { type: "string", description: "Naam of lotnummer van de partij" } },
        required: ["partij"],
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "zoek_tanks",
      description: "Zoek tanks op code, status, locatie of inhoud.",
      input_schema: {
        type: "object",
        properties: {
          code: { type: "string" },
          status: { type: "string", enum: ["leeg", "in_gebruik", "reiniging", "defect"] },
          locatie: { type: "string" },
        },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "zoek_kelderlog",
      description:
        "Werklogboek van de kelder (roeren, filtreren, klaring, toevoegingen, proeven, ...) op partij, tank, actie en/of periode. Compacte samenvatting per regel.",
      input_schema: {
        type: "object",
        properties: {
          partij: { type: "string", description: "Naam of lotnummer" },
          tank: { type: "string", description: "Tankcode, bv. '16'" },
          actie: {
            type: "string",
            enum: [
              "ontstelen",
              "persen",
              "voorklaren",
              "gisting_start",
              "gisting_einde",
              "roeren",
              "overhevelen",
              "filtreren",
              "klaring",
              "toevoeging",
              "koeling",
              "proeven",
              "reiniging",
              "botteling",
              "overig",
            ],
          },
          van: { type: "string", description: "yyyy-MM-dd" },
          tot: { type: "string", description: "yyyy-MM-dd" },
        },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "zoek_tankboek",
      description: "Mutatiehistorie uit het tankboek, op tank, partij en/of periode.",
      input_schema: {
        type: "object",
        properties: {
          tank: { type: "string", description: "Tankcode, bv. '16'" },
          partij: { type: "string", description: "Naam of lotnummer" },
          van: { type: "string" },
          tot: { type: "string" },
        },
      },
    },
  },
  {
    actie_type: "tankboek_boeking",
    schema: {
      name: "stel_tankboek_boeking_voor",
      description:
        "Stel een tankboek-boeking voor (vullen, overhevelen, toevoeging, monster, botteling, verlies, correctie). Wordt NOOIT direct uitgevoerd - altijd eerst een voorstel dat Thomas bevestigt.",
      input_schema: {
        type: "object",
        properties: {
          actie: {
            type: "string",
            enum: [
              "vullen",
              "overhevelen",
              "toevoeging",
              "monster",
              "botteling",
              "verlies",
              "correctie",
              "overig",
            ],
          },
          partij: { type: "string", description: "Naam of lotnummer van de partij" },
          van_tank: {
            type: "string",
            description: "Tankcode van de brontank, indien van toepassing",
          },
          naar_tank: {
            type: "string",
            description: "Tankcode van de doeltank, indien van toepassing",
          },
          volume_l: { type: "number" },
          notitie: { type: "string" },
          datum: { type: "string", description: "yyyy-MM-dd, standaard vandaag" },
        },
        required: ["actie", "partij", "volume_l"],
      },
    },
  },
  {
    actie_type: "kelderlog",
    schema: {
      name: "stel_kelderlog_voor",
      description:
        "Stel een kelderlogregel voor (werkzaamheid zonder per se een volume-effect: roeren, filtreren, klaring, proeven, reiniging, ...).",
      input_schema: {
        type: "object",
        properties: {
          partij: { type: "string" },
          taak_type: {
            type: "string",
            enum: [
              "ontstelen",
              "persen",
              "voorklaren",
              "gisting_start",
              "gisting_einde",
              "roeren",
              "overhevelen",
              "filtreren",
              "klaring",
              "toevoeging",
              "koeling",
              "proeven",
              "reiniging",
              "botteling",
              "overig",
            ],
          },
          beschrijving: { type: "string" },
        },
        required: ["partij", "taak_type", "beschrijving"],
      },
    },
  },
  {
    actie_type: "analyse",
    schema: {
      name: "stel_analyse_voor",
      description:
        "Stel een wijnanalyse voor een partij voor. Geef dichtheid als oechsle OF brix (niet beide nodig) - de conversie gebeurt automatisch.",
      input_schema: {
        type: "object",
        properties: {
          partij: { type: "string" },
          oechsle: { type: "number" },
          brix: { type: "number" },
          ph: { type: "number" },
          alcohol_pct: { type: "number" },
          restsuiker_g_l: { type: "number" },
          totaalzuur_g_l: { type: "number" },
          vluchtig_zuur_g_l: { type: "number" },
          so2_vrij: { type: "number" },
          so2_totaal: { type: "number" },
        },
        required: ["partij"],
      },
    },
  },
];

const WIJNGAARD_TOOLS = [
  {
    lezen: true,
    schema: {
      name: "zoek_metingen",
      description: "Wijngaardmetingen (Brix/°Oe, pH, zuurgraad) op ras, rijnummer en/of periode.",
      input_schema: {
        type: "object",
        properties: {
          ras: { type: "string" },
          rijnummer: { type: "integer" },
          van: { type: "string", description: "yyyy-MM-dd" },
          tot: { type: "string", description: "yyyy-MM-dd" },
        },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "zoek_observaties",
      description:
        "Wijngaardobservaties (ziekte, schade, uitval, groei, ...) op ras, rij, type en/of periode.",
      input_schema: {
        type: "object",
        properties: {
          ras: { type: "string" },
          rijnummer: { type: "integer" },
          type: {
            type: "string",
            enum: ["gezond", "groei", "ziekte", "schade", "uitval", "anders"],
          },
          van: { type: "string" },
          tot: { type: "string" },
        },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "zoek_oogst",
      description: "Oogstrecords op ras en/of jaar.",
      input_schema: {
        type: "object",
        properties: { ras: { type: "string" }, jaar: { type: "integer" } },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "zoek_fenologie",
      description:
        "Fenologiemomenten (knopbreek, bloei, zetting, veraison, oogstrijp) op ras en/of jaar, ook jaar-op-jaar.",
      input_schema: {
        type: "object",
        properties: { ras: { type: "string" }, jaar: { type: "integer" } },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "zoek_bodem",
      description:
        "Bodemobservaties (vocht, pH-veldmeting, structuur, gebreksverschijnselen) op rij en/of periode.",
      input_schema: {
        type: "object",
        properties: {
          rijnummer: { type: "integer" },
          van: { type: "string", description: "yyyy-MM-dd" },
          tot: { type: "string", description: "yyyy-MM-dd" },
        },
      },
    },
  },
  {
    actie_type: "observatie",
    schema: {
      name: "stel_observatie_voor",
      description:
        "Stel een wijngaardobservatie voor (ziekte, schade, groei, gezond, anders) voor een specifieke rij/plant.",
      input_schema: {
        type: "object",
        properties: {
          rijnummer: { type: "integer" },
          plant: { type: "integer", description: "Plantnummer binnen de rij, optioneel" },
          type: { type: "string", enum: ["gezond", "groei", "ziekte", "schade", "anders"] },
          ernst: { type: "string", description: "Korte inschatting van de ernst, optioneel" },
          beschrijving: { type: "string" },
        },
        required: ["rijnummer", "type", "beschrijving"],
      },
    },
  },
  {
    actie_type: "uitval",
    schema: {
      name: "stel_uitval_voor",
      description: "Stel een uitvalregistratie voor (dode planten) voor een specifieke rij.",
      input_schema: {
        type: "object",
        properties: {
          rijnummer: { type: "integer" },
          aantal: { type: "integer" },
          reden: { type: "string" },
        },
        required: ["rijnummer", "aantal", "reden"],
      },
    },
  },
];

const VOORRAAD_TOOLS = [
  {
    lezen: true,
    schema: {
      name: "zoek_voorraad",
      description:
        "Zoek flessenvoorraad op wijnnaam, jaargang en/of status (op_voorraad/uitverkocht).",
      input_schema: {
        type: "object",
        properties: {
          wijnnaam: { type: "string" },
          jaargang: { type: "integer" },
          status: { type: "string", enum: ["op_voorraad", "uitverkocht"] },
        },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "voorraad_detail",
      description:
        "Volledige details van één wijn op voorraad: aantal huidig/beginvoorraad, herkomst (bottelronde, partij, tank) en mutatiehistorie.",
      input_schema: {
        type: "object",
        properties: {
          wijnnaam: { type: "string", description: "Naam van de wijn, bv. 'Johanniter 2026'" },
          jaargang: { type: "integer" },
        },
        required: ["wijnnaam"],
      },
    },
  },
  {
    actie_type: "bottelronde",
    schema: {
      name: "stel_bottelronde_voor",
      description:
        "Stel een bottelronde voor een partij voor (bottelt vanuit een tank, maakt tankboekregel + voorraadrecord aan). Wordt NOOIT direct uitgevoerd - altijd eerst een voorstel dat Thomas bevestigt.",
      input_schema: {
        type: "object",
        properties: {
          partij: { type: "string", description: "Naam of lotnummer van de partij" },
          van_tank: { type: "string", description: "Tankcode waaruit gebotteld wordt" },
          aantal_flessen: { type: "integer" },
          flesinhoud_ml: { type: "number", description: "bv. 750" },
          flestype: { type: "string" },
          kleur_fles: { type: "string" },
          parelwijn: { type: "boolean" },
          lotnummer: { type: "string", description: "Standaard het lotnummer van de partij" },
          botteldatum: { type: "string", description: "yyyy-MM-dd, standaard vandaag" },
        },
        required: ["partij", "van_tank", "aantal_flessen", "flesinhoud_ml"],
      },
    },
  },
  {
    actie_type: "voorraad_mutatie",
    schema: {
      name: "stel_voorraad_mutatie_voor",
      description:
        "Stel een voorraadmutatie voor (verkocht, eigen gebruik, kapot, weggegeven, correctie). Wordt NOOIT direct uitgevoerd - altijd eerst een voorstel dat Thomas bevestigt.",
      input_schema: {
        type: "object",
        properties: {
          wijnnaam: { type: "string" },
          jaargang: { type: "integer" },
          mutatie_type: {
            type: "string",
            enum: ["verkocht", "eigen_gebruik", "kapot", "weggegeven", "correctie"],
          },
          aantal: {
            type: "integer",
            description:
              "Positief aantal flessen (bij correctie: mag negatief zijn om extra af te boeken)",
          },
          afnemer_of_reden: { type: "string" },
          datum: { type: "string", description: "yyyy-MM-dd, standaard vandaag" },
        },
        required: ["wijnnaam", "mutatie_type", "aantal"],
      },
    },
  },
];

const ALGEMEEN_TOOLS = [
  {
    lezen: true,
    schema: {
      name: "zoek_inzichten",
      description:
        "Eerder berekende patronen (brix-verloop, gistingssnelheid, uitval-clusters, GDD-afwijking, fenologievergelijking).",
      input_schema: {
        type: "object",
        properties: {
          inzicht_type: {
            type: "string",
            enum: [
              "brix_verloop",
              "gisting_snelheid",
              "uitval_cluster",
              "gdd_afwijking",
              "fenologie_vergelijking",
              "spuit_effectiviteit",
            ],
          },
          onderwerp: { type: "string", description: "Ras, rij, partij of tank waar het over gaat" },
        },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "zoek_advies_feedback",
      description:
        "Eerder gegeven adviezen en Thomas' oordeel daarover (klopte/klopte niet/deels), zodat je je eigen track record kent.",
      input_schema: {
        type: "object",
        properties: { onderwerp: { type: "string" } },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "analyseer_foto",
      description:
        "Analyseer de foto uit een specifiek bericht (blad, druif, stok) op gezondheid, verkleuring, vermoede ziekte of rijpheidsindruk.",
      input_schema: {
        type: "object",
        properties: { bericht_id: { type: "string" } },
        required: ["bericht_id"],
      },
    },
  },
];

const VERKOOP_TOOLS = [
  {
    lezen: true,
    schema: {
      name: "zoek_klanten",
      description: "Zoek klanten op naam en/of type (particulier/horeca/winkel/evenement).",
      input_schema: {
        type: "object",
        properties: {
          naam: { type: "string" },
          type: { type: "string", enum: ["particulier", "horeca", "winkel", "evenement"] },
        },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "zoek_orders",
      description:
        "Verkooporders op klantnaam, status (concept/geleverd/betaald) en/of periode; compacte regels met aantallen en bedragen.",
      input_schema: {
        type: "object",
        properties: {
          klant: { type: "string", description: "Klantnaam (vrij zoeken)" },
          status: { type: "string", enum: ["concept", "geleverd", "betaald"] },
          van: { type: "string" },
          tot: { type: "string" },
        },
      },
    },
  },
  {
    actie_type: "order",
    schema: {
      name: "stel_order_voor",
      description:
        "Stel een concept-verkooporder voor (klant + regels met wijn/aantal/prijs per fles). Wordt NOOIT direct uitgevoerd - altijd eerst een voorstel dat Thomas bevestigt. Leveren (voorraad afboeken) gebeurt daarna apart via /verkoop.",
      input_schema: {
        type: "object",
        properties: {
          klant: { type: "string", description: "Klantnaam (moet al bestaan)" },
          regels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                wijn: { type: "string", description: "Wijnnaam uit de voorraad" },
                jaargang: { type: "number" },
                aantal: { type: "number", description: "Aantal flessen" },
                prijs: { type: "number", description: "Prijs per fles in EUR" },
              },
              required: ["wijn", "aantal"],
            },
          },
          notities: { type: "string" },
        },
        required: ["klant", "regels"],
      },
    },
  },
];

const MATERIEEL_TOOLS = [
  {
    lezen: true,
    schema: {
      name: "zoek_materieel",
      description:
        "Machinepark met per machine de laatste onderhoudsregel en de eerstvolgende geplande onderhoudsdatum.",
      input_schema: {
        type: "object",
        properties: { naam: { type: "string" } },
      },
    },
  },
  {
    actie_type: "onderhoud",
    schema: {
      name: "stel_onderhoud_voor",
      description:
        "Stel een onderhoudsregel voor een machine voor (onderhoud/reparatie/keuring). Wordt NOOIT direct uitgevoerd - altijd eerst een voorstel dat Thomas bevestigt.",
      input_schema: {
        type: "object",
        properties: {
          machine: { type: "string", description: "Naam van de machine" },
          type: { type: "string", enum: ["onderhoud", "reparatie", "keuring"] },
          omschrijving: { type: "string" },
          kosten: { type: "number" },
          volgende_keer: { type: "string", description: "yyyy-MM-dd, optioneel" },
        },
        required: ["machine", "type", "omschrijving"],
      },
    },
  },
];

const TOOL_MODULES = {
  kelder: KELDER_TOOLS,
  wijngaard: WIJNGAARD_TOOLS,
  voorraad: VOORRAAD_TOOLS,
  verkoop: VERKOOP_TOOLS,
  materieel: MATERIEEL_TOOLS,
  algemeen: ALGEMEEN_TOOLS,
};

function alleToolDefinities() {
  const alles = [];
  for (const moduleNaam in TOOL_MODULES) {
    const defs = TOOL_MODULES[moduleNaam];
    for (let i = 0; i < defs.length; i++) alles.push(defs[i]);
  }
  return alles;
}

// Afgeleid uit de registry — niet meer met de hand bijhouden.
const LEES_TOOLS = new Set(
  alleToolDefinities()
    .filter(function (d) {
      return d.lezen;
    })
    .map(function (d) {
      return d.schema.name;
    }),
);

const SCHRIJF_TOOL_INFO = {};
for (const def of alleToolDefinities()) {
  if (def.actie_type) SCHRIJF_TOOL_INFO[def.schema.name] = { actie_type: def.actie_type };
}

function bouwTools() {
  const tools = alleToolDefinities().map(function (d) {
    return d.schema;
  });
  // Blok F: Anthropics ingebouwde server-side web-search-tool. Anders dan de
  // tools hierboven wordt deze NIET door onze code uitgevoerd - Anthropic
  // doet de zoekopdracht zelf en levert het resultaat binnen dezelfde
  // aanroep terug als server_tool_use/web_search_tool_result-blokken (zie
  // verwerkBeurt() in agent_uitvoering.js). Wanneer/waarvoor de agent dit
  // wel of niet mag gebruiken staat in Gedragsregel 9 van de systeemprompt.
  tools.push({
    type: "web_search_20250305",
    name: "web_search",
    max_uses: MAX_WEB_SEARCHES,
  });
  return tools;
}

module.exports = {
  MODEL,
  ANTHROPIC_ENDPOINT,
  MAX_TOOL_ITERATIES,
  MAX_GESCHIEDENIS_BERICHTEN,
  MAX_TOKENS,
  MAX_WEB_SEARCHES,
  TOOL_MODULES,
  LEES_TOOLS,
  SCHRIJF_TOOL_INFO,
  vandaagStr,
  bytesNaarBase64,
  dichtheidVanOechsle,
  dichtheidVanBrix,
  round,
  round1,
  vindPartij,
  vindTank,
  vindRij,
  vindVoorraad,
  vindMaterieel,
  vindKlant,
  bouwTools,
};
