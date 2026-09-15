# Oenologische formules (Fase 7 Blok C)

Bron van waarheid voor wat de app rekent (`src/lib/oenologie.ts`, spiegel in de
agent-tools in `pocketbase/pb_hooks/agent_uitvoering.js`). Formule-versie:
**2026-07-16.1** — deze versie wordt bij elk voorstel in het kelderlog
meegeschreven, zodat een dosering later herleidbaar is.

Alle calculators zijn **adviserend**: het resultaat wordt pas een kelderlog-
regel na expliciete bevestiging door de gebruiker, en de wettelijke limieten
komen als data uit `regelgeving_instellingen` (niet uit code). Zonder
geverifieerde limiet toont de app een rode "limiet niet geverifieerd"-
waarschuwing maar blokkeert niets.

## 1. Moleculair SO₂

Henderson-Hasselbalch met pKa₁ = 1,81 (bij ~20 °C; o.a. Waterhouse,
_Understanding Wine Chemistry_; Margalit, _Concepts in Wine Chemistry_):

```
moleculair SO₂ (mg/L) = vrije SO₂ (mg/L) / (1 + 10^(pH − 1,81))
```

Streefwaarde default 0,8 mg/L moleculair (gangbaar voor stille wijn;
0,5 mg/L wordt vaak voor rood gebruikt, 0,8 voor wit) — instelbaar via
`regelgeving_instellingen`-sleutel `so2_streef_moleculair_mg_l` en per
berekening aanpasbaar.

**Dosering**: benodigde vrije SO₂ = doel × (1 + 10^(pH−1,81)); de verhoging
× volume ÷ 1000 = gram SO₂. Kaliummetabisulfiet (KMS) levert praktisch ~57%
SO₂ (theoretisch 57,6%), dus gram KMS = gram SO₂ ÷ 0,57.

**Voorbeeld (nagerekend)**: pH 3,4 / vrije SO₂ 12 mg/L → moleculair
12 / (1 + 10^1,59) = 0,30 mg/L. Doel 0,8 → benodigd vrij 31,9 mg/L →
+19,9 mg/L; bij 500 L = 10,0 g SO₂ = 17,5 g KMS.

## 2. YAN / gistvoeding

Behoefteklassen naar gangbare gistproducent-indeling (laag/middel/hoog =
150/200/250 mg N/L bij ±12 vol% potentieel; naar Butzke (1998) en
Fermaid-richtlijnen), met +25 mg N/L per vol% boven 12:

```
behoefte (mg N/L) = klasse + max(0; potentieel alcohol − 12) × 25
tekort = behoefte − gemeten YAN   (YAN onbekend → hele behoefte als gift)
```

Faseschema (standaardpraktijk): rehydratatievoeding bij het aanmaken; ±½ van
de gift na het aanslaan van de gisting; resterende ±½ bij ⅓ suikerafbouw;
niet meer voeden na ½ suikerafbouw.

## 3. Chaptalisatie

```
potentieel alcohol (vol%) ≈ °Oe × 0,125        (gangbare benadering)
suiker (g/L) = gewenste verhoging (vol%) × 16,83
```

16,83 g/L per vol% is de EU-rekenwaarde voor witte most (Verordening (EG)
606/2009 bijlage I D). De **maximale verrijking** voor wijnbouwzone A staat
als sleutel `verrijking_max_volpct_zone` in `regelgeving_instellingen`
(Thomas verifieert het actuele maximum bij de officiële bron; zone-instelling
zelf: sleutel `wijnbouwzone`, 1 = A).

**Voorbeeld (nagerekend)**: 65 °Oe → 8,1 vol% potentieel. Doel 11,0 vol% →
+2,9 vol% → 48,8 g/L → bij 800 L = 39,05 kg suiker. (NB: boven een
geverifieerde zone-A-limiet kleurt het voorstel rood.)

## 4. Zuurcorrectie

- **Aanzuren** met wijnsteenzuur: +1,0 g/L toevoeging ≈ +1,0 g/L totaalzuur
  (en ±−0,1 pH; vuistregel, altijd na-meten).
- **Ontzuren** met CaCO₃: 0,67 g/L per −1,0 g/L totaalzuur (stoichiometrie
  CaCO₃/wijnsteenzuur); dubbelzout (bijv. Acidex) volgens etiket, zelfde orde.

Limieten als data: `aanzuring_max_g_l` en `ontzuring_max_g_l` (zone A;
Thomas verifieert).

## Kanttekening

Alle uitkomsten zijn rekenhulp, geen labvervanging: doseren → mengen →
**na-meten**. De SO₂-calculator plant daarom automatisch een
na-meting-taak (default +3 dagen, instelbaar per voorstel).
