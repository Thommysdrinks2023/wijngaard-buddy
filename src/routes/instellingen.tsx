import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isPbConfigured, pingPb } from "@/lib/data";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { CheckCircle2, XCircle, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { DREMPEL_OPTIES, getMetingDrempel, setMetingDrempel } from "@/lib/app-instellingen";

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

export const Route = createFileRoute("/instellingen")({
  component: Instellingen,
  head: () => ({ meta: [{ title: "Instellingen — Wijngaard" }] }),
});

function Instellingen() {
  const [invoerder, setInvoerder] = useInvoerder();
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [drempel, setDrempel] = useState<DrempelDagen>(() => getMetingDrempel());

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
          <h1 className="text-2xl font-bold tracking-tight">Instellingen</h1>
        </div>

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
          <p className="text-xs text-muted-foreground">
            Wordt op het dashboard getoond als oranje banner.
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
          </div>
          <p className="text-xs text-muted-foreground">
            JSON voor volledige backup, CSV voor gebruik in Excel.
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
