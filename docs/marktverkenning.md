# Marktverkenning wijnbouw-/kelderbeheersoftware

Uitgevoerd 2026-09, op verzoek van Thomas: hoe verhoudt De Tappenmars Buddy
zich tot Kelderbazen.nl en andere wijnbouw-/kelderbeheerpakketten, en welke
functies ontbreken die de markt wel standaard biedt?

## TL;DR

- **Kelderbazen.nl** is de meest directe Nederlandse concurrent: een web-app
  (abonnement, €288–312/jaar plus soms €312 opstartkosten) gericht op de
  van-oogst-tot-fles-administratie met nadruk op NVWA/douane-compliance,
  etikettering (ingrediënten/allergenen/voedingswaarden) en een
  productencatalogus — maar De Tappenmars Buddy is qua diepte (48 tanks,
  gistingscurve-voorspelling, PU/pasteurisatiemonitor, AI-agent) al breder
  dan Kelderbazen op de productie-/kelderkant.
- De grootste ontbrekende functies die commerciële pakketten wél standaard
  hebben: (1) DTC/e-commerce + wijnclub/abonnementen + proeverij-/
  reserveringsbeheer, (2) ziekte-/plaagvoorspelling gekoppeld aan
  weerstations (valse meeldauw/oïdium/botrytis), (3) GPS/perceelkaarten,
  (4) boekhoudkoppeling, (5) barcode/QR-scanning voor vaten/flessen,
  (6) officiële compliance-rapportages/e-label QR, en (7) blend-/
  trial-blend-planning met labkoppeling.
- Qua prijsstelling: vergelijkbare functionaliteit kost in de markt ruwweg
  €180–650/jaar aan de instapkant (Vinsight, eVineyard, Craft Your Taste,
  Kelderbazen, Winestro) tot $95–299+/maand (vintrace, Commerce7,
  Bottle360) voor volwaardige "winery operating systems" — de zelfbouw
  vertegenwoordigt dus makkelijk een equivalent van enkele honderden tot
  >duizend euro per jaar aan commerciële licentiewaarde, met enkele
  modules (PU-monitor, AI-agent) die in geen enkel standaardpakket zitten.

## Key findings

### 1. Kelderbazen.nl — de directe Nederlandse benchmark

Web-applicatie (responsive; telefoon/tablet/desktop) ontwikkeld door
DeskWeb consultancy uit Roermond, in nauwe samenwerking met de Vereniging
Nederlandse Wijn Producenten (VNWP) en Landgoed Overst Voerendaal. De
positionering is nadrukkelijk administratief/compliance-gedreven: correct
bijhouden voor controles door de douane en NVWA (additievengebruik), plus
de aangescherpte etiketteringsregels (ingrediënten/allergenen/
voedingswaarden). Kernpunten: registratie "van oogst tot fles" (begint als
de druiven van het land komen, eindigt als de wijn in de fles zit), een
productenboek/catalogus (borgt naamgeving + allergenen), en
etiketteringsondersteuning. Uit de pilotfase (gestart sept. 2022 met zes
wijngaarden); telt inmiddels een reëel gebruikersbestand: op de homepage
staan 25 wijngaarden, 904 tanks, 9.725 activiteiten en 15.575 kilo druiven
(2026).

**Prijs**: abonnementsmodel, jaarlijkse facturatie, excl. btw. Niet-VNWP-leden:
€312/jaar + €312 eenmalige opstartkosten + €156 per extra wijngaard/jaar.
VNWP-leden: €288/jaar, geen opstartkosten, €144 per extra wijngaard/jaar.
Loonwerk (wijn maken vóór andere wijngaarden) brengt aanvullende jaarlijkse
kosten met zich mee, bepaald per peildatum 1 januari. De site vermeldt dat
de prijzen "nog niet definitief" zijn.

**Wat Kelderbazen heeft dat mogelijk nog niet (zo) in De Tappenmars Buddy
zit**: een productencatalogus/-boek dat naamgeving en allergenen
standaardiseert, en expliciete etiketteringsoutput (ingrediënten/
allergenen/voedingswaarden — de EU-eis sinds dec. 2023). De
compliance-oriëntatie (NVWA/douane) is vergelijkbaar met de bestaande
accijns-/verbruiksbelasting-module. Op de productie-/kelderkant (48 tanks,
onwijzigbaar tankboek, gistingscurves met voorspelling, PU/pasteurisatie)
lijkt De Tappenmars Buddy juist dieper dan Kelderbazen.

### 2. De bredere markt splitst in drie categorieën

- **(a) Wijngaard/teelt-first** (perceelbeheer, spuitregistratie,
  weer/ziekte): eVineyard, Agromanager, VitiScribe, BeVine, RIMpro.
- **(b) Kelder/productie-first "winery operating systems"** (partijen,
  vaten, blends, compliance, kostprijs): InnoVint, vintrace, Vinsight,
  Ekos, WineMS, 360Winery.
- **(c) DTC/verkoop-first** (webshop, POS, wijnclub, reserveringen):
  Commerce7, WineDirect, VinesOS, VinNOW, Tock.

In Europa/NL/BE domineren compacte, compliance-gedreven admin-pakketten:
Kelderbazen (NL), Craft Your Taste/Tastefever (BE), V3ni/Multios (BE),
Winestro.Cloud, DWine, Weinhelp, wineNET, BOXXER VINO (DE/AT).

### 3. De grootste feature-gaps zitten niet in de kelder

Daar is De Tappenmars Buddy sterk. De gaps zitten in verkoop/DTC,
precisie-wijnbouw (weer/ziekte) en koppelingen (boekhouding, e-commerce,
lab).

## Andere relevante spelers

### Nederland / België (regionaal, klein-mkb)

- **Agromanager** (BE/NL): teelt-/fruitteeltbeheer — teelt, percelen/kassen,
  spuitschrift, GPS, koeling, sortering, oogstregistratie (o.a.
  Fruitmasters-koppeling), tijdregistratie plukkers, weerstation. 14 dagen
  gratis. Sterk in perceel/GPS/spuit en arbeids-/kostenregistratie; niet
  primair een kelder/DTC-pakket.
- **Craft Your Taste / Tastefever** (BE, Waregem; opgericht 2019, platform
  2024): "van plant tot klant" — percelen, oogst, spuit-/
  behandelregistratie, kelderpartijen (transfers/blends/toevoegingen),
  voorraad, materieel, multi-user met rollen, volledige traceerbaarheid
  (batchcodes, labanalyses), en automatische generatie van (Belgische + EU)
  overheids-/complianceformulieren en spuitlogboek uit één invoer.
  Instapprijs vanaf €15/maand. Ook een QR-code-consumentenapp.
  Duurzaamheidsinzicht (energie/middelen). Sterkste directe functionele
  analoog in de Lage Landen.
- **V3ni / Multios** (BE): webgebaseerde beheersoftware voor wijndomeinen,
  wijngaarden, brouwerijen en accijnsgoederenhandelaren; evolueert met
  regelgeving, lokale support. Demo-op-aanvraag (geen publieke prijs).
- **Odoo** (BE/NL, via partners zoals Connect365): generieke ERP die
  wijnhandel/wijngaard digitaliseert (webshop, kassa, voorraad, aankoop
  geïntegreerd). Geen wijnspecifiek kelderboek out-of-the-box.
- **Viniou** (BE/FR), **WijnAdmin** (NL), **Wine Cellar** (open source):
  consumenten-/liefhebber-kelderbeheer (flessen catalogiseren, etiket
  scannen, drinkvenster) — niet voor producenten; ter volledigheid genoemd.

### Duitstalig

Relevant vanwege omvang kleine familie-Weingüter — Duitsland telde
~15.151 Weinbaubetriebe in 2020, dalend naar ~14.150 in de
Agrarstrukturerhebung 2023.

- **Winestro.Cloud** (voorheen Weinbau-online.de; >2.300 gebruikers,
  >15 jaar): amtlich zugelassen (officieel toegelaten) cloudpakket: Schlag
  (perceel), Flaschenbuch, Kellerbuch, Stoffbuch, Herbstbuch (onwijzigbaar/
  geprotocolleerd), Aufträge, TSE-kassa, webshop/Winestro.Shop,
  paketmarken/verzendkoppelingen, e-label/QR-Nährwerte, GPT-4-
  tekstgeneratie (newsletters/wijnbeschrijving uit analysewaarden),
  tijdregistratie. Modulair met veel add-ons.
- **DWine** (DE): amtlich zugelassen Weinbuchführung (Kellerbuch,
  Flaschenbuch, Stoffkonten, Herbstbuch), plus klantbeheer/facturatie;
  platformoverschrijdend.
- **Weinhelp / WEINHELP 7** (DE): Flaschenbuch, Kellerbuch, facturatie,
  klantbeheer, tourenplanning, webshops.
- **wineNET** (AT, Joiser; >450 klanten): niet-modulair "Kellerbuch als
  serviceproces" — kellerbuchführung, facturatie (incl.
  btw-Pauschalierung), kassa, BKI-meldingen, webshop, export; e-label/QR
  (euvino); 100% wettelijk conform bij BKI/Bio/Finanz-controles.
- **BOXXER VINO** (DE): modulaire ERP met digitaal Kellerbuch, POS/kassa,
  gastro/tafelbeheer, voorraad.

### Internationaal (winery operating systems / DTC)

- **InnoVint** (VS; "the leading winery operating system, trusted by more
  than 2,000 wine brands of every size"): cellar management, lot/
  vessel-historie, work orders (mobiel, offline, met QR-/barcode-
  vatscanning voor "barrels and vessels"), inventory, TTB-compliance
  tracking, kostprijsberekening, 3D-tankmaps; recent AI/voice work orders
  en foto-naar-analyse. Vanaf $149/maand; iOS+Android PWA (InnoApp).
  Sterke labkoppeling (ETS), TankNET, Commerce7.
- **vintrace** (opgericht 2007, cloud; wereldwijd): productie, inventory,
  bottling, kostprijs, fermentatiebeheer, bulk-blending-programma's en
  trial-blending in een ingebouwde Lab Console (mock-blends analyseren op
  samenstelling), grower contracts/betalingen, harvest scheduling. Geen
  publieke prijs (quote-based tiers Essentials/Professional/Enterprise);
  vanaf-bedragen op vergelijkingssites variëren sterk (~$95/maand op
  GetApp, ~$159/maand volgens VitiScribe's overzicht). Integreert met
  Xero, WineDirect, vinCreative, TankNET.
- **Vinsight** (NZ; transparante prijzen): productie + sales & inventory:
  multi-location warehousing, multi-currency in-/verkoop, traceerbaarheid,
  WET/accijns, barrel/cellar management, vineyard, labanalyse,
  Xero-koppeling. Plannen ~$24–139/maand.
- **Ekos** (VS; craft beverage, 40 landen): productie/voorraad/verkoop/
  accounting voor brouwerij/wijn/cider: batchrecords, certificeringen/
  compliance, barcodescanners, QuickBooks/Shopify/Square/Xero-koppeling,
  Order Hub online bestellen. Quote-based (geen publieke prijs).
- **WineMS** (ZA): block-to-bottle met farm-modules (block management,
  spray programs, cost/analysis/planning), grape intake, bulk wine,
  bottling; ERP-koppeling (Dynamics NAV, Sage) en Google Earth-kaarten.
- **360Winery**: 9+ modules van vine-to-wine, boekhoud- en
  payment-gateway-integratie; vanaf $99/maand.
- **Commerce7** (DTC-leider): CRM, clubs & abonnementen, e-commerce, POS,
  reserveringen, analytics, open API/app store (QuickBooks, Klaviyo,
  Mailchimp). Alle plannen bevatten de volledige feature-set; tiering op
  DTC-omzet. Hoofdplannen (Basic/Pro/Experience) vanaf $299/maand +
  transactiefee tot ~1,5%, met sinds kort een instaptier Commerce7 Lite
  vanaf een vlakke $59/maand zonder transactiefees (voor wineries onder
  $100K DTC-omzet), inclusief POS, e-commerce, CRM, wijnclub,
  reserveringen en analytics.
- **WineDirect** (Napa; >1.800 wineries): DTC — e-commerce, POS, wijnclub,
  fulfilment, marketplace (e-commerceplatform wordt uitgefaseerd; SaaS
  overgenomen door Commerce7).
- **VinesOS / VinNOW**: DTC/POS/club met QuickBooks-koppeling (VinNOW
  pusht invoice-level detail naar QuickBooks).
- **Tock / AnyRoad / Roverd / Bookeo / CoverCount**: gespecialiseerde
  proeverij-/tour-/evenementenreserveringen (no-show-preventie, deposits,
  ticketing, QR-check-in, groepsboekingen).

### Precisie-wijnbouw / ziekte & weer

- **eVineyard** (Elmitel, Slovenië; wereldwijd): vineyard management met
  microklimaat-monitoring per blok (eigen sensoren of publieke
  weerstations), ziektedruk-voorspelling voor onder meer Plasmopara
  viticola (valse meeldauw), Oidium/echte meeldauw, Botrytis, Black Rot,
  Anthracnose en Phomopsis, met spuit-timingadvies afgestemd op het
  druivenras, irrigatie/evapotranspiratie, GPS-tracking, kostenbewaking,
  work orders/compliance-papierwerk. Vier tiers (Lite/Professional/
  Estate/Enterprise); vanaf $19/maand. Primair Europees.
- **BeVine**: cloud decision-support op basis van meteostations in de
  wijngaard; ziektemodellen (meeldauw, zwart-/grauwrot) op basis van
  huidige + toekomstige weersomstandigheden en uitgevoerde behandelingen.
- **RIMpro** (NL/BE breed gebruikt): infectiedruk-/schimmelvoorspelling
  (o.a. Plasmopara/valse meeldauw); koppelbaar aan sensoren
  (Sencrop-weerstations, Leafcrop bladnatsensor). VinLink GALATI (SK)
  vergelijkbaar met eigen weerstation.
- **VitiScribe** (VS): vineyard-only, publiceert alle prijstiers —
  Starter $49/maand, Pro $99/maand, Estate $179/maand; IPM/
  compliance-focus (VS-markt).

## Feature-gaps (op vermoedelijke relevantie voor een kleine NL-wijngaard
## met óók loonverwerking voor derden)

1. **Ziekte-/plaagvoorspelling + weerstation-integratie** (valse
   meeldauw/oïdium/botrytis). Kern van eVineyard, BeVine, RIMpro. Zeer
   relevant in het vochtige NL-klimaat; sluit direct aan op de bestaande
   fenologie/spuitregistratie. Koppeling met KNMI-open data of
   Sencrop/RIMpro ligt voor de hand.
2. **Loonverwerking-/custom-crush-scheiding** (multi-client tenancy). Voor
   derden wijn maken vereist strikte scheiding van partijen, tankboek,
   analyses en rapportages per opdrachtgever, plus facturatie van
   diensten. Kelderbazen en Winestro rekenen hier expliciet extra voor;
   InnoVint/vintrace hebben custom-crush-modi.
3. **DTC-webshop + wijnclub/abonnementen + proeverij-/
   evenementenreserveringen**. Standaard bij Commerce7/WineDirect/
   VinesOS/Winestro; reserveringen bij Tock/AnyRoad.
4. **Boekhoudkoppeling** (voor NL: Exact Online, Twinfield, Moneybird,
   e-Boekhouden; internationaal Xero/QuickBooks). Vrijwel universeel.
5. **Barcode/QR-scanning** van vaten/tanks/flessen voor snelle
   identificatie en work-order-afhandeling (InnoVint, Ekos).
6. **Officiële compliance-rapportages & e-label/QR** (EU-ingrediënten/
   allergenen/voedingswaarden-etiket met QR; bio/Skal/Demeter-
   rapportage; oogst-/voorraadaangifte). Kelderbazen, Craft Your Taste,
   Winestro, wineNET leveren dit.
7. **Blend-/trial-blend-planning met labkoppeling**. vintrace Lab Console
   en trial blending; labkoppelingen (ETS bij InnoVint).
8. **GPS/perceelkaart-tooling** (intekenen percelen/rijen, kaartlagen).
   Agromanager, eVineyard, WineMS (Google Earth).
9. **Arbeids-/tijdregistratie en machinekosten per perceel/taak**
   (Agromanager, eVineyard Estate). Relevant voor kostprijs per partij én
   doorbelasting bij loonwerk.
10. **Kostprijsberekening per partij/fles** (cost accounting) — sterke
    kant van InnoVint/vintrace/Ekos.
11. **Multi-taal/multi-valuta** (Vinsight, Commerce7) — lagere prioriteit
    voor een lokaal NL-domein, tenzij export.
12. **CRM/klantsegmentatie + e-mailmarketing/newsletter** (Commerce7;
    Winestro met GPT-4-teksten).
13. **Native mobiele app met offline-modus** (InnoApp offline work
    orders) — De Tappenmars Buddy heeft al een offline-first PWA;
    offline-first is de industriestandaard voor kelder-/veldwerk zonder
    bereik, dus dit punt is grotendeels al gedekt.

## Prijsindicatie in de markt

- **Regionale admin-pakketten (NL/BE/DE)**: Kelderbazen €288–312/jaar
  (+opstart/extra wijngaard); Craft Your Taste vanaf €15/maand
  (~€180/jaar); Winestro gratis "Team"-tier (15% verkoopcommissie)
  oplopend via betaalde pakketten (Starter/Premium/Power/Gold — exacte
  hoofdprijzen niet publiek machine-leesbaar; illustratief voorbeeld
  "Komplett = €50/maand") met vele add-ons (POS-interface +€15,
  Schlag-Plus +€20, e-label/Nährwerte +€11/maand, telefoonsupport
  Bronze/Silber/Gold 0/25/50 €/maand); wineNET/DWine/Weinhelp doorgaans
  enkele honderden euro/jaar.
- **Winery operating systems (internationaal)**: eVineyard vanaf
  $19/maand; Vinsight ~$24–139/maand; vintrace quote-based (vanaf-bedragen
  ~$95–159/maand op vergelijkingssites); InnoVint vanaf $149/maand;
  360Winery vanaf $99/maand; Bottle360 vanaf $169/maand; Ekos quote-based.
- **DTC-platforms**: Commerce7 vanaf $59/maand (Lite) of $299/maand
  (hoofdplannen, + tot ~1,5% transactiefee); WineDirect/VinesOS/VinNOW
  variabel.

**Interpretatie**: De Tappenmars Buddy dekt in één systeem wat in de markt
vaak 2–3 aparte abonnementen vergt (bijv. eVineyard/RIMpro voor wijngaard +
Kelderbazen/InnoVint voor kelder + Commerce7 voor DTC). Een equivalente
commerciële stack voor een klein domein loopt al snel op tot
€600–1.500+/jaar (regionaal, admin-focus) of $200–500+/maand
(internationale operating systems + DTC). Bovendien zitten enkele
Tappenmars-modules — de PU-berekening/pasteurisatiemonitor met
drukveiligheidsmodel voor gecarboniseerde dranken, de
gistingscurve-voorspelling, en de Nederlandstalige AI-agent met tool-use —
in geen enkel standaardpakket; dat is unieke, niet-inkoopbare
functionaliteit.

## Aanbevelingen

**Fase 1 — quick wins met hoge ROI (0–3 maanden)**

1. Bouw een weer/ziekte-module: koppel KNMI-open data of een goedkoop
   Sencrop-station en implementeer een valse-meeldauw/oïdium-model
   (RIMpro-achtig), gekoppeld aan de bestaande fenologie/spuitregistratie.
   Dit is de meest onderscheidende, klimaatrelevante toevoeging voor NL.
2. Voeg EU-etiket/QR-output toe (ingrediënten/allergenen/
   voedingswaarden per partij → e-label QR). Dit is inmiddels wettelijk
   en is precies waar Kelderbazen/Winestro op scoren. **(in uitvoering
   sinds 2026-09, zie WERKLOG.md Fase 20)**
3. Implementeer QR/barcode-scanning op tanks/vaten/flessen, aansluitend
   op het onwijzigbare tankboek.

**Fase 2 — commerciële en compliance-verdieping (3–9 maanden)**

4. Formaliseer de loonverwerking-/multi-client-laag: strikte partij-/
   tankboek-/analysescheiding per opdrachtgever + dienstfacturatie. Dit is
   de onderscheidende use-case en waar concurrenten extra voor rekenen.
5. Bouw een boekhoudkoppeling naar een NL-pakket (Exact Online/
   Twinfield/Moneybird/e-Boekhouden) vanuit verkoop + accijns.
6. Voeg bio/Skal/Demeter-rapportage toe als er biologisch/biodynamisch
   gewerkt wordt (eigen of bij loonwerkklanten).

**Fase 3 — DTC en optimalisatie (9+ maanden, alleen indien commercieel
relevant)**

7. Overweeg een webshop + wijnclub/abonnementen + proeverij-reserveringen
   — maar toets eerst of een bestaande koppeling (Shopify/WooCommerce +
   een reserveringstool) niet goedkoper is dan zelfbouw; DTC-platforms
   zijn de duurste categorie.
8. Voeg kostprijs-per-partij/fles en blend-/trial-blend-planning toe
   zodra assemblages en marge-inzicht prioriteit krijgen.

**Benchmarks die de prioriteit veranderen**

- Structureel voor >2–3 derden wijn maken → Fase 2-loonverwerking naar
  voren halen (boven alles).
- Verkoop-aan-huis/online wordt >20–30% van de omzet → Fase 3-DTC eerder
  oppakken; anders bestaande e-commerce koppelen i.p.v. bouwen.
- Bij ≥1 meeldauw-schade-jaar → weer/ziekte-module is direct terugverdiend.

## Caveats

- **Prijzen zijn indicatief en vluchtig.** Kelderbazen vermeldt zelf dat
  prijzen "nog niet definitief" zijn. De exacte maandprijzen van
  Winestro.Cloud's hoofdpakketten zijn niet publiek machine-leesbaar — de
  prijspagina blokkeert geautomatiseerde toegang en toont bedragen in een
  infographic; alleen het gratis "Team"-tier, een illustratief voorbeeld
  ("Komplett = €50/maand") en losse add-on-/setupprijzen (setup
  ~€75–150) waren te vinden. Internationale pakketten (vintrace, InnoVint,
  Ekos) hanteren "inquiry-based"/quote-based prijzen; genoemde
  vanaf-bedragen komen van vergelijkingssites (Capterra/GetApp/G2/
  SourceForge/VitiScribe) en verschillen onderling — voor vintrace
  bijvoorbeeld ~$95 vs. ~$159/maand.
- **Feature-vergelijking is deels inferentieel.** De functies van De
  Tappenmars Buddy zijn beoordeeld op basis van de taakomschrijving; de
  aanname was dat DTC-webshop, weerstation-koppeling, boekhoudkoppeling,
  GPS-kaarten en labkoppeling nog ontbreken. Als sommige daarvan al
  bestaan, vervalt die gap.
- **Kelderbazen-detail is beperkt tot de publieke website.** Zonder
  demo/inlog is de exacte modulaire diepte (bv. of het gistingscurves of
  accijns bevat) niet volledig verifieerbaar; de homepage-statistieken
  (25 wijngaarden etc.) zijn zelfgerapporteerd.
- **Marktlijst is selectief, niet uitputtend.** Er zijn tientallen niche-/
  regionale spelers; de selectie richt zich op de meest relevante spelers
  voor een klein NL-domein met loonverwerking. Consumenten-kelder-apps
  (Viniou, WijnAdmin, Wine Cellar) zijn expliciet géén producentensoftware.
- **Sommige bronnen (VitiScribe) zijn marketingpagina's** die concurrenten
  afzetten tegen zichzelf; hun claims over concurrentprijzen zijn met
  voorzichtigheid overgenomen.
