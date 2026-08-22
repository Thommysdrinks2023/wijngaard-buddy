/// <reference path="../pb_data/types.d.ts" />
// Fase 14 Blok B — RFID/NFC-tag-opzoek. Geen tags besteld of hardware
// gekoppeld; dit endpoint bewijst dat de software-kant werkt met verzonnen
// tekst-tags (bijv. "test-tank-3"), zodat de eerste échte tag straks alleen
// nog op een tank geplakt en in het tankdetail ingevuld hoeft te worden.
//
// Normale gebruikersauthenticatie (requireAuth), GEEN sensor-token: dit
// endpoint wordt aangeroepen door iemand die met de app/telefoon een tag
// scant, niet door onbemande hardware (vergelijk sensor.pb.js).

routerAdd(
  "GET",
  "/api/tappenmars/tank-bij-tag",
  (e) => {
    const tag = e.request.url.query().get("tag") || "";
    if (!tag.trim()) {
      throw new BadRequestError("tag is verplicht.");
    }
    let tank;
    try {
      tank = e.app.findFirstRecordByFilter("tanks", "nfc_tag = {:t}", { t: tag.trim() });
    } catch (err) {
      throw new ApiError(404, `Geen tank gevonden met tag "${tag}".`, {});
    }
    return e.json(200, {
      id: tank.id,
      code: tank.getString("code"),
      status: tank.getString("status"),
      huidige_partij: tank.getString("huidige_partij"),
      huidig_volume_l: tank.getFloat("huidig_volume_l"),
    });
  },
  $apis.requireAuth(),
);
