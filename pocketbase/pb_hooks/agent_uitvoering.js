// Uitvoeringslogica voor de AI-agent: lees-tools direct bevragen,
// schrijf-tools omzetten naar een voorstel (agent_acties), bevestigde
// voorstellen daadwerkelijk boeken, en de Anthropic-aanroep zelf.
// Via require() geladen binnen elke handler (zie CLAUDE.md/kelder_logica.js).

const logica = require(`${__hooks}/agent_logica.js`);

// ============= Lees-tools: direct uitvoeren =============
// H2 (§6.3): dispatch is een lookup in deze handler-map, geen switch meer.
// Een tool toevoegen = schema in agent_logica.js (TOOL_MODULES) + één handler
// hier; een ontbrekende handler wordt door de dispatcher als nette fout aan
// het model teruggemeld i.p.v. een crash.

const LEES_HANDLERS = {
  zoek_partijen(app, input) {
    const delen = [];
    if (input.zoekterm) delen.push(`(naam ~ {:z} || lotnummer ~ {:z})`);
    if (input.status) delen.push(`status = {:status}`);
    if (input.jaargang) delen.push(`jaargang = {:jaargang}`);
    const partijen = app.findRecordsByFilter(
      "partijen",
      delen.join(" && ") || "id != ''",
      "-jaargang",
      20,
      0,
      { z: input.zoekterm, status: input.status, jaargang: input.jaargang },
    );
    return partijen.map(partijSamenvatting);
  },
  partij_detail(app, input) {
    const partij = logica.vindPartij(app, input.partij);
    if (!partij)
      return { gevonden: false, notitie: `Geen partij gevonden voor "${input.partij}".` };
    const analyses = app.findRecordsByFilter("analyses", "partij = {:p}", "-datum", 5, 0, {
      p: partij.id,
    });
    const tankboek = app.findRecordsByFilter(
      "tankboek",
      "partij = {:p}",
      "-datum,-created",
      20,
      0,
      {
        p: partij.id,
      },
    );
    const tanks = app.findRecordsByFilter("tanks", "huidige_partij = {:p}", "code", 10, 0, {
      p: partij.id,
    });
    return {
      gevonden: true,
      partij: partijSamenvatting(partij),
      huidige_tanks: tanks.map((t) => ({
        code: t.getString("code"),
        volume_l: t.getFloat("huidig_volume_l"),
      })),
      laatste_analyses: analyses.map(analyseSamenvatting),
      tankboek_historie: tankboek.map(tankboekregelSamenvatting),
    };
  },
  zoek_tanks(app, input) {
    const delen = [];
    if (input.code) delen.push(`code = {:code}`);
    if (input.status) delen.push(`status = {:status}`);
    if (input.locatie) delen.push(`locatie ~ {:locatie}`);
    const tanks = app.findRecordsByFilter(
      "tanks",
      delen.join(" && ") || "id != ''",
      "code",
      50,
      0,
      { code: input.code, status: input.status, locatie: input.locatie },
    );
    return tanks.map((t) => ({
      code: t.getString("code"),
      soort: t.getString("soort"),
      capaciteit_l: t.getFloat("capaciteit_l"),
      status: t.getString("status"),
      huidig_volume_l: t.getFloat("huidig_volume_l"),
      locatie: t.getString("locatie"),
    }));
  },
  zoek_metingen(app, input) {
    const delen = [];
    if (input.ras) delen.push(`rij.ras = {:ras}`);
    if (input.rijnummer) delen.push(`rij.rijnummer = {:rijnummer}`);
    if (input.van) delen.push(`datum >= {:van}`);
    if (input.tot) delen.push(`datum <= {:tot}`);
    const metingen = app.findRecordsByFilter(
      "metingen",
      delen.join(" && ") || "id != ''",
      "-datum",
      30,
      0,
      { ras: input.ras, rijnummer: input.rijnummer, van: input.van, tot: input.tot },
    );
    return metingen.map((m) => ({
      datum: m.getString("datum"),
      rij: m.getString("rij"),
      brix: m.getFloat("brix") || null,
      ph: m.getFloat("ph") || null,
      zuurgraad: m.getFloat("zuurgraad") || null,
      rijpheid_score: m.getFloat("rijpheid_score") || null,
    }));
  },
  zoek_observaties(app, input) {
    const delen = [];
    if (input.ras) delen.push(`rij.ras = {:ras}`);
    if (input.rijnummer) delen.push(`rij.rijnummer = {:rijnummer}`);
    if (input.type) delen.push(`type = {:type}`);
    if (input.van) delen.push(`datum >= {:van}`);
    if (input.tot) delen.push(`datum <= {:tot}`);
    const obs = app.findRecordsByFilter(
      "observaties",
      delen.join(" && ") || "id != ''",
      "-datum",
      30,
      0,
      {
        ras: input.ras,
        rijnummer: input.rijnummer,
        type: input.type,
        van: input.van,
        tot: input.tot,
      },
    );
    return obs.map((o) => ({
      datum: o.getString("datum"),
      rij: o.getString("rij"),
      type: o.getString("type"),
      notitie: o.getString("notitie"),
    }));
  },
  zoek_oogst(app, input) {
    const delen = [];
    if (input.ras) delen.push(`ras = {:ras}`);
    if (input.jaar) delen.push(`seizoen = {:jaar}`);
    const oogst = app.findRecordsByFilter(
      "oogst",
      delen.join(" && ") || "id != ''",
      "datum",
      50,
      0,
      { ras: input.ras, jaar: input.jaar },
    );
    return oogst.map((o) => ({
      datum: o.getString("datum"),
      ras: o.getString("ras"),
      kg: o.getFloat("kg"),
      seizoen: o.getFloat("seizoen"),
    }));
  },
  zoek_fenologie(app, input) {
    const delen = [];
    if (input.ras) delen.push(`ras = {:ras}`);
    if (input.jaar) delen.push(`seizoen = {:jaar}`);
    const fen = app.findRecordsByFilter(
      "fenologie",
      delen.join(" && ") || "id != ''",
      "datum",
      50,
      0,
      { ras: input.ras, jaar: input.jaar },
    );
    return fen.map((f) => ({
      datum: f.getString("datum"),
      ras: f.getString("ras"),
      moment: f.getString("moment"),
      seizoen: f.getFloat("seizoen"),
    }));
  },
  zoek_kelderlog(app, input) {
    const delen = [];
    const params = {};
    if (input.partij) {
      const partij = logica.vindPartij(app, input.partij);
      if (!partij)
        return { gevonden: false, notitie: `Geen partij gevonden voor "${input.partij}".` };
      delen.push(`partij = {:p}`);
      params.p = partij.id;
    }
    if (input.tank) {
      const tank = logica.vindTank(app, input.tank);
      if (!tank) return { gevonden: false, notitie: `Geen tank gevonden voor "${input.tank}".` };
      delen.push(`tank = {:t}`);
      params.t = tank.id;
    }
    if (input.actie) {
      delen.push(`actie = {:a}`);
      params.a = input.actie;
    }
    if (input.van) {
      delen.push(`datum >= {:van}`);
      params.van = input.van;
    }
    if (input.tot) {
      delen.push(`datum <= {:tot}`);
      params.tot = input.tot;
    }
    const regels = app.findRecordsByFilter(
      "kelderlog",
      delen.join(" && ") || "id != ''",
      "-datum,-created",
      30,
      0,
      params,
    );
    return regels.map((r) => ({
      datum: r.getString("datum"),
      actie: r.getString("actie"),
      middel: r.getString("middel") || null,
      hoeveelheid: r.getFloat("hoeveelheid") || null,
      eenheid: r.getString("eenheid") || null,
      notitie: r.getString("notitie") || null,
    }));
  },
  zoek_bodem(app, input) {
    const delen = [];
    const params = {};
    if (input.rijnummer) {
      const rij = logica.vindRij(app, input.rijnummer);
      if (!rij) return { gevonden: false, notitie: "Geen rij " + input.rijnummer + " gevonden." };
      delen.push("rij = {:r}");
      params.r = rij.id;
    }
    if (input.van) {
      delen.push("datum >= {:van}");
      params.van = input.van;
    }
    if (input.tot) {
      delen.push("datum <= {:tot}");
      params.tot = input.tot;
    }
    const obs = app.findRecordsByFilter(
      "bodem_observaties",
      delen.join(" && ") || "id != ''",
      "-datum",
      30,
      0,
      params,
    );
    return obs.map((o) => ({
      datum: o.getString("datum"),
      bodemvocht: o.getString("bodemvocht") || null,
      ph_veld: o.getFloat("ph_veld") || null,
      structuur: o.getString("structuur") || null,
      gebreksverschijnselen: o.get("gebreksverschijnselen") || null,
      notitie: o.getString("notitie") || null,
    }));
  },
  zoek_klanten(app, input) {
    const delen = [];
    const params = {};
    if (input.naam) {
      delen.push("naam ~ {:n}");
      params.n = input.naam;
    }
    if (input.type) {
      delen.push("type = {:t}");
      params.t = input.type;
    }
    const klanten = app.findRecordsByFilter(
      "klanten",
      delen.join(" && ") || "id != ''",
      "naam",
      50,
      0,
      params,
    );
    return klanten.map((k) => ({
      naam: k.getString("naam"),
      type: k.getString("type") || null,
      contact: k.getString("contact") || null,
    }));
  },
  zoek_orders(app, input) {
    const delen = [];
    const params = {};
    if (input.klant) {
      let klant = null;
      try {
        klant = app.findFirstRecordByFilter("klanten", "naam ~ {:n}", { n: input.klant });
      } catch (e) {
        /* geen klant */
      }
      if (!klant)
        return {
          gevonden: false,
          notitie: "Geen klant gevonden voor " + JSON.stringify(input.klant) + ".",
        };
      delen.push("klant = {:k}");
      params.k = klant.id;
    }
    if (input.status) {
      delen.push("status = {:s}");
      params.s = input.status;
    }
    if (input.van) {
      delen.push("datum >= {:van}");
      params.van = input.van;
    }
    if (input.tot) {
      delen.push("datum <= {:tot}");
      params.tot = input.tot;
    }
    const orders = app.findRecordsByFilter(
      "orders",
      delen.join(" && ") || "id != ''",
      "-datum",
      30,
      0,
      params,
    );
    return orders.map((o) => {
      const regels = leesJsonVeld(o, "regels") || [];
      let klantNaam = "";
      try {
        klantNaam = app.findRecordById("klanten", o.getString("klant")).getString("naam");
      } catch (e) {
        /* weesorder */
      }
      const bedrag = Array.isArray(regels)
        ? regels.reduce((acc, r) => acc + (r.aantal || 0) * (r.prijs || 0), 0)
        : 0;
      const flessen = Array.isArray(regels)
        ? regels.reduce((acc, r) => acc + (r.aantal || 0), 0)
        : 0;
      return {
        datum: o.getString("datum"),
        klant: klantNaam,
        status: o.getString("status"),
        flessen: flessen,
        bedrag_eur: Math.round(bedrag * 100) / 100,
      };
    });
  },
  zoek_materieel(app, input) {
    const delen = [];
    const params = {};
    if (input.naam) {
      delen.push("naam ~ {:n}");
      params.n = input.naam;
    }
    const machines = app.findRecordsByFilter(
      "materieel",
      delen.join(" && ") || "id != ''",
      "naam",
      50,
      0,
      params,
    );
    return machines.map((m) => {
      let laatste = null;
      let volgende = null;
      try {
        const log = app.findRecordsByFilter("onderhoudslog", "materieel = {:m}", "-datum", 20, 0, {
          m: m.id,
        });
        if (log.length > 0) {
          laatste = {
            datum: log[0].getString("datum"),
            type: log[0].getString("type"),
            omschrijving: log[0].getString("omschrijving"),
          };
          for (let i = 0; i < log.length; i++) {
            const vk = log[i].getString("volgende_keer");
            if (vk && (!volgende || vk < volgende)) volgende = vk;
          }
        }
      } catch (e) {
        /* geen log */
      }
      return {
        naam: m.getString("naam"),
        type: m.getString("type") || null,
        bouwjaar: m.getFloat("bouwjaar") || null,
        laatste_onderhoud: laatste,
        volgende_onderhoud: volgende,
      };
    });
  },
  zoek_tankboek(app, input) {
    const delen = [];
    const params = {};
    if (input.tank) {
      const tank = logica.vindTank(app, input.tank);
      if (!tank) return { gevonden: false, notitie: `Geen tank gevonden voor "${input.tank}".` };
      delen.push(`(van_tank = {:t} || naar_tank = {:t})`);
      params.t = tank.id;
    }
    if (input.partij) {
      const partij = logica.vindPartij(app, input.partij);
      if (!partij)
        return { gevonden: false, notitie: `Geen partij gevonden voor "${input.partij}".` };
      delen.push(`partij = {:p}`);
      params.p = partij.id;
    }
    if (input.van) {
      delen.push(`datum >= {:van}`);
      params.van = input.van;
    }
    if (input.tot) {
      delen.push(`datum <= {:tot}`);
      params.tot = input.tot;
    }
    const regels = app.findRecordsByFilter(
      "tankboek",
      delen.join(" && ") || "id != ''",
      "-datum,-created",
      50,
      0,
      params,
    );
    return regels.map(tankboekregelSamenvatting);
  },
  zoek_inzichten(app, input) {
    const delen = [];
    if (input.inzicht_type) delen.push(`inzicht_type = {:t}`);
    if (input.onderwerp) delen.push(`onderwerp ~ {:o}`);
    const inzichten = app.findRecordsByFilter(
      "inzichten",
      delen.join(" && ") || "id != ''",
      "-berekend_op",
      20,
      0,
      { t: input.inzicht_type, o: input.onderwerp },
    );
    return inzichten.map((i) => ({
      inzicht_type: i.getString("inzicht_type"),
      onderwerp: i.getString("onderwerp"),
      periode: i.getString("periode"),
      samenvatting_nl: i.getString("samenvatting_nl"),
      waarde: leesJsonVeld(i, "waarde"),
    }));
  },
  zoek_advies_feedback(app, input) {
    // advies_feedback verwijst naar agent_berichten; onderwerp is niet direct
    // een veld op advies_feedback, dus we zoeken via de inhoud van het bericht.
    const berichten = input.onderwerp
      ? app.findRecordsByFilter(
          "agent_berichten",
          "inhoud ~ {:o} && rol = 'assistant'",
          "-created",
          10,
          0,
          {
            o: input.onderwerp,
          },
        )
      : [];
    const berichtIds = berichten.map((b) => b.id);
    if (berichtIds.length === 0) return [];
    const filter = berichtIds.map((_, i) => `bericht_id = {:id${i}}`).join(" || ");
    const params = {};
    berichtIds.forEach((id, i) => (params[`id${i}`] = id));
    const feedback = app.findRecordsByFilter("advies_feedback", filter, "-created", 10, 0, params);
    return feedback.map((f) => ({
      oordeel: f.getString("oordeel"),
      toelichting: f.getString("toelichting"),
    }));
  },
  analyseer_foto(app, input) {
    return {
      notitie: "wordt door de hoofdlus afgehandeld (heeft een aparte Anthropic-aanroep nodig)",
    };
  },
  zoek_voorraad(app, input) {
    const delen = [];
    if (input.wijnnaam) delen.push(`wijnnaam ~ {:w}`);
    if (input.jaargang) delen.push(`jaargang = {:j}`);
    if (input.status) delen.push(`status = {:s}`);
    const voorraad = app.findRecordsByFilter(
      "voorraad_flessen",
      delen.join(" && ") || "id != ''",
      "-created",
      20,
      0,
      { w: input.wijnnaam, j: input.jaargang, s: input.status },
    );
    return voorraad.map(voorraadSamenvatting);
  },
  voorraad_detail(app, input) {
    const voorraad = logica.vindVoorraad(app, input.wijnnaam, input.jaargang);
    if (!voorraad)
      return { gevonden: false, notitie: `Geen voorraad gevonden voor "${input.wijnnaam}".` };
    let bottelronde = null;
    let tank = null;
    try {
      bottelronde = app.findRecordById("bottelrondes", voorraad.getString("bottelronde"));
      if (bottelronde.getString("van_tank"))
        tank = app.findRecordById("tanks", bottelronde.getString("van_tank"));
    } catch (e) {
      // bottelronde/tank kan ontbreken bij handmatig aangepaste data - geen harde fout
    }
    const mutaties = app.findRecordsByFilter(
      "voorraad_mutaties",
      "voorraad = {:v}",
      "-datum,-created",
      20,
      0,
      { v: voorraad.id },
    );
    return {
      gevonden: true,
      voorraad: voorraadSamenvatting(voorraad),
      herkomst: bottelronde
        ? {
            botteldatum: bottelronde.getString("botteldatum"),
            aantal_flessen: bottelronde.getFloat("aantal_flessen"),
            flesinhoud_ml: bottelronde.getFloat("flesinhoud_ml"),
            lotnummer: bottelronde.getString("lotnummer"),
            van_tank: tank ? tank.getString("code") : null,
          }
        : null,
      mutatiehistorie: mutaties.map(voorraadMutatieSamenvatting),
    };
  },
};

function voerLeesToolUit(app, naam, input) {
  const handler = LEES_HANDLERS[naam];
  if (!handler) return { fout: `Onbekende lees-tool: ${naam}` };
  return handler(app, input);
}

function partijSamenvatting(p) {
  return {
    id: p.id,
    naam: p.getString("naam"),
    jaargang: p.getFloat("jaargang"),
    type: p.getString("type"),
    status: p.getString("status"),
    lotnummer: p.getString("lotnummer"),
    samenstelling: p.getString("samenstelling"),
  };
}
function analyseSamenvatting(a) {
  return {
    datum: a.getString("datum"),
    dichtheid_oechsle: a.getFloat("dichtheid_oechsle") || null,
    ph: a.getFloat("ph") || null,
    alcohol_pct: a.getFloat("alcohol_pct") || null,
    so2_vrij: a.getFloat("so2_vrij") || null,
    so2_totaal: a.getFloat("so2_totaal") || null,
  };
}
function tankboekregelSamenvatting(r) {
  return {
    datum: r.getString("datum"),
    actie: r.getString("actie"),
    volume_l: r.getFloat("volume_l"),
    van_tank: r.getString("van_tank"),
    naar_tank: r.getString("naar_tank"),
    verantwoordelijke: r.getString("verantwoordelijke"),
    notitie: r.getString("notitie"),
  };
}
function voorraadSamenvatting(v) {
  return {
    id: v.id,
    wijnnaam: v.getString("wijnnaam"),
    jaargang: v.getFloat("jaargang") || null,
    aantal_huidig: v.getFloat("aantal_huidig"),
    aantal_beginvoorraad: v.getFloat("aantal_beginvoorraad"),
    status: v.getString("status"),
    locatie: v.getString("locatie"),
  };
}
function voorraadMutatieSamenvatting(m) {
  return {
    datum: m.getString("datum"),
    mutatie_type: m.getString("mutatie_type"),
    aantal: m.getFloat("aantal"),
    afnemer_of_reden: m.getString("afnemer_of_reden"),
  };
}

// ============= Schrijf-tools: omzetten naar een voorstel =============

// Elke bouwer retourneert { actie_type, payload, samenvatting } of { fout } en
// schrijft NIETS — dispatch is een lookup, zelfde registry-patroon als de
// lees-tools hierboven (H2, §6.3).
const VOORSTEL_BOUWERS = {
  stel_tankboek_boeking_voor(app, input) {
    const partij = logica.vindPartij(app, input.partij);
    if (!partij) return { fout: `Geen partij gevonden voor "${input.partij}".` };
    let vanTank = null;
    let naarTank = null;
    if (input.van_tank) {
      vanTank = logica.vindTank(app, input.van_tank);
      if (!vanTank) return { fout: `Geen tank gevonden voor "${input.van_tank}".` };
    }
    if (input.naar_tank) {
      naarTank = logica.vindTank(app, input.naar_tank);
      if (!naarTank) return { fout: `Geen tank gevonden voor "${input.naar_tank}".` };
    }
    const payload = {
      datum: input.datum || logica.vandaagStr(),
      partij: partij.id,
      producent: partij.getString("producent"),
      actie: input.actie,
      van_tank: vanTank ? vanTank.id : "",
      naar_tank: naarTank ? naarTank.id : "",
      volume_l: input.volume_l,
      notitie: input.notitie || "",
    };
    const samenvatting =
      `Tankboek-boeking: ${input.actie}, partij ${partij.getString("naam")}` +
      `${partij.getString("lotnummer") ? " (" + partij.getString("lotnummer") + ")" : ""}, ` +
      `${input.volume_l} L` +
      `${vanTank ? `, tank ${vanTank.getString("code")}` : ""}` +
      `${naarTank ? ` -> tank ${naarTank.getString("code")}` : ""}` +
      `${input.notitie ? `, reden: ${input.notitie}` : ""}`;
    return { actie_type: "tankboek_boeking", payload, samenvatting };
  },
  stel_observatie_voor(app, input) {
    const rij = logica.vindRij(app, input.rijnummer);
    if (!rij) return { fout: `Geen rij ${input.rijnummer} gevonden.` };
    const notitie = input.beschrijving + (input.ernst ? ` (ernst: ${input.ernst})` : "");
    const datum = logica.vandaagStr();
    const payload = {
      rij: rij.id,
      plant: input.plant || null,
      datum,
      seizoen: Number(datum.slice(0, 4)),
      type: input.type,
      notitie,
    };
    const samenvatting =
      `Observatie: rij ${input.rijnummer} (${rij.getString("ras")})` +
      `${input.plant ? `, plant ${input.plant}` : ""} - ${input.type}: ${input.beschrijving}` +
      `${input.ernst ? ` (ernst: ${input.ernst})` : ""}`;
    return { actie_type: "observatie", payload, samenvatting };
  },
  stel_uitval_voor(app, input) {
    const rij = logica.vindRij(app, input.rijnummer);
    if (!rij) return { fout: `Geen rij ${input.rijnummer} gevonden.` };
    const notitie = `Uitval: ${input.aantal} planten. Reden: ${input.reden}`;
    const datumUitval = logica.vandaagStr();
    const payload = {
      rij: rij.id,
      datum: datumUitval,
      seizoen: Number(datumUitval.slice(0, 4)),
      type: "uitval",
      notitie,
    };
    const samenvatting = `Uitval: rij ${input.rijnummer} (${rij.getString("ras")}), ${input.aantal} planten, reden: ${input.reden}`;
    return { actie_type: "uitval", payload, samenvatting };
  },
  stel_kelderlog_voor(app, input) {
    const partij = logica.vindPartij(app, input.partij);
    if (!partij) return { fout: `Geen partij gevonden voor "${input.partij}".` };
    const payload = {
      datum: logica.vandaagStr(),
      partij: partij.id,
      actie: input.taak_type,
      notitie: input.beschrijving,
    };
    const samenvatting = `Kelderlog: ${input.taak_type} bij partij ${partij.getString("naam")} - ${input.beschrijving}`;
    return { actie_type: "kelderlog", payload, samenvatting };
  },
  stel_analyse_voor(app, input) {
    const partij = logica.vindPartij(app, input.partij);
    if (!partij) return { fout: `Geen partij gevonden voor "${input.partij}".` };
    let dichtheid = null;
    if (input.oechsle != null) dichtheid = logica.dichtheidVanOechsle(input.oechsle);
    else if (input.brix != null) dichtheid = logica.dichtheidVanBrix(input.brix);
    const payload = {
      datum: logica.vandaagStr(),
      partij: partij.id,
      dichtheid_oechsle: dichtheid ? dichtheid.oechsle : null,
      dichtheid_brix: dichtheid ? dichtheid.brix : null,
      dichtheid_sg: dichtheid ? dichtheid.sg : null,
      ph: input.ph != null ? input.ph : null,
      alcohol_pct: input.alcohol_pct != null ? input.alcohol_pct : null,
      restsuiker_g_l: input.restsuiker_g_l != null ? input.restsuiker_g_l : null,
      totaalzuur_g_l: input.totaalzuur_g_l != null ? input.totaalzuur_g_l : null,
      vluchtig_zuur_g_l: input.vluchtig_zuur_g_l != null ? input.vluchtig_zuur_g_l : null,
      so2_vrij: input.so2_vrij != null ? input.so2_vrij : null,
      so2_totaal: input.so2_totaal != null ? input.so2_totaal : null,
      methode: "eigen_meting",
    };
    const samenvatting =
      `Analyse: partij ${partij.getString("naam")}` +
      `${dichtheid ? `, ${dichtheid.oechsle} °Oe / ${dichtheid.brix} °Bx` : ""}` +
      `${input.ph != null ? `, pH ${input.ph}` : ""}`;
    return { actie_type: "analyse", payload, samenvatting };
  },
  stel_bottelronde_voor(app, input) {
    const partij = logica.vindPartij(app, input.partij);
    if (!partij) return { fout: `Geen partij gevonden voor "${input.partij}".` };
    const tank = logica.vindTank(app, input.van_tank);
    if (!tank) return { fout: `Geen tank gevonden voor "${input.van_tank}".` };
    const payload = {
      partij: partij.id,
      producent: partij.getString("producent"),
      van_tank: tank.id,
      botteldatum: input.botteldatum || logica.vandaagStr(),
      aantal_flessen: input.aantal_flessen,
      flesinhoud_ml: input.flesinhoud_ml,
      flestype: input.flestype || "",
      kleur_fles: input.kleur_fles || "",
      parelwijn: !!input.parelwijn,
      lotnummer: input.lotnummer || partij.getString("lotnummer") || "",
    };
    const volumeL = logica.round1((input.aantal_flessen * input.flesinhoud_ml) / 1000);
    const samenvatting =
      `Bottelronde: partij ${partij.getString("naam")}, ${input.aantal_flessen} flessen x ${input.flesinhoud_ml} ml ` +
      `(${volumeL} L) uit tank ${tank.getString("code")}` +
      `${payload.lotnummer ? `, lot ${payload.lotnummer}` : ""}`;
    return { actie_type: "bottelronde", payload, samenvatting };
  },
  stel_order_voor(app, input) {
    const klant = logica.vindKlant(app, input.klant);
    if (!klant)
      return {
        fout: `Geen klant gevonden voor "${input.klant}" — maak die eerst aan op /verkoop.`,
      };
    if (!Array.isArray(input.regels) || input.regels.length === 0)
      return { fout: "Een order heeft minstens één regel (wijn + aantal) nodig." };
    const regels = [];
    const delen = [];
    for (const r of input.regels) {
      const voorraad = logica.vindVoorraad(app, r.wijn, r.jaargang);
      if (!voorraad) return { fout: `Geen voorraad gevonden voor wijn "${r.wijn}".` };
      const aantal = Number(r.aantal);
      if (!aantal || aantal <= 0) return { fout: `Ongeldig aantal voor "${r.wijn}".` };
      const beschikbaar = voorraad.getFloat("aantal_huidig");
      if (aantal > beschikbaar)
        return {
          fout: `Voorraad "${voorraad.getString("wijnnaam")}" heeft maar ${beschikbaar} flessen (gevraagd: ${aantal}).`,
        };
      regels.push({
        voorraad: voorraad.id,
        aantal: aantal,
        prijs: r.prijs != null ? Number(r.prijs) : 0,
      });
      delen.push(
        `${aantal}× ${voorraad.getString("wijnnaam")} ${voorraad.getFloat("jaargang") || ""}`.trim() +
          (r.prijs != null ? ` à €${r.prijs}` : ""),
      );
    }
    const payload = {
      klant: klant.id,
      datum: logica.vandaagStr(),
      regels: regels,
      notities: input.notities || "",
    };
    const samenvatting = `Conceptorder voor ${klant.getString("naam")}: ${delen.join(", ")}`;
    return { actie_type: "order", payload, samenvatting };
  },
  stel_onderhoud_voor(app, input) {
    const machine = logica.vindMaterieel(app, input.machine);
    if (!machine) return { fout: `Geen machine gevonden voor "${input.machine}".` };
    const payload = {
      materieel: machine.id,
      datum: logica.vandaagStr(),
      type: input.type,
      omschrijving: input.omschrijving,
      kosten: input.kosten != null ? input.kosten : null,
      volgende_keer: input.volgende_keer || "",
    };
    const samenvatting =
      `Onderhoud: ${input.type} bij ${machine.getString("naam")} - ${input.omschrijving}` +
      `${input.kosten != null ? ` (€${input.kosten})` : ""}` +
      `${input.volgende_keer ? `, volgende keer ${input.volgende_keer}` : ""}`;
    return { actie_type: "onderhoud", payload, samenvatting };
  },
  stel_voorraad_mutatie_voor(app, input) {
    const voorraad = logica.vindVoorraad(app, input.wijnnaam, input.jaargang);
    if (!voorraad) return { fout: `Geen voorraad gevonden voor "${input.wijnnaam}".` };
    const afnameTypes = ["verkocht", "eigen_gebruik", "kapot", "weggegeven"];
    let aantal = Number(input.aantal);
    if (afnameTypes.indexOf(input.mutatie_type) !== -1) aantal = -Math.abs(aantal);
    const payload = {
      voorraad: voorraad.id,
      mutatie_type: input.mutatie_type,
      aantal,
      datum: input.datum || logica.vandaagStr(),
      afnemer_of_reden: input.afnemer_of_reden || "",
    };
    const samenvatting =
      `Voorraadmutatie: ${input.mutatie_type}, ${voorraad.getString("wijnnaam")}, ${Math.abs(aantal)} flessen` +
      `${input.afnemer_of_reden ? `, ${input.afnemer_of_reden}` : ""}`;
    return { actie_type: "voorraad_mutatie", payload, samenvatting };
  },
};

function bouwActieVoorstel(app, naam, input) {
  const bouwer = VOORSTEL_BOUWERS[naam];
  if (!bouwer) return { fout: `Onbekende schrijf-tool: ${naam}` };
  return bouwer(app, input);
}

// ============= Bevestigde actie daadwerkelijk uitvoeren =============
// Retourneert { record_id } of { fout }. Schrijft binnen txApp (transactie).
function voerBevestigdeActieUit(txApp, actieType, payload, verantwoordelijke) {
  switch (actieType) {
    case "tankboek_boeking": {
      const kelder = require(`${__hooks}/kelder_logica.js`);
      const resultaat = kelder.voerBoekingUit(txApp, {
        ...payload,
        verantwoordelijke,
      });
      if (resultaat.fout) return { fout: resultaat.fout };
      return { record_id: resultaat.regelId };
    }
    case "observatie":
    case "uitval": {
      const col = txApp.findCollectionByNameOrId("observaties");
      const rec = new Record(col);
      rec.set("rij", payload.rij);
      if (payload.plant) rec.set("plant", payload.plant);
      rec.set("datum", payload.datum);
      if (payload.seizoen) rec.set("seizoen", payload.seizoen);
      rec.set("type", payload.type);
      rec.set("notitie", payload.notitie);
      rec.set("ingevoerd_door", verantwoordelijke);
      txApp.save(rec);
      return { record_id: rec.id };
    }
    case "kelderlog": {
      const col = txApp.findCollectionByNameOrId("kelderlog");
      const rec = new Record(col);
      rec.set("datum", payload.datum);
      rec.set("partij", payload.partij);
      rec.set("actie", payload.actie);
      rec.set("notitie", payload.notitie);
      rec.set("ingevoerd_door", verantwoordelijke);
      txApp.save(rec);
      return { record_id: rec.id };
    }
    case "analyse": {
      const col = txApp.findCollectionByNameOrId("analyses");
      const rec = new Record(col);
      for (const veld of Object.keys(payload)) {
        if (payload[veld] != null) rec.set(veld, payload[veld]);
      }
      rec.set("ingevoerd_door", verantwoordelijke);
      txApp.save(rec);
      return { record_id: rec.id };
    }
    case "bottelronde": {
      const kelder = require(`${__hooks}/kelder_logica.js`);
      const resultaat = kelder.voerBottelrondeUit(txApp, {
        ...payload,
        ingevoerd_door: verantwoordelijke,
      });
      if (resultaat.fout) return { fout: resultaat.fout };
      return { record_id: resultaat.bottelrondeId };
    }
    case "order": {
      const col = txApp.findCollectionByNameOrId("orders");
      const rec = new Record(col);
      rec.set("klant", payload.klant);
      rec.set("datum", payload.datum);
      rec.set("regels", payload.regels);
      rec.set("status", "concept");
      if (payload.notities) rec.set("notities", payload.notities);
      rec.set("ingevoerd_door", verantwoordelijke);
      txApp.save(rec);
      return { record_id: rec.id };
    }
    case "onderhoud": {
      const col = txApp.findCollectionByNameOrId("onderhoudslog");
      const rec = new Record(col);
      rec.set("materieel", payload.materieel);
      rec.set("datum", payload.datum);
      rec.set("type", payload.type);
      rec.set("omschrijving", payload.omschrijving);
      if (payload.kosten != null) rec.set("kosten", payload.kosten);
      if (payload.volgende_keer) rec.set("volgende_keer", payload.volgende_keer);
      rec.set("ingevoerd_door", verantwoordelijke);
      txApp.save(rec);
      return { record_id: rec.id };
    }
    case "voorraad_mutatie": {
      const voorraad = require(`${__hooks}/voorraad_logica.js`);
      const resultaat = voorraad.voerMutatieUit(txApp, {
        ...payload,
        ingevoerd_door: verantwoordelijke,
      });
      if (resultaat.fout) return { fout: resultaat.fout };
      return { record_id: resultaat.regelId };
    }
    default:
      return { fout: `Onbekend actietype: ${actieType}` };
  }
}

// ============= Anthropic API =============

function roepAnthropicAan(apiKey, systeemprompt, berichten, tools) {
  const res = $http.send({
    url: logica.ANTHROPIC_ENDPOINT,
    method: "POST",
    timeout: 60,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: logica.MODEL,
      max_tokens: logica.MAX_TOKENS,
      system: systeemprompt,
      messages: berichten,
      tools: tools,
    }),
  });
  if (res.statusCode >= 400) {
    const msg =
      (res.json && res.json.error && res.json.error.message) || `Anthropic-fout ${res.statusCode}`;
    throw new Error(msg);
  }
  return res.json;
}

function leesSysteemprompt() {
  const inhoud = $os.readFile(`${__hooks}/agent_systeemprompt.md`);
  return typeof inhoud === "string" ? inhoud : String.fromCharCode.apply(null, inhoud);
}

function leesbareFout(err) {
  if (err && err.status) return err;
  return new BadRequestError("AI-agent fout: " + (err && err.message ? err.message : String(err)));
}

// ============= Rate limit (Eindsprint Blok C / mega-prompt-v2 Blok C) =============
// Elke aanroep van de drie agent-endpoints kost een betaalde Claude-aanroep
// (ook bevestig/afwijzen: die draaien verwerkBeurt() opnieuw). Dit is het
// enige bekende financiële risico van de app (CLAUDE.md/STATUS-RAPPORT) en
// moest af vóór de server ooit publiek wordt. Telling per IP in het gedeelde
// Go-side app-store (overleeft de JSVM-VM-pool, reset bij PocketBase-herstart
// — acceptabel voor een kostenrem). De limiet is instelbaar via een
// regelgeving_instellingen-record met sleutel "agent_berichten_per_uur_per_ip";
// zonder record geldt RATE_LIMIT_STANDAARD. De check telt élke poging mee
// (ook ongeldige requests), zodat probing niet gratis is.
const RATE_LIMIT_STANDAARD = 30; // berichten per uur per IP
const RATE_LIMIT_VENSTER_MS = 60 * 60 * 1000;

function rateLimietPerUur(app) {
  try {
    const rec = app.findFirstRecordByFilter(
      "regelgeving_instellingen",
      "sleutel = 'agent_berichten_per_uur_per_ip'",
    );
    const waarde = rec.getFloat("waarde");
    if (waarde > 0) return Math.floor(waarde);
  } catch (e) {
    /* geen instelling -> standaard */
  }
  return RATE_LIMIT_STANDAARD;
}

// Retourneert null als de aanroep mag, anders een nette Nederlandse melding.
function controleerRateLimit(app, ip) {
  const sleutel = "agent_ratelimit_" + (ip || "onbekend");
  const nu = Date.now();
  const store = app.store();
  let stempels = [];
  try {
    const bestaand = store.get(sleutel);
    if (Array.isArray(bestaand)) stempels = bestaand;
  } catch (e) {
    /* leeg store-slot */
  }
  stempels = stempels.filter((t) => nu - t < RATE_LIMIT_VENSTER_MS);
  const limiet = rateLimietPerUur(app);
  if (stempels.length >= limiet) {
    const minutenTotVrij = Math.ceil((RATE_LIMIT_VENSTER_MS - (nu - stempels[0])) / 60000);
    return (
      "Je hebt de limiet van " +
      limiet +
      " assistent-berichten per uur bereikt. Probeer het over ongeveer " +
      minutenTotVrij +
      " minuten opnieuw."
    );
  }
  stempels.push(nu);
  store.set(sleutel, stempels);
  return null;
}

// record.get("jsonveld") levert in de JSVM een types.JSONRaw op - dat is GEEN
// parsed object en ook geen string, maar een byte-array (Array<number>).
// {...ruw} spreidt dan numerieke indices i.p.v. de echte sleutels (kostte een
// debugronde: "partij is verplicht" ondanks een correcte payload, omdat
// voerBoekingUit() een spread van bytes kreeg). .string() + JSON.parse is de
// juiste weg terug naar een bruikbaar object.
function leesJsonVeld(record, veld) {
  const ruw = record.get(veld);
  if (ruw == null) return {};
  if (typeof ruw === "object" && typeof ruw.string === "function") {
    return JSON.parse(ruw.string());
  }
  if (typeof ruw === "string") return JSON.parse(ruw);
  return ruw;
}

function haalFotoBase64Op(app, berichtId, pocketbaseUrl, apiKey) {
  try {
    const bericht = app.findRecordById("agent_berichten", berichtId);
    const bestand = bericht.getString("foto");
    if (!bestand) return null;
    const url = `${pocketbaseUrl}/api/files/${bericht.baseFilesPath()}/${bestand}`;
    const res = $http.send({ url, method: "GET", timeout: 30 });
    if (res.statusCode >= 400) return null;
    const mediaType = bestand.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return { base64: logica.bytesNaarBase64(res.body), mediaType };
  } catch (e) {
    return null;
  }
}

// ============= Eén volledige beurt verwerken =============
// Vertrekpunt: gesprek_id + het al opgeslagen laatste bericht in dat gesprek
// (een echt user-bericht, of een synthetisch "tool"-systeembericht na een
// mislukte/afgewezen actie). Retourneert { antwoord, acties, bericht_id }
// of { fout } (bv. geen API-sleutel geconfigureerd).
function verwerkBeurt(app, opties) {
  const { gesprekId, systeemprompt, pocketbaseUrl, verantwoordelijke } = opties;
  const apiKey = $os.getenv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return { fout: "De AI-agent is niet ingesteld: ANTHROPIC_API_KEY ontbreekt op de server." };
  }

  const historie = app.findRecordsByFilter(
    "agent_berichten",
    "gesprek_id = {:g}",
    "created",
    logica.MAX_GESCHIEDENIS_BERICHTEN,
    0,
    { g: gesprekId },
  );

  // alleen user/assistant-tekstwisselingen repliceren; tool-detail van eerdere
  // beurten zit al samengevat in het opgeslagen assistant-antwoord van die beurt
  const berichten = [];
  for (const b of historie) {
    const rol = b.getString("rol");
    if (rol === "user") {
      let tekst = b.getString("inhoud") || "";
      if (b.getString("foto")) {
        tekst += `\n\n[Gebruiker heeft een foto bijgevoegd bij dit bericht - gebruik analyseer_foto met bericht_id "${b.id}" om te bekijken]`;
      }
      berichten.push({ role: "user", content: tekst });
    } else if (rol === "assistant") {
      berichten.push({ role: "assistant", content: b.getString("inhoud") || "(geen antwoord)" });
    } else if (rol === "tool") {
      // synthetische systeemmelding (bv. na een mislukte actie) - als user-beurt
      // aanbieden, want Anthropic staat geen "tool"-rol zonder voorgaande
      // tool_use toe in de vervangen geschiedenis.
      berichten.push({ role: "user", content: b.getString("inhoud") || "" });
    }
  }

  const tools = logica.bouwTools();
  const systeem = [
    { type: "text", text: systeemprompt, cache_control: { type: "ephemeral" } },
    { type: "text", text: `HUIDIGE DATUM: ${logica.vandaagStr()}` },
  ];

  const alleToolCalls = [];
  const alleToolResultaten = [];
  const voorgesteldeActies = [];
  let laatsteAntwoord = null;
  let teBreedGeworden = false;

  for (let iteratie = 0; iteratie < logica.MAX_TOOL_ITERATIES; iteratie++) {
    let antwoord;
    try {
      antwoord = roepAnthropicAan(apiKey, systeem, berichten, tools);
    } catch (e) {
      return { fout: `Kon de AI-agent niet bereiken: ${e.message}` };
    }
    laatsteAntwoord = antwoord;

    // Blok F: web search is een server-side tool - Anthropic voert 'm zelf uit
    // en levert search + antwoordtekst in dezelfde beurt terug (vaak met
    // stop_reason "end_turn", niet "tool_use"). Daarom hier al vastleggen
    // voor de bronnenregel, vóór de stop_reason-check hieronder anders zou
    // een beurt met UITSLUITEND een websearch (geen eigen tool_use) nooit in
    // alleToolCalls terechtkomen.
    for (const blok of antwoord.content) {
      if (blok.type === "server_tool_use" && blok.name === "web_search") {
        alleToolCalls.push({ naam: "web_search", input: blok.input });
      } else if (blok.type === "web_search_tool_result") {
        alleToolResultaten.push({
          naam: "web_search",
          resultaat: JSON.stringify(blok.content || []),
        });
      }
    }

    if (antwoord.stop_reason !== "tool_use") break;

    berichten.push({ role: "assistant", content: antwoord.content });
    const toolResultaten = [];
    for (const blok of antwoord.content) {
      if (blok.type !== "tool_use") continue;
      alleToolCalls.push({ naam: blok.name, input: blok.input });

      let resultaatTekst;
      if (blok.name === "analyseer_foto") {
        const foto = haalFotoBase64Op(app, blok.input.bericht_id, pocketbaseUrl, apiKey);
        if (!foto) {
          resultaatTekst = "Kon de foto niet ophalen of dit bericht heeft geen foto.";
        } else {
          try {
            const visieRes = roepAnthropicAan(
              apiKey,
              [
                {
                  type: "text",
                  text: "Analyseer deze foto van een wijngaard/kelder-onderwerp (blad, druif, stok, wijn) op gezondheid, verkleuring, vermoede ziekte of rijpheidsindruk. Geef een kort, concreet Nederlands oordeel, geen voorzichtigheidsclausules.",
                },
              ],
              [
                {
                  role: "user",
                  content: [
                    {
                      type: "image",
                      source: { type: "base64", media_type: foto.mediaType, data: foto.base64 },
                    },
                    { type: "text", text: "Analyseer deze foto." },
                  ],
                },
              ],
              [],
            );
            resultaatTekst = (visieRes.content || [])
              .filter((c) => c.type === "text")
              .map((c) => c.text)
              .join("\n");
          } catch (e) {
            resultaatTekst = `Foto-analyse mislukt: ${e.message}`;
          }
        }
      } else if (logica.LEES_TOOLS.has(blok.name)) {
        try {
          resultaatTekst = JSON.stringify(voerLeesToolUit(app, blok.name, blok.input));
        } catch (e) {
          resultaatTekst = `Fout bij opzoeken: ${e.message}`;
        }
      } else if (logica.SCHRIJF_TOOL_INFO[blok.name]) {
        const voorstel = bouwActieVoorstel(app, blok.name, blok.input);
        if (voorstel.fout) {
          resultaatTekst = `Kan geen voorstel maken: ${voorstel.fout}`;
        } else {
          voorgesteldeActies.push(voorstel);
          resultaatTekst = `Voorstel klaar: "${voorstel.samenvatting}". Dit wordt als bevestigingskaart getoond - wacht op bevestiging van de gebruiker, voer het niet uit.`;
        }
      } else {
        resultaatTekst = `Onbekende tool: ${blok.name}`;
      }
      alleToolResultaten.push({ naam: blok.name, resultaat: resultaatTekst });
      toolResultaten.push({ type: "tool_result", tool_use_id: blok.id, content: resultaatTekst });
    }
    berichten.push({ role: "user", content: toolResultaten });

    if (iteratie === logica.MAX_TOOL_ITERATIES - 1) teBreedGeworden = true;
  }

  let tekst = ((laatsteAntwoord && laatsteAntwoord.content) || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
  if (teBreedGeworden) {
    tekst +=
      "\n\n(Dit was een brede vraag met veel stappen - ik geef je wat ik tot nu toe heb. Vraag gerust gerichter door.)";
  }
  if (!tekst) tekst = "(geen antwoord)";

  let assistantBerichtId = null;
  let aangemaakteActies = [];
  app.runInTransaction((txApp) => {
    const col = txApp.findCollectionByNameOrId("agent_berichten");
    const rec = new Record(col);
    rec.set("gesprek_id", gesprekId);
    rec.set("rol", "assistant");
    rec.set("inhoud", tekst);
    rec.set("tool_calls", alleToolCalls);
    rec.set("tool_resultaten", alleToolResultaten);
    txApp.save(rec);
    assistantBerichtId = rec.id;

    for (const voorstel of voorgesteldeActies) {
      const actieCol = txApp.findCollectionByNameOrId("agent_acties");
      const actieRec = new Record(actieCol);
      actieRec.set("gesprek_id", gesprekId);
      actieRec.set("bericht_id", assistantBerichtId);
      actieRec.set("actie_type", voorstel.actie_type);
      actieRec.set("payload", voorstel.payload);
      actieRec.set("samenvatting", voorstel.samenvatting);
      actieRec.set("status", "voorgesteld");
      txApp.save(actieRec);
      aangemaakteActies.push({
        id: actieRec.id,
        actie_type: voorstel.actie_type,
        samenvatting: voorstel.samenvatting,
        status: "voorgesteld",
      });
    }

    const gesprek = txApp.findRecordById("agent_gesprekken", gesprekId);
    gesprek.set("laatste_bericht_op", new Date().toISOString());
    if (!gesprek.getString("titel") || gesprek.getString("titel") === "Nieuw gesprek") {
      const eersteUser = historie.find((b) => b.getString("rol") === "user");
      if (eersteUser) {
        gesprek.set("titel", (eersteUser.getString("inhoud") || "Nieuw gesprek").slice(0, 60));
      }
    }
    txApp.save(gesprek);
  });

  return {
    antwoord: tekst,
    acties: aangemaakteActies,
    bericht_id: assistantBerichtId,
    tool_calls: alleToolCalls,
    tool_resultaten: alleToolResultaten,
  };
}

module.exports = {
  voerLeesToolUit,
  bouwActieVoorstel,
  voerBevestigdeActieUit,
  roepAnthropicAan,
  haalFotoBase64Op,
  leesJsonVeld,
  verwerkBeurt,
  leesSysteemprompt,
  leesbareFout,
  controleerRateLimit,
};
