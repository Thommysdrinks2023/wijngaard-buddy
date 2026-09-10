# Pasteurisatie- en drukformules (Fase 17)

Dit document legt uit wat `src/lib/pasteurisatie.ts` en
`src/lib/drukveiligheid.ts` rekenen, met bronnen en aannames — zodat Thomas
(of een controleur) kan navolgen wat de app doet. **Geen van beide modellen
is gevalideerd tegen een echte, nagemeten run** (zie de
`gevalideerd: false`-vlag op elk resultaat) — zie Blok I voor hoe die status
wordt bijgehouden.

## Pasteurisatie-eenheden (PU)

**Formule:** `PU/min = 10^((T - Tref) / z)`, met `z = 7 °C` en `Tref = 60 °C`
(de bierconventie). Dit is dezelfde formule als de veelgebruikte notatie
`1,393^(T-60)`, met `1,393 ≈ 10^(1/7)` — deze module rekent met de exacte
exponentvorm, wat de uitkomst een fractie (~3-4%) hoger geeft dan wanneer je
met de afgeronde 1,393 rekent. Geen modelfout, zie `pasteurisatie.test.ts`.

**Integratie:** trapeziumregel tussen opeenvolgende metingen, over de
VOLLEDIGE curve (opwarmen, houden, afkoelen). Er is bewust geen
ondergrenstemperatuur waaronder niet meer geteld wordt — de bijdrage bij lage
temperatuur is klein maar niet nul, en die weglaten is precies de fout die dit
systeem moet voorkomen.

**Fase-indeling** (opwarm/houd/afkoel): de piektemperatuur is het eerste
optreden van de maximale gemeten temperatuur; de houdfase is het aaneen-
gesloten blok metingen rond die piek binnen 0,5 °C tolerantie. Dit is een
praktische, geen fysisch afgeleide afbakening — bedoeld om inzicht te geven
in waar de PU vandaan komt, niet als harde grens.

**Meetgaten**: een gat groter dan de ingestelde drempel (standaard 2 minuten)
wordt gerapporteerd en het resultaat als `betrouwbaar: false` gemarkeerd. Er
wordt nooit stilzwijgend over een gat geïnterpoleerd.

## Druk in de gesloten fles

De druk komt uit drie bijdragen, allemaal gemodelleerd (nooit alleen CO2):

### 1. Waterdampdruk

Antoine-vergelijking, geldig 1–100 °C (bron: NIST Chemistry WebBook /
Stull 1947): `log10(P in mmHg) = 8,07131 - 1730,63 / (233,426 + T)`.
Gecontroleerd tegen de vuistwaarde uit de opdracht: bij 48 °C geeft dit
≈0,1115 bar tegen de genoemde "circa 0,11 bar" — klopt binnen 2%.

### 2. Thermische uitzetting van de vloeistof

Gebaseerd op een standaard dichtheidstabel van water (bijv. CRC Handbook of
Chemistry and Physics), lineair geïnterpoleerd. De uitzettingsfactor is de
verhouding `dichtheid(vultemperatuur) / dichtheid(doeltemperatuur)`.
Gecontroleerd: van 10 naar 48 °C geeft dit ~1,09% volumetoename, tegen de
vuistwaarde "~1,2%" uit de opdracht — dezelfde orde van grootte, klein
verschil door interpolatie van de tabel.

Dit effect drukt de kopruimte samen naarmate de vloeistof warmer wordt — de
reden dat een te hoog vulniveau (kleine kopruimte) de druk sterk verhoogt, en
waarom dat een vastgestelde oorzaak van het eerdere dopfalen was.

### 3. CO2-evenwichtsdruk (wet van Henry)

**Temperatuurafhankelijkheid van de oplosbaarheid**: een van 't Hoff-relatie,
`S(T) = S(Tref) × exp(B × (1/T - 1/Tref))` met T in kelvin. `B ≈ 2400 K` is
de breed gepubliceerde temperatuurcoëfficiënt voor de Henry-constante van CO2
in water (oplossingsenthalpie ≈ 19,4 kJ/mol; vergelijk R. Sander,
"Compilation of Henry's law constants for water as solvent",
_Atmos. Chem. Phys._ 15, 4399–4981, 2015).

**Absolute schaal**: `S` bij 10 °C is gekalibreerd zodat
`co2GehalteUitDruk(1,0 bar, 10 °C)` op 4,35 g/L uitkomt — het midden van de
in dit bedrijf gebruikte vuistregel "1,0 bar bij 10 °C ≈ 4,2–4,5 g/L". Dit is
een kalibratie op een praktijkwaarde, geen onafhankelijk gemeten Henry-
constante — dat is expliciet vermeld omdat het een aanname is die Thomas kan
bijstellen.

### Massabalans — het gekoppelde model

De fles is een gesloten, star volume. Bij het vullen (op de vultemperatuur,
standaard 10 °C) bevat de vloeistof een vaste hoeveelheid opgelost CO2
(`co2GehalteGl × vulvolume`). Bij de doeltemperatuur verdeelt die hoeveelheid
zich opnieuw over vloeistof en kopruimte volgens Henry's evenwicht, waarbij:

- de vloeistof zelf is uitgezet (minder kopruimte, zie hierboven),
- de kopruimte een molaire "capaciteit" heeft voor CO2 volgens de ideale
  gaswet (`P·V = n·R·T`).

Dit geeft een lineaire vergelijking in de CO2-partieeldruk `P`:

```
totaalCO2 = P × (S(T) × Vvloeistof_bij_T + (10⁵ × Vkopruimte_bij_T × M_CO2) / (R × T))
```

opgelost naar `P`. De totale absolute druk is `P + waterdampdruk(T)`; de
gauge-druk is dat min 1 atmosfeer (1,01325 bar).

### Conservatieve bovengrens

Dezelfde vergelijking, maar zonder de term voor de kopruimte-capaciteit — als
had geen enkel CO2-molecuul de vloeistof verlaten om de kopruimte te vullen.
Dat kan de concentratie in de vloeistof niet hebben laten dalen, dus deze
uitkomst is per constructie altijd ≥ het gekoppelde model. **Het
veiligheidsoordeel gebruikt uitsluitend deze bovengrens** (besluit Thomas,
1 september 2026): een valse waarschuwing kost een gesprek, een gemiste kost
glas of letsel.

## Wat er WEL en NIET als ijkpunt is gebruikt

Een eerdere analysesessie noemde "2,2 bar bij 10 °C wordt ~8 bar bij 48 °C"
als bekend meetpunt. **Thomas heeft bevestigd dat dit zelf een eerdere
berekening was, geen gemeten flesdruk** — dat getal wordt daarom nergens in
dit model als ijkpunt gebruikt.

Het enige harde, empirische gegeven is dat het 750 ml BVS-formaat met 6
bar-schroefdoppen bij een te hoog vulniveau daadwerkelijk is bezweken
(doppen + barstend glas) — d.w.z. de werkelijke druk kwam aantoonbaar boven 6
bar uit. Met een realistisch kleine kopruimte (te hoog vulniveau, ~2,7%
kopruimte) geeft het model voor dit scenario een conservatieve bovengrens van
**~7,7 bar** bij 48 °C — boven de 6 bar-limiet, dus oordeel "onveilig". Dat is
consistent met wat er is gebeurd.

**Bevinding, gerapporteerd i.p.v. weggepoetst**: `maximaleCarbonatie(6 bar-dop,
48 °C, 750 ml, 650 ml vulling)` geeft in dit model ~1,1 bar bij 10 °C, tegen
de eerder genoemde vuistwaarde van 0,6–0,7 bar. Dat eerdere getal is met een
ander (het inmiddels losgelaten) drukmodel bepaald, dus een verschil is niet
verrassend — maar het betekent dat dit concrete getal NIET gebruikt moet
worden voor een productiebeslissing zonder Thomas' validatie. Zie Blok I.

## Status

Beide modellen dragen `gevalideerd: false`. Zie
`docs/pasteurisatie-werkwijze.md` voor hoe een run wordt opgezet en
`src/lib/pasteurisatie.ts` / `drukveiligheid.ts` voor de implementatie.
