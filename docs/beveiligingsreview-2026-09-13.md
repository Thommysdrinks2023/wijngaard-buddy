# Gezamenlijke beveiligingsreview — 13 september 2026

Opdracht van Thomas: _"Kijk samen met Codex eens naar de beveiliging van mijn app."_

Aanpak: de pentest van 10 september (`docs/beveiligingsonderzoek-2026-09-10.md`)
dekte de toen bestaande endpoints. Sindsdien is er nieuwe code bijgekomen —
vooral Codex' nieuwe overhevel-endpoint met verliesboeking. **Nieuwe code is
nieuwe aanvalsoppervlakte**, dus die is hier opnieuw aangevallen, niet alleen
gelezen. Daarnaast heeft Codex mijn werk beoordeeld en ik het zijne (§4 van
`docs/SAMENWERKING-AGENTS.md`).

Alle probes zijn live uitgevoerd tegen `127.0.0.1:8090`. Testdata is verwijderd
en op nul restanten gecontroleerd; tank 3 is met `tanks-herbereken` teruggezet
op zijn oorspronkelijke 95 L.

---

## 1. Nieuw endpoint: overhevelen mét verlies — gehouden

Codex heeft de twee losse boekingen vervangen door één serveraanroep met
`verlies_l`/`verlies_type`, in één transactie. Zeven aanvalspogingen:

| Probe                                        | Uitkomst                                           |
| -------------------------------------------- | -------------------------------------------------- |
| Negatief verlies (`-5`)                      | 400 — geweigerd                                    |
| `Infinity` (`1e999`)                         | 400 — al door de JSON-decoder geweigerd            |
| Verlies bij een niet-overhevelen-actie       | 400 — geweigerd                                    |
| Aangekomen + verlies > brontank (90+50 > 95) | 400 — geweigerd                                    |
| Verlies zonder `van_tank`                    | 400 — "Van-tank niet gevonden"                     |
| `verlies_type` van 60.000 tekens             | 400 — schema begrenst `notitie` op 5000 tekens     |
| Legitieme boeking (5 L + 1 L verlies)        | 200 — twee regels, tank 95 → 89 L, precies correct |

### Het belangrijkste resultaat: de atomiciteit is nu écht bewezen

De 60.000-tekenprobe is meer dan een lengtecontrole. Die lange tekst gaat alleen
in de notitie van de **verliesregel**, dus de overhevelregel was op dat moment
al weggeschreven. Toen het opslaan van de tweede regel afketste op de
5000-tekenlimiet, bleef de uitkomst:

- **nul** tankboekregels
- tank 3 onveranderd op 95 L

De hele transactie is dus teruggedraaid bij een fout ná de eerste write. Dat is
precies waarvoor Codex daar bewust `throw` gebruikt in plaats van `{ fout }`
terug te geven. In zijn eigen overdracht stond dit nog als "echte
schrijftest/rollbacktest op PocketBase blijft niet gedaan" — die is hierbij
gedaan, en geslaagd.

## 2. Bevestigde bevinding van Codex: rollback bij een late bottelfout

Codex vond bij code-inspectie dat het bottelpad die garantie **niet** heeft.
Ik heb het nagelopen en het klopt:

- `pocketbase/pb_hooks/kelder_logica.js:430` en `:443` — faalt de
  flessenmutatie (verbruik of breuk) nadat de bottelronde al is weggeschreven,
  dan wordt `{ fout }` **geretourneerd**, niet gegooid.
- `pocketbase/pb_hooks/agent.pb.js:91` — de agent registreert die fout als
  status "mislukt" en laat de transactie **normaal eindigen**. Geen rollback.

**Aanvulling die Codex expliciet openliet: dit is bereikbaar, niet theoretisch.**
De agent kent een echte bottelactie — `agent_uitvoering.js:1409` bouwt het
voorstel `actie_type: "bottelronde"` en `:1649` voert het uit. Een door de
gebruiker bevestigde botteling die halverwege faalt, laat dus een bottelronde
staan terwijl de flessenvoorraad níet is bijgewerkt: de voorraad en het
bottelregister lopen uiteen.

Ernst: **midden** — het vereist een fout ín de flessenmutatie, en de actie wordt
wel zichtbaar als "mislukt" gemarkeerd. Maar de administratie klopt daarna niet
meer, en dat is precies de categorie waar dit project streng in is.

Dit ligt in het kelderdomein en is Codex' vondst; hij heeft aangekondigd er een
gerichte foutinjectietest bij te bouwen en dezelfde grens te bewaken als bij de
verliesboeking. Niet door mij aangeraakt.

## 3. Codex' review van mijn werk — één terechte codefout, nu gerepareerd

`pingPb()` in `src/lib/data.ts` gebruikte alleen `Promise.race` voor de
3,5-secondentimeout. `Promise.race` laat de verliezer echter gewoon doorlopen:
het health-verzoek bleef openstaan tot de browser het zelf opgaf, en op een
trage verbinding stapelen die zich op. Nu met een `AbortController`, zodat de
fetch bij de timeout daadwerkelijk stopt.

Codex' tweede opmerking was ook terecht en betrof mijn formulering, niet de
code: "gedeelde ping" is te ruim gesteld. Alleen aanroepen via `ensureOnline()`
delen de lopende ping; een directe `pingPb()`-aanroep doet dat niet.

## 4. Waar de pentest van 10 september nog steeds staat

Ongewijzigd, en bewust: de drie zware punten (`/bevestig` zonder auth, open
PII in `klanten`, wildcard-CORS) zijn geen nieuwe lekken maar de openstaande
auth/rollen-beslissing van Thomas. Onschadelijk zolang de server op
`127.0.0.1` luistert, op te lossen vóór de Pi-migratie.

**Nieuw punt daarbij, gevonden op 12 september:** de cross-user session leak die
in augustus was gedicht, is weer open. De fix zat in
`synchroniseerServerSessieMetCookie()` in `src/lib/auth-guard.ts` en is op
22 augustus meeverwijderd met het inloggen. `getPb()` is nog steeds een
module-scoped singleton. Nu onschadelijk (geen auth = geen sessie), maar het
lek keert terug op het moment dat auth wordt hersteld — dus precies tijdens de
klus waarin niemand eraan denkt. Staat nu als ontbrekende stap in `CLAUDE.md`.

## 5. Losse bevinding: de Anthropic-sleutel is ongeldig

`POST /api/agent/bericht` geeft `"API key is invalid"`. De `.env` is sinds
17 juli niet gewijzigd en de sleutel staat er correct in (juiste prefix, normale
lengte), dus hij is aan Anthropic-zijde ongeldig geworden. **`/assistent` werkt
op dit moment niet.** Alleen Thomas kan dit oplossen met een nieuwe sleutel.

---

## Conclusie

De nieuwe code houdt stand tegen dezelfde aanvalsklasse die in de vorige pentest
wél gaten opleverde, en de atomiciteitsgarantie is nu met een echte late fout
bewezen in plaats van beredeneerd. Eén reëel integriteitsgat is gevonden (het
bottelpad via de agent) en ligt bij Codex. Eén codefout in mijn eigen werk is
gevonden door Codex en gerepareerd.

Het resterende zware risico is onveranderd geen bug maar een uitgesteld besluit:
authenticatie. Dat moet vóór de Pi-migratie, en de session-leak-fix hoort in
diezelfde klus mee.
