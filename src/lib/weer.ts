// Weer-integratie voor Wijngaard Buddy
// Fase 1: OpenWeatherMap API
// Fase 2: eigen weerstation (vervang fetchWeer met een eigen endpoint)

export interface WeerData {
  temperatuur: number;       // °C
  gevoelstemperatuur: number;
  luchtvochtigheid: number;  // %
  neerslag1u: number;        // mm afgelopen uur (0 als geen)
  windsnelheid: number;      // m/s
  omschrijving: string;      // bijv. "lichte regen"
  icoon: string;             // OWM icon code, bijv. "10d"
  stad: string;
  tijdstip: Date;
  bron: "openweathermap" | "weerstation";
}

const OWM_KEY = import.meta.env.VITE_OWM_API_KEY as string | undefined;
const LAT = import.meta.env.VITE_WEER_LAT as string | undefined;
const LON = import.meta.env.VITE_WEER_LON as string | undefined;

export function isWeerGeconfigureerd(): boolean {
  return Boolean(OWM_KEY && LAT && LON);
}

export async function fetchWeer(): Promise<WeerData> {
  if (!OWM_KEY || !LAT || !LON) {
    throw new Error("Weerconfiguratie ontbreekt. Stel VITE_OWM_API_KEY, VITE_WEER_LAT en VITE_WEER_LON in.");
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&appid=${OWM_KEY}&units=metric&lang=nl`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenWeatherMap fout: ${res.status}`);

  const d = await res.json();
  return {
    temperatuur: Math.round(d.main.temp),
    gevoelstemperatuur: Math.round(d.main.feels_like),
    luchtvochtigheid: d.main.humidity,
    neerslag1u: d.rain?.["1h"] ?? 0,
    windsnelheid: Math.round(d.wind.speed * 10) / 10,
    omschrijving: d.weather?.[0]?.description ?? "",
    icoon: d.weather?.[0]?.icon ?? "01d",
    stad: d.name,
    tijdstip: new Date(),
    bron: "openweathermap",
  };
}

export function owmIconUrl(icoon: string): string {
  return `https://openweathermap.org/img/wn/${icoon}@2x.png`;
}

// ---------- 3-daagse verwachting ----------
export interface DagVerwachting {
  datum: string; // yyyy-MM-dd
  dagNaam: string; // bijv. "wo"
  tempMin: number;
  tempMax: number;
  neerslag: number; // totaal mm
  icoon: string;
}

interface ForecastItem {
  dt_txt: string;
  main: { temp_min: number; temp_max: number };
  rain?: { "3h"?: number };
  weather?: { icon?: string }[];
}

// Gebruikt het gratis 5-daagse/3-uurs forecast endpoint van OpenWeatherMap
// en vat het samen tot een dag-overzicht voor de komende 3 dagen.
export async function fetchVerwachting(): Promise<DagVerwachting[]> {
  if (!OWM_KEY || !LAT || !LON) {
    throw new Error("Weerconfiguratie ontbreekt.");
  }
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${LAT}&lon=${LON}&appid=${OWM_KEY}&units=metric&lang=nl`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenWeatherMap fout: ${res.status}`);
  const d = (await res.json()) as { list: ForecastItem[] };

  const vandaag = new Date().toISOString().slice(0, 10);
  const perDag = new Map<string, { min: number; max: number; regen: number; iconen: Map<string, string> }>();
  for (const item of d.list) {
    const datum = item.dt_txt.slice(0, 10);
    if (datum === vandaag) continue;
    const uur = item.dt_txt.slice(11, 13);
    const cur = perDag.get(datum) ?? {
      min: Infinity,
      max: -Infinity,
      regen: 0,
      iconen: new Map<string, string>(),
    };
    cur.min = Math.min(cur.min, item.main.temp_min);
    cur.max = Math.max(cur.max, item.main.temp_max);
    cur.regen += item.rain?.["3h"] ?? 0;
    const icoon = item.weather?.[0]?.icon;
    if (icoon) cur.iconen.set(uur, icoon);
    perDag.set(datum, cur);
  }

  const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  return Array.from(perDag.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(0, 3)
    .map(([datum, v]) => ({
      datum,
      dagNaam: DAGEN[new Date(datum).getDay()],
      tempMin: Math.round(v.min),
      tempMax: Math.round(v.max),
      neerslag: Math.round(v.regen * 10) / 10,
      // icoon rond het middaguur, anders de eerste beschikbare
      icoon: v.iconen.get("12") ?? v.iconen.values().next().value ?? "01d",
    }));
}

// Vorstrisico is kritiek voor een wijngaard (vooral rond knopbreek in het voorjaar)
export function isVorstRisico(temp: number): boolean {
  return temp <= 2;
}

// Helperkleur op basis van temperatuur voor wijngaard-context
export function temperatuurKleur(temp: number): string {
  if (temp < 5) return "text-blue-500";
  if (temp < 15) return "text-sky-500";
  if (temp < 25) return "text-green-500";
  if (temp < 32) return "text-orange-500";
  return "text-red-500";
}
