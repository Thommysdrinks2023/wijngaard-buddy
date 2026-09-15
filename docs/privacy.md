# Privacynotitie — De Tappenmars Buddy (intern bedrijfssysteem)

Laatst bijgewerkt: 16 juli 2026. Dit is een interne werknotitie (AVG-basis),
geen juridisch document.

## Welke persoonsgegevens staan in het systeem?

| Collectie                                         | Gegevens                                  | Doel                                              |
| ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| `users`                                           | naam, e-mail, rol                         | toegang en rolbeheer voor eigen mensen            |
| `klanten`                                         | naam, type, contactgegevens (e-mail/tel.) | verkoopadministratie en levering                  |
| `orders`                                          | koppeling aan klant, gekochte wijnen      | verkoop-, voorraad- en accijnsadministratie       |
| logvelden (`ingevoerd_door`, `verantwoordelijke`) | naam van de invoerder                     | traceerbaarheid van boekingen (wettelijk gewenst) |

Er worden geen bijzondere persoonsgegevens verwerkt. Foto's worden vóór opslag
ontdaan van EXIF-metadata (GPS/tijd/toestel) — zie `docs/security.md` punt 3.

## Bewaartermijnen

- **Orders en boekingen**: bewaard conform fiscale bewaarplicht (7 jaar);
  het tankboek en de voorraadmutaties zijn bewust onwijzigbaar.
- **Klanten zonder orders**: instelbaar via `regelgeving_instellingen`-sleutel
  `klant_bewaartermijn_maanden` (default 24). Klanten zonder enige order die
  ouder zijn dan deze termijn verschijnen in een **opschoonlijstje** op
  /verkoop — verwijdering is altijd een handmatige, bewuste actie, nooit
  automatisch.

## AI-verwerking

De assistent (/assistent) stuurt gespreksinhoud en tool-resultaten naar de
**Anthropic API** (Claude). Volgens de commerciële API-voorwaarden van
Anthropic wordt deze data **niet gebruikt voor het trainen van modellen**.
Klantgegevens gaan alleen mee wanneer een gesprek daar expliciet om vraagt
(zie `docs/security.md` punt 6). Er is geen andere externe verwerking; de
database draait lokaal.

## Rechten van betrokkenen

Bij een inzage- of verwijderverzoek van een klant: zoek de klant op /verkoop op
(alle gegevens staan op één record + gekoppelde orders). Verwijderen kan zodra
de fiscale bewaarplicht van de orders dat toelaat; anonimiseren (naam →
"verwijderde klant") is het alternatief zolang orders bewaard moeten blijven.
