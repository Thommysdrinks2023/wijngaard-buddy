import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchOogst, type OogstRecord } from "@/lib/extra-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { fetchProducenten, fetchTanks } from "@/lib/kelder-data";
import { useSeizoen } from "@/lib/seizoen";
import { PARTIJ_STATUSSEN, type PartijStatus } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { YearSelector } from "@/components/year-selector";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Plus, Wine } from "lucide-react";

export const Route = createFileRoute("/kelder/partijen/")({
  component: PartijenPage,
  head: () => ({
    meta: [
      { title: "Partijen — Kelder" },
      { name: "description", content: "Alle wijn- en drankpartijen." },
    ],
  }),
});

function statusInfo(status: PartijStatus) {
  return PARTIJ_STATUSSEN.find((s) => s.value === status);
}

function PartijenPage() {
  const [jaar] = useSeizoen();
  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });
  const oogstQ = useQuery({ queryKey: ["oogst-records"], queryFn: fetchOogst });
  const producentenQ = useQuery({ queryKey: ["producenten"], queryFn: fetchProducenten });
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const [producentFilter, setProducentFilter] = useState("");

  const producentNaam = useMemo(() => {
    const m = new Map<string, string>();
    producentenQ.data?.forEach((p) => m.set(p.id, p.naam));
    return m;
  }, [producentenQ.data]);

  const oogstPerPartij = useMemo(() => {
    const map = new Map<string, OogstRecord[]>();
    oogstQ.data?.forEach((o) => {
      if (!o.partij) return;
      const arr = map.get(o.partij) ?? [];
      arr.push(o);
      map.set(o.partij, arr);
    });
    return map;
  }, [oogstQ.data]);

  const partijenSeizoen = useMemo(
    () =>
      (partijenQ.data ?? []).filter(
        (p) => p.jaargang === jaar && (!producentFilter || p.producent === producentFilter),
      ),
    [partijenQ.data, jaar, producentFilter],
  );

  return (
    <>
      <AppHeader back title="Partijen" subtitle="Kelder" />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Partijen</h1>
            <p className="text-sm text-muted-foreground">Oogst en dranken volgen tot de fles</p>
          </div>
          <YearSelector />
        </div>

        <Link
          to="/kelder/partijen/nieuw"
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" /> Nieuwe partij
        </Link>

        {partijenQ.isError && (
          <ErrorState error={partijenQ.error} onRetry={() => partijenQ.refetch()} />
        )}

        {(producentenQ.data ?? []).length > 1 && (
          <select
            value={producentFilter}
            onChange={(e) => setProducentFilter(e.target.value)}
            className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"
          >
            <option value="">Alle producenten</option>
            {(producentenQ.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.naam}
              </option>
            ))}
          </select>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Partijen {jaar}
          </h2>
          {partijenSeizoen.length === 0 ? (
            <EmptyState
              message="Nog geen partijen dit seizoen."
              icon={<Wine className="h-6 w-6" />}
            />
          ) : (
            <ul className="space-y-2">
              {partijenSeizoen.map((p) => {
                const records = oogstPerPartij.get(p.id) ?? [];
                const totaalKg = Math.round(records.reduce((acc, o) => acc + o.kg, 0) * 10) / 10;
                const info = statusInfo(p.status);
                const tanksVanPartij = (tanksQ.data ?? []).filter((t) => t.huidige_partij === p.id);
                return (
                  <li key={p.id}>
                    <Link
                      to="/kelder/partijen/$partijId"
                      params={{ partijId: p.id }}
                      className="block rounded-xl border border-border bg-card p-3 active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{p.naam}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.jaargang} · {p.type}
                            {p.producent ? ` · ${producentNaam.get(p.producent) ?? ""}` : ""}
                            {p.lotnummer ? ` · lot ${p.lotnummer}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                          {info?.emoji} {info?.label ?? p.status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {tanksVanPartij.length > 0
                          ? `Tank ${tanksVanPartij.map((t) => t.code).join(", ")}`
                          : "Niet op tank"}
                        {records.length > 0
                          ? ` · ${records.length} oogstregistratie(s) · ${totaalKg} kg`
                          : ""}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
