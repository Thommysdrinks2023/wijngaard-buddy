/// <reference path="../pb_data/types.d.ts" />
// Eindsprint Blok B — gebruikersbeheer, uitsluitend voor de rol "beheerder".
// Bewust als custom endpoints i.p.v. het openzetten van de users-API-rules:
// de standaard users-rules blijven dicht (alleen jezelf), en het rol-beheer
// loopt langs precies één gecontroleerde route. Zelfde JSVM-patroon als
// kelder.pb.js: alle gedeelde logica via require() binnen de handler.

// ---------- GET /api/tappenmars/gebruikers ----------
routerAdd(
  "GET",
  "/api/tappenmars/gebruikers",
  (e) => {
    const logica = require(`${__hooks}/kelder_logica.js`);
    try {
      const rolFout = logica.eisBeheerder(e.auth, "gebruikers beheren");
      if (rolFout) return e.json(403, { message: rolFout });
      const users = e.app.findRecordsByFilter("users", "id != ''", "email", 200, 0);
      return e.json(200, {
        gebruikers: users.map((u) => ({
          id: u.id,
          email: u.getString("email"),
          naam: u.getString("name"),
          weergavenaam: u.getString("weergavenaam"),
          rol: u.getString("rol") || "medewerker",
        })),
      });
    } catch (err) {
      throw logica.leesbareFout(err);
    }
  },
  $apis.requireAuth(),
);

// ---------- POST /api/tappenmars/gebruiker-rol ----------
// body: { user_id, rol } — beheerder kan zichzelf niet degraderen als hij de
// laatste beheerder is (voorkomt een lockout waarbij niemand meer rollen kan
// beheren of correcties kan boeken).
routerAdd(
  "POST",
  "/api/tappenmars/gebruiker-rol",
  (e) => {
    const logica = require(`${__hooks}/kelder_logica.js`);
    try {
      const rolFout = logica.eisBeheerder(e.auth, "gebruikers beheren");
      if (rolFout) return e.json(403, { message: rolFout });
      const b = e.requestInfo().body;
      const geldig = ["beheerder", "medewerker", "alleen_lezen"];
      if (!b.user_id || geldig.indexOf(b.rol) === -1)
        throw new BadRequestError("user_id en een geldige rol zijn verplicht.");

      const doel = e.app.findRecordById("users", b.user_id);
      if (doel.getString("rol") === "beheerder" && b.rol !== "beheerder") {
        const beheerders = e.app.findRecordsByFilter("users", "rol = 'beheerder'", "", 10, 0);
        if (beheerders.length <= 1) {
          throw new BadRequestError(
            "Dit is de laatste beheerder — wijs eerst iemand anders als beheerder aan.",
          );
        }
      }
      doel.set("rol", b.rol);
      e.app.save(doel);
      return e.json(200, { ok: true, id: doel.id, rol: b.rol });
    } catch (err) {
      throw logica.leesbareFout(err);
    }
  },
  $apis.requireAuth(),
);
