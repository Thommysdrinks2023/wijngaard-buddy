# Status en veiligheidsrapport — Tappenmars Buddy

**Datum:** 3 juli 2026
**Voor:** Thomas
**Doel:** overzicht van waar de app nu staat, wat er nog aankomt, en waar je op moet letten voordat de Raspberry Pi in gebruik gaat.

---

## 1. Waar staan we nu

De app is uitgegroeid van een los wijngaard-registratieprogramma naar **drie samenwerkende onderdelen** die allemaal op dezelfde database draaien:

### 🌿 Wijngaard — af, in gebruik sinds het begin

Alles rond de 69 rijen: Brix-metingen, observaties, fenologie (knopbreek, bloei, veraison...), oogstregistratie, plantstatus per vak, de perceelkaart, weer en warmtesom (GDD). Dit is het oudste en meest uitgebreide deel van de app en verandert nu niet meer structureel.

### 🍷 Kelder — af (fase 0 t/m 2 van het oorspronkelijke bouwplan)

Alles van druif tot tank:

- **Partijen** — een wijn-/drankbatch volgen van pers tot fles (bijv. "Johanniter 2026")
- **48 tanks** — digitale kopie van je echte tankinventaris, met inhoud en status
- **Tankboek** — een onwijzigbaar register van elke verplaatsing (vullen, overhevelen, verlies, correctie). Fouten herstel je met een nieuwe correctieregel, nooit door iets te wissen — dat is bewust zo gebouwd, ook met het oog op een eventuele wettelijke registratieplicht later (accijns/AGP, zie §5 van `ARCHITECTURE.md` — dat is geen juridisch advies, wel een aanzet).
- **Analyses & kelderlogboek** — chemische metingen en werkzaamheden per partij

Alle boekingen lopen via de server, die alles controleert (past het volume wel in de tank? klopt het opgegeven aantal liter met wat er echt in zit?) vóórdat er iets wordt vastgelegd.

### ✨ Assistent — net af, vandaag voor het eerst écht getest

Een Nederlandstalige AI-hulp (Claude) waar je tegen kunt praten of typen over je wijngaard en kelder:

- Beantwoordt vragen over je eigen data ("wanneer was onze eerste Johanniter-oogst?") — **nooit door te gokken**: als er niets geregistreerd staat, zegt hij dat eerlijk.
- Stelt acties voor (een boeking, een observatie) die je altijd eerst moet **bevestigen** voordat er iets wordt weggeschreven — er wordt nooit automatisch iets geboekt.
- Kan een foto van een blad of druif beoordelen.
- Werkt zonder inloggen, net als de rest van de app.

Vandaag is voor het eerst een echte vraag door de agent beantwoord — dat onderdeel is dus niet alleen gebouwd maar ook aantoonbaar werkend.

### In cijfers

- 216 commits sinds het begin van het project
- 41 losse schermen/pagina's
- 28 dataverzamelingen in de database (rijen, metingen, partijen, tanks, tankboek, agent-gesprekken, enzovoort)

---

## 2. Welke fase komt hierna

Het oorspronkelijke bouwplan (`ARCHITECTURE.md`) beschreef zes fasen. De eerste vijf daarvan (fundament, tankbeheer, tankboek, analyses, logboeken) zijn gedaan — soms in een net iets andere volgorde of met meer functionaliteit dan oorspronkelijk gepland (de assistent is bijvoorbeeld veel uitgebreider geworden dan het "alleen-lezen"-idee uit het oorspronkelijke plan: hij mag nu ook dingen _voorstellen_ om te boeken).

**Wat structureel nog ontbreekt: 🍾 Botteling & Voorraad.**
Dit is het enige grote stuk uit het oorspronkelijke plan dat nog niet gebouwd is:

- Een bottelronde vastleggen (welke partij, hoeveel flessen, welk lotnummer)
- Een voorraadoverzicht: hoeveel flessen van welke wijn/jaargang heb je nog, en waar zijn ze gebleven (verkocht, eigen gebruik, kapot)

De hub-pagina (het hoofdmenu) heeft hier al een tegel voor klaarstaan met het label "BINNENKORT". Dit is de logische volgende fase zodra je aan bottelen toe bent — en het is ook het moment waarop lotnummers en traceerbaarheid (welke fles komt uit welke partij, welke rij) echt gaan meetellen.

**Kleinere, losse punten die nog open staan** (niet urgent, maar goed om te weten):

- De weekelijkse "inzichten"-berekening (bijv. "gisting stagneert") moet je nu zelf één keer per week handmatig starten — dat wordt pas automatisch zodra de Pi als vaste server draait.
- Er is geen los scherm voor analyses/kelderlogboek; die zitten nu verwerkt in het partijdetail-scherm. Werkt prima, maar mocht dat ooit onhandig voelen, is een apart overzicht een kleine uitbreiding.

---

## 3. Veiligheid — waar je rekening mee moet houden voor de Raspberry Pi

Belangrijk om vooraf te weten: **dit is geen wet- of vakjuridisch advies**, maar een praktische, technische inventarisatie op basis van hoe de app nu in elkaar zit.

### Het goede nieuws eerst

De basis staat er netjes bij:

- Wachtwoorden en API-sleutels staan nooit in de programmacode zelf, alleen in een apart `.env`-bestand dat nooit wordt gedeeld of online gezet.
- De belangrijkste dataverzamelingen (rijen, metingen, tanks, tankboek, partijen — alles wat je wijngaard- en kelderdata bevat) **vereisen nog steeds gewoon inloggen**. Alleen de assistent-chat is bewust opengezet.
- Het tankboek zelf kan door niemand — ook niet per ongeluk — worden overschreven of gewist; alleen de server mag daarin schrijven, en altijd met een nieuwe regel, nooit door iets aan te passen.
- Foto's en documenten die je uploadt worden gecontroleerd op bestandstype en maximale grootte (10–20 MB), dus niet zomaar elk bestand komt erin.

### Waar je wél op moet letten vóór de Pi live gaat

**1. De AI-assistent heeft geen rem op misbruik (belangrijkste punt)**
Omdat de assistent-chat bewust zonder inloggen werkt, kan op dit moment **iedereen die het adres van je server kan bereiken** onbeperkt vragen naar de assistent sturen — en elke vraag kost je geld (een betaalde aanroep naar Claude). Zolang de Pi alleen lokaal bereikbaar is (in je eigen huis-/schuurnetwerk, niet vanaf internet), is dit geen probleem. **Maar zodra je de Pi via internet bereikbaar maakt** (bijvoorbeeld via `pb.tappenmars.nl`, zoals al eerder als plan genoteerd stond), moet hier eerst een rem op — een limiet op hoeveel vragen er per uur gesteld mogen worden. Dit is op dit moment de duidelijkste actie die nog open staat.

**2. Nog geen HTTPS/SSL geregeld**
Er lag al een plan (genoteerd in de projectdocumentatie) om `pb.tappenmars.nl` te gebruiken met een beveiligde verbinding (HTTPS) via Cloud86, maar dat is nog niet uitgevoerd. Zonder HTTPS reist alles — ook wachtwoorden bij het inloggen — onversleuteld over het netwerk zodra je van buiten je eigen huis verbindt. **Nodig zodra de Pi van buiten je eigen netwerk bereikbaar wordt**, niet nodig zolang alles binnen je eigen wifi/netwerk blijft.

**3. Enkele technische adressen zijn nu "hardgecodeerd" op de ontwikkelcomputer**
Een paar plekken in de programmacode verwijzen letterlijk naar het adres van deze Windows-computer (`127.0.0.1:8090`, wat "deze computer zelf" betekent). Die moeten worden aangepast naar het echte adres van de Pi zodra die in gebruik gaat. Dit is een kleine, bekende technische klus, geen risico op zich — maar wel iets dat vergeten kan worden als er niet expliciet aan gedacht wordt bij de overstap.

**4. PocketBase (de database-software) kan een update gebruiken**
Je draait versie 0.39.3, de nieuwste versie is 0.39.5 (half klein verschil, geen enorme sprong). Standaardadvies: vóór je de Pi in productie neemt, even bijwerken naar de laatste versie — dat hoort bij normaal onderhoud, zoals updates op je telefoon.

**5. Fysieke en netwerktoegang tot de Pi zelf**
Dit gaat niet over de programmacode maar over de Pi als apparaat:

- Zet een eigen wachtwoord op de Pi (niet het standaardwachtwoord van Raspberry Pi OS laten staan).
- Als je op afstand wilt kunnen inloggen op de Pi (SSH), gebruik dan een sterk wachtwoord of — beter — een sleutelbestand in plaats van een wachtwoord.
- Zorg voor een vaste back-up van de database (de map `pb_data`) naar een andere plek dan de Pi zelf — een Pi's geheugenkaartje kan kapotgaan, en dan ben je zonder back-up alles kwijt. Er bestaat al een back-upscript in het project; dat moet dan wel ook echt regelmatig draaien.
- Overweeg de Pi achter een eenvoudige firewall/router-instelling te zetten die alleen de poorten open laat die je echt nodig hebt.

**6. Wat al goed geregeld is voor als je ooit toch gaat verkopen**
Zoals ook in de architectuurdocumentatie staat: als er ooit sprake is van verkoop (in plaats van alleen eigen gebruik), gelden er mogelijk regels rond accijns, registratie en traceerbaarheid van flessen. Dat is geen beveiligingskwestie maar een wettelijke — en die check moet je zelf doen bij de Douane/RVO/NVWA of de vereniging Wijnbouwers der Lage Landen. Het datamodel van de kelder (tankboek, lotnummers) is er wel al op voorbereid.

### Kort samengevat: prioriteitenlijst voor de Pi-overstap

1. **Rem op de assistent-chat** (limiet per uur) — vóór de Pi van buitenaf bereikbaar wordt
2. **HTTPS regelen** (`pb.tappenmars.nl` + Cloud86, zoals al gepland) — vóór de Pi van buitenaf bereikbaar wordt
3. Adressen aanpassen van "deze computer" naar het echte Pi-adres — bij de overstap zelf
4. PocketBase bijwerken naar de laatste versie — voor de overstap, daarna gewoon periodiek
5. Pi zelf afschermen (wachtwoord, SSH-sleutel, back-ups, evt. firewall) — bij het inrichten van de Pi

Zolang de Pi alleen binnen je eigen netwerk blijft draaien (niet vanaf internet bereikbaar), zijn punten 1 en 2 niet dringend — maar wel iets om te doen vóórdat je de stap naar "overal bereikbaar" zet.
