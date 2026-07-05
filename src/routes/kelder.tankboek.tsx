import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { fetchProducenten, fetchTankboek, fetchTanks } from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { exporteerCsv } from "@/lib/csv-export";
import { TANKBOEK_ACTIES } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { BookOpen, Printer, Sheet } from "lucide-react";

export const Route = createFileRoute("/kelder/tankboek")({
  component: TankboekPage,
  head: () => ({
    meta: [
      { title: "Tankboek — Kelder" },
      { name: "description", content: "Onwijzigbaar register van alle keldermutaties." },
    ],
  }),
});

function TankboekPage() {
  const [tankFilter, setTankFilter] = useState("");
  const [partijFilter, setPartijFilter] = useState("");
  const [producentFilter, setProducentFilter] = useState("");
  const [vanaf, setVanaf] = useState("");
  const [tot, setTot] = useState("");

  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });
  const producentenQ = useQuery({ queryKey: ["producenten"], queryFn: fetchProducenten });
  const tankboekQ = useQuery({
    queryKey: ["tankboek", { tankFilter, partijFilter, producentFilter, vanaf, tot }],
    queryFn: () =>
      fetchTankboek({
        tank: tankFilter || undefined,
        partij: partijFilter || undefined,
        producent: producentFilter || undefined,
        vanaf: vanaf || undefined,
        tot: tot || undefined,
      }),
  });

  const tankCode = useMemo(() => {
    const m = new Map<string, string>();
    tanksQ.data?.forEach((t) => m.set(t.id, t.code));
    return m;
  }, [tanksQ.data]);
  const partijNaam = useMemo(() => {
    const m = new Map<string, string>();
    partijenQ.data?.forEach((p) => m.set(p.id, p.naam));
    return m;
  }, [partijenQ.data]);
  const producentNaam = useMemo(() => {
    const m = new Map<string, string>();
    producentenQ.data?.forEach((p) => m.set(p.id, p.naam));
    return m;
  }, [producentenQ.data]);

  const veldClass = "h-10 w-full rounded-xl border border-input bg-card px-2.5 text-sm";

  return (
    <>
      <AppHeader back title="Tankboek" subtitle="Register van keldermutaties" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4 print:max-w-none">
        <div className="flex items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tankboek</h1>
            <p className="text-sm text-muted-foreground">
              Regels zijn onwijzigbaar; fouten herstel je met een correctieboeking.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() =>
                exporteerCsv(
                  `tankboek_${format(new Date(), "yyyy-MM-dd")}`,
                  [
                    "Datum",
                    "Tijd",
                    "Actie",
                    "Partij",
                    "Producent",
                    "Van",
                    "Naar",
                    "Liters",
                    "Middel",
                    "Dosering",
                    "Verantwoordelijke",
                    "Notitie",
                  ],
                  (tankboekQ.data ?? []).map((r) => [
                    r.datum,
                    r.tijd ?? "",
                    TANKBOEK_ACTIES.find((a) => a.value === r.actie)?.label ?? r.actie,
                    partijNaam.get(r.partij) ?? "",
                    r.producent ? (producentNaam.get(r.producent) ?? "") : "",
                    r.van_tank ? (tankCode.get(r.van_tank) ?? "") : "",
                    r.naar_tank ? (tankCode.get(r.naar_tank) ?? "") : "",
                    r.volume_l,
                    r.middel ?? "",
                    r.dosering ?? "",
                    r.verantwoordelijke,
                    r.notitie ?? "",
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
            value={producentFilter}
            onChange={(e) => setProducentFilter(e.target.value)}
            className={veldClass}
          >
            <option value="">Alle producenten</option>
            {(producentenQ.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.naam}
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
              setTankFilter("");
              setPartijFilter("");
              setProducentFilter("");
              setVanaf("");
              setTot("");
            }}
            className="h-10 rounded-xl border border-border bg-background text-sm font-medium"
          >
            Wis filters
          </button>
        </section>

        {tankboekQ.isError && (
          <ErrorState error={tankboekQ.error} onRetry={() => tankboekQ.refetch()} />
        )}

        {/* Register */}
        {(tankboekQ.data ?? []).length === 0 ? (
          <EmptyState
            message="Geen boekingen gevonden voor deze selectie."
            icon={<BookOpen className="h-6 w-6" />}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-2 py-2">Actie</th>
                  <th className="px-2 py-2">Partij</th>
                  <th className="px-2 py-2">Van</th>
                  <th className="px-2 py-2">Naar</th>
                  <th className="px-2 py-2 text-right">Liters</th>
                  <th className="px-2 py-2">Door</th>
                </tr>
              </thead>
              <tbody>
                {(tankboekQ.data ?? []).map((r) => {
                  const actie = TANKBOEK_ACTIES.find((a) => a.value === r.actie);
                  return (
                    <tr key={r.id} className="border-b border-border/60 align-top last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {format(parseISO(r.datum), "d-M-yy", { locale: nl })}
                        {r.tijd ? ` ${r.tijd}` : ""}
                      </td>
                      <td className="px-2 py-2">
                        {actie?.emoji} {actie?.label ?? r.actie}
                        {r.middel ? (
                          <span className="block text-xs text-muted-foreground">
                            {r.middel}
                            {r.dosering ? ` · ${r.dosering}` : ""}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        {partijNaam.get(r.partij) ?? "…"}
                        {r.producent ? (
                          <span className="block text-xs text-muted-foreground">
                            {producentNaam.get(r.producent) ?? ""}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {r.van_tank ? tankCode.get(r.van_tank) : "—"}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {r.naar_tank ? tankCode.get(r.naar_tank) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.volume_l}</td>
                      <td className="px-2 py-2">{r.verantwoordelijke}</td>
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
