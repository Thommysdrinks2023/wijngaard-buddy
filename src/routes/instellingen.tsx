import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPb, isPbConfigured, pingPb } from "@/lib/data";
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
} from "lucide-react";
import { toast } from "sonner";
import {
  DREMPEL_OPTIES,
  getMetingDrempel,
  getPerceelOppervlakte,
  getUurloon,
  setMetingDrempel,
  setPerceelOppervlakte,
  setUurloon,
} from "@/lib/app-instellingen";

// Volledig menu — alle pagina's van de app in logische volgorde
const MENU = [
  { to: "/perceelkaart", label: "Perceelkaart", omschrijving: "Bovenaanzicht van alle rijen", icon: Map },
  { to: "/dashboard", label: "Dashboard", omschrijving: "Overzicht van het seizoen", icon: BarChart3 },
  { to: "/seizoen", label: "Seizoen", omschrijving: "Fenologie, warmtesom en werkkalender", icon: Calendar },
  { to: "/steekproeven", label: "Steekproeven", omschrijving: "Vaste meetplanten per ras", icon: ClipboardList },
  { to: "/gezondheid", label: "Gezondheid", omschrijving: "Vigor, snoeigewicht en uitval", icon: HeartPulse },
  { to: "/oogst", label: "Oogst", omschrijving: "Opbrengst registreren en vergelijken", icon: Grape },
  { to: "/werkrapport", label: "Werkrapport", omschrijving: "Uren per taak bijhouden", icon: Clock },
  { to: "/grafieken", label: "Grafieken", omschrijving: "Vaste analyses per seizoen", icon: LineChart },
  { to: "/trends", label: "Trends", omschrijving: "Zelf grafieken samenstellen", icon: TrendingUp },
  { to: "/login", label: "Inloggen", omschrijving: "Account voor synchronisatie", icon: LogIn },
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
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
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

function downloadJsonBackup() {
  const data = dumpLocalStorage();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, `tappenmars-backup-${vandaagStr()}.json`);
  toast.success("Backup gedownload", { description: "JSON bestand is opgeslagen." });
}

function downloadCsvBackup() {
  const data = dumpLocalStorage();
  const blob = new Blob([toCsv(data)], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `tappenmars-backup-${vandaagStr()}.csv`);
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
    "rijen", "metingen", "observaties", "fenologie", "gezondheid",
    "oogst", "werkuren", "steekproef_planten", "steekproef_metingen",
    "werkkalender", "notities",
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
  triggerDownload(blob, `tappenmars-server-backup-${vandaagStr()}.json`);
  toast.success("Serverbackup gedownload", { description: "Alle collecties als JSON." });
}

export const Route = createFileRoute("/instellingen")({
  component: Instellingen,
  head: () => ({ meta: [{ title: "Instellingen — Wijngaard" }] }),
});

function Instellingen() {
  const [invoerder, setInvoerder] = useInvoerder();
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [drempel, setDrempel] = useState<number>(() => getMetingDrempel());
  const [oppervlakte, setOppervlakte] = useState<string>(() => String(getPerceelOppervlakte()));
  const [uurloon, setUurloonState] = useState<string>(() => String(getUurloon() || ""));

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

        {/* Volledig menu */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Menu
          </h2>
          <ul className="space-y-1.5">
            {MENU.map((item) => {
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
              Stel <code className="rounded bg-muted px-1.5 py-0.5 text-xs">VITE_POCKETBASE_URL</code> in om
              te verbinden met je PocketBase backend.
            </p>
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
            JSON/CSV exporteert de lokale gegevens van dit apparaat. Serverdata exporteert
            álle collecties uit PocketBase (vereist login). De laptop maakt daarnaast elke
            avond om 20:00 automatisch een volledige backup.
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
