// Growing Degree Days (GDD) — warmtesom voor de wijngaard.
// GDD per dag = max(0, (Tmax + Tmin) / 2 − 10°C), opgeteld over het
// groeiseizoen (1 april t/m 31 oktober). Historische temperaturen komen
// van Open-Meteo (gratis, geen API-key nodig); resultaat wordt per dag
// gecachet in localStorage zodat we de API niet onnodig belasten.

const BASIS_TEMPERATUUR = 10;
const LAT = import.meta.env.VITE_WEER_LAT as string | undefined;
const LON = import.meta.env.VITE_WEER_LON as string | undefined;

export interface GddPunt {
  datum: string; // yyyy-MM-dd
  gdd: number; // die dag
  cumulatief: number; // sinds 1 april
}

export function isGddBeschikbaar(): boolean {
  return Boolean(LAT && LON);
}

function seizoenStart(jaar: number): string {
  return `${jaar}-04-01`;
}
function seizoenEind(jaar: number): string {
  const vandaag = new Date().toISOString().slice(0, 10);
  const eind = `${jaar}-10-31`;
  return vandaag < eind ? vandaag : eind;
}

interface CacheVorm {
  bijgewerkt: string; // datum waarop de cache is gevuld
  punten: GddPunt[];
}

export async function fetchGdd(jaar: number): Promise<GddPunt[]> {
  if (!LAT || !LON) throw new Error("GPS-locatie ontbreekt (VITE_WEER_LAT/LON).");

  const start = seizoenStart(jaar);
  const eind = seizoenEind(jaar);
  if (eind < start) return []; // seizoen nog niet begonnen

  const cacheKey = `wg.gdd.${jaar}.v1`;
  const vandaag = new Date().toISOString().slice(0, 10);
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cache = JSON.parse(raw) as CacheVorm;
        // cache van vandaag is vers genoeg; oude seizoenen veranderen nooit meer
        const seizoenVoorbij = jaar < new Date().getFullYear();
        if (cache.bijgewerkt === vandaag || seizoenVoorbij) return cache.punten;
      }
    } catch {
      // cache negeren
    }
  }

  // Open-Meteo archive: gratis historische dagtemperaturen.
  // Data loopt 1-2 dagen achter op vandaag; dat is prima voor GDD.
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}` +
    `&start_date=${start}&end_date=${eind}` +
    `&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FBerlin`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo fout: ${res.status}`);
  const d = (await res.json()) as {
    daily?: {
      time: string[];
      temperature_2m_max: (number | null)[];
      temperature_2m_min: (number | null)[];
    };
  };
  if (!d.daily) return [];

  const punten: GddPunt[] = [];
  let cumulatief = 0;
  for (let i = 0; i < d.daily.time.length; i++) {
    const tmax = d.daily.temperature_2m_max[i];
    const tmin = d.daily.temperature_2m_min[i];
    if (tmax == null || tmin == null) continue; // recente dagen nog niet beschikbaar
    const gdd = Math.max(0, (tmax + tmin) / 2 - BASIS_TEMPERATUUR);
    cumulatief += gdd;
    punten.push({
      datum: d.daily.time[i],
      gdd: Math.round(gdd * 10) / 10,
      cumulatief: Math.round(cumulatief * 10) / 10,
    });
  }

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ bijgewerkt: vandaag, punten } satisfies CacheVorm),
      );
    } catch {
      // opslag vol — geen ramp
    }
  }
  return punten;
}

// Huidige (laatste bekende) cumulatieve GDD van een seizoen
export function huidigeGdd(punten: GddPunt[]): number {
  return punten.length > 0 ? punten[punten.length - 1].cumulatief : 0;
}

// GDD-waarde op (of vlak vóór) een bepaalde datum — voor fenologie-context
export function gddOpDatum(punten: GddPunt[], datum: string): number | null {
  let laatste: number | null = null;
  for (const p of punten) {
    if (p.datum > datum) break;
    laatste = p.cumulatief;
  }
  return laatste;
}
