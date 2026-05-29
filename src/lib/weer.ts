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

// Helperkleur op basis van temperatuur voor wijngaard-context
export function temperatuurKleur(temp: number): string {
  if (temp < 5) return "text-blue-500";
  if (temp < 15) return "text-sky-500";
  if (temp < 25) return "text-green-500";
  if (temp < 32) return "text-orange-500";
  return "text-red-500";
}
