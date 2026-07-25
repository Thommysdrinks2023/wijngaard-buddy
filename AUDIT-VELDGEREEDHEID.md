# Auditrapport veldgereedheid — seizoen 2026

**Onderwerp**: De Tappenmars Buddy, de app waarmee wijngaard De Tappenmars in Den Ham haar registraties bijhoudt
**Vraag**: is deze app klaar om in het seizoen 2026 in het veld gebruikt te worden?
**Datum onderzoek**: 24–25 juli 2026
**Voor**: Thomas Drinks (eigenaar) en zijn adviseur

Dit document is bedoeld om zelfstandig leesbaar te zijn. Voorkennis van de app of van de code is niet nodig.

Het onderzoek was uitdrukkelijk geen bouwopdracht. De opdracht was om te zoeken naar wat er misgaat vóórdat het seizoen begint, en alleen te repareren wat er onderweg werd gevonden. **Wat is gevonden is belangrijker dan wat is toegevoegd.**

---

## 1. Samenvatting in één alinea

De app werkt, en werkt sneller dan verwacht. Maar het onderzoek vond **twee fouten die stil data zouden hebben beschadigd of geblokkeerd** — beide precies in de registraties die tijdens de oogst het hardst nodig zijn, en één ervan in een registratie die wettelijk verplicht is. Beide zijn gerepareerd en de reparatie is aantoonbaar getest. Daarnaast bleek de app opgezet om data te _bekijken_ terwijl het veldgebruik vooral _invoeren_ is; dat is deels rechtgezet. **Het grootste resterende risico zit niet in de code maar in waar de app draait**: op één laptop, met de backups op diezelfde laptop. Dat is voor september 2026 het punt dat aandacht verdient, meer dan enige softwarekwestie in dit rapport.

---

## 2. Hoe er is gemeten

Er is bewust niet vertrouwd op wat de code beweert te doen. Alle bevindingen hieronder komen uit een van deze drie:

1. **Een vol seizoen aan testgegevens.** Er zijn 1142 records aangemaakt die een compleet jaar nabootsen — metingen, waarnemingen, oogst, tankboekregels, bottelingen, orders. Elk record kreeg een markering, zodat aantoonbaar is dat ze naderhand allemaal weer zijn verwijderd (geverifieerd: 0 restanten).
2. **Metingen in de echte app**, gedraaid als productieversie op telefoonformaat — niet in de ontwikkelversie, want die bleek tot acht keer trager en gedraagt zich anders. Meten in de ontwikkelversie zou een te rooskleurig én een te somber beeld hebben gegeven, afhankelijk van wat je meet.
3. **Storingen nagebootst.** De verbinding is doelbewust op het slechtst mogelijke moment weggehaald, formulieren zijn met opzet foutief ingevuld, en een kernfunctie is tijdelijk stukgemaakt om te controleren of de testen dat opmerken.

---

## 3. Wat er kapot was

### 3.1 Een kwart van de wijngaard kon niets registreren (ernstig)

In de database stond de druivenras-naam **"Souveginier Gris"** — een tikfout. De app stuurt de juiste spelling, **"Souvignier Gris"**. Gevolg: elke poging om iets vast te leggen voor een rij met dit ras werd door de server geweigerd.

Dit raakte **17 van de 69 rijen — een kwart van de wijngaard**, en samen met Johanniter de grootste aanplant. Het betrof vijf soorten registratie: fenologie, oogst, werkuren, steekproeven en de werkkalender.

Waarom dit onopgemerkt bleef: de rijenlijst zélf had de juiste spelling. Op het scherm stond dus netjes "Souvignier Gris". Pas op het moment dat je er iets voor wilde vastleggen, ging het mis. In de winter registreer je weinig; het zou dus vermoedelijk pas in september zijn opgevallen — op de drukste dagen van het jaar, en bij `werkuren` gaat het om de **spuitregistratie, een wettelijke verplichting**.

De onderliggende oorzaak is structureler dan de tikfout: het installatiescript maakt ontbrekende tabellen aan, maar corrigeert nooit bestaande. De spelling was ooit in de broncode hersteld, maar die correctie is nooit naar de draaiende database doorgevoerd. Er bestond wél een reparatie, maar die werkte op één tabel terwijl dezelfde lijst in zes tabellen wordt gebruikt.

**Gerepareerd.** De reparatie werkt nu op álle tabellen met een rassenlijst. Vooraf is gecontroleerd dat geen enkel bestaand record de verkeerde spelling gebruikte, dus er is niets overschreven. Na de reparatie zijn dezelfde drie registraties die eerst werden geweigerd, opnieuw geprobeerd: alle drie geslaagd. Ook is gecontroleerd of dit patroon elders speelt — van de 40 keuzelijsten in de database komt geen enkele andere in meer dan één tabel voor.

### 3.2 Eén meting kon drie metingen worden (ernstig)

De app is gemaakt om zonder internet te werken: wat je in het veld invoert wordt lokaal bewaard en later verstuurd. Getest is wat er gebeurt als de verbinding wegvalt op het slechtst denkbare moment — nadat de server het record heeft opgeslagen, maar vóórdat de bevestiging terug is.

Resultaat vóór de reparatie: de app denkt dat het mislukt is, houdt het record in de wachtrij en probeert het later opnieuw. **Eén ingevoerde meting werd zo drie identieke records op de server.** De wachtrij was daarna leeg, het foutenlogboek leeg, en er was geen enkele waarschuwing. Thomas zou drie metingen in zijn overzicht hebben gezien zonder te kunnen weten welke de echte was.

Dit geldt voor alle offline registraties, dus ook voor oogst en werkuren. Dubbele regels in een register dat bij een controle wordt ingezien zijn erger dan een ontbrekende regel, omdat ze niet als fout herkenbaar zijn.

**Gerepareerd.** Elke wachtende registratie krijgt vooraf een vast kenmerk mee. Komt een tweede poging binnen voor iets dat al is opgeslagen, dan herkent de app dat als "al aangekomen" in plaats van als mislukking. Hetzelfde scenario is na de reparatie opnieuw gedraaid: **één record in plaats van drie**, wachtrij netjes leeg, nul fouten.

_Eerlijke beperking_: registraties die op Thomas' telefoon al in de wachtrij stonden vóór deze versie hebben dat kenmerk niet en houden het oude gedrag. In de praktijk is die wachtrij bij normaal gebruik leeg, maar het is geen theoretische nul.

### 3.3 Het foutenlogboek zei niets bruikbaars

Als een registratie definitief wordt geweigerd, komt dat in een logboek zodat het niet stil verdwijnt. Dat logboek toonde `"Failed to create record."` — de algemene boodschap van de server, zonder te vermelden wélk veld fout was. Daarmee weet je dat er iets mis is, maar niet wat. **Gerepareerd**: het logboek toont nu de veldfout zelf.

### 3.4 De app was ingericht om te kijken, niet om in te voeren

De navigatiebalk van de wijngaardmodule had zeven knoppen: Home, Kaart, Seizoen, Steekproeven, Dashboard, Grafieken, Meer. **Geen daarvan is een invoeractie.** Vijf van de zeven zijn schermen om naar data te kíjken.

Gevolg, gemeten:

| Actie                   | Route ernaartoe              | Schermwissels |
| ----------------------- | ---------------------------- | ------------- |
| Brix-meting             | Home → Kaart → Snelle meting | 3             |
| Oogst registreren       | Home → Dashboard → tegel     | 3             |
| Werk/spuiten vastleggen | Home → Dashboard → tegel     | 3             |

Oogst en spuitregistratie waren vanuit géén enkel veldscherm te bereiken — alleen via het dashboard of de instellingen.

**Deels gerepareerd**: "Meten" staat nu direct in de navigatiebalk (van 3 schermwissels naar 1, in plaats van "Grafiek", dat via Meer bereikbaar blijft), en oogst en spuitregistratie staan nu als knoppen op de perceelkaart.

### 3.5 Knoppen te klein voor gebruik met handschoenen

Gemeten op telefoonformaat tegen de gangbare norm van 44×44 beeldpunten. De ergste: de knoppen in de "Vandaag"-melding waren **20×20** — drie stuks naast elkaar, waarvan er één een melding permanent verbergt. Verder de seizoenswisselaar (36×36, aanwezig op 13 schermen) en het zoekicoon (te smal, op élk scherm).

**Gerepareerd.** Op de hub ging het van 7 te kleine knoppen naar 0.

### 3.6 Dezelfde storing voor de vierde keer

Vier keer eerder is tijd verloren aan hetzelfde probleem: een scherm blijft leeg of meldt "kon niet laden", en uit die melding is niet af te leiden waarom. De oorzaak zat in één plek in de code waar vier wezenlijk verschillende situaties dezelfde melding kregen: een verlopen sessie, een onbereikbare server, een onderbroken verzoek, en een serverfout. Voor de gebruiker ziet dat er identiek uit, terwijl de juiste reactie in elk geval anders is.

**Gerepareerd**: de vier situaties zijn nu uit elkaar gehaald en krijgen elk een eigen, bruikbare melding. Het onderbroken verzoek — dat helemaal geen storing is — wordt niet meer als fout getoond maar gewoon één keer opnieuw geprobeerd.

---

## 4. Wat er nu wél goed werkt (en dat is getoetst)

- **Snelheid.** Met een vol seizoen aan gegevens laadt geen enkel zwaar scherm trager dan **0,6 seconde**. De database zelf is geen knelpunt: alle vijftien zwaarste zoekopdrachten samen kosten 96 milliseconden.
- **Een geweigerde registratie blokkeert de rest niet.** Getest met 20 wachtende registraties waarvan één ongeldig: 19 kwamen aan, de ongeldige werd apart geregistreerd.
- **Dubbel op "opslaan" tikken is onschadelijk.** Alle 27 schermen met een opslaanactie zijn nagelopen; ze blokkeren de knop tijdens het opslaan.
- **Oogstinvoer op volgorde.** Bij het opslaan springt de app door naar de volgende rij en zet de cursor in het gewichtsveld, zodat elke volgende registratie nog maar "typen en opslaan" is. Live getest met drie rijen achter elkaar.
- **Er zijn nu automatische testen.** 84 testen op de rekenlogica en de datalaag, plus 6 rooktesten die de app als geheel doorlopen op telefoonformaat — samen ongeveer twee minuten. Om te bewijzen dat die testen ook echt iets betekenen is een kernfunctie tijdelijk stukgemaakt: alle zes werden rood, en na herstel weer groen.

---

## 5. Wat NIET is opgelost — de risico's

Dit hoofdstuk is bewust het meest pessimistische deel van dit rapport.

### 5.1 De app draait op één laptop, en de backups staan op diezelfde laptop (grootste risico)

De database draait als achtergrondtaak op Thomas' Windows-laptop. Er is een dagelijkse backup om 20:00, met veertien bewaarde versies — maar **die backups staan op dezelfde schijf als de database zelf**. Bij schijfuitval, diefstal of ransomware ben je database én backup tegelijk kwijt.

Dat dit geen theoretisch risico is, blijkt uit de recente geschiedenis: op 4 juli 2026 liep de schijf twee keer vol door achtergebleven tijdelijke bestanden, wat zowel de database liet crashen als de dagelijkse backup liet mislukken. Ook is eerder gebleken dat de taken niet startten zodra de laptop op accu liep (inmiddels verholpen).

**Dit is het punt om vóór september op te lossen.** Een externe kopie — een NAS, een externe schijf die na de backup wordt losgekoppeld, of versleutelde cloudopslag — weegt zwaarder dan welke softwareverbetering in dit rapport ook. Er stond een verhuizing naar een Raspberry Pi in de schuur gepland; die is niet uitgevoerd.

Tijdens dit onderzoek daalde de vrije schijfruimte van 8,5 naar 4,2 GB door bouwbestanden en de installatie van de testsoftware. Dat is ruim voldoende, maar het bevestigt dat de schijfruimte op deze machine aandacht nodig heeft.

### 5.2 De eerste keer laden duurt bijna 5 seconden

Warm — dus bij normaal gebruik door de dag heen — is de app snel. Maar de **eerste keer** op een apparaat, of na het legen van de browsergegevens, duurt het laden **4,8 seconden**: er moet ruim 1 MB aan programmabestanden binnenkomen. Op de testmachine gebeurt dat direct; in de wijngaard met matig bereik duurt dat aanzienlijk langer.

**Niet opgelost.** Dat terugbrengen raakt de structuur van de app en de grafiekbibliotheken, en dat is geen ingreep om vlak voor het seizoen te doen. Verzachtend: als de app op het startscherm is geïnstalleerd, gebeurt dit in principe één keer per apparaat en niet dagelijks. Dat laatste is niet onder veldomstandigheden geverifieerd.

### 5.3 Een rij aantikken op de kaart werkt niet betrouwbaar op een telefoon

De perceelkaart tekent 69 rijen op schaal. Op een telefoonscherm van 375 punten breed is elke rij daardoor **5 punten breed**. Dat is geen opmaakfout maar rekenkunde. Er zijn twee werkende alternatieven (de QR-code op de rijpaal scannen, en zoeken), dus geen enkele functie is geblokkeerd — maar wie de kaart als kiezer wil gebruiken, zal misgrijpen. Een echte oplossing (inzoomen, of een lijstweergave) is een ontwerpkeuze voor Thomas.

### 5.4 De AI-assistent is onbeschermd zodra hij van buiten bereikbaar wordt

Het onderdeel dat vragen aan de AI-assistent verwerkt, vereist geen inlog. Zolang de server alleen op het eigen netwerk luistert is dat geen probleem. **Zodra deze app van buitenaf bereikbaar wordt gemaakt, kan iedereen die het adres kent betaalde AI-aanvragen laten uitvoeren op Thomas' rekening.** Dit is een bekende en eerder vastgelegde beperking, geen nieuwe bevinding — maar het hoort in dit rapport omdat een verhuizing naar een Pi of externe server precies dat zou veranderen.

> **Aanvulling 25 juli 2026 — deze paragraaf was te somber.** Er blijkt wél een kostenrem te zitten, die de auditor over het hoofd had gezien: alle drie de assistent-endpoints hanteren een limiet van **30 berichten per uur per IP-adres**, instelbaar en afgedwongen met een nette Nederlandse melding. Opnieuw getest op de werkelijke instelling (dus niet met een verlaagde testlimiet): de 29e poging werd geweigerd — kloppend, want er waren die sessie al twee echte aanroepen gedaan — en bevestigen en afwijzen delen aantoonbaar dezelfde teller. Ook ongeldige verzoeken tellen mee, zodat aftasten niet gratis is.
>
> Wat blijft staan: de assistent vereist nog steeds **geen inlog**, en de teller wordt per IP-adres bijgehouden. Bij publieke bereikbaarheid kan iemand met wisselende IP-adressen de rem dus omzeilen, en de teller wordt bij elke herstart van de server op nul gezet. De rem beperkt de schade, maar vervangt geen authenticatie. **Vóór publieke bereikbaarheid hoort er inlogplicht op deze endpoints te komen** — de limiet alleen is niet genoeg.

### 5.5 Kleinere punten, niet opgelost

- De **welkomstdialoog verschijnt over het inlogscherm** op een nieuw apparaat en vangt de kliks af. Voor een mens op te lossen door "Overslaan" te tikken, maar het is de verkeerde volgorde.
- Het **voorraadscherm mist een kop**, wat voor schermlezers slordig is.
- Bij het **verwijderen van een steekproefpunt** ontbreekt de blokkade tegen dubbel tikken. Het zit achter een bevestigingsvraag en een tweede verwijdering is onschadelijk, dus dit is bewust gelaten.
- De app is **niet getest op een echt toestel onder veldomstandigheden**: alles hierboven is gemeten in een nagebootste telefoon op een bureaucomputer, met de server op dezelfde machine. Dat is de belangrijkste beperking van dit hele onderzoek.

---

## 6. Oordeel

**Is de app klaar voor september 2026? Ja wat betreft de software, nee wat betreft de opstelling waarin hij draait.**

De twee fouten die het seizoen echt hadden kunnen schaden — een kwart van de wijngaard die niets kon registreren, en registraties die zichzelf konden verdrievoudigen — zijn gevonden en verholpen, en die reparaties zijn aantoonbaar getest en niet alleen beredeneerd. De app is snel genoeg, de invoer is merkbaar korter geworden, en er ligt nu voor het eerst een geautomatiseerde controle die aan de bel trekt als een kernfunctie stukgaat.

Wat ik daarbij eerlijk moet vermelden: **beide ernstige fouten waren er al maanden en niemand had ze gezien.** De eerste was onzichtbaar omdat het scherm er goed uitzag, de tweede omdat er nooit een storing was opgetreden op precies het verkeerde moment. Dat er nu twee zijn gevonden, is geen garantie dat er geen derde is. De rooktesten verkleinen dat risico maar heffen het niet op — zes testen dekken de kern, niet alles.

Het serieuze bezwaar zit elders. De volledige administratie van de wijngaard — inclusief registraties met een wettelijke functie — staat op één laptop, met de enige backups op diezelfde schijf. Er is dit jaar al twee keer een situatie geweest waarin die schijf vol liep en de backup mislukte. Geen enkele verbetering in dit rapport weegt op tegen het risico dat die machine uitvalt op een oogstdag.

---

## 7. Aanbevelingen, op volgorde van belang

1. **Zorg vóór september voor een backup buiten deze laptop.** Een externe schijf die na de backup wordt losgekoppeld is al voldoende; een NAS of versleutelde cloudopslag is beter. Controleer daarna één keer of terugzetten écht werkt — een backup die nooit is teruggezet is een aanname, geen backup.
2. **Test de app één dag op het echte toestel in de wijngaard**, met echt bereik en echte handschoenen, vóór de oogst begint. Alle metingen in dit rapport zijn nabootsingen. Eén ochtend in het veld levert meer op dan het hele onderzoek hierboven.
3. **Beslis over de Raspberry Pi.** Doorgaan lost het uitvalrisico deels op maar maakt de assistent-beveiliging (5.4) dringend. Niet doorgaan is verdedigbaar, maar maak dan punt 1 des te steviger.
4. **Bekijk de wijziging in de navigatiebalk.** "Grafiek" is vervangen door "Meten". Dat is één regel en zo teruggedraaid als het tegenvalt — maar het is de enige zichtbare wijziging in dit onderzoek waarover Thomas een eigen mening kan hebben.
5. **Laat de rooktesten meedraaien** vóór elke wijziging die vlak voor of tijdens het seizoen wordt gedaan. Twee minuten, en ze zijn aantoonbaar in staat een kapotte kernfunctie te betrappen.
6. **Overweeg na het seizoen** het inlaadgewicht (5.2) en de kaartbediening (5.3) aan te pakken. Beide zijn echte tekortkomingen, maar geen van beide blokkeert het werk, en beide vragen ingrepen die je niet vlak voor een oogst wilt doen.
