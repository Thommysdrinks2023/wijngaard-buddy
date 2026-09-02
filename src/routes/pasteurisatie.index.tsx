// Fase 17 Blok F/G — runoverzicht + logboekoverzicht (gegroepeerd op
// product/eigenaar: "wat hebben we voor deze klant gedaan").
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchEigenaars } from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { fetchPasteurisatieRuns } from "@/lib/pasteurisatie-data";
import {
  eigenaarLabel,
  PASTEURISATIE_OORDELEN,
  PASTEURISATIE_RUN_STATUSSEN,
  type PasteurisatieRunStatus,
} from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { Plus, Thermometer } from "lucide-react";

export const Route = createFileRoute("/pasteurisatie/")({
  component: PasteurisatieOverzicht,
  head: () => ({
    meta: [
      { title: "Pasteurisatie" },
      { name: "description", content: "PU-opbouw, drukveiligheid en runoverzicht." },
    ],
  }),
});

function PasteurisatieOverzicht() {
  const [weergave, setWeergave] = useState<"runs" | "logboek">("runs");
  const [eigenaarFilter, setEigenaarFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<PasteurisatieRunStatus | "">("");

  const runsQ = useQuery({
    queryKey: ["pasteurisatie-runs"],
    queryFn: () => fetchPasteurisatieRuns(),
  });
  const eigenaarsQ = useQuery({ queryKey: ["eigenaars"], queryFn: fetchEigenaars });
  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });

  const eigenaarNaam = useMemo(() => {
    const m = new Map<string, string>();
    eigenaarsQ.data?.forEach((e) => m.set(e.id, eigenaarLabel(e)));
    return m;
  }, [eigenaarsQ.data]);
  const partijNaam = useMemo(() => {
    const m = new Map<string, string>();
    partijenQ.data?.forEach((p) => m.set(p.id, p.naam));
    return m;
  }, [partijenQ.data]);

  const gefilterd = useMemo(
    () =>
      (runsQ.data ?? []).filter(
        (r) =>
          (!eigenaarFilter || r.eigenaar === eigenaarFilter) &&
          (!statusFilter || r.status === statusFilter),
      ),
    [runsQ.data, eigenaarFilter, statusFilter],
  );

  // Logboekoverzicht: groeperen op eigenaar, dan op product_soort.
  const gegroepeerd = useMemo(() => {
    const groepen = new Map<string, Map<string, typeof gefilterd>>();
    for (const run of gefilterd) {
      const eigenaarKey = run.eigenaar
        ? (eigenaarNaam.get(run.eigenaar) ?? "Onbekend")
        : "Geen eigenaar";
      if (!groepen.has(eigenaarKey)) groepen.set(eigenaarKey, new Map());
      const perProduct = groepen.get(eigenaarKey)!;
      if (!perProduct.has(run.product_soort)) perProduct.set(run.product_soort, []);
      perProduct.get(run.product_soort)!.push(run);
    }
    return groepen;
  }, [gefilterd, eigenaarNaam]);

  const actieveRuns = (runsQ.data ?? []).filter((r) => r.status === "actief");

  return (
    <>
      <AppHeader back title="Pasteurisatie" subtitle="PU-opbouw en drukveiligheid" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        {actieveRuns.length > 0 && (
          <div className="space-y-2">
            {actieveRuns.map((r) => (
              <Link
                key={r.id}
                to="/pasteurisatie/run/$runId"
                params={{ runId: r.id }}
                className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900"
              >
                🔴 Actieve run: lot {r.lotnummer} — {partijNaam.get(r.partij) ?? ""} →
              </Link>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/pasteurisatie/plannen"
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card p-4 text-center"
          >
            <Thermometer className="h-5 w-5" />
            <span className="text-sm font-semibold">Vooraf plannen</span>
          </Link>
          <Link
            to="/pasteurisatie/run/nieuw"
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-primary bg-primary-soft p-4 text-center"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-semibold">Run starten</span>
          </Link>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setWeergave("runs")}
            className={`h-10 flex-1 rounded-xl text-sm font-semibold ${weergave === "runs" ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
          >
            Runs
          </button>
          <button
            onClick={() => setWeergave("logboek")}
            className={`h-10 flex-1 rounded-xl text-sm font-semibold ${weergave === "logboek" ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
          >
            Per klant/product
          </button>
        </div>

        <div className="flex gap-2">
          {(eigenaarsQ.data ?? []).length > 0 && (
            <select
              value={eigenaarFilter}
              onChange={(e) => setEigenaarFilter(e.target.value)}
              className="h-10 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
            >
              <option value="">Alle eigenaars</option>
              {(eigenaarsQ.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {eigenaarLabel(e)}
                </option>
              ))}
            </select>
          )}
          {weergave === "runs" && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PasteurisatieRunStatus | "")}
              className="h-10 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
            >
              <option value="">Alle statussen</option>
              {PASTEURISATIE_RUN_STATUSSEN.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.emoji} {s.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {runsQ.isError && <ErrorState error={runsQ.error} onRetry={() => runsQ.refetch()} />}

        {runsQ.isLoading ? (
          <ListSkeleton />
        ) : gefilterd.length === 0 ? (
          <EmptyState
            message="Nog geen pasteurisatieruns."
            icon={<Thermometer className="h-6 w-6" />}
          />
        ) : weergave === "runs" ? (
          <ul className="space-y-2">
            {gefilterd.map((r) => {
              const oordeel = PASTEURISATIE_OORDELEN.find((o) => o.value === r.veiligheidsoordeel);
              return (
                <li key={r.id}>
                  <Link
                    to="/pasteurisatie/run/$runId"
                    params={{ runId: r.id }}
                    className="block rounded-xl border border-border bg-card p-3 active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          Lot {r.lotnummer} — {partijNaam.get(r.partij) ?? ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.datum}
                          {r.eigenaar ? ` · ${eigenaarNaam.get(r.eigenaar) ?? ""}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                        {PASTEURISATIE_RUN_STATUSSEN.find((s) => s.value === r.status)?.emoji}{" "}
                        {r.status}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-sm">
                      {r.totale_pu != null && (
                        <span className="font-semibold tabular-nums">
                          {r.totale_pu.toFixed(0)} PU
                        </span>
                      )}
                      {oordeel && (
                        <span>
                          {oordeel.emoji} {oordeel.label}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="space-y-4">
            {Array.from(gegroepeerd.entries()).map(([eigenaarKey, perProduct]) => (
              <section key={eigenaarKey} className="rounded-xl border border-border bg-card p-3">
                <h2 className="mb-2 text-sm font-semibold">{eigenaarKey}</h2>
                {Array.from(perProduct.entries()).map(([product, runs]) => (
                  <div key={product} className="mb-3 last:mb-0">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {product}
                    </h3>
                    <ul className="space-y-1">
                      {runs.map((r) => (
                        <li key={r.id}>
                          <Link
                            to="/pasteurisatie/run/$runId"
                            params={{ runId: r.id }}
                            className="flex items-center justify-between rounded-lg bg-muted/40 px-2 py-1.5 text-sm"
                          >
                            <span>
                              {r.datum} · lot {r.lotnummer}
                            </span>
                            <span className="tabular-nums">
                              {r.totale_pu != null ? `${r.totale_pu.toFixed(0)} PU` : r.status}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
