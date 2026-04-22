import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { fetchMetingen, fetchObservaties, fetchRijen } from "@/lib/data";
import { RAS_OPTIONS } from "@/lib/seed-rijen";
import { AppHeader } from "@/components/app-header";
import { Search, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Rijen — Wijngaard" },
      { name: "description", content: "Overzicht van alle rijen in de wijngaard." },
    ],
  }),
});

function recentBadge(dates: string[]): "meting" | "observatie" | null {
  // Caller passes a flag map; not used directly here
  return null;
}

function HomePage() {
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const metingenQ = useQuery({ queryKey: ["metingen"], queryFn: () => fetchMetingen() });
  const obsQ = useQuery({ queryKey: ["observaties"], queryFn: () => fetchObservaties() });

  const [filter, setFilter] = useState<string>("alle");
  const [zoek, setZoek] = useState("");

  const recencyByRij = useMemo(() => {
    const map = new Map<string, { meting?: number; obs?: number }>();
    const now = new Date();
    metingenQ.data?.forEach((m) => {
      const d = differenceInDays(now, parseISO(m.datum));
      const cur = map.get(m.rij) ?? {};
      if (cur.meting == null || d < cur.meting) cur.meting = d;
      map.set(m.rij, cur);
    });
    obsQ.data?.forEach((o) => {
      const d = differenceInDays(now, parseISO(o.datum));
      const cur = map.get(o.rij) ?? {};
      if (cur.obs == null || d < cur.obs) cur.obs = d;
      map.set(o.rij, cur);
    });
    return map;
  }, [metingenQ.data, obsQ.data]);

  const rijen = (rijenQ.data ?? [])
    .filter((r) => filter === "alle" || r.ras === filter)
    .filter((r) => {
      if (!zoek.trim()) return true;
      const q = zoek.toLowerCase();
      return (
        String(r.rijnummer).includes(q) ||
        r.ras.toLowerCase().includes(q)
      );
    });

  return (
    <>
      <AppHeader title="Wijngaard" />
      <div className="mx-auto max-w-screen-md px-3 py-4 space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rijen</h1>
          <p className="text-sm text-muted-foreground">
            {rijenQ.data?.length ?? 0} rijen totaal
          </p>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            inputMode="search"
            placeholder="Zoek op rijnummer of ras…"
            className="h-12 w-full rounded-xl border border-input bg-card pl-11 pr-4 text-base outline-none focus:border-primary"
          />
        </div>

        <div className="-mx-3 overflow-x-auto px-3">
          <div className="flex gap-2 pb-1">
            <FilterChip active={filter === "alle"} onClick={() => setFilter("alle")}>
              Alle
            </FilterChip>
            {RAS_OPTIONS.map((r) => (
              <FilterChip key={r} active={filter === r} onClick={() => setFilter(r)}>
                {r}
              </FilterChip>
            ))}
          </div>
        </div>

        <ul className="space-y-2">
          {rijen.map((r) => {
            const rec = recencyByRij.get(r.id);
            const recentMeting = rec?.meting != null && rec.meting < 7;
            const recentObs = rec?.obs != null && rec.obs < 7;
            return (
              <li key={r.id}>
                <Link
                  to="/rij/$rijId"
                  params={{ rijId: r.id }}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 active:scale-[0.99] transition"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary font-bold">
                    {r.rijnummer}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">{r.ras}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.aantal_planten} planten
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {recentMeting && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                        meting
                      </span>
                    )}
                    {recentObs && (
                      <span className="rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
                        observatie
                      </span>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
          {rijen.length === 0 && (
            <li className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Geen rijen gevonden.
            </li>
          )}
        </ul>
      </div>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
