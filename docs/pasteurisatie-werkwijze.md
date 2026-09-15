# Pasteurisatie — werkwijze (Fase 17)

Hoe je een run opzet, waar de referentiesensor hoort, en wat je doet bij
sensoruitval. Dit document gaat over de WERKWIJZE; de formules zelf staan in
`docs/pasteurisatie-formules.md`.

## Veiligheidskader (herhaling — dit staat voorop)

De app **registreert en adviseert**. Ze stuurt niets aan: geen kleppen, geen
verwarming, geen automatische stop. Elke drukberekening is een **conservatieve
schatting**, geen garantie — het model is nog niet gevalideerd tegen een
echte, gemeten flesdruk (zie "Validatiestatus" onderaan). Verifieer bij twijfel
altijd tegen de fabrieksspecificatie van de sluiting, en bij een marginaal of
onveilig oordeel: overleg, meet, en leg de beslissing vast — de app dwingt die
vastlegging af (`oordeel_geaccepteerd_door`), maar de beoordeling zelf blijft
bij jou.

## Een run opzetten

1. Ga naar **Pasteurisatie → Run starten** (of gebruik eerst **Vooraf
   plannen** om de drukveiligheid door te rekenen vóórdat je iets in de fles
   doet).
2. Voer het **lotnummer** in. De app zoekt de bijbehorende partij op en toont
   ter bevestiging de eigenaar, het product en de laatste logboekregels —
   controleer dat dit echt de batch is die je bedoelt.
3. **Onbekend lotnummer?** De app biedt aan een nieuwe partij aan te maken
   ("alleen bottelen"-variant, voor loonproductie waarbij De Tappenmars alleen
   bottelt en pasteuriseert). Er ontstaat nooit een run zonder partijkoppeling.
4. Vul flestype, sluiting, vulvolume, carbonatie en doeltemperatuur in. De app
   toont meteen het veiligheidsoordeel. Bij marginaal/onveilig: je kunt
   alsnog starten, maar moet dat expliciet bevestigen met je naam.
5. Zodra de run "actief" is, staat hij vanaf het startscherm (hub) zichtbaar
   met een rode markering — een lopende pasteurisatie mag je niet vergeten.

## Waar hoort de referentiesensor?

**Op het traagst opwarmende punt in de lading** — niet het gemiddelde, niet
het snelst opwarmende punt. Dat is namelijk het punt dat de MINIMUM-PU van de
hele batch bepaalt: als de rest van de lading al ruim in het doelbereik zit
maar één fles achterblijft, is de batch als geheel nog niet klaar.

In de praktijk (nader te bevestigen door Thomas, zie
`docs/pasteurisatie-formules.md`/WERKLOG "VRAGEN VOOR THOMAS"):

- meestal het midden van de lading, of de fles die het verst van de
  warmtebron af staat;
- geen fles aan de rand die als eerste warmte krijgt.

Vul de gekozen positie in bij "Referentiesensor (positie/label)" bij het
starten van de run — dit wordt vastgelegd en verschijnt letterlijk op het
certificaat ("PU is bepaald aan een referentiefles op positie ..."). Zonder
die context is een PU-getal betekenisloos voor wie het certificaat later
leest.

## Tijdens de run

- De live monitor (`/pasteurisatie/run/:id`) toont de temperatuurcurve, de
  opgebouwde PU (groot, met de doelband 100–150 als zone), een voorspelling
  van wanneer de ondergrens bereikt wordt, en een live drukschatting.
- Meldingen verschijnen automatisch op het startscherm (Vandaag-widget) zodra:
  - de ondergrens van het PU-doel bereikt is,
  - de bovengrens bereikt of overschreden is (overweeg af te ronden),
  - de drukmarge overschreden wordt,
  - er langer dan het ingestelde interval (standaard 2 minuten) geen meting
    binnenkomt van de referentiefles.

## Bij sensoruitval

Een monitor die stilletjes stopt is gevaarlijker dan geen monitor — daarom
meldt de app dit expliciet (zie hierboven) in plaats van gewoon niets meer te
laten zien. Bij uitval:

1. Controleer de sensor/verbinding.
2. Zolang die niet hersteld is: gebruik **handmatige temperatuurinvoer** op
   het monitorscherm — meet met een thermometer en voer op vaste intervallen
   (bijv. elke 2–5 minuten) een waarde in. De PU-berekening werkt identiek,
   ongeacht of een meting van een sensor of handmatig komt.
3. Een gat in de reeks (groter dan de ingestelde drempel) wordt bij het
   afronden gemeld en zichtbaar gemaakt — de PU-uitkomst is dan minder zeker,
   maar wordt niet stilzwijgend "gladgestreken".

## Een run afronden

Bij het afronden berekent de app de definitieve PU over de VOLLEDIGE curve
(opwarmen + houden + afkoelen). Dit schrijft automatisch:

- een eindregel in het kelderlog van de batch (totale PU, verdeling over de
  fasen, piektemperatuur, aantal flessen),
- de run zelf op "afgerond".

Daarna kun je een **certificaat** genereren (PDF, met de temperatuurcurve als
grafiek) — elke generatie maakt een nieuwe, genummerde versie; er wordt nooit
overschreven.

## Validatiestatus

Zolang een rekenmodel niet is bevestigd met een echte, nagemeten run, toont de
app overal een "nog niet gevalideerd"-markering. Ga naar **Instellingen →
Validatiestatus rekenmodellen** om een model als gevalideerd te markeren
zodra je een run hebt nagemeten (drukopnemer/manometer of een onafhankelijke
temperatuurlog) en de uitkomst overeenkomt met wat het model voorspelde. Zet
een toelichting erbij (welke run, wat er precies is vergeleken) — dat is wat
een toekomstige controleur of jijzelf later terugleest.
