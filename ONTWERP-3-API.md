# Fase 10 — Proactieve assistent: Fase 3, API en contracten

> **Correctie (Fase 16, 28 augustus 2026):** waar dit document "producent"
> schrijft, heet dat vanaf Fase 16 **eigenaar** (collectie `eigenaars`, veld
> `eigenaar`). De term is gewijzigd omdat De Tappenmars ook voor andere
> wijngaarden en fruittelers verwerkt en bottelt; die klanten zijn geen
> producent maar eigenaar van hun eigen product. De tekst hieronder blijft
> staan zoals hij destijds is geschreven.

**Status: BESLOTEN door Thomas (24 juli 2026). Basis voor Fase 5 (bouwen).**

---

## Leidend principe: het meeste "contract" is een TypeScript-interface, geen endpoint

Omdat de regel-signalen client-side worden berekend uit bestaande, al bereikbare collecties (Fase 1), is er voor de kern van deze feature **geen nieuw netwerk-endpoint nodig.** Het belangrijkste contract is een TypeScript-interface (`Signaal`) plus een functiesignatuur (`SignaalProducent`) — geen HTTP-API. Dat is de eerlijke consequentie van "bereken, sla niet op."

De enige echte endpoints in dit ontwerp horen bij de **optionele, uitgestelde** onderdelen (correlatietool, cross-device snooze). Die staan hieronder volledig gespecificeerd zodat de vorm vaststaat, maar worden niet in Fase 5 gebouwd.

---

## 1. Het `Signaal`-contract (TypeScript, `src/lib/signalen.ts`)

Dit is het hart van de feature. De vorm moet **stabiel** zijn (Fase 1: wijzigen na livegang breekt Thomas' opgeslagen snooze/dismiss-state), dus bewust behoudend gekozen.

```ts
export type SignaalErnst = "kritiek" | "waarschuwing" | "info";

export interface Signaal {
  // Stabiel id: `<bron>-<onderwerp-id>`. Bepaalt snooze/dismiss-identiteit.
  // MOET identiek blijven aan de bestaande meldingen.tsx-id's voor migratie.
  id: string;
  // Prefix uniek per producent-module, bv. "voorraad_bijna_op".
  bron: string;
  ernst: SignaalErnst;
  // Korte, mensleesbare kop (verschijnt in de widget).
  titel: string;
  // Optionele langere toelichting (uitklapbaar).
  detail?: string;
  // Waarheen bij klikken (bestaande route), bv. "/kelder/accijns".
  link?: string;
  // De "waarom": een string, live opgebouwd uit dezelfde data die het
  // signaal detecteerde. Omdat het hele signaal bij elke render opnieuw
  // wordt berekend, IS dit per definitie actueel — geen opslag, geen kosten.
  waarom: string;
  // Optioneel: voor recentheid-sortering binnen dezelfde ernst.
  datum?: string; // yyyy-MM-dd
  // Optioneel: als dit signaal een taak kan voorstellen. Levert de payload
  // voor de bestaande agent_acties-bevestigingsflow — GEEN nieuwe machine.
  taakVoorstel?: {
    actie_type: "kelderlog"; // hergebruikt bestaand type
    samenvatting: string;
    payload: Record<string, unknown>;
  };
}

// Een producent is een pure, alleen-lezen functie die nooit throwt.
export type SignaalProducent = () => Promise<Signaal[]>;
```

**Ontwerpkeuzes en verworpen alternatieven:**

- **`waarom` als `string`, niet als `() => string`.** Verworpen: een functie op het object, want dan is het signaal niet serialiseerbaar (nodig zou kunnen zijn voor de correlatietool-snapshot) en het voegt niets toe — de hele lijst wordt toch elke render herberekend, dus een vooraf-berekende string is al net zo "live" als een functie-aanroep. Simpeler wint.
- **`ernst` als drie vaste niveaus.** Verworpen: een numerieke prioriteit (1-100). Drie niveaus zijn genoeg om te sorteren en te kleuren (rood/amber/neutraal, zoals `meldingen.tsx` nu al doet), en een fijnmaziger schaal nodigt uit tot schijnprecisie die niemand consistent kan invullen.
- **`taakVoorstel` optioneel op het signaal zelf.** Verworpen alternatief: een aparte "promotie"-API. De promotie hergebruikt de bestaande `agent_acties`-flow; het signaal levert alleen de payload aan, de UI-knop roept het bestaande bevestig-endpoint aan. Zo blijft er precies één plek waar iets "uitgevoerd" wordt.

---

## 2. Contract van een signaalproducent (de uitbreidingshandleiding, formeel)

Een module levert signalen door een `SignaalProducent`-functie te schrijven en die aan de centrale array toe te voegen. Harde eisen aan de implementatie:

1. **Puur en alleen-lezen.** Een producent leest data (via bestaande `fetch*`-functies) en retourneert `Signaal[]`. Hij schrijft nooit, muteert nooit.
2. **Nooit throwen.** Bij een interne fout (bv. een fetch faalt) retourneert de producent `[]` en logt eventueel via `console.warn`. Eén kapotte producent mag nooit de hele Vandaag-widget breken — de verzamelfunctie draait elke producent in een eigen `try/catch` en negeert falers, zodat de overige signalen gewoon verschijnen.
3. **Stabiele id's.** Elk signaal-id begint met de vaste `bron`-prefix van de module, gevolgd door een id dat stabiel is zolang het onderwerp hetzelfde is (bv. het record-id van de betrokken tank/wijn), zodat snooze/dismiss blijft plakken.
4. **Respecteert auth.** Producenten die auth-only collecties lezen, retourneren `[]` als er geen sessie is (`isIngelogd()`-check) — exact het Fase 8-patroon, zodat de publieke hub anoniem stil blijft.

De centrale verzamelfunctie:

```ts
// src/lib/signalen.ts
const PRODUCENTEN: SignaalProducent[] = [
  onderhoudSignalen,
  backupSignaal,
  agpSignaal,
  voorraadBijnaOpSignalen, // NIEUW
  kelderlogTaakSignalen,
  kritiekeInzichtSignalen,
];

export async function verzamelSignalen(): Promise<Signaal[]> {
  const resultaten = await Promise.all(
    PRODUCENTEN.map(async (p) => {
      try {
        return await p();
      } catch (e) {
        console.warn("signaalproducent faalde, overgeslagen", e);
        return [];
      }
    }),
  );
  const alle = resultaten.flat();
  // ontdubbelen op id, filteren op snooze/dismiss, sorteren op ernst→datum
  return sorteerEnFilter(alle);
}
```

Deze functie wordt door de Vandaag-widget aangeroepen via een enkele `useQuery` — één cache-entry, zelfde patroon als vandaag, geen nieuw netwerkverkeer buiten de al bestaande fetches.

---

## 3. Contract van de "waarom"-opvraging

**Voor regel-signalen: geen opvraging, het staat al in het object.** Het `waarom`-veld is bij het genereren gevuld met een string als: _"Tank 3 (Souvignier Gris): dichtheid daalde 0,3 °Oe/dag over de laatste 4 dagen — onder de stagnatiedrempel van 0,5 °Oe/dag."_ De UI klapt dit uit op verzoek; er is geen call, geen kosten, en het is actueel omdat de hele lijst live herberekend is.

**Voor AI-signalen (correlatietool, indien gebouwd): opgeslagen, niet heropgevraagd.** De "waarom" is het `redenering`-veld uit het `signaal_analyses`-record (Fase 2 §5), opgehaald met een gewone `viewRule`-read. Conform Fase 1: **nooit** een nieuwe AI-aanroep om een verklaring te reconstrueren — dat kost geld en levert een ander antwoord.

---

## 4. Endpoints (alleen de optionele/uitgestelde onderdelen)

### 4a. `POST /api/signalen/correlatie` — **optioneel, uitgesteld tot na oogst 2026**

Alleen gebouwd na akkoord (Fase 1 vraag 1/2). PocketBase-hook (`pb_hooks/signalen.pb.js`).

- **Autorisatie**: geen `requireAuth` (consistent met de rest van de agent-endpoints), maar **wel** achter de bestaande rate-limit (`controleerRateLimit`, sleutel `agent_berichten_per_uur_per_ip`) — elke aanroep is een betaalde Claude-call. Dit is een harde eis, niet optioneel.
- **Request**: `{ signalen: Array<{ id, titel, detail, waarom }> }` — de client stuurt de _op dat moment actieve_ signaalsamenvattingen mee (de server berekent geen signalen zelf; de client is de bron, want die heeft de data al).
- **Response (200)**: `{ ok: true, redenering: string, analyse_id: string }` — de opgeslagen verklaring + het `signaal_analyses`-record-id.
- **Foutgevallen** (allemaal met Nederlandse melding):

  | Situatie                          | HTTP | Melding                                                                                                                 |
  | --------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
  | Rate limit bereikt                | 429  | "Je hebt de limiet van N assistent-aanroepen per uur bereikt. Probeer het over ~M minuten opnieuw." (bestaande melding) |
  | Minder dan 2 signalen meegestuurd | 400  | "Correlatie heeft minstens twee gelijktijdige signalen nodig."                                                          |
  | `ANTHROPIC_API_KEY` ontbreekt     | 400  | "De AI-agent is niet ingesteld: ANTHROPIC_API_KEY ontbreekt op de server." (bestaande melding)                          |
  | Anthropic onbereikbaar/fout       | 400  | "Kon de AI-agent niet bereiken: <reden>." (bestaand patroon)                                                            |
  | Budget-plafond overschreden       | —    | **Vervalt** (besluit Thomas): geen apart maandplafond bovenop de bestaande rate-limit — zie §4c.                        |

- **Waarom een hook en niet client-side?** De Anthropic-key mag nooit in de client (bestaande architectuur, Fase 3-besluit uit een eerdere fase). Elke AI-aanroep loopt server-side, punt.

### 4b. Snooze/dismiss — **besloten: server-side (`signaal_status`), gewone PocketBase-SDK-calls**

Thomas werkt op telefoon én desktop — localStorage is per apparaat en verdwijnt bij het legen van de cache, dus dat volstaat niet. Dit zijn gewone PocketBase-SDK-calls, **geen custom hook-endpoint nodig**:

```ts
// snoozen
await pb.collection("signaal_status").create({
  signaal_id,
  actie: "gesnoozed",
  snooze_tot: datum,
});
// permanent negeren
await pb.collection("signaal_status").create({ signaal_id, actie: "genegeerd" });
// status opvragen voor de zichtbare signalen (één query, niet per signaal)
const statussen = await pb.collection("signaal_status").getFullList({
  filter: pb.filter("signaal_id in ({:ids})" /* of per-id filter, zie implementatie */, { ids }),
});
```

Rechten `OPEN_RULE` (Fase 2 §4) — geen hook, geen server-side validatie nodig, dit is precies het soort simpele CRUD waar de PocketBase-SDK direct voor bedoeld is.

### 4c. Geen apart budgetplafond — besloten door Thomas

Geen nieuw endpoint, geen nieuwe instelling. Thomas werkt met prepaid Anthropic-credits (het account raakt op, geen onverwachte rekening) en de bestaande per-uur rate-limit (Fase 9 Blok E, `agent_berichten_per_uur_per_ip`) geldt al voor elke Claude-aanroep inclusief de toekomstige correlatietool. Bovendien is de correlatietool zelf uitgesteld tot na het seizoen, dus dit is op dit moment ook geen acuut risico. Als de correlatietool ooit gebouwd wordt (buiten dit Fase 5-plan) en de praktijk een apart plafond nodig blijkt, is dat een kleine losse toevoeging op dat moment — niet iets om nu al te bouwen zonder concrete aanleiding.

---

## 5. Wat waar draait, en waarom

| Logica                                    | Waar                                         | Motivatie                                                                                           |
| ----------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Regel-signalen detecteren                 | **Client** (`src/lib/signalen.ts`)           | Leest bestaande collecties die de client toch al ophaalt; herberekening is gratis; geen serverstaat |
| Signalen sorteren/ontdubbelen/plafonneren | **Client**                                   | Pure transformatie van de opgehaalde lijst                                                          |
| Snooze/dismiss (localStorage-variant)     | **Client**                                   | Geen serverstaat nodig bij single-device                                                            |
| Snooze/dismiss (collectie-variant)        | **PocketBase-SDK direct**                    | Simpele CRUD, geen custom logica → geen hook nodig                                                  |
| AI-correlatie                             | **PocketBase-hook**                          | API-key mag niet in de client; rate limit moet server-side                                          |
| Opschoning inzichten                      | **Gepland script** (`bereken-inzichten.mjs`) | Gekoppeld aan de bestaande berekening, geen los proces                                              |

**Geen enkele nieuwe logica in een hook voor de regel-laag.** Dat is bewust: hooks herladen niet automatisch op Windows (bekende valkuil, CLAUDE.md), zijn lastiger te testen dan client-code, en voegen hier niets toe omdat er geen serverstaat en geen geheim in het spel is.

---

## 6. Wat gebeurt er bij falen

| Faalscenario                                      | Gedrag                                                                                                                                                                                     | Blijft de app bruikbaar?                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Eén signaalproducent gooit een fout               | `try/catch` per producent → die producent levert `[]`, de rest verschijnt                                                                                                                  | Ja, volledig                                                      |
| PocketBase onbereikbaar                           | Alle producenten die data nodig hebben leveren `[]`; de widget toont niets of een "geen verbinding"-notitie (bestaand `ErrorState`-patroon)                                                | Ja — de rest van de app draait op de bestaande offline-first laag |
| Anthropic-API onbereikbaar (correlatietool)       | Knop toont Nederlandse foutmelding; **alle regel-signalen blijven werken**                                                                                                                 | Ja, volledig — regel-laag is nooit AI-afhankelijk                 |
| Budget op                                         | Correlatie-knop uitgeschakeld met zichtbare melding; regel-signalen ongewijzigd                                                                                                            | Ja, volledig                                                      |
| Hook-fout in correlatie                           | 400 met leesbare melding; geen half-opgeslagen `signaal_analyses` (schrijven pas na succesvolle AI-call, in één transactie — zelfde atomiciteitspatroon als `agent_acties`, Fase 9 Blok E) | Ja                                                                |
| Gedeeltelijk resultaat (sommige producenten leeg) | Toont wat er is; geen foutstatus voor een lege producent (leeg ≠ fout)                                                                                                                     | Ja                                                                |

**Kernontwerp voor robuustheid**: de regel-laag en de AI-laag zijn volledig ontkoppeld. De AI-laag kan volledig uitvallen (onbereikbaar, budget op, key weg) zonder dat één regel-signaal verdwijnt. Dit is de "graceful degradation" uit de opdracht, ingebakken in de architectuur in plaats van als foutafhandeling toegevoegd.

---

## 7. Backwards compatibiliteit

| Bestaand onderdeel                 | Raakt dit ontwerp het?                                                  | Blijft compatibel?                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `meldingen.tsx`                    | **Vervangen** door de Vandaag-widget                                    | Ja — de afgevinkt-state wordt gemigreerd (Fase 2 §6); geen weggeklikte melding komt terug |
| `BackupWidget` (`index.tsx`)       | Kan opgaan in de signaallaag (dedupliceert de dubbele check) of blijven | Als 'm blijft: ongewijzigd. Als 'm opgaat: dezelfde info, één bron                        |
| `agent_acties`-flow                | **Hergebruikt**, niet gewijzigd                                         | Ja — mits de `onderhoud`/`order`-config-drift eerst gefixt is                             |
| `zoek_inzichten`-agenttool         | Ongewijzigd                                                             | Ja                                                                                        |
| `advies_feedback`-flow             | Ongewijzigd                                                             | Ja                                                                                        |
| Bestaande `/api/agent/*`-endpoints | Ongewijzigd                                                             | Ja — de correlatietool is een nieuw, apart endpoint                                       |
| Bestaande `inzichten`-records      | Volledig behouden, geen opschoning (herzien besluit)                    | Ja                                                                                        |

**Geen enkel bestaand endpoint wordt in signatuur gewijzigd.** De correlatietool is additief. De grootste zichtbare wijziging is de vervanging van `meldingen.tsx` door de Vandaag-widget, en die is bewust ontworpen om Thomas' bestaande weggeklikte-state te behouden.

---

## Drie belangrijkste API-keuzes

1. **De kern is een TypeScript-interface, geen HTTP-API.** Regel-signalen worden client-side berekend; er is geen nieuw endpoint nodig voor het overgrote deel van de feature.
2. **Regel-laag en AI-laag zijn volledig ontkoppeld** — de AI-laag kan volledig uitvallen zonder dat één regel-signaal verdwijnt; graceful degradation zit in de architectuur, niet in foutafhandeling.
3. **De enige AI-aanroep (correlatietool) loopt server-side achter de bestaande rate-limit**, met exact het atomiciteits- en foutafhandelingspatroon dat Fase 9 al bewees voor `agent_acties`.

---

## Besluiten van Thomas (24 juli 2026, was hier eerder een open vraag)

1. **`BackupWidget` op de hub**: **beide** — een permanente statusregel ("laatste geslaagde backup: X geleden", ook zichtbaar als alles goed gaat) blijft bestaan, plus een signaal in de Vandaag-widget zodra de drempel overschreden wordt. Motivatie van Thomas: bij backups is stilte dubbelzinnig — hij wil kunnen zien dat de controle zelf nog actief is, niet alleen een melding krijgen als het misgaat. **Consequentie voor bouwstap 1**: de permanente statusregel (in `index.tsx`) blijft ongewijzigd bestaan; alleen de _waarschuwings_-conditie verhuist naar `signalen.ts` als producent. Geen dubbele check meer (beide lezen straks dezelfde `backup_waarschuwing_dagen`-instelling uit `app_instellingen`), maar wel twee zichtbare plekken — bewust, niet per ongeluk.
2. **Budget-plafond**: **niet gebouwd.** Prepaid Anthropic-credits + de bestaande per-uur rate-limit volstaan; de correlatietool is bovendien uitgesteld. Zie §4c hierboven.
