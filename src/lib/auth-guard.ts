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
// localStorage, zie synchroniseerServerSessieMetCookie hieronder).
const leesPbAuthCookie = createIsomorphicFn()
  .server(() => getCookie("pb_auth"))
  .client(() => undefined as string | undefined);

// KRITIEKE BUG GEVONDEN EN GEFIXT (21 augustus 2026, bij het herstellen van
// inloggen). `getPb()` retourneert op de server een MODULE-LEVEL SINGLETON
// (`pbInstance` in data.ts) — die instantie, inclusief zijn `authStore`,
// blijft bestaan over ALLE requests van ALLE gebruikers heen zolang het
// Node-serverproces draait. Dat is prima voor de client (één browser-tab =
// één gebruiker), maar op de server behandelt geen enkel ander stuk code dit
// als per-request state.
//
// De vorige versie van deze functie (toen laadServerSessieUitCookie geheten)
// had: `if (!pb || pb.authStore.isValid) return;` — die early-return ging
// ervan uit dat "de gedeelde authStore is al geldig" betekent "voor DEZE
// request is al eerder gecheckt". In werkelijkheid betekent het alleen "een
// ANDERE, eerdere request (mogelijk van een andere gebruiker) heeft deze
// gedeelde instantie laatst gevuld". Gevolg, bevestigd met een kale `curl`
// zonder cookies vlak na een ingelogde sessie: een volledig anonieme
// aanvraag kreeg de server-gerenderde HTML van de kelder te zien, inclusief
// "Uitloggen" en het beheerder-only gebruikersbeheer — een cross-user
// session leak op serverniveau. Onschadelijk zolang er één gebruiker op één
// apparaat tegen localhost werkt, maar precies het soort architectuurfout
// die op de Pi-migratie (meerdere apparaten, netwerkbreed bereikbaar) een
// echt datalek wordt.
//
// DE FIX: bepaal bij ELKE serverrender de sessie ALTIJD opnieuw vanuit de
// cookie van DIE SPECIFIEKE request — nooit uitgaan van de restwaarde van
// een vorige request. Is er een geldige cookie: laden (overschrijft een
// eventuele oude sessie). Is er geen cookie: expliciet clearen, zodat een
// sessie van een vorige, andere request niet blijft hangen.
//
// AANGEROEPEN VANUIT ROOT-BEFORELOAD (__root.tsx), NIET ALLEEN VANUIT DEZE
// GUARD: het lek trof namelijk ook ONGEGIDste routes (de hub, /perceelkaart,
// /oogst, /werkrapport) die `isIngelogd()` gebruiken om auth-only content
// voorwaardelijk te tonen — die routes riepen deze functie nooit aan, dus de
// gedeelde staat van een eerdere guarded-route-render bleef daar ongefilterd
// zichtbaar. Door dit op het root-niveau te draaien geldt de correctie voor
// elke serverrender, ongeacht welke route.
export function synchroniseerServerSessieMetCookie() {
  if (typeof document !== "undefined") return; // client: authStore komt al uit localStorage
  const pb = getPb();
  if (!pb) return;
  const cookie = leesPbAuthCookie();
  if (!cookie) {
    pb.authStore.clear();
    return;
  }
  try {
    pb.authStore.loadFromCookie(`pb_auth=${cookie}`);
  } catch {
    pb.authStore.clear();
  }
}

export function vereistIngelogd(melding: string) {
  synchroniseerServerSessieMetCookie();
  if (!isIngelogd()) {
    throw redirect({ to: "/login", search: { melding } });
  }
}
