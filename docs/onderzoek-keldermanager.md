# Onderzoek — keldermanager efficiënter maken en meer data verzamelen

Datum: 10 september 2026. Opdracht van Thomas: _"hoe kunnen wij de keldermanager
verbeteren, meer efficiënt maken en makkelijker gaan werken. Daarbij wil ik meer
focussen op het verzamelen van data, hoe kan ik dit nog meer integreren."_

Methode: 14 parallelle onderzoeksagents in vier fases — zes verkenningslijnen
(wrijving in het dagelijks werk, gaten in het datamodel, sensoren/hardware, de
integratieketen, vakinhoud/regelgeving, het eigen archief), drie
ontwerpvoorstellen vanuit verschillende invalshoeken, drie adversariële critici
plus een volledigheidscriticus, en een synthese. 46 bevindingen, 20 voorstellen,
waarvan 5 de kritiek overleefden.

> **Waarschuwing bij de bedragen in dit document**: WebSearch was tijdens dit
> onderzoek onbeschikbaar. Alle prijzen komen uit `docs/hardware-kelder-ideeen.md`
> (21 augustus 2026), niet uit verse bronnen. Verifiëren vóór aanschaf.

---

## Antwoorden van Thomas (10 september 2026) — vastgelegde besluiten

Deze vijf antwoorden zijn gegeven ná het onderzoek en veranderen de prioritering.
Ze staan hier als besluit, niet als suggestie.

### 1. Wifi in de kelder — geen probleem

Overal goed bereik en verbinding. De online-only-aanname van kelder/voorraad
(bewust geen sync-wachtrij, zie `partijen-data.ts`) blijft dus houdbaar. Wel
graag verbindingsproblemen melden als ze zich alsnog voordoen.

### 2. Agent-chatpad nog niet geprobeerd

Het bestaande pad (`stel_analyse_voor`/`stel_kelderlog_voor` in
`agent_logica.js`) is nog niet in de praktijk getest als snelinvoermethode.

### 3. Temperatuur wordt nu niet standaard gemeten

Kan wel. Een temperatuurveld op `analyses` is dus bruikbaar, maar levert pas
data op als het meten zelf een gewoonte wordt — niet iets om op te leunen.

### 4. Temperatuursonde eerst — en de CO2-melder bewust NIET via de app

**Dit corrigeert het onderzoeksadvies, dat de CO2-melder als eerste hardware
voorstelde.** Thomas' redenering, integraal overgenomen omdat hij gelijk heeft:

> Een CO2-melder is een veiligheidsapparaat — koop een gecertificeerde melder die
> zelfstandig alarm slaat op batterij, zonder afhankelijkheid van wifi, server of
> app. Een app-koppeling mag daar hooguit een logboek bovenop zijn. Je wilt nooit
> dat een gaswaarschuwing afhangt van of je router het doet.

**Besluit**: de CO2-veiligheid gaat buiten dit project om — een zelfstandige,
gecertificeerde melder op batterij. De app mag daar later hooguit een
meetlogboek naast zetten, nooit de alarmfunctie zelf. De temperatuursonde is de
eerste sensor: die sluit aan op wat er al staat (Fase 14/17,
`POST /api/sensor/meting`, temperatuurlijn op de fermentatiecurve) en levert
meteen resultaat.

Dit lost ook de tegenstrijdigheid in `docs/hardware-kelder-ideeen.md` op (de
tekst zei "als er maar één ding komt, laat het de CO2-melder zijn", de
volgordetabel zette temperatuur eerst): **temperatuur eerst, CO2 niet via de app.**

### 5. Het echte knelpunt — dubbele invoer

Thomas' eigen antwoord op "wat stoort jou het meest":

> Opslaan van data snel en efficiënt. Als er handelingen worden gedaan moet
> eigenlijk alles genoteerd worden. Dit gebeurt nu analoog en vervolgens digitaal
> in een logboek. Daarnaast moet dezelfde informatie op veel verschillende plekken
> worden opgeslagen.

**Dit is het belangrijkste resultaat van dit onderzoek en het weegt zwaarder dan
alles wat de agents zelf vonden.** Er zitten twee losse problemen in:

- **(a) Analoog → digitaal.** Er wordt eerst op papier genoteerd in de kelder, en
  later nog eens ingetikt. Dat is per handeling dubbel werk én een risico:
  wat op papier blijft staan, komt nooit in de data terecht.
- **(b) Dezelfde informatie op meerdere plekken.** Eén handeling vereist invoer
  op meerdere schermen/plekken in plaats van één keer vastleggen.

Het onderzoek richtte zich vooral op (a) — sneller invoeren op het moment zelf.
Probleem (b) is een architectuurvraag die niet is uitgezocht: **welke handeling
vraagt precies welke dubbele invoer?** Dat moet als eerste boven tafel.

Wat wél al concreet gevonden is voor (b):

| Handeling                              | Schrijft automatisch                                           | Moet je apart nog doen                                            |
| -------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Overhevelen (`kelder.overhevelen.tsx`) | `tankboek` (via `boekTankboek`, plus een 2e regel bij verlies) | een `kelderlog`-notitie tikken als je het in het werklogboek wilt |
| Partij aanmaken                        | `partijen` + `tankboek` (atomisch, `kelder.pb.js`)             | —                                                                 |
| Pasteurisatierun starten               | `pasteurisatie_runs` + `kelderlog` (atomisch)                  | —                                                                 |
| Order leveren                          | `orders` + `voorraad_mutaties` (atomisch)                      | —                                                                 |

`createKelderlog()` wordt vanuit vier plekken los aangeroepen
(`calculators-sectie.tsx`, `kelder-data.ts`, partijdetail, tankdetail). Sommige
ketens zijn dus wél atomisch dichtgetimmerd, andere niet — dat verschil is
historisch gegroeid, niet ontworpen.

---

## Herziene prioritering (na antwoord 5)

Het oorspronkelijke advies zette "tank-QR → direct meetformulier" bovenaan. Dat
blijft goed, maar is te smal: het lost alleen _metingen_ op, terwijl Thomas zegt
dat **alle handelingen** genoteerd moeten worden en dat de dubbele opslag het
probleem is.

**Stap 0 — eerst uitzoeken, niet bouwen.** Breng in kaart welke handelingen
Thomas in een werkweek doet, welke hij nu op papier zet, en waar dezelfde
gegevens twee keer ingevoerd worden. Zonder die lijst is elke bouwkeuze een gok.
Dit vraagt zijn input, geen code-analyse.

**Stap 1 — het bestaande snelste pad testen (kost niets).** De agent kan
vandaag al "Oechsle 85 op tank 12, log dat" verwerken via een bevestigingskaart.
Met spraak-naar-tekst, met natte handen, is dat mogelijk al sneller dan welk
formulier ook. Eerst proberen, dán pas bouwen.

**Stap 2 — één handeling, één invoer.** Op basis van stap 0: zorg dat een
handeling die logisch bij elkaar hoort ook in één keer wordt vastgelegd. Het
duidelijkste bekende geval: een overheveling zou zelf een kelderlogregel moeten
kunnen schrijven zonder dat je die apart tikt.

**Stap 3 — de vijf voorstellen die de kritiek overleefden** (zie hieronder),
in de volgorde die na stap 0 logisch blijkt.

---

## De vijf voorstellen die de kritiek overleefden

### 1. Oogst-herkomst zichtbaar maken — klein, wacht op niets

De koppeling `oogst.partij` bestaat al sinds Fase 13, maar wordt nergens
getoond. "Uit welke rijen komt lot X" is daardoor onbeantwoordbaar, terwijl de
data er gewoon staat.

Bouw: `fetchOogst()`-query in `kelder.partijen.$partijId.tsx` (herkomstsectie met
rijnummers/kg); `zoek_oogst`/`partij_detail` in de agent geven `rij`/`partij`
weer terug in plaats van ze te strippen.

Schoonste voorstel van de lijst: geen schema, geen nieuwe invoer, geen
transactierisico. Ontsluit puur wat er al ligt.

### 2. Tank-QR → direct meetformulier — middel, wacht op niets

De meest voorkomende kelderhandeling kost nu 6+ stappen via de partijpagina van
1635 regels. `kelder.qr.tsx` linkt naar tankdetail, waar wel Reiniging/Peiling/
Overhevelen staan maar geen analyse-knop.

Bouw: één gedeelde `analyse`-opslagfunctie (geen tweede implementatie naast de
bestaande mutatie in partijdetail), aangeroepen vanuit een nieuwe
"Analyse"-knop op `kelder.tanks.$tankId.tsx` met een compact modal
(datum/Brix-Oechsle/optioneel temperatuur). QR blijft naar tankdetail linken —
anders verlies je één-tik-toegang tot de andere acties.

Kleine toevoeging: markeer op `kelder.index` welke tank het langst niet gemeten
is (live berekend, geen cron nodig).

### 3. Temperatuurveld op `analyses` — klein

Optioneel veld `temperatuur_c` via `ensureVelden()`, in hetzelfde formulier als
voorstel 2, als vijfde lijn op de fermentatiecurve — handmatige metingen anders
gestileerd dan sensordata (stippen vs. lijn). Levert pas data op als het meten
gewoonte wordt (zie antwoord 3).

### 4. Additieven-/behandelingenlog — middel

SO2, gist, enzymen en bentoniet zitten nu als vrije tekst in `kelderlog.middel`.
Niet doorzoekbaar, niet optelbaar — terwijl dit precies de data is die
etikettering en NVWA-controle vereisen.

Bouw: collectie `additieven` (partij, actie_type, stof, dosering, eenheid,
moment). Het bestaande "toevoeging"-logmoment maakt er automatisch een record
bij. **Twee opeenvolgende client-side creates, geen echte transactie** —
`createKelderlog()` is nu al een kale client-side create zonder serverhook. Voor
additieven acceptabel; dit is geen accijnsregister zoals het tankboek.

Het "gemiddeld SO2 per ras/jaargang"-rapport nog laten liggen — daar is nog geen
meerjarendata voor.

### 5. Foto-upload bij kelderlog — klein

Kleiner dan het lijkt: het `foto`-veld op `kelderlog` bestaat al in het schema en
wordt al uitgelezen (`kelderlogFromPb()`). Alleen de upload-UI ontbreekt.
Hergebruik `foto-compressie.ts` (EXIF-strip is verplicht projectpatroon) plus een
thumbnailstrip op de partijpagina.

---

## Wat is afgevallen, en waarom

- **Prefill "aangekomen volume" bij overhevelen** — bouwt een schijnzekere
  aanname in ("geen verlies") die je met één tik bevestigt zonder te meten.
  Precies wat dit project niet wil, en het raakt accijnsgevoelige data.
- **Conceptopslag (draft-autosave) op kelderformulieren** — generieke
  infrastructuur voor een niet-aangetoonde pijn bij formulieren van 3-6 velden.
  Twee ontwerpers stelden dit onafhankelijk voor; dat is geen extra bewijs, wel
  een teken dat het aantrekkelijk _lijkt_.
- **Losse route `/kelder/snel`** — overlapt met dashboard en voorstel 2. Het
  bruikbare deel (sorteren op "langst niet gemeten") zit al in voorstel 2.
- **"Recent gebruikt"-sectie** — tweede navigatiepatroon voor een
  niet-vastgestelde pijn; het dashboard toont al actieve partijen.
- **App-voorgestelde meetmomenten** en **automatisch gistingssignaal** —
  vereisen een dagelijkse cron die er niet is (`bereken-inzichten.mjs` draait
  wekelijks en handmatig tot de Pi er staat) en zouden
  `regelgeving_instellingen` misbruiken (bedoeld voor wettelijk geverifieerde
  tarieven, niet operationele drempels).
- **MLF-status als apart veld** — uitgesteld, niet afgevallen. De aanname dat
  malolactische gisting voor alle rassen relevant is klopt waarschijnlijk niet
  (aromatische witten willen vaak juist géén MLF). Eerst navragen.
- **Automatische peiling-koppeling bij overhevelen** — eerlijker dan de
  prefill-variant, maar een peiling is nu een losstaande tankboekregel.
  "Automatisch" koppelen is een gok die verkeerde tankboekdata kan vastleggen.
- **Kleur/helderheid als vaste schaal** — goed idee, maar niet blind een schaal
  verzinnen die niet aansluit bij hoe Thomas er zelf naar kijkt. Open vraag.

---

## Hardware — stand van zaken

**Softwarematig is alles al klaar** sinds Fase 7/14: `POST /api/sensor/meting`
(token-beveiligd, plausibiliteitsgrenzen, ondersteunt temperatuur/CO2/gewicht/
dichtheid), append-only collectie `sensor_metingen`, `SENSOR_TOKEN` in `.env`,
temperatuurlijn op de fermentatiecurve. Er hangt alleen nog geen apparaat aan.

**De sensoren wachten niet op de Pi.** Ze praten via wifi met PocketBase,
ongeacht of die op de laptop of de Pi draait. De Pi geeft alleen 24/7-
beschikbaarheid zonder dat de laptop aan hoeft, plus het moment waarop het
auth/rollenbesluit sowieso genomen moet zijn.

**Eerste sensor: temperatuursonde** (besluit Thomas, zie antwoord 4).
ESP32 + DS18B20, volgens het bestaande plan ~€12 — te verifiëren.

**CO2: buiten de app om.** Gecertificeerde, zelfstandige melder op batterij.
Geen afhankelijkheid van wifi, server of app voor de alarmfunctie.

---

## Open vragen

1. **Welke handelingen noteer je nu op papier, en waar tik je dezelfde gegevens
   twee keer in?** (stap 0 hierboven — dit is de belangrijkste openstaande vraag)
2. **Kleur/helderheid**: welke schaal herken je zelf — een selectlijst
   (strogeel/goudgeel/oud goud) of een cijfer (NTU, als je een troebelheidsmeter
   hebt)?
3. **MLF**: voor welke partijen/rassen is malolactische gisting bij jou relevant?

---

## Verwijzingen

- `docs/marktverkenning.md` — concurrentie- en marktanalyse (deze studie bouwt
  daarop voort en herhaalt hem niet)
- `docs/hardware-kelder-ideeen.md` — het bestaande hardwareplan van 21 augustus
  2026; op het punt van de CO2-volgorde achterhaald door antwoord 4 hierboven
- `AUDIT-MEDEWERKER.md` §4 — de eerdere constatering dat partij→rij-herkomst niet
  terug te zoeken is (voorstel 1 lost dit op)
- `CLAUDE.md` — projectcontext, JSVM-valkuilen, het openstaande auth/rollenbesluit
