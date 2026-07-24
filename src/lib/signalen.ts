// Fase 10 — proactieve assistent, de signaallaag (ONTWERP-3-API.md §1-2).
// Eén gedeeld contract + één array van producenten, ipv losse, verspreide
// checks (die stonden voorheen dubbel in index.tsx en meldingen.tsx).
//
// Regel-signalen worden hier BEREKEND, niet opgeslagen: elke producent leest
// bestaande data en levert een verse Signaal[] op. Geen serverstaat, geen
// AI-aanroep, geen kosten. Zie ONTWERP-1-ARCHITECTUUR.md voor de motivatie.

import { isIngelogd } from "./data";
import { fetchMaterieel, fetchOnderhoud, onderhoudBinnenkort } from "./materieel-data";
import { fetchRegelgevingInstellingen } from "./regelgeving-data";
import { APP_INSTELLING_SLEUTELS, fetchAppInstellingen, vindWaarde } from "./app-instellingen-data";

export type SignaalErnst = "kritiek" | "waarschuwing" | "info";

export interface Signaal {
  // Stabiel id: `<bron>-<onderwerp-id>`. Bepaalt snooze/dismiss-identiteit -
  // MOET identiek blijven aan de bestaande meldingen.tsx-id's (migratie).
  id: string;
  bron: string;
  ernst: SignaalErnst;
  titel: string;
  detail?: string;
  link?: string;
  // De "waarom": een kant-en-klare string, opgebouwd uit dezelfde data die
  // het signaal detecteerde. Geen aparte call nodig om 'm te tonen.
  waarom: string;
  datum?: string; // yyyy-MM-dd, voor recentheid-sortering binnen dezelfde ernst
  taakVoorstel?: {
    actie_type: "kelderlog";
    samenvatting: string;
    payload: Record<string, unknown>;
  };
}

export type SignaalProducent = () => Promise<Signaal[]>;

// ============= Onderhoud binnen 30 dagen (verhuisd uit meldingen.tsx) =============
export async function onderhoudSignalen(): Promise<Signaal[]> {
  if (!isIngelogd()) return []; // auth-only bronnen, zie Fase 8-patroon
  const [onderhoud, materieel] = await Promise.all([fetchOnderhoud(), fetchMaterieel()]);
  const binnenkort = onderhoudBinnenkort(onderhoud);
  const materieelNaam = new Map(materieel.map((m) => [m.id, m.naam]));
  return binnenkort.map((r) => {
    const naam = materieelNaam.get(r.materieel) ?? "machine";
    return {
      id: `onderhoud-${r.materieel}-${r.volgende_keer}`,
      bron: "onderhoud",
      ernst: "info" as const,
      titel: `Onderhoud gepland: ${naam} vóór ${r.volgende_keer}.`,
      waarom: `${naam} heeft onderhoud gepland vóór ${r.volgende_keer} — dat valt binnen de 30-dagen-vooruitblik.`,
      link: "/materieel",
      datum: r.volgende_keer,
    };
  });
}

// ============= Backup-waarschuwing (verhuisd uit meldingen.tsx/index.tsx) =============
// De permanente statusregel op de hub (BackupWidget in index.tsx) blijft
// ongewijzigd bestaan naast dit signaal (besluit Thomas: "stilte is
// dubbelzinnig bij backups") - dit signaal toont ALLEEN de waarschuwing.
export async function backupWaarschuwingSignaal(): Promise<Signaal[]> {
  if (!isIngelogd()) return [];
  const [regelgeving, appInstellingen] = await Promise.all([
    fetchRegelgevingInstellingen(),
    fetchAppInstellingen(),
  ]);
  const record = regelgeving.find((r) => r.sleutel === "laatste_backup");
  if (!record?.laatst_gecontroleerd) return [];
  const laatst = new Date(record.laatst_gecontroleerd.replace(" ", "T"));
  if (isNaN(laatst.getTime())) return [];
  const dagen = Math.floor((Date.now() - laatst.getTime()) / 86400000);
  const drempel = vindWaarde(appInstellingen, APP_INSTELLING_SLEUTELS.backupWaarschuwingDagen, 2);
  if (dagen <= drempel) return [];
  return [
    {
      id: `backup-${record.laatst_gecontroleerd}`,
      bron: "backup",
      ernst: "waarschuwing",
      titel: `Laatste geslaagde backup is ${dagen} dagen oud — controleer de backuptaak.`,
      waarom: `De laatste geslaagde backup is ${dagen} dagen oud — dat is meer dan de ingestelde waarschuwingsdrempel van ${drempel} dagen (zie docs/backup.md).`,
    },
  ];
}

const PRODUCENTEN: SignaalProducent[] = [onderhoudSignalen, backupWaarschuwingSignaal];

// Verzamelt alle signalen; een falende producent blokkeert de rest nooit
// (Fase 3-eis: één kapotte bron mag nooit de hele Vandaag-widget breken).
export async function verzamelSignalen(): Promise<Signaal[]> {
  const resultaten = await Promise.all(
    PRODUCENTEN.map(async (p) => {
      try {
        return await p();
      } catch (e) {
        console.warn("signaalproducent faalde, overgeslagen", e);
        return [];
      }
    }),
  );
  return sorteerSignalen(resultaten.flat());
}

const ERNST_VOLGORDE: Record<SignaalErnst, number> = { kritiek: 0, waarschuwing: 1, info: 2 };

export function sorteerSignalen(signalen: Signaal[]): Signaal[] {
  return [...signalen].sort((a, b) => {
    const ernstVerschil = ERNST_VOLGORDE[a.ernst] - ERNST_VOLGORDE[b.ernst];
    if (ernstVerschil !== 0) return ernstVerschil;
    return (b.datum ?? "").localeCompare(a.datum ?? "");
  });
}
