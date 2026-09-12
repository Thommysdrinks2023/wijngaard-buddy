// Fase 17 Blok F/G — runoverzicht + logboekoverzicht (gegroepeerd op
// product/eigenaar: "wat hebben we voor deze klant gedaan").
// Fase 18 Blok B — dashboardherontwerp: kerncijfers bovenaan, mini-trend van
// de laatste runs, daarna dezelfde filterbare lijst/logboek als voorheen.
// Rekenlogica/datamodel ongewijzigd — alleen de weergave.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchEigenaars } from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { fetchPasteurisatieRuns } from "@/lib/pasteurisatie-data";
import {
  eigenaarLabel,
  PASTEURISATIE_OORDELEN,
  PASTEURISATIE_RUN_STATUSSEN,
  type PasteurisatieOordeel,
  type PasteurisatieRun,
  type PasteurisatieRunStatus,
} from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { StatTile } from "@/components/stat-tile";
import { StatusBadge } from "@/components/status-badge";
import { Activity, CalendarRange, Gauge, Plus, ShieldAlert, Thermometer } from "lucide-react";

export const Route = createFileRoute("/pasteurisatie/")({
  component: PasteurisatieOverzicht,
  head: () => ({
    meta: [
      { title: "Pasteurisatie" },
      { name: "description", content: "PU-opbouw, drukveiligheid en runoverzicht." },
    ],
  }),
});

const OORDEEL_TOON: Record<PasteurisatieOordeel, "success" | "warning" | "destructive"> = {
  veilig: "success",
  marginaal: "warning",
  onveilig: "destructive",
  onbekend: "warning",
};
const OORDEEL_KLEUR: Record<PasteurisatieOordeel, string> = {
  veilig: "#4a8c5c",
  marginaal: "#e6a817",
  onveilig: "#d64444",
  onbekend: "var(--warning)",
};
const STATUS_TOON: Record<PasteurisatieRunStatus, "neutraal" | "info" | "success" | "destructive"> =
  {
    gepland: "neutraal",
    actief: "info",
    afgerond: "success",
    afgebroken: "destructive",
  };

function oordeelBadge(oordeel: PasteurisatieOordeel | null | undefined) {
  const def = PASTEURISATIE_OORDELEN.find((o) => o.value === oordeel);
  if (!def) return null;
  return <StatusBadge label={def.label} emoji={def.emoji} toon={OORDEEL_TOON[def.value]} />;
}

function statusBadge(status: PasteurisatieRunStatus) {
  const def = PASTEURISATIE_RUN_STATUSSEN.find((s) => s.value === status);
  return (
    <StatusBadge
      label={def?.label ?? status}
      emoji={def?.emoji}
      toon={STATUS_TOON[status] ?? "neutraal"}
    />
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TrendPunt }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-semibold">Lot {p.lotnummer}</p>
      <p>
        {p.pu.toFixed(0)} PU · doel {p.doelMin}-{p.doelMax}
      </p>
      {p.oordeelLabel && <p>{p.oordeelLabel}</p>}
    </div>
  );
}

interface TrendPunt {
  lotnummer: string;
  pu: number;
  doelMin: number;
  doelMax: number;
  oordeelLabel: string;
  kleur: string;
}

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

  const alleRuns = useMemo(() => runsQ.data ?? [], [runsQ.data]);
  const actieveRuns = useMemo(() => alleRuns.filter((r) => r.status === "actief"), [alleRuns]);

  // ---------- Kerncijfers (Blok B) ----------
  const kerncijfers = useMemo(() => {
    const afgerond = alleRuns.filter(
      (r): r is PasteurisatieRun & { totale_pu: number } =>
        r.status === "afgerond" && r.totale_pu != null,
    );
    const nu = Date.now();
    const dertigDagen = afgerond.filter((r) => nu - new Date(r.datum).getTime() <= 30 * 86400000);
    const negentigDagen = afgerond.filter((r) => nu - new Date(r.datum).getTime() <= 90 * 86400000);
    const binnenDoel = afgerond.filter(
      (r) => r.totale_pu >= r.doel_pu_min && r.totale_pu <= r.doel_pu_max,
    );
    const aandacht = negentigDagen.filter(
      (r) => r.veiligheidsoordeel === "marginaal" || r.veiligheidsoordeel === "onveilig",
    );
    return {
      actief: actieveRuns.length,
      dertigDagen: dertigDagen.length,
      binnenDoelPct:
        afgerond.length > 0 ? Math.round((binnenDoel.length / afgerond.length) * 100) : null,
      afgerondTotaal: afgerond.length,
      aandacht: aandacht.length,
      negentigDagenTotaal: negentigDagen.length,
    };
  }, [alleRuns, actieveRuns.length]);

  const trendData: TrendPunt[] = useMemo(
    () =>
      alleRuns
        .filter((r) => r.status === "afgerond" && r.totale_pu != null)
        .slice(0, 10)
        .reverse()
        .map((r) => ({
          lotnummer: r.lotnummer || r.id,
          pu: r.totale_pu as number,
          doelMin: r.doel_pu_min,
          doelMax: r.doel_pu_max,
          oordeelLabel:
            PASTEURISATIE_OORDELEN.find((o) => o.value === r.veiligheidsoordeel)?.label ?? "",
          kleur: r.veiligheidsoordeel ? OORDEEL_KLEUR[r.veiligheidsoordeel] : "#94a3b8",
        })),
    [alleRuns],
  );

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
                className="flex min-h-11 items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold"
              >
                <span className="animate-pulse">🔴</span>
                <span className="min-w-0 flex-1 truncate">
                  Actieve run: lot {r.lotnummer} — {partijNaam.get(r.partij) ?? ""}
                </span>
                <span aria-hidden>→</span>
              </Link>
            ))}
          </div>
        )}

        {/* Kerncijfers */}
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile
            label="Actieve runs"
            value={kerncijfers.actief}
            icon={<Activity className="h-3.5 w-3.5" />}
            toon={kerncijfers.actief > 0 ? "info" : "neutraal"}
          />
          <StatTile
            label="Laatste 30 dagen"
            value={kerncijfers.dertigDagen}
            sub="afgeronde runs"
            icon={<CalendarRange className="h-3.5 w-3.5" />}
          />
          <StatTile
            label="Binnen doelbereik"
            value={kerncijfers.binnenDoelPct != null ? `${kerncijfers.binnenDoelPct}%` : "—"}
            sub={
              kerncijfers.afgerondTotaal > 0
                ? `van ${kerncijfers.afgerondTotaal} afgeronde runs`
                : "nog geen afgeronde runs"
            }
            icon={<Gauge className="h-3.5 w-3.5" />}
            toon={
              kerncijfers.binnenDoelPct == null
                ? "neutraal"
                : kerncijfers.binnenDoelPct >= 80
                  ? "success"
                  : "warning"
            }
          />
          <StatTile
            label="Aandacht nodig"
            value={kerncijfers.aandacht}
            sub="marginaal/onveilig, 90 dgn"
            icon={<ShieldAlert className="h-3.5 w-3.5" />}
            toon={kerncijfers.aandacht > 0 ? "destructive" : "success"}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/pasteurisatie/plannen"
            className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card p-4 text-center"
          >
            <Thermometer className="h-5 w-5" />
            <span className="text-sm font-semibold">Vooraf plannen</span>
          </Link>
          <Link
            to="/pasteurisatie/run/nieuw"
            className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border border-primary bg-primary-soft p-4 text-center"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-semibold">Run starten</span>
          </Link>
        </div>

        {/* Mini-trend van de laatste afgeronde runs */}
        <div className="rounded-xl border border-border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold">PU per run (laatste 10)</h2>
          {trendData.length === 0 ? (
            <EmptyState
              message="Nog geen afgeronde run om een trend van te tonen — de eerste afgeronde run verschijnt hier."
              icon={<Activity className="h-6 w-6" />}
            />
          ) : (
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="lotnummer"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    tickFormatter={(v: string) => v.replace(/^SEED-0*/, "")}
                  />
                  <YAxis tick={{ fontSize: 10 }} unit=" PU" width={56} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="pu" radius={[4, 4, 0, 0]}>
                    {trendData.map((p) => (
                      <Cell key={p.lotnummer} fill={p.kleur} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setWeergave("runs")}
            className={`h-11 flex-1 rounded-xl text-sm font-semibold ${weergave === "runs" ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
          >
            Runs
          </button>
          <button
            onClick={() => setWeergave("logboek")}
            className={`h-11 flex-1 rounded-xl text-sm font-semibold ${weergave === "logboek" ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
          >
            Per klant/product
          </button>
        </div>

        <div className="flex gap-2">
          {(eigenaarsQ.data ?? []).length > 0 && (
            <select
              value={eigenaarFilter}
              onChange={(e) => setEigenaarFilter(e.target.value)}
              className="h-11 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
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
              className="h-11 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
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
            action={
              <Link
                to="/pasteurisatie/run/nieuw"
                className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                <Plus className="h-4 w-4" /> Eerste run starten
              </Link>
            }
          />
        ) : weergave === "runs" ? (
          <ul className="space-y-2">
            {gefilterd.map((r) => (
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
                    {statusBadge(r.status)}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-sm">
                    {r.totale_pu != null && (
                      <span className="font-semibold tabular-nums">
                        {r.totale_pu.toFixed(0)} PU
                      </span>
                    )}
                    {oordeelBadge(r.veiligheidsoordeel)}
                  </div>
                </Link>
              </li>
            ))}
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
                            className="flex min-h-11 items-center justify-between rounded-lg bg-muted/40 px-2 py-1.5 text-sm"
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
