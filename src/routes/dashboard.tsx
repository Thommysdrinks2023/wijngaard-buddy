import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { differenceInDays, format, parseISO, startOfYear } from "date-fns";
import { nl } from "date-fns/locale";
import { fetchMetingen, fetchObservaties, fetchRijen } from "@/lib/data";
import { OBSERVATIE_TYPES, type Rij } from "@/lib/types";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard — Wijngaard" },
      { name: "description", content: "Overzicht: brix per ras, uitval, recente activiteiten." },
    ],
  }),
});

function Dashboard() {
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const metingenQ = useQuery({ queryKey: ["metingen"], queryFn: () => fetchMetingen() });
  const obsQ = useQuery({ queryKey: ["observaties"], queryFn: () => fetchObservaties() });

  const rijenById = useMemo(() => {
    const m = new Map<string, Rij>();
    rijenQ.data?.forEach((r) => m.set(r.id, r));
    return m;
  }, [rijenQ.data]);

  // Avg Brix per ras this week
  const brixPerRas = useMemo(() => {
    const acc = new Map<string, { sum: number; n: number }>();
    const now = new Date();
    metingenQ.data?.forEach((m) => {
      if (m.brix == null) return;
      const days = differenceInDays(now, parseISO(m.datum));
      if (days > 7 || days < 0) return;
      const r = rijenById.get(m.rij);
      if (!r) return;
      const cur = acc.get(r.ras) ?? { sum: 0, n: 0 };
      cur.sum += m.brix;
      cur.n += 1;
      acc.set(r.ras, cur);
    });
    return Array.from(acc.entries())
      .map(([ras, v]) => ({ ras, avg: v.sum / v.n, n: v.n }))
      .sort((a, b) => b.avg - a.avg);
  }, [metingenQ.data, rijenById]);

  // Rijen with uitval observations this season
  const uitvalRijen = useMemo(() => {
    const seasonStart = startOfYear(new Date());
    const ids = new Set<string>();
    obsQ.data?.forEach((o) => {
      if (o.type !== "uitval") return;
      if (parseISO(o.datum) < seasonStart) return;
      ids.add(o.rij);
    });
    return Array.from(ids)
      .map((id) => rijenById.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .sort((a, b) => a.rijnummer - b.rijnummer);
  }, [obsQ.data, rijenById]);

  // Last 10 activities
  const recent = useMemo(() => {
    const items: Array<{
      id: string;
      datum: string;
      kind: "meting" | "observatie";
      label: string;
      rijId: string;
      rijLabel: string;
    }> = [];
    metingenQ.data?.forEach((m) => {
      const r = rijenById.get(m.rij);
      items.push({
        id: `m-${m.id}`,
        datum: m.datum,
        kind: "meting",
        label:
          m.brix != null
            ? `Brix ${m.brix} · ${m.rijpheid_score}/5`
            : `Rijpheid ${m.rijpheid_score}/5`,
        rijId: m.rij,
        rijLabel: r ? `Rij ${r.rijnummer} · ${r.ras}` : "Rij",
      });
    });
    obsQ.data?.forEach((o) => {
      const r = rijenById.get(o.rij);
      const t = OBSERVATIE_TYPES.find((x) => x.value === o.type);
      items.push({
        id: `o-${o.id}`,
        datum: o.datum,
        kind: "observatie",
        label: `${t?.emoji ?? ""} ${t?.label ?? o.type}`,
        rijId: o.rij,
        rijLabel: r ? `Rij ${r.rijnummer} · ${r.ras}` : "Rij",
      });
    });
    return items
      .sort((a, b) => (a.datum < b.datum ? 1 : -1))
      .slice(0, 10);
  }, [metingenQ.data, obsQ.data, rijenById]);

  return (
    <>
      <AppHeader title="Dashboard" />
      <div className="mx-auto max-w-screen-md space-y-6 px-3 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overzicht van het seizoen
          </p>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Gemiddelde Brix per ras (deze week)
          </h2>
          {brixPerRas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nog geen Brix-metingen deze week.
            </p>
          ) : (
            <div className="space-y-2">
              {brixPerRas.map((b) => {
                const pct = Math.min(100, (b.avg / 25) * 100);
                return (
                  <div key={b.ras} className="rounded-xl border border-border bg-card p-3">
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="font-medium">{b.ras}</span>
                      <span className="text-lg font-bold tabular-nums text-primary">
                        {b.avg.toFixed(1)}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          °Bx · {b.n}×
                        </span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Rijen met uitval dit seizoen
          </h2>
          {uitvalRijen.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Geen uitval-observaties dit seizoen.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {uitvalRijen.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/rij/$rijId"
                    params={{ rijId: r.id }}
                    className="flex h-12 items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 text-sm font-medium text-destructive"
                  >
                    💀 Rij {r.rijnummer}
                    <span className="text-xs opacity-80">{r.ras}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Laatste 10 activiteiten
          </h2>
          {recent.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nog geen activiteit.
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.map((it) => (
                <li key={it.id}>
                  <Link
                    to="/rij/$rijId"
                    params={{ rijId: it.rijId }}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
                        it.kind === "meting"
                          ? "bg-primary-soft text-primary"
                          : "bg-accent/30 text-accent-foreground"
                      }`}
                    >
                      {it.kind === "meting" ? "M" : "O"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{it.rijLabel}</p>
                      <p className="truncate text-xs text-muted-foreground">{it.label}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(it.datum), "d MMM", { locale: nl })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
