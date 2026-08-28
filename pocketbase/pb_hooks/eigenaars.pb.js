/// <reference path="../pb_data/types.d.ts" />
//
// Fase 16 Blok C — eigenaarscode afdwingen, met een overgangsregel.
//
// Elke eigenaar heeft in de administratie een tweecijferige code
// (De Tappenmars = 01, Thommy's Drinks = 07). Die code is verplicht voor
// NIEUWE eigenaars, maar de codes van de externe loonproductieklanten zijn
// nog niet allemaal bekend. Daarom:
//
//   nieuw record  -> code verplicht, exact twee cijfers
//   bestaand record -> mag zonder code blijven bestaan en normaal gebruikt
//                      worden; het beheerscherm toont wel zichtbaar dat de
//                      code ontbreekt (stil laten liggen is hoe zoiets
//                      jarenlang blijft hangen)
//
// Het schema zelf zet `code` bewust NIET op required: dat zou elke PATCH op
// een bestaand record zonder code laten falen, en dan kun je zo'n record ook
// niet meer op inactief zetten of een notitie toevoegen.

onRecordCreateRequest((e) => {
  const code = (e.record.getString("code") || "").trim();
  if (!code) {
    throw new BadRequestError(
      "Een nieuwe eigenaar heeft een tweecijferige code nodig (bijvoorbeeld 01 voor De Tappenmars, 07 voor Thommy's Drinks).",
    );
  }
  if (!/^[0-9]{2}$/.test(code)) {
    throw new BadRequestError(
      "De eigenaarscode moet uit precies twee cijfers bestaan, bijvoorbeeld 03.",
    );
  }
  e.next();
}, "eigenaars");

// Bij wijzigen mag de code leeg blijven (overgangsregel), maar een INGEVULDE
// code moet wel het juiste formaat hebben — anders sluipt "7" of "007" er
// alsnog in via het bewerkformulier.
onRecordUpdateRequest((e) => {
  const code = (e.record.getString("code") || "").trim();
  if (code && !/^[0-9]{2}$/.test(code)) {
    throw new BadRequestError(
      "De eigenaarscode moet uit precies twee cijfers bestaan, bijvoorbeeld 03.",
    );
  }
  e.next();
}, "eigenaars");
