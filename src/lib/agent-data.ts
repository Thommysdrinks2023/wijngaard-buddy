// Datalaag AI-agent (Fase 3): gesprekken, berichten, bevestigingsacties, feedback.
// Bewust online-only zoals kelder-data.ts — de agent-loop draait server-side en
// heeft sowieso een verbinding nodig, dus een offline-wachtrij voegt niets toe.

import type { RecordModel } from "pocketbase";
import type {
  AdviesFeedback,
  AdviesOordeel,
  AgentActie,
  AgentActieType,
  AgentBericht,
  AgentGesprek,
  AgentRol,
} from "./types";
import { ensureOnline, getPb } from "./data";
import { logAudit } from "./audit";

const GEEN_VERBINDING = "Geen verbinding — de assistent heeft de server nodig.";

async function pbOfFout() {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) throw new Error(GEEN_VERBINDING);
  return pb;
}

function huidigeGebruikerId(): string {
  return getPb()?.authStore.record?.id ?? "";
}

// naam voor "verantwoordelijke" op boekingen: ingelogde accountnaam, anders de
// lokaal ingestelde invoerder (zelfde bron als metingen/observaties gebruiken)
function huidigeNaam(): string {
  const record = getPb()?.authStore.record as { name?: string; email?: string } | null;
  if (record?.name) return record.name;
  if (record?.email) return record.email.split("@")[0];
  try {
    return JSON.parse(localStorage.getItem("wg.invoerder.v1") ?? '""') || "onbekend";
  } catch {
    return "onbekend";
  }
}

// ============= Gesprekken =============

function gesprekFromPb(r: RecordModel): AgentGesprek {
  return {
    id: r.id,
    titel: r["titel"] || "Nieuw gesprek",
    laatste_bericht_op: r["laatste_bericht_op"] || r["created"],
    created: r["created"],
  };
}

// Geen filter op gebruiker: de app is in de praktijk één bedrijf/één gebruiker,
// en de assistent werkt bewust ook zonder inloggen (gesprekken die uitgelogd
// zijn gestart moeten na inloggen gewoon zichtbaar blijven, en andersom).
export async function fetchGesprekken(): Promise<AgentGesprek[]> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) return [];
  const records = await pb.collection("agent_gesprekken").getFullList({
    sort: "-laatste_bericht_op",
    filter: `deleted != true`,
  });
  return records.map(gesprekFromPb);
}

export async function createGesprek(): Promise<AgentGesprek> {
  const pb = await pbOfFout();
  const r = await pb.collection("agent_gesprekken").create({
    gebruiker: huidigeGebruikerId(),
    titel: "Nieuw gesprek",
    laatste_bericht_op: new Date().toISOString(),
  });
  return gesprekFromPb(r);
}

// ============= Berichten =============

function berichtFromPb(r: RecordModel, pb: ReturnType<typeof getPb>): AgentBericht {
  return {
    id: r.id,
    gesprek_id: r["gesprek_id"],
    rol: r["rol"] as AgentRol,
    inhoud: r["inhoud"] ?? "",
    tool_calls: r["tool_calls"] ?? undefined,
    tool_resultaten: r["tool_resultaten"] ?? undefined,
    foto: r["foto"] ? pb?.files.getURL(r, r["foto"]) : undefined,
    created: r["created"],
  };
}

export async function fetchBerichten(gesprekId: string): Promise<AgentBericht[]> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) return [];
  const records = await pb.collection("agent_berichten").getFullList({
    sort: "created",
    filter: `gesprek_id = "${gesprekId}" && deleted != true`,
  });
  return records.map((r) => berichtFromPb(r, pb));
}

export interface NieuwBerichtInput {
  gesprekId: string;
  inhoud: string;
  fotoFile?: File | null;
}

// Maakt het user-bericht rechtstreeks via de SDK aan (incl. eventuele foto als
// multipart) — de hook parset zelf geen multipart, zie DECISIONS-FASE3.md.
export async function createUserBericht(input: NieuwBerichtInput): Promise<AgentBericht> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "agent_berichten", input.inhoud.slice(0, 60));
  const fd = new FormData();
  fd.append("gesprek_id", input.gesprekId);
  fd.append("rol", "user");
  fd.append("inhoud", input.inhoud);
  if (input.fotoFile) fd.append("foto", input.fotoFile);
  const r = await pb.collection("agent_berichten").create(fd);
  return berichtFromPb(r, pb);
}

export interface AgentBeurtResultaat {
  antwoord: string;
  acties: Pick<AgentActie, "id" | "actie_type" | "samenvatting" | "status">[];
  bericht_id: string;
  tool_calls?: { naam: string; input: Record<string, unknown> }[];
  tool_resultaten?: { naam: string; resultaat: string }[];
}

// Roept de agent-loop aan voor een al aangemaakt bericht. Foutmeldingen komen
// al in het Nederlands terug van de server (leesbareFout in agent_uitvoering.js).
export async function stuurBerichtNaarAgent(berichtId: string): Promise<AgentBeurtResultaat> {
  const pb = await pbOfFout();
  return await pb.send("/api/agent/bericht", {
    method: "POST",
    body: { bericht_id: berichtId, verantwoordelijke: huidigeNaam() },
  });
}

export async function fetchActies(gesprekId: string): Promise<AgentActie[]> {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) return [];
  const records = await pb.collection("agent_acties").getFullList({
    sort: "created",
    filter: `gesprek_id = "${gesprekId}"`,
  });
  return records.map((r) => ({
    id: r.id,
    gesprek_id: r["gesprek_id"],
    bericht_id: r["bericht_id"],
    actie_type: r["actie_type"],
    payload: r["payload"] ?? {},
    samenvatting: r["samenvatting"],
    status: r["status"],
    fout: r["fout"] || undefined,
    uitgevoerd_record_id: r["uitgevoerd_record_id"] || undefined,
    created: r["created"],
  }));
}

// ============= Acties (bevestigen/afwijzen) =============

export interface AgentActieUitkomst {
  ok: boolean;
  status: "uitgevoerd" | "mislukt" | "afgewezen";
  uitgevoerd_record_id?: string;
  fout?: string;
  vervolg: AgentBeurtResultaat | null;
}

export async function bevestigActie(actieId: string): Promise<AgentActieUitkomst> {
  const pb = await pbOfFout();
  logAudit("gewijzigd", "agent_acties", "Voorstel bevestigd");
  return await pb.send(`/api/agent/actie/${actieId}/bevestig`, {
    method: "POST",
    body: { verantwoordelijke: huidigeNaam() },
  });
}

export async function afwijzActie(actieId: string): Promise<AgentActieUitkomst> {
  const pb = await pbOfFout();
  logAudit("gewijzigd", "agent_acties", "Voorstel afgewezen");
  return await pb.send(`/api/agent/actie/${actieId}/afwijzen`, {
    method: "POST",
    body: { verantwoordelijke: huidigeNaam() },
  });
}

// ============= Feedback =============

export async function geefAdviesFeedback(
  berichtId: string,
  oordeel: AdviesOordeel,
): Promise<AdviesFeedback> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "advies_feedback", `${oordeel} · bericht ${berichtId}`);
  const r = await pb.collection("advies_feedback").create({
    bericht_id: berichtId,
    oordeel,
    gegeven_door: huidigeGebruikerId(),
  });
  return {
    id: r.id,
    bericht_id: r["bericht_id"],
    oordeel: r["oordeel"],
    toelichting: r["toelichting"] || undefined,
    created: r["created"],
  };
}

// ============= Bronnenregel =============
// Bouwt "gebaseerd op: 12 metingen, inzicht gisting_snelheid W27" uit de
// tool_calls/tool_resultaten van één assistant-bericht. Puur client-side —
// geen extra verzoek nodig omdat de hook deze velden meestuurt in de respons.

const LEES_TOOL_LABELS: Record<string, string> = {
  zoek_partijen: "partijen",
  partij_detail: "partijdetail",
  zoek_tanks: "tanks",
  zoek_metingen: "metingen",
  zoek_observaties: "observaties",
  zoek_oogst: "oogstrecords",
  zoek_fenologie: "fenologiemomenten",
  zoek_tankboek: "tankboekregels",
  zoek_advies_feedback: "eerdere adviesoordelen",
};

export function bouwBronnenregel(
  toolCalls?: { naam: string; input: Record<string, unknown> }[],
  toolResultaten?: { naam: string; resultaat: string }[],
): string | null {
  if (!toolCalls || toolCalls.length === 0) return null;

  const resultatenPerNaam = new Map<string, string[]>();
  for (const r of toolResultaten ?? []) {
    const lijst = resultatenPerNaam.get(r.naam) ?? [];
    lijst.push(r.resultaat);
    resultatenPerNaam.set(r.naam, lijst);
  }

  const delen: string[] = [];
  for (const call of toolCalls) {
    if (call.naam === "zoek_inzichten") {
      for (const raw of resultatenPerNaam.get(call.naam) ?? []) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            for (const item of arr) {
              if (item?.inzicht_type) {
                delen.push(`inzicht ${item.inzicht_type}${item.periode ? " " + item.periode : ""}`);
              }
            }
          }
        } catch {
          // geen valide JSON (bv. een foutmelding) — geen bronvermelding
        }
      }
      continue;
    }
    if (call.naam === "analyseer_foto") {
      delen.push("1 fotoanalyse");
      continue;
    }
    if (call.naam === "web_search") {
      for (const raw of resultatenPerNaam.get(call.naam) ?? []) {
        try {
          const resultaten = JSON.parse(raw);
          const aantal = Array.isArray(resultaten) ? resultaten.length : 0;
          delen.push(
            aantal > 0 ? `web search (${aantal} bron${aantal === 1 ? "" : "nen"})` : "web search",
          );
        } catch {
          delen.push("web search");
        }
      }
      continue;
    }
    const label = LEES_TOOL_LABELS[call.naam];
    if (!label) continue; // schrijf-tools zijn een voorstel, geen bron
    for (const raw of resultatenPerNaam.get(call.naam) ?? []) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          if (parsed.length > 0) delen.push(`${parsed.length} ${label}`);
        } else if (parsed && parsed.gevonden === false) {
          // expliciet niets gevonden — geen bronregel nodig
        } else if (parsed) {
          delen.push(`1 ${label}`);
        }
      } catch {
        // geen valide JSON — negeren
      }
    }
  }

  if (delen.length === 0) return null;
  return `gebaseerd op: ${Array.from(new Set(delen)).join(", ")}`;
}

export function actieTypeNaarLijstNaam(actieType: AgentActieType): string {
  switch (actieType) {
    case "tankboek_boeking":
      return "tankboek";
    case "observatie":
    case "uitval":
      return "observaties";
    case "kelderlog":
      return "kelderlog";
    case "analyse":
      return "analyses";
  }
}
