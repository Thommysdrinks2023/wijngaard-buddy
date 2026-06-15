// AI Wijngaard Assistent — Anthropic Messages API rechtstreeks vanuit de browser.
//
// ⚠️ BEVEILIGING: VITE_ANTHROPIC_API_KEY komt in de browserbundel terecht en is
// dus zichtbaar voor iedereen die de app gebruikt. Dit is alleen acceptabel voor
// een privé-app op eigen apparaten. Voor publieke distributie hoort de sleutel
// achter een eigen server-proxy te zitten (bijv. op de PocketBase-VPS).

import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { fetchFenologie, fetchMetingen, fetchObservaties, fetchRijen } from "./data";
import { fetchOogst } from "./extra-data";
import { fetchSteekproefMetingen, fetchSteekproefPlanten } from "./steekproef";
import { fetchWeer, fetchVerwachting } from "./weer";
import { fetchGdd, huidigeGdd, isGddBeschikbaar } from "./gdd";
import { OBSERVATIE_TYPES, type Ras } from "./types";

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
const MODEL = "claude-sonnet-4-6";
const ENDPOINT = "https://api.anthropic.com/v1/messages";

export function isAssistentBeschikbaar(): boolean {
  return Boolean(API_KEY);
}

export interface ChatBericht {
  rol: "user" | "assistant";
  tekst: string;
}

// Stabiele systeemprompt — verandert nooit, dus geschikt voor prompt caching.
const SYSTEEM_PROMPT = `Je bent de Wijngaard Assistent van De Tappenmars in Den Ham.
Je kent de wijngaard: 1.5 hectare, 70 rijen, 7 rassen:
- Muscaris (rij 1-5), Souvignier Gris (6-21), Johanniter (22-40)
- Regent (41-44,46-47), Pinot Noir (45,65,68)
- Chardonnay (48-56), Pinotin (57-64,66-67)
Je krijgt actuele data mee bij elke vraag.
Geef praktisch, concreet advies in het Nederlands.
Denk mee als een ervaren wijnboer.
Wees kort en to-the-point.`;

export interface ContextResultaat {
  // compacte tekst die als context naar het model gaat
  tekst: string;
  // leesbare samenvatting van welke databronnen zijn meegestuurd (voor de UI)
  bronnen: string[];
}

function jaarOf(item: { seizoen?: number; datum: string }): number {
  return item.seizoen ?? parseISO(item.datum).getFullYear();
}

// Haalt automatisch de actuele wijngaard-data op uit PocketBase + weer/GDD.
export async function verzamelContext(): Promise<ContextResultaat> {
  const seizoen = new Date().getFullYear();
  const bronnen: string[] = [];
  const delen: string[] = [
    `Vandaag is ${format(new Date(), "d MMMM yyyy", { locale: nl })}. Huidig seizoen: ${seizoen}.`,
  ];

  const rasVanRij = new Map<string, Ras>();
  const rijnummerVanRij = new Map<string, number>();

  // Alles parallel ophalen; faalt er één, dan slaan we dat deel over
  const [rijen, metingen, observaties, fenologie, oogst, stkPlanten, stkMetingen] =
    await Promise.all([
      fetchRijen().catch(() => []),
      fetchMetingen().catch(() => []),
      fetchObservaties().catch(() => []),
      fetchFenologie().catch(() => []),
      fetchOogst().catch(() => []),
      fetchSteekproefPlanten().catch(() => []),
      fetchSteekproefMetingen().catch(() => []),
    ]);

  rijen.forEach((r) => {
    rasVanRij.set(r.id, r.ras);
    rijnummerVanRij.set(r.id, r.rijnummer);
  });
  const rijLabel = (rijId: string) =>
    `rij ${rijnummerVanRij.get(rijId) ?? "?"} (${rasVanRij.get(rijId) ?? "?"})`;

  // Laatste 10 metingen
  const laatsteMetingen = metingen.slice(0, 10);
  if (laatsteMetingen.length > 0) {
    bronnen.push(`Laatste ${laatsteMetingen.length} metingen`);
    delen.push(
      "LAATSTE METINGEN:\n" +
        laatsteMetingen
          .map(
            (m) =>
              `- ${m.datum} ${rijLabel(m.rij)}: ${m.brix != null ? `Brix ${m.brix}` : "geen brix"}` +
              `${m.ph != null ? `, pH ${m.ph}` : ""}${m.zuurgraad != null ? `, zuur ${m.zuurgraad}` : ""}, rijpheid ${m.rijpheid_score}/5`,
          )
          .join("\n"),
    );
  }

  // Laatste 5 observaties
  const laatsteObs = observaties.slice(0, 5);
  if (laatsteObs.length > 0) {
    bronnen.push(`Laatste ${laatsteObs.length} observaties`);
    delen.push(
      "LAATSTE OBSERVATIES:\n" +
        laatsteObs
          .map((o) => {
            const t = OBSERVATIE_TYPES.find((x) => x.value === o.type);
            return `- ${o.datum} ${rijLabel(o.rij)}: ${t?.label ?? o.type} — ${o.notitie}`;
          })
          .join("\n"),
    );
  }

  // Fenologie: laatste moment per ras dit seizoen
  const fenSeizoen = fenologie.filter((f) => jaarOf(f) === seizoen);
  if (fenSeizoen.length > 0) {
    const perRas = new Map<Ras, { moment: string; datum: string }>();
    fenSeizoen.forEach((f) => {
      const cur = perRas.get(f.ras);
      if (!cur || cur.datum < f.datum) perRas.set(f.ras, { moment: f.moment, datum: f.datum });
    });
    bronnen.push("Fenologie per ras");
    delen.push(
      "FENOLOGIE (laatste moment per ras dit seizoen):\n" +
        Array.from(perRas.entries())
          .map(([ras, v]) => `- ${ras}: ${v.moment} (${v.datum})`)
          .join("\n"),
    );
  }

  // Ziektedruk per ras (nieuwste steekproefmeting dit seizoen)
  const plantRas = new Map<string, Ras>();
  stkPlanten.forEach((p) => plantRas.set(p.id, p.ras));
  const ziekteperRas = new Map<Ras, { druk: string; datum: string }>();
  stkMetingen.forEach((m) => {
    if (m.seizoen !== seizoen || !m.ziektedruk) return;
    const ras = plantRas.get(m.plantId);
    if (!ras) return;
    const cur = ziekteperRas.get(ras);
    if (!cur || cur.datum < m.datum) ziekteperRas.set(ras, { druk: m.ziektedruk, datum: m.datum });
  });
  if (ziekteperRas.size > 0) {
    bronnen.push("Ziektedruk per ras");
    delen.push(
      "ZIEKTEDRUK (uit steekproeven):\n" +
        Array.from(ziekteperRas.entries())
          .map(([ras, v]) => `- ${ras}: ${v.druk} (${v.datum})`)
          .join("\n"),
    );
  }

  // Oogst dit seizoen
  const oogstSeizoen = oogst.filter((o) => o.seizoen === seizoen);
  if (oogstSeizoen.length > 0) {
    const perRas = new Map<Ras, number>();
    oogstSeizoen.forEach((o) => perRas.set(o.ras, (perRas.get(o.ras) ?? 0) + o.kg));
    const totaal = Math.round(Array.from(perRas.values()).reduce((a, b) => a + b, 0) * 10) / 10;
    bronnen.push("Oogstdata");
    delen.push(
      `OOGST ${seizoen} (totaal ${totaal} kg):\n` +
        Array.from(perRas.entries())
          .map(([ras, kg]) => `- ${ras}: ${Math.round(kg * 10) / 10} kg`)
          .join("\n"),
    );
  }

  // Weer (huidig + verwachting)
  try {
    const weer = await fetchWeer();
    bronnen.push("Huidig weer");
    let weerTekst = `WEER NU (${weer.stad}): ${weer.temperatuur}°C, ${weer.omschrijving}, ${weer.luchtvochtigheid}% vocht, wind ${weer.windsnelheid} m/s, neerslag ${weer.neerslag1u} mm/u.`;
    try {
      const verw = await fetchVerwachting();
      if (verw.length > 0) {
        bronnen.push("Weersverwachting");
        weerTekst +=
          "\nVERWACHTING:\n" +
          verw
            .map((d) => `- ${d.dagNaam}: ${d.tempMin}-${d.tempMax}°C, ${d.neerslag} mm`)
            .join("\n");
      }
    } catch {
      // verwachting optioneel
    }
    delen.push(weerTekst);
  } catch {
    // weer optioneel
  }

  // GDD-stand
  if (isGddBeschikbaar()) {
    try {
      const gdd = await fetchGdd(seizoen);
      const totaal = Math.round(huidigeGdd(gdd));
      if (totaal > 0) {
        bronnen.push("GDD (warmtesom)");
        delen.push(`WARMTESOM (GDD, basis 10°C, sinds 1 april): ${totaal} °C·dagen.`);
      }
    } catch {
      // gdd optioneel
    }
  }

  return { tekst: delen.join("\n\n"), bronnen };
}

interface AnthropicAntwoord {
  content?: { type: string; text?: string }[];
  error?: { message?: string };
}

// Stuurt de vraag + context naar Claude en geeft het antwoord terug.
export async function vraagAssistent(
  berichten: ChatBericht[],
  contextTekst: string,
): Promise<string> {
  if (!API_KEY) throw new Error("Geen API-sleutel ingesteld (VITE_ANTHROPIC_API_KEY).");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      // nodig om de API rechtstreeks vanuit de browser aan te roepen (CORS)
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      // systeemprompt in twee blokken: het stabiele deel wordt gecachet,
      // de wisselende wijngaard-context staat erna (buiten de cache)
      system: [
        { type: "text", text: SYSTEEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: `ACTUELE WIJNGAARD-DATA:\n\n${contextTekst}` },
      ],
      messages: berichten.map((b) => ({ role: b.rol, content: b.tekst })),
    }),
  });

  if (!res.ok) {
    let bericht = `Fout ${res.status}`;
    try {
      const fout = (await res.json()) as AnthropicAntwoord;
      if (fout.error?.message) bericht = fout.error.message;
    } catch {
      // niet-JSON foutmelding
    }
    if (res.status === 401) bericht = "Ongeldige API-sleutel.";
    if (res.status === 429) bericht = "Te veel verzoeken — probeer het zo opnieuw.";
    throw new Error(bericht);
  }

  const data = (await res.json()) as AnthropicAntwoord;
  const tekst = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  return tekst || "(geen antwoord)";
}
