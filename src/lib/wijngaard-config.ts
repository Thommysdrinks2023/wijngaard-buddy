// Centrale wijngaard-configuratie — één bron voor alles wat per wijngaard
// verschilt (naam, plaats, locatie, oppervlakte). De Tappenmars is hier de
// EERSTE ingevulde configuratie; de app maakt nergens anders nog aannames
// over wélke wijngaard het is.
//
// Volgorde van waarheid: localStorage-override → .env → ingebouwde standaard.
// Zo blijft de app voor De Tappenmars exact werken als voorheen, ook offline,
// terwijl een andere wijngaard alleen deze configuratie hoeft te wijzigen.

import { ensureOnline, getPb } from "./data";
import { readLs, writeLs } from "./opslag";

export interface WijngaardConfig {
  naam: string; // bijv. "De Tappenmars"
  plaats: string; // bijv. "Den Ham"
  lat: number; // breedtegraad (weer, GDD, kaart-middelpunt)
  lon: number; // lengtegraad
  oppervlakteHa: number; // perceeloppervlakte in hectare
}

// De eerste configuratie: De Tappenmars. Geen andere aanname in de code.
export const STANDAARD_CONFIG: WijngaardConfig = {
  naam: "De Tappenmars",
  plaats: "Den Ham",
  lat: 52.47291998204718,
  lon: 6.484049217459633,
  oppervlakteHa: 1.5,
};

const LS_CONFIG = "wg.wijngaard_config.v1";
export const CONFIG_GEWIJZIGD_EVENT = "wg.wijngaard_config.changed";

// .env-waarden (build-time) — blijven de bron voor de weer-API-locatie
const ENV_LAT = import.meta.env.VITE_WEER_LAT as string | undefined;
const ENV_LON = import.meta.env.VITE_WEER_LON as string | undefined;

function envGetal(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function getWijngaardConfig(): WijngaardConfig {
  const opgeslagen = readLs<Partial<WijngaardConfig>>(LS_CONFIG, {});
  return {
    naam: opgeslagen.naam ?? STANDAARD_CONFIG.naam,
    plaats: opgeslagen.plaats ?? STANDAARD_CONFIG.plaats,
    // locatie: opgeslagen > .env > standaard (identiek aan vroeger gedrag)
    lat: opgeslagen.lat ?? envGetal(ENV_LAT) ?? STANDAARD_CONFIG.lat,
    lon: opgeslagen.lon ?? envGetal(ENV_LON) ?? STANDAARD_CONFIG.lon,
    oppervlakteHa:
      opgeslagen.oppervlakteHa != null && opgeslagen.oppervlakteHa > 0
        ? opgeslagen.oppervlakteHa
        : STANDAARD_CONFIG.oppervlakteHa,
  };
}

export function setWijngaardConfig(wijziging: Partial<WijngaardConfig>) {
  if (typeof window === "undefined") return;
  const huidig = readLs<Partial<WijngaardConfig>>(LS_CONFIG, {});
  const nieuw = { ...huidig, ...wijziging };
  writeLs(LS_CONFIG, nieuw);
  window.dispatchEvent(new CustomEvent(CONFIG_GEWIJZIGD_EVENT));
  // best-effort naar PocketBase (collectie vineyard_settings) wanneer ingelogd
  void bewaarConfigOpServer(getWijngaardConfig());
}

async function bewaarConfigOpServer(config: WijngaardConfig) {
  const pb = getPb();
  if (!pb || !pb.authStore.isValid || !(await ensureOnline())) return;
  try {
    const bestaand = await pb
      .collection("vineyard_settings")
      .getFirstListItem("")
      .catch(() => null);
    const payload = {
      naam: config.naam,
      plaats: config.plaats,
      lat: config.lat,
      lon: config.lon,
      oppervlakte_ha: config.oppervlakteHa,
    };
    if (bestaand) await pb.collection("vineyard_settings").update(bestaand.id, payload);
    else await pb.collection("vineyard_settings").create(payload);
  } catch {
    // serveropslag is een extraatje; lokaal is al bewaard
  }
}

// Haalt de configuratie van de server en cachet lokaal (indien aanwezig).
export async function laadConfigVanServer(): Promise<void> {
  const pb = getPb();
  if (!pb || !pb.authStore.isValid || !(await ensureOnline())) return;
  try {
    const r = await pb.collection("vineyard_settings").getFirstListItem("");
    const server: Partial<WijngaardConfig> = {
      naam: r["naam"],
      plaats: r["plaats"],
      lat: r["lat"],
      lon: r["lon"],
      oppervlakteHa: r["oppervlakte_ha"],
    };
    writeLs(LS_CONFIG, server);
    window.dispatchEvent(new CustomEvent(CONFIG_GEWIJZIGD_EVENT));
  } catch {
    // nog geen serverconfig — standaard/lokaal blijft gelden
  }
}
