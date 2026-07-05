# Wettelijke checklist — wat de app dekt, wat jij zelf moet checken

**Geen juridisch advies.** Dit is een technische inventarisatie op basis van `ARCHITECTURE.md` §5 (drie aannames over accijns/AGP, EU-wijnbouwregisters en NVWA-traceerbaarheid) en de daadwerkelijk gebouwde staat van de app (`WERKLOG.md`, `DECISIONS-*.md`). Verifieer alles hieronder zelf bij de Douane (accijns/AGP), RVO (wijnbouwregisters) en NVWA (traceerbaarheid), of bij de vereniging Wijnbouwers der Lage Landen — die heeft praktijkervaring met precies deze schaal. De regels verschillen wezenlijk tussen hobbyproductie voor eigen gebruik en (ook kleinschalige) verkoop.

## 1. Accijns / AGP (Douane)

**Aanname:** zodra je wijn verkoopt of bedrijfsmatig produceert, krijg je te maken met de Wet op de accijns; producenten hebben doorgaans een vergunning accijnsgoederenplaats (AGP) nodig met bijbehorende voorraadadministratie — per soort en per tank het volume, alle in-/uitslagen, en verliezen (verdamping, droesem) verantwoord.

| Wat de app dekt                                                 | Status                                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Getekende volumemutaties per tank, per soort (partij)           | ✅ `tankboek`                                                                                 |
| Verliesregels als expliciete, aparte actie (`verlies`)          | ✅                                                                                            |
| Onwijzigbare regels, fouten via correctieboeking (`corrigeert`) | ✅ (API-rules `create/update/delete = null`, alleen de server-hook mag schrijven)             |
| Volledig, filterbaar in-/uitslagregister met export             | ✅ `/kelder/tankboek` (PDF via print, CSV/Excel-export)                                       |
| Douane-goederencodes, verzegelingsnummers, aangiftenummers      | ❌ Bewust niet opgenomen (ARCHITECTURE.md §5) — pas toevoegen als een AGP-traject dat vereist |

**Zelf te doen:** nagaan of De Tappenmars onder de AGP-plicht valt en zo ja, welke aanvullende velden een AGP-vergunning vereist (dan triviaal toe te voegen via `scripts/setup-pocketbase.mjs`).

## 2. EU-wijnbouwregisters (RVO)

**Aanname:** EU-verordening 2018/273 verplicht wijnproducenten tot in-/uitslagregisters en registratie van oenologische procedés (verrijking, aanzuring/ontzuring, zwaveling, klaring), doorgaans binnen enkele werkdagen na de verrichting. Kleine producenten kennen mogelijk vrijstellingen onder een productiedrempel.

| Wat de app dekt                                                                                          | Status                                                             |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Registratie van oenologische procedés (toevoeging, klaring, filtreren, …) met middel/hoeveelheid/eenheid | ✅ `kelderlog`                                                     |
| Los, filterbaar overzicht van het kelderlogboek + export                                                 | ✅ `/kelder/logboek` (sinds Blok F)                                |
| Chemische analysewaarden per partij over tijd, met grafieken                                             | ✅ `analyses` + fermentatiecurve/analysegrafieken op partijdetail  |
| Automatische _termijn_-bewaking (registratie binnen X werkdagen)                                         | ❌ Niet gebouwd — is een werkwijze-afspraak, geen datamodelkwestie |

**Zelf te doen:** nagaan of De Tappenmars onder de vrijstellingsdrempel voor kleine producenten valt, en zo niet, een vaste routine afspreken om binnen de wettelijke termijn te registreren (de app kan dat niet afdwingen, alleen faciliteren).

## 3. Traceerbaarheid (NVWA)

**Aanname:** bij verkoop geldt de Algemene Levensmiddelenverordening — één stap terug, één stap vooruit traceerbaar. Het lotnummer op de fles moet herleidbaar zijn naar partij en tank.

| Wat de app dekt                                                                             | Status                                                                 |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Lotnummerconventie `L<jj>-<PARTIJCODE>-<volgnr>`                                            | ✅ `ARCHITECTURE.md` v1.1 §A2, autosuggestie in `src/lib/lotnummer.ts` |
| Volledige keten lot → bottelronde → partij → tankboekhistorie → oogst → rij, in één rapport | ✅ `/voorraad/$voorraadId` (Herkomst-sectie, printbaar sinds Blok F)   |
| Eén klik vanaf een botteling naar het traceerbaarheidsrapport                               | ✅ (via het voorraadrecord dat bij elke bottelronde ontstaat)          |
| Terugroepactie-ondersteuning (alle flessen van één lot in één overzicht)                    | ✅ `/voorraad` gegroepeerd per wijn/lot                                |

**Zelf te doen:** niets structureels — dit onderdeel is functioneel compleet voor de "één stap terug/vooruit"-eis. Wel verifiëren of etikettering (allergenen, bevat sulfiet, alcoholpercentage) aan de wettelijke etiketteisen voldoet; de voedingswaarde-/etiketmodule (`voedingswaarde_berekeningen`) berekent de voedingswaarde-informatie maar toetst niet aan de volledige etiketteringsregels.

## Samenvatting

De **datamodel-kant** (wat er geregistreerd wordt en hoe het herleidbaar is) is voor alle drie de aannames grotendeels gedekt. Wat overblijft is puur **extern te verifiëren regelgeving** (val je onder een vrijstelling, heb je een AGP nodig) en **werkwijze-discipline** (op tijd registreren) — geen van beide is met code op te lossen.
