// Opslag van AI-gesprekken. localStorage is de bron voor de UI (werkt altijd);
// als er verbinding + login is, wordt het gesprek ook naar PocketBase
// (collectie ai_gesprekken) geschreven zodat het op andere apparaten terugkomt.

import { ensureOnline, getPb } from "./data";
import { readLs, uid, writeLs } from "./opslag";
import type { ChatBericht } from "./assistent";

const LS_KEY = "wg.ai_gesprekken.v1";

export interface Gesprek {
  id: string;
  titel: string;
  berichten: ChatBericht[];
  bijgewerkt: string; // ISO
  remoteId?: string; // PocketBase-id, indien gesynchroniseerd
}

export function getGesprekken(): Gesprek[] {
  return readLs<Gesprek[]>(LS_KEY, []).sort((a, b) => (a.bijgewerkt < b.bijgewerkt ? 1 : -1));
}

export function getGesprek(id: string): Gesprek | null {
  return readLs<Gesprek[]>(LS_KEY, []).find((g) => g.id === id) ?? null;
}

export function nieuwGesprek(): Gesprek {
  return { id: uid(), titel: "Nieuw gesprek", berichten: [], bijgewerkt: new Date().toISOString() };
}

// Bewaart lokaal en (best effort) op de server. Geeft het bijgewerkte gesprek terug.
export async function bewaarGesprek(gesprek: Gesprek): Promise<Gesprek> {
  // titel afleiden uit de eerste vraag
  const titel =
    gesprek.berichten.find((b) => b.rol === "user")?.tekst.slice(0, 60) || "Nieuw gesprek";
  const bijgewerkt: Gesprek = { ...gesprek, titel, bijgewerkt: new Date().toISOString() };

  const alle = readLs<Gesprek[]>(LS_KEY, []);
  const idx = alle.findIndex((g) => g.id === bijgewerkt.id);
  if (idx >= 0) alle[idx] = bijgewerkt;
  else alle.push(bijgewerkt);
  writeLs(LS_KEY, alle);

  // best-effort naar PocketBase
  const pb = getPb();
  if (pb && pb.authStore.isValid && (await ensureOnline())) {
    try {
      const payload = {
        client_id: bijgewerkt.id,
        titel: bijgewerkt.titel,
        berichten: JSON.stringify(bijgewerkt.berichten),
        ingevoerd_door: pb.authStore.record?.id ?? "",
      };
      if (bijgewerkt.remoteId) {
        await pb.collection("ai_gesprekken").update(bijgewerkt.remoteId, payload);
      } else {
        const r = await pb.collection("ai_gesprekken").create(payload);
        bijgewerkt.remoteId = r.id;
        // remoteId terugschrijven naar localStorage
        const opnieuw = readLs<Gesprek[]>(LS_KEY, []);
        const i = opnieuw.findIndex((g) => g.id === bijgewerkt.id);
        if (i >= 0) {
          opnieuw[i] = bijgewerkt;
          writeLs(LS_KEY, opnieuw);
        }
      }
    } catch {
      // server-opslag is een extraatje; lokaal is al bewaard
    }
  }
  return bijgewerkt;
}

export function verwijderGesprek(id: string) {
  const alle = readLs<Gesprek[]>(LS_KEY, []);
  const gesprek = alle.find((g) => g.id === id);
  writeLs(
    LS_KEY,
    alle.filter((g) => g.id !== id),
  );
  // ook op de server verwijderen indien mogelijk
  const pb = getPb();
  if (gesprek?.remoteId && pb && pb.authStore.isValid) {
    pb.collection("ai_gesprekken")
      .delete(gesprek.remoteId)
      .catch(() => {});
  }
}
