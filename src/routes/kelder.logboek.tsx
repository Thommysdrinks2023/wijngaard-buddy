import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { fetchKelderlog, fetchTanks } from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { exporteerCsv } from "@/lib/csv-export";
import { KELDERLOG_ACTIES, KELDERLOG_EENHEDEN } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";
import { NotebookPen, Printer, Sheet } from "lucide-react";

// Blok F — los, filterbaar overzicht van het kelderlogboek (ARCHITECTURE.md
// §2.2 noemde deze route al, nooit gebouwd: kelderlog was tot nu toe alleen
// per partij zichtbaar op /kelder/partijen/$partijId). Zelfde structuur als
// /kelder/tankboek: filters, printbaar register, CSV-export.
export const Route = createFileRoute("/kelder/logboek")({
  component: KelderlogPage,
  head: () => ({
    meta: [
      { title: "Logboek — Kelder" },
      { name: "description", content: "Overzicht van alle kelderwerkzaamheden." },
    ],
  }),
});

function KelderlogPage() {
  const [partijFilter, setPartijFilter] = useState("");
  const [tankFilter, setTankFilter] = useState("");
  const [actieFilter, setActieFilter] = useState("");
  const [vanaf, setVanaf] = useState("");
  const [tot, setTot] = useState("");

  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const logQ = useQuery({
    queryKey: ["kelderlog", "overzicht", { partijFilter, tankFilter, actieFilter, vanaf, tot }],
    queryFn: () =>
      fetchKelderlog({
        partij: partijFilter || undefined,
        tank: tankFilter || undefined,
        actie: actieFilter || undefined,
        vanaf: vanaf || undefined,
        tot: tot || undefined,
      }),
  });

  const partijNaam = useMemo(() => {
    const m = new Map<string, string>();
    partijenQ.data?.forEach((p) => m.set(p.id, p.naam));
    return m;
  }, [partijenQ.data]);
  const tankCode = useMemo(() => {
    const m = new Map<string, string>();
    tanksQ.data?.forEach((t) => m.set(t.id, t.code));
    return m;
  }, [tanksQ.data]);

  const veldClass = "h-10 w-full rounded-xl border border-input bg-card px-2.5 text-sm";

  return (
    <>
      <AppHeader back title="Logboek" subtitle="Kelderwerkzaamheden" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4 print:max-w-none">
        <OfflineWaarschuwing wat="het kelderlog" />
        <div className="flex items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Logboek</h1>
            <p className="text-sm text-muted-foreground">
              Alle gisting, roer-, filter- en toevoegingsacties per partij/tank.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() =>
                exporteerCsv(
                  `kelderlogboek_${format(new Date(), "yyyy-MM-dd")}`,
                  [
                    "Datum",
                    "Actie",
                    "Partij",
                    "Tank",
                    "Middel",
                    "Hoeveelheid",
                    "Eenheid",
                    "Notitie",
                    "Ingevoerd door",
                  ],
                  (logQ.data ?? []).map((r) => [
                    r.datum,
                    KELDERLOG_ACTIES.find((a) => a.value === r.actie)?.label ?? r.actie,
                    r.partij ? (partijNaam.get(r.partij) ?? "") : "",
                    r.tank ? (tankCode.get(r.tank) ?? "") : "",
                    r.middel ?? "",
                    r.hoeveelheid ?? "",
                    r.eenheid
                      ? (KELDERLOG_EENHEDEN.find((e) => e.value === r.eenheid)?.label ?? "")
                      : "",
                    r.notitie ?? "",
                    r.ingevoerd_door ?? "",
                  ]),
                )
              }
              className="flex h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium"
            >
              <Sheet className="h-4 w-4" /> Excel
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
          </div>
        </div>

        {/* Filters */}
        <section className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3 sm:grid-cols-3 print:hidden">
          <select
            value={partijFilter}
            onChange={(e) => setPartijFilter(e.target.value)}
            className={veldClass}
          >
            <option value="">Alle partijen</option>
            {(partijenQ.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.naam} · {p.jaargang}
              </option>
            ))}
          </select>
          <select
            value={tankFilter}
            onChange={(e) => setTankFilter(e.target.value)}
            className={veldClass}
          >
            <option value="">Alle tanks</option>
            {(tanksQ.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                Tank {t.code}
              </option>
            ))}
          </select>
          <select
            value={actieFilter}
            onChange={(e) => setActieFilter(e.target.value)}
            className={veldClass}
          >
            <option value="">Alle acties</option>
            {KELDERLOG_ACTIES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.emoji} {a.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={vanaf}
            onChange={(e) => setVanaf(e.target.value)}
            className={veldClass}
            title="Vanaf datum"
          />
          <input
            type="date"
            value={tot}
            onChange={(e) => setTot(e.target.value)}
            className={veldClass}
            title="Tot en met datum"
          />
          <button
            type="button"
            onClick={() => {
              setPartijFilter("");
              setTankFilter("");
              setActieFilter("");
              setVanaf("");
              setTot("");
            }}
            className="h-10 rounded-xl border border-border bg-background text-sm font-medium"
          >
            Wis filters
          </button>
        </section>

        {logQ.isError && <ErrorState error={logQ.error} onRetry={() => logQ.refetch()} />}

        {/* Register */}
        {(logQ.data ?? []).length === 0 ? (
          <EmptyState
            message="Geen logregels gevonden voor deze selectie."
            icon={<NotebookPen className="h-6 w-6" />}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-2 py-2">Actie</th>
                  <th className="px-2 py-2">Partij</th>
                  <th className="px-2 py-2">Tank</th>
                  <th className="px-2 py-2">Middel</th>
                  <th className="px-2 py-2 text-right">Hoeveelheid</th>
                  <th className="px-2 py-2">Door</th>
                </tr>
              </thead>
              <tbody>
                {(logQ.data ?? []).map((r) => {
                  const actie = KELDERLOG_ACTIES.find((a) => a.value === r.actie);
                  const eenheid = KELDERLOG_EENHEDEN.find((e) => e.value === r.eenheid);
                  return (
                    <tr key={r.id} className="border-b border-border/60 align-top last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {format(parseISO(r.datum), "d-M-yy", { locale: nl })}
                      </td>
                      <td className="px-2 py-2">
                        {actie?.emoji} {actie?.label ?? r.actie}
                        {r.notitie ? (
                          <span className="block text-xs text-muted-foreground">{r.notitie}</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        {r.partij ? (partijNaam.get(r.partij) ?? "…") : "—"}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {r.tank ? (tankCode.get(r.tank) ?? "…") : "—"}
                      </td>
                      <td className="px-2 py-2">{r.middel || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {/* Fase 13 Blok A: leeg getalveld komt als 0 uit
                            PocketBase; een toevoeging van 0 is geen toevoeging. */}
                        {r.hoeveelheid ? `${r.hoeveelheid} ${eenheid?.label ?? ""}` : "—"}
                      </td>
                      <td className="px-2 py-2">{r.ingevoerd_door || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
