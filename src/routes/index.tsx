import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { APP_NAAM } from "@/config/app";
import { useEffect } from "react";
import { AppHeader } from "@/components/app-header";
import { fetchRijen, isIngelogd } from "@/lib/data";
import { fetchTanks, fetchVoorraadFlessen } from "@/lib/kelder-data";
import { fetchPasteurisatieRuns } from "@/lib/pasteurisatie-data";
import {
  getAutoStartModule,
  getLaatsteModule,
  MODULE_ROUTES,
  setLaatsteModule,
} from "@/lib/module-keuze";
import { fetchRegelgevingInstellingen } from "@/lib/regelgeving-data";
import {
  APP_INSTELLING_SLEUTELS,
  fetchAppInstellingen,
  vindWaarde,
} from "@/lib/app-instellingen-data";
import { VandaagWidget } from "@/components/vandaag-widget";

// Fase 7 Blok A: backup-bewaking. Het backupscript schrijft na elke geslaagde
// run de sleutel "laatste_backup" bij. Deze permanente statusregel blijft
// bewust naast het signaal in de Vandaag-widget bestaan (Fase 10 besluit
// Thomas: "stilte is dubbelzinnig bij backups" — hij wil ook zien dat de
// controle zelf nog werkt, niet alleen een melding bij een probleem).
function BackupWidget() {
  const q = useQuery({
    queryKey: ["regelgeving", "hub-backup"],
    queryFn: fetchRegelgevingInstellingen,
    enabled: isIngelogd(), // hub is publiek; zonder sessie geen (falende) fetch
  });
  const instellingenQ = useQuery({
    queryKey: ["app-instellingen", "hub-backup"],
    queryFn: fetchAppInstellingen,
    enabled: isIngelogd(),
  });
  const record = (q.data ?? []).find((r) => r.sleutel === "laatste_backup");
  if (!record?.laatst_gecontroleerd) return null;
  const laatst = new Date(record.laatst_gecontroleerd.replace(" ", "T"));
  if (isNaN(laatst.getTime())) return null;
  const dagen = Math.floor((Date.now() - laatst.getTime()) / (24 * 60 * 60 * 1000));
  const drempel = vindWaarde(
    instellingenQ.data ?? [],
    APP_INSTELLING_SLEUTELS.backupWaarschuwingDagen,
    2,
  );
  const teOud = dagen > drempel;
  return (
    <div
      className={`mt-3 rounded-xl border px-4 py-2.5 text-sm ${
        teOud
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-card text-muted-foreground"
      }`}
    >
      {teOud ? "⚠️ " : "✓ "}
      Laatste geslaagde backup:{" "}
      {dagen === 0 ? "vandaag" : dagen === 1 ? "gisteren" : `${dagen} dagen geleden`}
      {teOud && " — controleer de backuptaak (zie docs/backup.md)"}
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: ModuleHub,
  head: () => ({ meta: [{ title: APP_NAAM }] }),
});

const TEGELS = [
  {
    key: "wijngaard",
    to: "/wijngaard",
    emoji: "🌿",
    label: "Wijngaard",
    omschrijving: "Rijen, metingen en veldwerk",
  },
  {
    key: "kelder",
    to: "/kelder",
    emoji: "🍷",
    label: "Kelder",
    omschrijving: "Tanks, partijen en tankboek",
  },
  {
    key: "assistent",
    to: "/assistent",
    emoji: "✨",
    label: "Assistent",
    omschrijving: "AI-hulp met je actuele data",
  },
  {
    key: "voorraad",
    to: "/voorraad",
    emoji: "🍾",
    label: "Voorraad",
    omschrijving: "Van fles tot verkoop",
  },
  {
    key: "pasteurisatie",
    to: "/pasteurisatie",
    emoji: "🌡️",
    label: "Pasteurisatie",
    omschrijving: "PU-opbouw en drukveiligheid",
  },
] as const;

function ModuleHub() {
  const navigate = useNavigate();

  // Blok I.5 (ARCHITECTURE.md §2.3): live kerncijfer per tegel. De queries
  // geven zonder login/verbinding gewoon [] terug — dan valt de tegel stil
  // terug op zijn vaste omschrijving, nooit een misleidende "0".
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks, enabled: isIngelogd() });
  const voorraadQ = useQuery({
    queryKey: ["voorraad", "hub"],
    queryFn: () => fetchVoorraadFlessen(),
    enabled: isIngelogd(),
  });
  const pasteurisatieRunsQ = useQuery({
    queryKey: ["pasteurisatie-runs", "hub"],
    queryFn: () => fetchPasteurisatieRuns(),
    enabled: isIngelogd(),
  });

  const tanksInGebruik = (tanksQ.data ?? []).filter((t) => t.huidig_volume_l > 0);
  const volumeInKelder = Math.round(tanksInGebruik.reduce((acc, t) => acc + t.huidig_volume_l, 0));
  const flessenOpVoorraad = (voorraadQ.data ?? []).reduce((acc, v) => acc + v.aantal_huidig, 0);
  // Fase 17 Blok F — een lopende run mag nooit onopgemerkt blijven: die
  // moet vanaf de hub zichtbaar zijn, niet alleen in de pasteurisatiesectie.
  const actieveRuns = (pasteurisatieRunsQ.data ?? []).filter((r) => r.status === "actief");
  const laatstAfgerond = (pasteurisatieRunsQ.data ?? [])
    .filter((r) => r.status === "afgerond")
    .sort((a, b) => (b.eindtijd ?? "").localeCompare(a.eindtijd ?? ""))[0];

  const liveStat: Partial<Record<(typeof TEGELS)[number]["key"], string>> = {};
  if ((rijenQ.data ?? []).length > 0) liveStat.wijngaard = `${rijenQ.data!.length} rijen`;
  if (tanksInGebruik.length > 0)
    liveStat.kelder = `${tanksInGebruik.length} tank${tanksInGebruik.length === 1 ? "" : "s"} in gebruik · ${volumeInKelder} L`;
  if (flessenOpVoorraad > 0) liveStat.voorraad = `${flessenOpVoorraad} flessen op voorraad`;
  if (actieveRuns.length > 0) {
    liveStat.pasteurisatie = `🔴 ${actieveRuns.length} actieve run${actieveRuns.length === 1 ? "" : "s"}`;
  } else if (laatstAfgerond) {
    liveStat.pasteurisatie = `laatste: ${laatstAfgerond.totale_pu?.toFixed(0) ?? "?"} PU (${laatstAfgerond.veiligheidsoordeel ?? "?"})`;
  }

  // Client-only: localStorage bestaat niet tijdens SSR, dus deze check kan
  // niet in beforeLoad (die draait ook server-side bij een verse paginalaad).
  useEffect(() => {
    if (!getAutoStartModule()) return;
    const laatste = getLaatsteModule();
    if (laatste) navigate({ to: MODULE_ROUTES[laatste], replace: true });
  }, [navigate]);

  return (
    <>
      <AppHeader title={APP_NAAM} subtitle="Kies een module" />
      <div className="mx-auto max-w-screen-md px-3 py-4">
        <div className="grid grid-cols-2 gap-3">
          {TEGELS.map((tegel) => (
            <Link
              key={tegel.key}
              to={tegel.to}
              onClick={() => setLaatsteModule(tegel.key)}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition active:scale-[0.98] ${
                tegel.key === "pasteurisatie" && actieveRuns.length > 0
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-border bg-card"
              }`}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-3xl">
                {tegel.emoji}
              </span>
              <span className="text-base font-semibold">{tegel.label}</span>
              <span className="text-xs text-muted-foreground">
                {liveStat[tegel.key] ?? tegel.omschrijving}
              </span>
            </Link>
          ))}
        </div>
        <VandaagWidget />
        <BackupWidget />
      </div>
    </>
  );
}
