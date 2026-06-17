import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPb, isIngelogd, isPbConfigured, pingPb } from "@/lib/data";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  Map,
  BarChart3,
  Calendar,
  ClipboardList,
  LineChart,
  HeartPulse,
  Grape,
  Clock,
  TrendingUp,
  LogIn,
  Database,
  FlaskConical,
  MapPinned,
  ScanLine,
  QrCode,
  FileText,
  Zap,
  Trash2,
  Search as SearchIcon,
  Sun,
  History,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  DREMPEL_OPTIES,
  getMetingDrempel,
  getPerceelOppervlakte,
  getUurloon,
  getWeergave,
  setMetingDrempel,
  setPerceelOppervlakte,
  setUurloon,
  setWeergave,
  type Weergave,
} from "@/lib/app-instellingen";
import { getWijngaardConfig, setWijngaardConfig } from "@/lib/wijngaard-config";
import { getSyncFouten, wisSyncFouten } from "@/lib/sync";
import { getAuditLog } from "@/lib/audit";

// Volledig menu, gegroepeerd: Veld (registreren), Analyse (bekijken), Beheer
const MENU_GROEPEN = [
  {
    kop: "🌿 In het veld",
    items: [
      {
        to: "/perceelkaart",
        label: "Perceelkaart",
        omschrijving: "Bovenaanzicht van alle rijen",
        icon: Map,
      },
      { to: "/snel", label: "Snelle meting", omschrijving: "Brix invoeren in 3 tikken", icon: Zap },
      {
        to: "/scan",
        label: "QR scannen",
        omschrijving: "Scan een rijcode bij de paal",
        icon: ScanLine,
      },
      {
        to: "/steekproeven",
        label: "Steekproeven",
        omschrijving: "Vaste meetplanten per ras",
        icon: ClipboardList,
      },
      {
        to: "/gezondheid",
        label: "Gezondheid",
        omschrijving: "Vigor, snoeigewicht en uitval",
        icon: HeartPulse,
      },
      { to: "/oogst", label: "Oogst", omschrijving: "Opbrengst registreren", icon: Grape },
      {
        to: "/werkrapport",
        label: "Werkrapport",
        omschrijving: "Uren en spuitregistratie",
        icon: Clock,
      },
      { to: "/lab", label: "Lab", omschrijving: "Bodem- en sapanalyses", icon: FlaskConical },
    ],
  },
  {
    kop: "📊 Analyse",
    items: [
      {
        to: "/assistent",
        label: "AI-assistent",
        omschrijving: "Vraag advies met je actuele data",
        icon: Sparkles,
      },
      {
        to: "/dashboard",
        label: "Dashboard",
        omschrijving: "Overzicht van het seizoen",
        icon: BarChart3,
      },
      {
        to: "/seizoen",
        label: "Seizoen",
        omschrijving: "Fenologie, warmtesom, werkkalender",
        icon: Calendar,
      },
      {
        to: "/grafieken",
        label: "Grafieken",
        omschrijving: "Vaste analyses per seizoen",
        icon: LineChart,
      },
      {
        to: "/trends",
        label: "Trends",
        omschrijving: "Zelf grafieken samenstellen",
        icon: TrendingUp,
      },
      {
        to: "/zoeken",
        label: "Zoeken",
        omschrijving: "Vind elke registratie terug",
        icon: SearchIcon,
      },
      {
        to: "/rapport",
        label: "Seizoensrapport",
        omschrijving: "Afdrukken of opslaan als PDF",
        icon: FileText,
      },
    ],
  },
  {
    kop: "⚙️ Beheer",
    items: [
      { to: "/kaart", label: "GPS-kaart", omschrijving: "Rijlocaties vastleggen", icon: MapPinned },
      {
        to: "/qr",
        label: "QR-codes printen",
        omschrijving: "A4-vel voor de rijpalen",
        icon: QrCode,
      },
      {
        to: "/prullenbak",
        label: "Prullenbak",
        omschrijving: "Verwijderde records terugzetten",
        icon: Trash2,
      },
      { to: "/login", label: "Inloggen", omschrijving: "Account voor synchronisatie", icon: LogIn },
    ],
  },
] as const;

function vandaagStr() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dumpLocalStorage(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const raw = localStorage.getItem(k) ?? "";
    try {
      out[k] = JSON.parse(raw);
    } catch {
      out[k] = raw;
    }
  }
  return out;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [collection, value] of Object.entries(data)) {
    lines.push(`# ${collection}`);
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === "object" &&
      value[0] !== null
    ) {
      const cols = Array.from(
        value.reduce<Set<string>>((s, row) => {
          Object.keys(row as object).forEach((k) => s.add(k));
          return s;
        }, new Set()),
      );
      lines.push(cols.join(","));
      for (const row of value as Record<string, unknown>[]) {
        lines.push(cols.map((c) => csvEscape(row[c])).join(","));
      }
    } else {
      lines.push("key,value");
      lines.push(`${csvEscape(collection)},${csvEscape(value)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// bestandsnaam-slug op basis van de wijngaardnaam (bijv. "de-tappenmars")
function wijngaardSlug(): string {
  return (
    getWijngaardConfig()
      .naam.toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "wijngaard"
  );
}

function downloadJsonBackup() {
  const data = dumpLocalStorage();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, `${wijngaardSlug()}-backup-${vandaagStr()}.json`);
  toast.success("Backup gedownload", { description: "JSON bestand is opgeslagen." });
}

function downloadCsvBackup() {
  const data = dumpLocalStorage();
  const blob = new Blob([toCsv(data)], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `${wijngaardSlug()}-backup-${vandaagStr()}.csv`);
  toast.success("CSV gedownload", { description: "Te openen in Excel." });
}

// Volledige backup van alle PocketBase-collecties (vereist login)
async function downloadServerBackup() {
  const pb = getPb();
  if (!pb || !(await pingPb())) {
    toast.error("Server niet bereikbaar", { description: "Probeer het later opnieuw." });
    return;
  }
  if (!pb.authStore.isValid) {
    toast.error("Log eerst in", { description: "Serverdata downloaden vereist een account." });
    return;
  }
  const collecties = [
    "rijen",
    "metingen",
    "observaties",
    "fenologie",
    "gezondheid",
    "oogst",
    "werkuren",
    "steekproef_planten",
    "steekproef_metingen",
    "werkkalender",
    "notities",
  ];
  const data: Record<string, unknown> = { geexporteerd: new Date().toISOString() };
  for (const c of collecties) {
    try {
      data[c] = await pb.collection(c).getFullList();
    } catch {
      data[c] = "kon niet worden opgehaald";
    }
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, `${wijngaardSlug()}-server-backup-${vandaagStr()}.json`);
  toast.success("Serverbackup gedownload", { description: "Alle collecties als JSON." });
}

export const Route = createFileRoute("/instellingen")({
  component: Instellingen,
  head: () => ({ meta: [{ title: "Instellingen — Wijngaard" }] }),
});

function Instellingen() {
  const navigate = useNavigate();
  const [invoerder, setInvoerder] = useInvoerder();
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [drempel, setDrempel] = useState<number>(() => getMetingDrempel());
  const [oppervlakte, setOppervlakte] = useState<string>(() => String(getPerceelOppervlakte()));
  const [wijngaard, setWijngaardState] = useState(() => getWijngaardConfig());
  const wijzigWijngaard = (deel: Partial<ReturnType<typeof getWijngaardConfig>>) => {
    setWijngaardState((w) => ({ ...w, ...deel }));
    setWijngaardConfig(deel);
  };
  const [uurloon, setUurloonState] = useState<string>(() => String(getUurloon() || ""));
  const [weergave, setWeergaveState] = useState<Weergave>(() => getWeergave());
  const [syncFouten, setSyncFouten] = useState(() => getSyncFouten());
  const [toonAudit, setToonAudit] = useState(false);

  const wijzigWeergave = (deel: Partial<Weergave>) => {
    const nieuw = { ...weergave, ...deel };
    setWeergaveState(nieuw);
    setWeergave(nieuw);
  };

  useEffect(() => {
    if (!isPbConfigured()) {
      setStatus("offline");
      return;
    }
    pingPb().then((ok) => setStatus(ok ? "online" : "offline"));
  }, []);

  return (
    <>
      <AppHeader title="Instellingen" />
      <div className="mx-auto max-w-screen-md space-y-6 px-3 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meer</h1>
          <p className="text-sm text-muted-foreground">Alle onderdelen en instellingen</p>
        </div>

        {/* Volledig menu, gegroepeerd */}
        {MENU_GROEPEN.map((groep) => (
          <section key={groep.kop} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {groep.kop}
            </h2>
            <ul className="space-y-1.5">
              {groep.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition active:scale-[0.99]"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: "#27232a" }}
                      >
                        <Icon className="h-5 w-5" style={{ color: "#cac176" }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.omschrijving}
                        </span>
                      </span>
                      <span className="text-muted-foreground">→</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Jouw naam
          </h2>
          <input
            value={invoerder}
            onChange={(e) => setInvoerder(e.target.value)}
            placeholder="Bijv. Anna"
            className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
          />
          <p className="text-xs text-muted-foreground">
            Wordt automatisch ingevuld bij metingen en observaties.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Herinneringen
          </h2>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              Waarschuw bij rijen zonder meting/observatie na…
            </span>
            <div className="grid grid-cols-4 gap-2">
              {DREMPEL_OPTIES.map((d) => {
                const active = drempel === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDrempel(d);
                      setMetingDrempel(d);
                    }}
                    className={`h-11 rounded-xl border text-sm font-semibold transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-card text-foreground"
                    }`}
                  >
                    {d} dagen
                  </button>
                );
              })}
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Of kies eigen aantal dagen</span>
            <input
              type="number"
              min={1}
              max={365}
              value={drempel}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                const v = Math.max(1, Math.min(365, Math.round(n)));
                setDrempel(v);
                setMetingDrempel(v);
              }}
              className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Wordt op het dashboard getoond als oranje banner. Rijen zonder enige meting blijven
            verborgen tot de drempel bereikt is.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Wijngaard
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Naam</span>
              <input
                type="text"
                value={wijngaard.naam}
                onChange={(e) => wijzigWijngaard({ naam: e.target.value })}
                className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Plaats</span>
              <input
                type="text"
                value={wijngaard.plaats}
                onChange={(e) => wijzigWijngaard({ plaats: e.target.value })}
                className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Breedtegraad (lat)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.0001"
                value={wijngaard.lat}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) wijzigWijngaard({ lat: n });
                }}
                className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Lengtegraad (lon)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.0001"
                value={wijngaard.lon}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) wijzigWijngaard({ lon: n });
                }}
                className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Naam verschijnt in de app en rapporten. De locatie bepaalt weer, warmtesom (GDD) en het
            kaartmiddelpunt.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Perceel
          </h2>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Oppervlakte (hectare)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0.01}
              value={oppervlakte}
              onChange={(e) => {
                setOppervlakte(e.target.value);
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0) setPerceelOppervlakte(n);
              }}
              className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Gebruikt voor uren per hectare in het werkrapport.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Uurloon (€, optioneel)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min={0}
              value={uurloon}
              onChange={(e) => {
                setUurloonState(e.target.value);
                const n = Number(e.target.value);
                setUurloon(Number.isFinite(n) && n >= 0 ? n : 0);
              }}
              placeholder="Leeg = geen kostenberekening"
              className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Met een uurloon toont het werkrapport ook de kosten per taak en per seizoen.
          </p>
        </section>

        {/* Weergave: zonlicht-modus voor in het veld */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Sun className="h-4 w-4" /> Weergave
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => wijzigWeergave({ hoogContrast: !weergave.hoogContrast })}
              className={`h-14 rounded-xl border-2 text-sm font-semibold ${
                weergave.hoogContrast
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card"
              }`}
            >
              ☀️ Zonlicht-modus
              <span className="block text-[11px] font-normal opacity-70">
                {weergave.hoogContrast ? "aan" : "uit"} · zwart/geel
              </span>
            </button>
            <button
              type="button"
              onClick={() => wijzigWeergave({ groteTekst: !weergave.groteTekst })}
              className={`h-14 rounded-xl border-2 text-sm font-semibold ${
                weergave.groteTekst
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card"
              }`}
            >
              🔍 Grotere tekst
              <span className="block text-[11px] font-normal opacity-70">
                {weergave.groteTekst ? "aan" : "uit"} · +15%
              </span>
            </button>
          </div>
        </section>

        {/* Sync-problemen: records die de server blijvend weigerde */}
        {syncFouten.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-destructive">
              ⚠ Sync-problemen ({syncFouten.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Deze records weigerde de server (bijv. door een validatiefout). Ze staan nog wél op
              dit apparaat, maar syncen niet. Voer ze zo nodig opnieuw in.
            </p>
            <ul className="space-y-1.5">
              {syncFouten.map((f, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs"
                >
                  <p className="font-semibold">
                    {f.soort} ({f.actie}) · fout {f.status} ·{" "}
                    {new Date(f.tijd).toLocaleString("nl-NL")}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">{f.bericht}</p>
                  <p className="mt-0.5 break-all text-muted-foreground/70">{f.samenvatting}</p>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                wisSyncFouten();
                setSyncFouten([]);
              }}
              className="h-11 w-full rounded-xl border border-border bg-card text-sm font-medium"
            >
              Lijst wissen
            </button>
          </section>
        )}

        {/* Audit-log: wie deed wat */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="h-4 w-4" /> Logboek
          </h2>
          <button
            type="button"
            onClick={() => setToonAudit((v) => !v)}
            className="h-12 w-full rounded-xl border border-border bg-card text-sm font-medium"
          >
            {toonAudit ? "Logboek verbergen" : "Logboek bekijken (wie deed wat)"}
          </button>
          {toonAudit && (
            <ul className="max-h-80 space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-2">
              {getAuditLog().length === 0 ? (
                <li className="p-2 text-sm text-muted-foreground">
                  Nog geen acties geregistreerd.
                </li>
              ) : (
                getAuditLog()
                  .slice(0, 50)
                  .map((r, i) => (
                    <li key={i} className="rounded-lg bg-muted/40 px-2 py-1.5 text-xs">
                      <span className="font-semibold">{r.gebruiker}</span> heeft{" "}
                      <span className="font-semibold">{r.collectie}</span> {r.actie} ·{" "}
                      {new Date(r.tijd).toLocaleString("nl-NL")}
                      <span className="block truncate text-muted-foreground">{r.samenvatting}</span>
                    </li>
                  ))
              )}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Backend
          </h2>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            {status === "checking" ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : status === "online" ? (
              <CheckCircle2 className="h-6 w-6 text-success" />
            ) : (
              <XCircle className="h-6 w-6 text-muted-foreground" />
            )}
            <div className="flex-1">
              <p className="font-medium">
                {status === "online"
                  ? "PocketBase verbonden"
                  : status === "offline" && isPbConfigured()
                    ? "PocketBase niet bereikbaar"
                    : "Lokale modus"}
              </p>
              <p className="text-xs text-muted-foreground">
                {status === "online"
                  ? "Data wordt op de server opgeslagen."
                  : "Data wordt lokaal in deze browser opgeslagen."}
              </p>
            </div>
          </div>
          {!isPbConfigured() && (
            <p className="text-xs text-muted-foreground">
              Stel{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">VITE_POCKETBASE_URL</code> in
              om te verbinden met je PocketBase backend.
            </p>
          )}
          {isIngelogd() && (
            <button
              type="button"
              onClick={() => {
                getPb()?.authStore.clear();
                localStorage.removeItem("wg.offline.keuze.v1");
                toast.success("Uitgelogd");
                navigate({ to: "/login" });
              }}
              className="h-12 w-full rounded-xl border border-border bg-card text-sm font-semibold text-destructive"
            >
              Uitloggen
            </button>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Backup
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={downloadJsonBackup}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#cac176] bg-[#27232a] px-4 text-sm font-semibold text-[#cac176] transition hover:bg-[#0a0b09]"
            >
              <Download className="h-4 w-4" />
              Download backup
            </button>
            <button
              type="button"
              onClick={downloadCsvBackup}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#cac176] bg-[#27232a] px-4 text-sm font-semibold text-[#cac176] transition hover:bg-[#0a0b09]"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => void downloadServerBackup()}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#cac176] bg-[#27232a] px-4 text-sm font-semibold text-[#cac176] transition hover:bg-[#0a0b09] sm:col-span-2"
            >
              <Database className="h-4 w-4" />
              Download serverdata (alle collecties)
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            JSON/CSV exporteert de lokale gegevens van dit apparaat. Serverdata exporteert álle
            collecties uit PocketBase (vereist login). De laptop maakt daarnaast elke avond om 20:00
            automatisch een volledige backup.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Over
          </h2>
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Wijngaard veld-app</p>
            <p>68 rijen vooraf geladen · mobiel-eerst · NL</p>
          </div>
        </section>
      </div>
    </>
  );
}
