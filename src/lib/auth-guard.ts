// Route-guard voor de online-only modules (kelder, verkoop, materieel,
// voorraad — zie CLAUDE.md: deze datalagen hebben bewust geen offline-
// fallback). Bug gevonden: zonder deze guard rendert de paginacomponent
// gewoon door tegen een niet-geauthenticeerde sessie; PocketBase's listRule
// (`@request.auth.id != ''`) beantwoordt dat dan met een geldige 200 en een
// lege items-lijst (geen foutcode), dus de select-velden lijken alleen maar
// stil leeg — niets wijst naar "log in". Deze guard onderschept dat vóór de
// pagina laadt.
import { redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { getPb, isIngelogd } from "./data";

// Isomorphic wrapper: de server-implementatie (met de server-only
// `getCookie`) wordt door de bundler nooit in de clientbundel meegenomen —
// de client-tak levert gewoon undefined (authStore komt daar al uit
// localStorage, zie laadServerSessieUitCookie hieronder).
const leesPbAuthCookie = createIsomorphicFn()
  .server(() => getCookie("pb_auth"))
  .client(() => undefined as string | undefined);

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
// ingelogd" — een terechte weigering, geen valse positief. Bijwerking (nu
// OPGELOST, zie Fase 9 Blok D / ARCHITECTURE.md): een écht ingelogde
// gebruiker die zo'n route hard ververste werd voorheen ook naar /login
// gestuurd, omdat de sessie niet server-side beschikbaar was. `data.ts`
// spiegelt de authStore nu naar een `pb_auth`-cookie (niet-httpOnly, want
// een client-side authStore kan geen httpOnly-cookie zetten); hieronder
// wordt die cookie tijdens SSR teruggelezen vóórdat isIngelogd() checkt.
function laadServerSessieUitCookie() {
  if (typeof document !== "undefined") return; // client: authStore komt al uit localStorage
  const pb = getPb();
  if (!pb || pb.authStore.isValid) return;
  const cookie = leesPbAuthCookie();
  if (!cookie) return;
  try {
    pb.authStore.loadFromCookie(`pb_auth=${cookie}`);
  } catch {
    pb.authStore.clear();
  }
}

export function vereistIngelogd(melding: string) {
  laadServerSessieUitCookie();
  if (!isIngelogd()) {
    throw redirect({ to: "/login", search: { melding } });
  }
}
