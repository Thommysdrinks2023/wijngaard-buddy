import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { fetchFenologie, fetchMetingen, fetchObservaties, fetchRijen } from "@/lib/data";
import { RAS_OPTIONS, type Ras } from "@/lib/seed-rijen";
import { AppHeader } from "@/components/app-header";
import { AlertTriangle, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/perceelkaart")({
  component: Perceelkaart,
  head: () => ({
    meta: [
      { title: "Perceelkaart — Wijngaard" },
      { name: "description", content: "Visueel bovenaanzicht van de wijngaard per rij." },
    ],
  }),
});

const RAS_KLEUR: Record<Ras, string> = {
  Muscaris: "#fde68a", // lichtgeel
  "Souveginier Gris": "#eab308", // goudgeel
  Johanniter: "#86efac", // lichtgroen
  Regent: "#7e22ce", // paars
  "Pinot Noir": "#7f1d1d", // donkerrood
  Chardonnay: "#bbf7d0", // lichtgroen (iets lichter dan Johanniter)
  Pinotin: "#5c1a2b", // bordeauxrood
};

function Perceelkaart() {
  const navigate = useNavigate();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const metingenQ = useQuery({ queryKey: ["metingen"], queryFn: () => fetchMetingen() });
  const obsQ = useQuery({ queryKey: ["observaties"], queryFn: () => fetchObservaties() });
  const fenQ = useQuery({ queryKey: ["fenologie"], queryFn: () => fetchFenologie() });

  const recencyByRij = useMemo(() => {
    const map = new Map<
      string,
      { recentMeting: boolean; recentZiekteSchade: boolean }
    >();
    const now = new Date();
    metingenQ.data?.forEach((m) => {
      if (differenceInDays(now, parseISO(m.datum)) < 7) {
        const cur = map.get(m.rij) ?? { recentMeting: false, recentZiekteSchade: false };
        cur.recentMeting = true;
        map.set(m.rij, cur);
      }
    });
    obsQ.data?.forEach((o) => {
      if ((o.type === "ziekte" || o.type === "schade") && differenceInDays(now, parseISO(o.datum)) < 7) {
        const cur = map.get(o.rij) ?? { recentMeting: false, recentZiekteSchade: false };
        cur.recentZiekteSchade = true;
        map.set(o.rij, cur);
      }
    });
    return map;
  }, [metingenQ.data, obsQ.data]);

  // Rijen die dit seizoen nog geen knopbreek hebben (en het is na 1 april)
  const ontbrekendKnopbreek = useMemo(() => {
    const set = new Set<string>();
    const now = new Date();
    const huidigJaar = now.getFullYear();
    const eersteApril = new Date(huidigJaar, 3, 1); // april = month 3
    if (now < eersteApril) return set;
    const knopbreekRijen = new Set<string>();
    fenQ.data?.forEach((f) => {
      try {
        if (f.moment === "Knopbreek" && parseISO(f.datum).getFullYear() === huidigJaar) {
          knopbreekRijen.add(f.rij);
        }
      } catch {
        // ignore
      }
    });
    rijenQ.data?.forEach((r) => {
      if (!knopbreekRijen.has(r.id)) set.add(r.id);
    });
    return set;
  }, [fenQ.data, rijenQ.data]);

  const rijen = useMemo(
    () => [...(rijenQ.data ?? [])].sort((a, b) => a.rijnummer - b.rijnummer),
    [rijenQ.data]
  );

  const maxPlanten = useMemo(
    () => Math.max(1, ...rijen.map((r) => r.aantal_planten)),
    [rijen]
  );

  // Visual scale: max bar height in px
  const MAX_BAR = 280;
  const MIN_BAR = 18;
  const BAR_WIDTH = 14;
  const BAR_GAP = 4;

  return (
    <>
      <AppHeader title="Perceelkaart" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Perceelkaart</h1>
          <p className="text-sm text-muted-foreground">
            Bovenaanzicht · {rijen.length} rijen · hoogte = aantal planten
          </p>
        </div>

        {/* Map area */}
        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="overflow-x-auto -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
            <div
              className="relative flex items-end pb-6 pt-8"
              style={{ minHeight: MAX_BAR + 56, gap: `${BAR_GAP}px` }}
            >
              {rijen.map((r) => {
                const heightPx =
                  MIN_BAR + (r.aantal_planten / maxPlanten) * (MAX_BAR - MIN_BAR);
                const rec = recencyByRij.get(r.id);
                const color = RAS_KLEUR[r.ras];
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate({ to: "/rij/$rijId/planten", params: { rijId: r.id } })}
                    aria-label={`Rij ${r.rijnummer} – ${r.ras}, ${r.aantal_planten} planten`}
                    className="group relative flex shrink-0 flex-col items-center justify-end focus:outline-none"
                    style={{ width: BAR_WIDTH, height: MAX_BAR + 24 }}
                  >
                    {/* Indicators above bar */}
                    <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-0.5"
                         style={{ bottom: heightPx + 2 }}>
                      {rec?.recentZiekteSchade && (
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-warning text-warning-foreground shadow"
                          title="Recente ziekte/schade"
                        >
                          <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
                        </span>
                      )}
                      {rec?.recentMeting && (
                        <span
                          className="h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card shadow"
                          title="Recente meting"
                        />
                      )}
                      {ontbrekendKnopbreek.has(r.id) && !rec?.recentZiekteSchade && !rec?.recentMeting && (
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground/70 shadow-sm"
                          title="Nog geen knopbreek geregistreerd"
                        >
                          <HelpCircle className="h-3 w-3" strokeWidth={2.5} />
                        </span>
                      )}
                    </div>

                    {/* Bar */}
                    <div
                      className="w-full rounded-t-sm transition-transform group-active:scale-y-95 group-focus-visible:ring-2 group-focus-visible:ring-primary"
                      style={{
                        height: heightPx,
                        backgroundColor: color,
                        boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.15)",
                      }}
                    />

                    {/* Row number — show every 5th + first/last to avoid clutter */}
                    {(r.rijnummer % 5 === 0 || r.rijnummer === 1 || r.rijnummer === rijen[rijen.length - 1].rijnummer) && (
                      <span className="absolute -bottom-0 text-[9px] font-medium text-muted-foreground tabular-nums">
                        {r.rijnummer}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            ← scroll horizontaal →
          </p>
        </div>

        {/* Indicator legend */}
        <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-card p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            <span>Recente meting (&lt; 7 dagen)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-warning text-warning-foreground">
              <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <span>Recente ziekte / schade</span>
          </div>
        </div>

        {/* Ras legend */}
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Legenda — rassen
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {RAS_OPTIONS.map((ras) => {
              const count = rijen.filter((r) => r.ras === ras).length;
              return (
                <li
                  key={ras}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                >
                  <span
                    className="h-5 w-5 shrink-0 rounded-md ring-1 ring-black/10"
                    style={{ backgroundColor: RAS_KLEUR[ras] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight">{ras}</p>
                    <p className="text-[11px] text-muted-foreground">{count} rijen</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
