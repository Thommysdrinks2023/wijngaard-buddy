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
      description: "Zoek partijen op eigenaar, ras/type, status of lotnummer.",
      input_schema: {
        type: "object",
        properties: {
          zoekterm: { type: "string", description: "Naam, lotnummer of ras (vrij zoeken)" },
          eigenaar: {
            type: "string",
            description:
              'Naam of tweecijferige code van de eigenaar, bijv. "Thommy\'s Drinks" of "07".',
          },
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
      description:
        "Oogstrecords op ras, jaar, rijnummer en/of lotnummer. Met lotnummer beantwoordt dit de herkomstvraag: uit welke rijen en hoeveel kg is dit lot opgebouwd.",
      input_schema: {
        type: "object",
        properties: {
          ras: { type: "string" },
          jaar: { type: "integer" },
          rijnummer: { type: "integer" },
          lotnummer: { type: "string", description: "Lotnummer of naam van de partij" },
        },
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
  // Besluit Thomas (26 juli 2026): "de AI-assistent mag over de hele app
  // werkbaar zijn". Onderstaande lees- en schrijftools sluiten de laatste
  // gaten: fenologie, gezondheid, werkuren (incl. de wettelijk verplichte
  // spuitregistratie), bodem en proefnotities.
  {
    lezen: true,
    schema: {
      name: "zoek_gezondheid",
      description:
        "Gezondheidsmetingen per rij (vigor 1-5, snoeigewicht, dode planten, korte scheuten).",
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
    lezen: true,
    schema: {
      name: "zoek_werkuren",
      description:
        "Geregistreerde werkzaamheden en uren, inclusief bespuitingen met middel en wachttijd.",
      input_schema: {
        type: "object",
        properties: {
          taak: { type: "string" },
          rijnummer: { type: "integer" },
          van: { type: "string", description: "yyyy-MM-dd" },
          tot: { type: "string", description: "yyyy-MM-dd" },
        },
      },
    },
  },
  {
    actie_type: "fenologie",
    schema: {
      name: "stel_fenologie_voor",
      description:
        "Leg een fenologisch moment vast voor een rij (knopbreek, bloei, zetting, véraison, " +
        "oogstrijp). Gebruik dit bij 'rij 12 staat in bloei' of 'de johanniter is aan het kleuren'.",
      input_schema: {
        type: "object",
        properties: {
          rijnummer: { type: "integer" },
          moment: {
            type: "string",
            enum: ["Knopbreek", "Bloei", "Zetting", "Véraison", "Oogstrijp"],
          },
          datum: { type: "string", description: "yyyy-MM-dd; laat weg voor vandaag" },
          notitie: { type: "string" },
        },
        required: ["rijnummer", "moment"],
      },
    },
  },
  {
    actie_type: "gezondheid",
    schema: {
      name: "stel_gezondheid_voor",
      description:
        "Leg een gezondheidsmeting vast voor een rij: vigor (groeikracht 1-5), snoeigewicht in " +
        "gram per plant, aantal dode planten en/of percentage korte scheuten.",
      input_schema: {
        type: "object",
        properties: {
          rijnummer: { type: "integer" },
          vigor: { type: "integer", description: "1 (zwak) tot 5 (zeer sterk)" },
          snoeigewicht: { type: "number", description: "gram per plant" },
          dode_planten: { type: "integer" },
          korte_scheuten: { type: "number", description: "percentage 0-100" },
          notitie: { type: "string" },
        },
        required: ["rijnummer", "vigor"],
      },
    },
  },
  {
    actie_type: "werkuren",
    schema: {
      name: "stel_werkuren_voor",
      description:
        "Registreer uitgevoerd werk met uren. Bij taak 'Spuiten' hoort dit ook het middel en de " +
        "wachttijd te bevatten — dat is de wettelijk verplichte spuitregistratie. Laat `rijnummer` " +
        "weg als het werk de hele wijngaard betrof.",
      input_schema: {
        type: "object",
        properties: {
          taak: {
            type: "string",
            enum: [
              "Snoeien",
              "Uitbreken",
              "Aanbinden",
              "Spuiten",
              "Maaien",
              "Bodembewerking",
              "Oogsten",
              "Overig",
            ],
          },
          uren: { type: "number" },
          rijnummer: { type: "integer", description: "Weglaten = hele wijngaard" },
          datum: { type: "string", description: "yyyy-MM-dd; laat weg voor vandaag" },
          middel: { type: "string", description: "Alleen bij Spuiten" },
          wachttijd_dagen: {
            type: "integer",
            description: "Veiligheidstermijn, alleen bij Spuiten",
          },
          notitie: { type: "string" },
        },
        required: ["taak", "uren"],
      },
    },
  },
  {
    actie_type: "bodem",
    schema: {
      name: "stel_bodem_voor",
      description:
        "Leg een bodemobservatie vast: vochttoestand, veld-pH, structuur, bodemleven, " +
        "verslemping en/of gebreksverschijnselen.",
      input_schema: {
        type: "object",
        properties: {
          rijnummer: { type: "integer" },
          blok: { type: "string", description: "Als het geen specifieke rij betreft" },
          bodemvocht: { type: "string", enum: ["droog", "vochtig", "nat", "verzadigd"] },
          ph_veld: { type: "number" },
          structuur: { type: "string" },
          bodemleven: { type: "string" },
          verslemping: { type: "boolean" },
          gebreksverschijnselen: {
            type: "array",
            items: { type: "string", enum: ["N", "Mg", "K", "Fe", "B", "Zn", "Mn"] },
          },
          notitie: { type: "string" },
        },
      },
    },
  },
  {
    actie_type: "proefnotitie",
    schema: {
      name: "stel_proefnotitie_voor",
      description:
        "Leg een proefnotitie vast bij een partij: helderheid, kleur, geur, smaak, balans en een " +
        "score van 1 tot 10.",
      input_schema: {
        type: "object",
        properties: {
          partij: { type: "string", description: "Naam of lotnummer van de partij" },
          proever: { type: "string" },
          helderheid: { type: "string" },
          kleur: { type: "string" },
          geur: { type: "string" },
          smaak: { type: "string" },
          balans: { type: "string" },
          score: { type: "integer", description: "1-10" },
          gebotteld_exemplaar: { type: "boolean" },
          notities: { type: "string" },
        },
        required: ["partij"],
      },
    },
  },
  // Fase 13 Blok G — GEVONDEN GAT (26 juli 2026). De assistent kon van alles
  // wegschrijven (observaties, analyses, tankboek, voorraad, orders) maar juist
  // NIET de twee handelingen die een wijnboer het vaakst doet: een rijpheids-
  // meting en een oogstregistratie. Bij de doorloop antwoordde hij letterlijk
  // "Ik heb geen tool om een officiële brix/pH-wijngaardmeting weg te
  // schrijven" en bood aan het als observatie te noteren — dan staat je Brix
  // in een vrije tekst in plaats van in de rijpheidsgrafiek. Daarmee was de
  // assistent als invoerroute in het veld onbruikbaar voor het hoofdwerk.
  {
    actie_type: "meting",
    schema: {
      name: "stel_meting_voor",
      description:
        "Stel een rijpheidsmeting voor bij een rij: Brix, pH en/of zuurgraad. Gebruik dit " +
        "wanneer iemand een gemeten waarde doorgeeft ('rij 23 zit op 20,4 brix'). Niet " +
        "gebruiken voor kelderanalyses van een partij — daarvoor is stel_analyse_voor.",
      input_schema: {
        type: "object",
        properties: {
          rijnummer: { type: "integer" },
          plant: { type: "integer", description: "Plantnummer binnen de rij, optioneel" },
          brix: { type: "number", description: "Suikergehalte in °Brix" },
          ph: { type: "number" },
          zuurgraad: { type: "number", description: "Totaal zuur in g/L" },
          rijpheid_score: {
            type: "integer",
            description: "1-5, inschatting van de rijpheid. Laat weg als niet genoemd.",
          },
          notitie: { type: "string" },
        },
        required: ["rijnummer"],
      },
    },
  },
  {
    actie_type: "oogst",
    schema: {
      name: "stel_oogst_voor",
      description:
        "Stel een oogstregistratie voor: geoogste kilo's voor een rij. Gebruik dit wanneer " +
        "iemand een plukresultaat doorgeeft ('rij 12 gedaan, 84 kilo').",
      input_schema: {
        type: "object",
        properties: {
          rijnummer: { type: "integer" },
          kg: { type: "number" },
          datum: { type: "string", description: "yyyy-MM-dd; laat weg voor vandaag" },
          notitie: { type: "string" },
        },
        required: ["rijnummer", "kg"],
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

// Fase 7 Blok C — oenologische reken-tools (lees-only; formules gespiegeld
// uit src/lib/oenologie.ts, zie docs/oenologie-formules.md). Het resultaat is
// een advies; een eventuele boeking loopt via stel_kelderlog_voor.
const OENOLOGIE_TOOLS = [
  {
    lezen: true,
    schema: {
      name: "zoek_proefnotities",
      description:
        "Sensorische proefnotities per partij (datum, proever, helderheid/kleur/geur/smaak/balans, score 1-10, fles of tank).",
      input_schema: {
        type: "object",
        properties: {
          partij: { type: "string", description: "Partijnaam of lotnummer" },
          van: { type: "string" },
          tot: { type: "string" },
        },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "bereken_so2",
      description:
        "Moleculair SO2 + doseeradvies (gram KMS) uit pH, vrije SO2, volume en streefwaarde (default 0,8 mg/L moleculair). Advies - boeken kan daarna via stel_kelderlog_voor.",
      input_schema: {
        type: "object",
        properties: {
          ph: { type: "number" },
          vrij_so2_mg_l: { type: "number" },
          volume_l: { type: "number" },
          doel_moleculair_mg_l: { type: "number" },
        },
        required: ["ph", "vrij_so2_mg_l", "volume_l"],
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "bereken_yan",
      description:
        "YAN-behoefte en gefaseerd voedingsschema uit graden Oechsle, gistklasse (laag/middel/hoog) en volume; optioneel gemeten YAN voor het tekort.",
      input_schema: {
        type: "object",
        properties: {
          oechsle: { type: "number" },
          gist_klasse: { type: "string", enum: ["laag", "middel", "hoog"] },
          volume_l: { type: "number" },
          gemeten_yan_mg_l: { type: "number" },
        },
        required: ["oechsle", "gist_klasse", "volume_l"],
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "bereken_chaptalisatie",
      description:
        "Benodigde suiker (16,83 g/L per vol%) uit huidig Oechsle, gewenst alcoholpercentage en volume. Meldt of de zone A-verrijkingslimiet uit regelgeving_instellingen wordt overschreden of niet geverifieerd is.",
      input_schema: {
        type: "object",
        properties: {
          oechsle: { type: "number" },
          doel_alcohol_volpct: { type: "number" },
          volume_l: { type: "number" },
        },
        required: ["oechsle", "doel_alcohol_volpct", "volume_l"],
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "bereken_zuurcorrectie",
      description:
        "Aanzuren (wijnsteenzuur) of ontzuren (CaCO3/dubbelzout) uit huidig en gewenst totaalzuur (g/L) en volume, met zone A-limietbewaking uit regelgeving_instellingen.",
      input_schema: {
        type: "object",
        properties: {
          huidig_totaalzuur_g_l: { type: "number" },
          doel_totaalzuur_g_l: { type: "number" },
          volume_l: { type: "number" },
        },
        required: ["huidig_totaalzuur_g_l", "doel_totaalzuur_g_l", "volume_l"],
      },
    },
  },
];

// Fase 17 Blok H — pasteurisatie & drukveiligheid.
//
// bereken_pu/bereken_druk DUPLICEREN bewust een vereenvoudigde versie van de
// formules uit src/lib/pasteurisatie.ts / drukveiligheid.ts: de JSVM-hook-
// omgeving kan geen TypeScript-modules importeren (zelfde beperking als
// SENSOR_TYPES/SENSOR_BRON_TYPES in sensor.pb.js, zie de toelichting daar).
// Bij een wijziging in die formules moet dit blok hier bijgewerkt worden.
// Dit zijn adviserende antwoorden van de assistent, GEEN vervanging van de
// officiële berekening in de app zelf (die blijft in Blok D/E/plannen.tsx).
const PASTEURISATIE_TOOLS = [
  {
    lezen: true,
    schema: {
      name: "zoek_pasteurisatie_runs",
      description: "Zoek pasteurisatieruns op eigenaar, partij/lotnummer of status.",
      input_schema: {
        type: "object",
        properties: {
          eigenaar: {
            type: "string",
            description: "Naam of code van de eigenaar, bv. 'Thommy's Drinks' of '07'.",
          },
          partij: { type: "string", description: "Naam of lotnummer van de partij" },
          status: { type: "string", enum: ["gepland", "actief", "afgerond", "afgebroken"] },
        },
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "pasteurisatie_run_detail",
      description:
        "Volledige details van één pasteurisatierun: PU-verdeling, veiligheidsoordeel, flestype/sluiting.",
      input_schema: {
        type: "object",
        properties: {
          lotnummer: {
            type: "string",
            description: "Lotnummer van de partij waar de run bij hoort",
          },
        },
        required: ["lotnummer"],
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "bereken_pu",
      description:
        "Rekent PU (pasteurisatie-eenheden) door over een reeks temperatuurmetingen (trapeziumintegratie, volledige curve). Geeft een indicatie — geen vervanging van de live monitor in de app.",
      input_schema: {
        type: "object",
        properties: {
          metingen: {
            type: "array",
            description: "Reeks {minuut, temperatuur_c}, oplopend in tijd",
            items: {
              type: "object",
              properties: {
                minuut: { type: "number" },
                temperatuur_c: { type: "number" },
              },
              required: ["minuut", "temperatuur_c"],
            },
          },
        },
        required: ["metingen"],
      },
    },
  },
  {
    lezen: true,
    schema: {
      name: "bereken_druk",
      description:
        "Schat de druk in een gesloten fles bij een doeltemperatuur (CO2 + thermische uitzetting + waterdamp) en geeft een veiligheidsoordeel als de dopspecificatie bekend is. Adviseert altijd om dit te verifiëren tegen de echte fabrieksspecificatie.",
      input_schema: {
        type: "object",
        properties: {
          co2_gehalte_gl: { type: "number", description: "CO2-gehalte in g/L" },
          druk_bar_gauge: {
            type: "number",
            description: "Alternatief voor co2_gehalte_gl: gemeten druk (bar gauge)",
          },
          ref_temperatuur_c: {
            type: "number",
            description: "Temperatuur waarbij druk_bar_gauge is gemeten, standaard 10",
          },
          flesinhoud_ml: { type: "number" },
          vulvolume_ml: { type: "number" },
          doeltemperatuur_c: { type: "number" },
          sluiting: {
            type: "string",
            description: "Naam van de sluiting, voor de dopspecificatie",
          },
        },
        required: ["flesinhoud_ml", "vulvolume_ml", "doeltemperatuur_c"],
      },
    },
  },
  {
    actie_type: "pasteurisatie_run",
    schema: {
      name: "stel_pasteurisatie_run_voor",
      description:
        "Stel het plannen van een pasteurisatierun voor (nog niet starten - dat gebeurt in de app zelf met een druk-veiligheidscontrole). Wordt NOOIT direct uitgevoerd.",
      input_schema: {
        type: "object",
        properties: {
          lotnummer: { type: "string" },
          product_soort: { type: "string", enum: ["wijn", "sap", "overige_gegiste_drank"] },
          doeltemperatuur_c: { type: "number" },
          doel_pu_min: { type: "number" },
          doel_pu_max: { type: "number" },
        },
        required: ["lotnummer", "product_soort", "doeltemperatuur_c"],
      },
    },
  },
  {
    actie_type: "pasteurisatie_meting",
    schema: {
      name: "stel_temperatuurmeting_voor",
      description:
        "Stel een handmatige temperatuurmeting voor een actieve run voor. Wordt NOOIT direct uitgevoerd.",
      input_schema: {
        type: "object",
        properties: {
          lotnummer: { type: "string", description: "Lotnummer van de actieve run" },
          temperatuur_c: { type: "number" },
        },
        required: ["lotnummer", "temperatuur_c"],
      },
    },
  },
];

const TOOL_MODULES = {
  kelder: KELDER_TOOLS,
  oenologie: OENOLOGIE_TOOLS,
  wijngaard: WIJNGAARD_TOOLS,
  voorraad: VOORRAAD_TOOLS,
  verkoop: VERKOOP_TOOLS,
  materieel: MATERIEEL_TOOLS,
  pasteurisatie: PASTEURISATIE_TOOLS,
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
