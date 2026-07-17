// Route-guard voor de online-only modules (kelder, verkoop, materieel,
// voorraad — zie CLAUDE.md: deze datalagen hebben bewust geen offline-
// fallback). Bug gevonden: zonder deze guard rendert de paginacomponent
// gewoon door tegen een niet-geauthenticeerde sessie; PocketBase's listRule
// (`@request.auth.id != ''`) beantwoordt dat dan met een geldige 200 en een
// lege items-lijst (geen foutcode), dus de select-velden lijken alleen maar
// stil leeg — niets wijst naar "log in". Deze guard onderschept dat vóór de
// pagina laadt.
import { redirect } from "@tanstack/react-router";
import { isIngelogd } from "./data";

// LET OP (bevestigd tijdens het testen van deze fix): de app rendert deze
// routes ook server-side (TanStack Start SSR — `curl` op een beveiligde
// route levert zonder sessie de volledig gerenderde pagina-HTML op). Een
// eerdere versie sloeg deze check daarom over tijdens SSR (`typeof window
// === "undefined"`) uit angst een ingelogde gebruiker onterecht weg te
// sturen — maar TanStack Start hergebruikt het server-beforeLoad-resultaat
// bij hydratie en voert beforeLoad NIET opnieuw uit op de client voor een
// SSR'de match. Met de skip erin vuurde de guard dus NOOIT bij een verse
// paginalaad/refresh (alleen nog bij client-side in-app-navigatie), wat het
// hele lek weer openzette. Daarom draait de check nu ONVOORWAARDELIJK, ook
// tijdens SSR: `isIngelogd()` leest de PocketBase-authStore (localStorage),
// die op de server sowieso leeg is, dus het resultaat is daar altijd "niet
// ingelogd" — een terechte weigering, geen valse positief. Bijwerking: een
// écht ingelogde gebruiker die een kelder/verkoop/materieel/voorraad-URL
// hard ververst (in plaats van er client-side naartoe te navigeren) wordt
// nu ook even naar /login gestuurd omdat de sessie niet server-side
// beschikbaar is. Structurele oplossing (cookie-gesynchroniseerde
// authStore voor SSR) staat als vervolgpunt — buiten scope van deze fix.
export function vereistIngelogd(melding: string) {
  if (!isIngelogd()) {
    throw redirect({ to: "/login", search: { melding } });
  }
}
