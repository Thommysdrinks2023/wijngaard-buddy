# Fase 21 — Wat-als-simulatielaag: implementatiepad pasteurisatie

Status: **schets voor overdracht, geen code.** Vervolg op
`ONTWERP-SIMULATIE-1-ARCHITECTUUR.md` (akkoord van Thomas, 5 september
2026). Dit document is geen volledig stappenplan — dat komt in de aparte
bouwsessie — maar een korte, scherpe overdracht zodat die sessie niet de
nulmeting van Fase 1 hoeft te herhalen.

**Scope-herinnering uit Fase 1, besluit van Thomas**: "wat als" blijft in
deze bouwstap **uitsluitend pasteurisatie**. Gisting en GDD/rijpheid komen
pas aan de beurt na apart vervolgwerk (zie "Toekomstig werk" hieronder) —
niet in deze sessie, en niet als kleine toevoeging "omdat het toch dezelfde
UI-badge gebruikt".

---

## Welke functies hergebruiken, welke herschrijven

### Volledig herbruikbaar, ongewijzigd

- `puOverCurve()`, `voorspelPuVerloop()`, `puPerMinuut()`
  (`src/lib/pasteurisatie.ts`) — al 100% puur, geen databaseaanroep. Een
  "wat-als"-run roept deze exact zo aan als de live runmonitor nu al doet,
  alleen met een **synthetische** `TemperatuurMeting[]`-reeks in plaats van
  echte sensordata.
- `verwachteDruk()`, `veiligheidsoordeel()`, `maximaleCarbonatie()`
  (`src/lib/drukveiligheid.ts`) — idem, al puur, al hergebruikt in zowel de
  planner als de live monitor.

### Nieuw te bouwen (geen herschrijfwerk — dit bestaat nog niet)

- **Synthetische-curvegenerator**, als nieuwe pure functie in
  `src/lib/pasteurisatie.ts` (niet in `drukveiligheid.ts` — dit hoort bij de
  tijd-curve, niet bij het drukmodel). **Belangrijke vondst uit de
  nulmeting**: de rekenkundige vorm hiervan bestaat al, maar op de
  verkeerde plek: `scripts/seed-pasteurisatie.mjs:127-149` bouwt precies zo'n
  synthetische opwarm/houd/afkoel-curve op uit `{ opwarmMin, vanTemp,
naarTemp, houdMin, houdTemp, afkoelMin, eindTemp }` — bedoeld om
  testdata te genereren, niet om te simuleren, maar wiskundig identiek aan
  wat een "wat-als"-run nodig heeft (lineaire interpolatie per fase, één
  tijdstap-lus). **Til deze functie over naar `src/lib/pasteurisatie.ts`**
  als bijvoorbeeld `synthetiseerCurve(params, stapMinuten)`, exporteer hem,
  en laat het seed-script hem daarvandaan importeren in plaats van zijn
  eigen kopie te houden — één minder plek waar dezelfde wiskunde kan
  driften. Dit is klein, geïsoleerd werk, en levert twee dingen tegelijk op
  (simulatie-invoer + een opschoning van dubbele logica).
- **`SimulatieResultaat`-contract** (Fase 1, 1c) — nieuw gedeeld type,
  klein bestand (bijvoorbeeld `src/lib/simulatie.ts`): `{ status: "ok" |
"onvoldoende_data" | "model_ontbreekt", puntschatting, bandbreedte?,
aannames: string[], gevalideerd: false }`. Voor pasteurisatie is
  `status` in de praktijk altijd `"ok"` (het model bestaat en heeft geen
  historie nodig, alleen parameters) — `"model_ontbreekt"` is hier dus nooit
  bereikbaar, maar het type moet het al wel dragen zodat gisting/GDD er
  later zonder wijziging op aansluiten.
- **`<WatAlsBadge/>` en `<OnvoldoendeDataMelding/>`** (Fase 1, 1c) — twee
  kleine, domein-onafhankelijke UI-componenten. Voor pasteurisatie is
  vooral de badge relevant (`OnvoldoendeDataMelding` heeft hier weinig
  functie, zie vorige punt); bouw hem toch mee, klein genoeg om nu te doen
  en nodig zodra domein 2 volgt.

### Bewust NIET aanraken

- `pasteurisatie.plannen.tsx` (Blok D) zelf — de opdracht is expliciet: de
  wat-als-run start **vanaf** de planner, de planner wordt niet verbouwd.
  Zijn bestaande `gevoeligheidsdata`-sweep (temperatuur→druk, één
  parameter) blijft ongewijzigd bestaan naast de nieuwe, uitgebreidere
  wat-als-functionaliteit (volledige curve→PU+druk, meerdere parameters)
  — geen samenvoeging, dat zijn twee verschillende dieptes van dezelfde
  vraag en hoeven niet één UI te delen.
- `pasteurisatie.run.$runId.tsx` (live monitor) — geen wijziging nodig.
  De wat-als-functionaliteit leest niet uit een lopende run; hij simuleert
  een hypothetische, nog niet gestarte run.

---

## Nieuwe UI: een "wat-als-run" starten vanaf de planner

**Voorstel**: één nieuwe knop op `/pasteurisatie/plannen`, bijvoorbeeld
"Simuleer volledige curve", die — met de al ingevulde planner-parameters
(flestype, sluiting, carbonatie, doeltemperatuur, doel-PU) plus drie nieuwe
velden (opwarmduur, houdduur, afkoelduur, met verstandige defaults zoals nu
al in `seed-pasteurisatie.mjs` staan: ca. 15/20/20 minuten) — een
synthetische curve genereert, er `puOverCurve()` overheen legt, en het
resultaat toont in een **apart paneel onder de bestaande
gevoeligheidsgrafiek**, nooit erin gemengd:

- Een curve-grafiek (tijd × temperatuur, dezelfde `recharts`-opzet als de
  live monitor al gebruikt) met de synthetische reeks, **duidelijk anders
  gestijld dan een echte meetreeks** (bijvoorbeeld gestippeld, met de
  `<WatAlsBadge/>` er nadrukkelijk bovenop — nooit alleen een kleurverschil
  dat op een klein scherm makkelijk gemist wordt).
- De uitkomst: totale PU, tijdstip waarop het PU-doel bereikt wordt, en het
  veiligheidsoordeel (veilig/marginaal/onveilig) — exact dezelfde drie
  dingen die de live monitor al toont, nu voor een hypothetische in plaats
  van een echte run.
- Geen schrijfactie naar de server, nergens. Dit is een puur client-side
  berekening — geen nieuwe collectie, geen nieuw endpoint.

**Waarom dit de planner niet "verbouwt"**: het is een extra knop en een
extra paneel, geen wijziging aan de bestaande velden, berekeningen of
lay-out. Iemand die de knop nooit indrukt merkt niets.

---

## Risicovolle punten — expliciet voor de bouwsessie

### 1. Het ijkpuntprobleem uit Fase 17 — HERHAALD, NIET VERGETEN

**Dit is de belangrijkste waarschuwing in dit hele document.** Het
drukmodel (`drukveiligheid.ts`) is nog **niet gevalideerd tegen een echte,
gemeten flesdruk** — elk resultaat draagt `gevalideerd: false`, en dat is
geen technisch detail maar een expliciete, herhaalde beslissing van Thomas
sinds Fase 17. Een "wat-als"-simulatie bovenop een ongevalideerd model
**verergert dit risico**, niet vermindert het: een simulatie-UI die er
gepolijst en zelfverzekerd uitziet (grafiek, getal, "veilig"-badge) kan een
gebruiker gemakkelijker overtuigen dan de kale tekst
`DRUKVEILIGHEID_NIET_GEVALIDEERD` dat nu al getoond wordt. **Eis voor de
bouwsessie**: de `<WatAlsBadge/>` moet bij pasteurisatie-resultaten altijd
in combinatie met de bestaande niet-gevalideerd-tekst verschijnen, nooit in
plaats daarvan — een wat-als-uitkomst is dubbel onzeker (het is een
simulatie, gebaseerd op een niet-gevalideerd model) en moet dat ook dubbel
zo duidelijk zeggen. Bouw geen UI die "veilig" toont zonder in dezelfde
adem te herhalen dat het onderliggende model zelf nog niet is nagemeten.

### 2. Synthetische curve kan een fysiek onmogelijke opwarmsnelheid impliceren

De curvegenerator (overgenomen uit het seed-script) interpoleert lineair
zonder enige grens op hoe snel een tank/waterbad in werkelijkheid kan
opwarmen. Een gebruiker die "5 minuten opwarmen naar 65°C" invoert krijgt
een keurig berekend PU/druk-resultaat voor een curve die in de praktijk
niet haalbaar is. **Aanbeveling**: geen harde validatie bouwen (dat zou een
nieuw, ongevalideerd "haalbaarheids"-model toevoegen — precies wat Fase 1
afraadt), maar wel een zichtbare aanname-tekst tonen ("Deze curve gaat uit
van een lineaire opwarm-/afkoelsnelheid — controleer of dat haalbaar is met
je apparatuur") als onderdeel van het `aannames`-veld in
`SimulatieResultaat`.

### 3. Verwarring tussen de twee sweeps op hetzelfde scherm

Zodra de planner zowel de bestaande `gevoeligheidsdata`-temperatuursweep
als de nieuwe volledige-curve-simulatie toont, moet héél duidelijk zijn dat
dit twee verschillende vragen zijn ("hoe gevoelig is de druk voor de
doeltemperatuur, bij een ogenblikkelijke temperatuursprong" versus "wat
gebeurt er over de hele opwarm/houd/afkoel-curve"). Zonder duidelijke
koppen/uitleg kan een gebruiker de twee grafieken door elkaar halen en een
verkeerde conclusie trekken over welke temperatuur "veilig" is. Geef ze
duidelijk gescheiden secties met eigen uitleg, niet naast elkaar zonder
context.

### 4. Weersta de verleiding om dit óók voor gisting te doen "omdat de badge er al is"

Zodra `<WatAlsBadge/>` en `SimulatieResultaat` bestaan, is de verleiding
groot om ze meteen ook op de gistingscurve te plakken. Fase 1 en het
besluit van Thomas zijn hier expliciet: dat vereist eerst een
temperatuur→gistingssnelheid-domeinmodel dat niet bestaat (zie hieronder).
Een badge neerzetten op een extrapolatie die geen temperatuur-invoer heeft
zou de indruk wekken dat er een "wat als bij andere temperatuur"-vraag
beantwoord wordt, terwijl de onderliggende berekening dat woord niet eens
kent. Dat is precies de schijnzekerheid die dit hele ontwerp probeert te
voorkomen.

---

## Toekomstig werk — expliciet vastgelegd, niet stilzwijgend losgelaten

Op verzoek van Thomas: de twee ontbrekende domeinmodellen uit Fase 1 worden
hier vastgelegd met hun randvoorwaarden, zodat ze bij een volgende
planningsronde niet opnieuw uitgevonden hoeven te worden.

### Temperatuur→gistingssnelheid (nodig voor "wat als bij 16°C i.p.v. 18°C")

- **Randvoorwaarde, expliciet van Thomas**: dit model mag **niet** gebouwd
  worden op aannames over hoe gisting bij De Tappenmars op temperatuur
  reageert — dat zou dezelfde fout herhalen als het losgelaten 8-bar-
  ijkpunt bij het drukmodel (Fase 17). Er is een **gedraaid seizoen met
  temperatuurgevarieerde metingen** nodig voordat dit verantwoord te
  kalibreren is.
- Wat er ondertussen wél kan: als er ooit gistingen bij verschillende
  temperaturen zijn gemeten (ook toevallig, niet expres als experiment),
  is de data er al — `analyses` bevat zowel dichtheid als (waarschijnlijk)
  gistingstemperatuur; controleer dit bij de volgende sessie die dit
  oppakt in plaats van opnieuw aan te nemen dat het er niet is.
- Tot die tijd: `gisting-verwachting.ts` blijft zoals hij is. Geen
  wat-als-badge, geen simulatie-poging.

### Weer/GDD→rijpheid (nodig voor "wat als ik vijf dagen wacht met plukken")

- **Randvoorwaarde, expliciet van Thomas**: dit model hoort **niet los**
  ontworpen te worden — het moet samen met de weer/ziektemodule uit
  `docs/marktverkenning.md` (Botrytis-/peronospora-drukberekening,
  spuitvenster-advies) opgepakt worden, omdat beide dezelfde onderliggende
  weerdata (en waarschijnlijk dezelfde weersverwachting-bron) nodig hebben.
  Twee aparte weer-gebaseerde modellen na elkaar ontwerpen zonder dit besef
  zou tot dubbel werk of tegenstrijdige aannames over de weerbron leiden.
- Wat er ondertussen wél bestaat om op voort te bouwen: `gdd.ts` (warmtesom)
  en de al aanwezige, maar aparte `weer.ts` (3-daagse OpenWeatherMap-
  verwachting) — beide ongewijzigd bruikbaar als bouwstenen zodra dit
  domein wordt opgepakt.
- Tot die tijd: geen wat-als-functionaliteit op `/rij/$rijId` of de
  perceelkaart.

---

## Omvangschatting

**Klein tot middel.** Ter oriëntatie:

- Curvegenerator overtillen + exporteren: klein (functie bestaat al,
  overtypen/verplaatsen + één test).
- `SimulatieResultaat`-type + twee UI-componenten: klein (geen bestaande
  complexiteit om mee te integreren, puur nieuwe, kleine bestanden).
- Nieuwe knop + paneel op de planner (curve-grafiek, resultaatkaart,
  aannames-tekst, dubbele niet-gevalideerd-waarschuwing): middel — dit is
  het grootste deel van het werk, vooral de UI/grafiek, niet de rekenkern.
- Geen schema-, endpoint- of collectiewijziging nodig — hele fase is
  client-side.

Ga uit van een **middelgrote sessie** (niet groot) voor het Fable-budget:
vergelijkbaar met een gemiddeld "Blok" uit Fase 17, niet met een hele fase.

---

**Dit document is de overdracht naar de bouwsessie. Er wordt hier nog niets
gebouwd.**
