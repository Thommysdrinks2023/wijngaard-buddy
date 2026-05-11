import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { nl } from "date-fns/locale";
import { AppHeader } from "@/components/app-header";
import {
  getSteekproefPlanten,
  getSteekproefMetingen,
  type SteekproefMeting,
  type SteekproefPlant,
} from "@/lib/steekproef";
import { RAS_OPTIONS } from "@/lib/seed-rijen";
import { AlertTriangle, Plus, Settings2 } from "lucide-react";

export const Route = createFileRoute("/steekproeven/")({
  component: SteekproevenPage,
  head: () => ({
    meta: [
      { title: "Steekproeven — Wijngaard" },
      { name: "description", content: "Vaste steekproefplanten per ras voor seizoensvergelijking." },
    ],
  }),
});

function SteekproevenPage() {
  const puntenQ = useQuery({
    queryKey: ["steekproef_planten"],
    queryFn: async () => getSteekproefPlanten(),
  });
  const metingenQ = useQuery({
    queryKey: ["steekproef_metingen"],
    queryFn: async () => getSteekproefMetingen(),
  });

  const laatsteMeting = useMemo(() => {
    const map = new Map<string, SteekproefMeting>();
    metingenQ.data?.forEach((m) => {
      const cur = map.get(m.plantId);
      if (!cur || cur.datum < m.datum) map.set(m.plantId, m);
    });
    return map;
  }, [metingenQ.data]);

  const perRas = useMemo(() => {
    const map = new Map<string, SteekproefPlant[]>();
    puntenQ.data?.forEach((p) => {
      const arr = map.get(p.ras) ?? [];
      arr.push(p);
      map.set(p.ras, arr);
    });
    map.forEach((arr) => arr.sort((a, b) => a.naam.localeCompare(b.naam)));
    return map;
  }, [puntenQ.data]);

  const rasMet = RAS_OPTIONS.filter((r) => perRas.has(r));

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader title="Steekproeven" />
      <main className="mx-auto max-w-screen-md space-y-5 px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Steekproeven</h1>
            <p className="text-sm text-muted-foreground">
              Vaste meetplanten per ras voor consistente seizoensvergelijking.
            </p>
          </div>
          <Link
            to="/steekproeven/beheer"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium"
          >
            <Settings2 className="h-4 w-4" /> Beheer
          </Link>
        </div>

        {puntenQ.data && puntenQ.data.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nog geen steekproefplanten aangewezen.
            </p>
            <Link
              to="/steekproeven/beheer"
              className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Eerste plant aanwijzen
            </Link>
          </div>
        )}

        {rasMet.map((ras) => (
          <section key={ras} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {ras}
            </h2>
            <ul className="space-y-2">
              {perRas.get(ras)!.map((p) => {
                const m = laatsteMeting.get(p.id);
                const dagen = m
                  ? differenceInCalendarDays(new Date(), parseISO(m.datum))
                  : null;
                const stale = dagen == null || dagen > 14;
                return (
                  <li key={p.id}>
                    <Link
                      to="/steekproeven/$puntId/invoer"
                      params={{ puntId: p.id }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 active:scale-[0.99]"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold">{p.naam}</span>
                          {stale && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                              <AlertTriangle className="h-3 w-3" />
                              {dagen == null ? "Geen meting" : `${dagen}d oud`}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          Rij {p.rijnummer} · plant {p.plant}
                        </div>
                        {m ? (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                            <span>
                              <span className="text-muted-foreground">Datum:</span>{" "}
                              {format(parseISO(m.datum), "d MMM", { locale: nl })}
                            </span>
                            {m.brix != null && (
                              <span>
                                <span className="text-muted-foreground">Brix:</span> {m.brix}
                              </span>
                            )}
                            {m.ziektedruk && (
                              <span>
                                <span className="text-muted-foreground">Ziekte:</span>{" "}
                                {m.ziektedruk}
                              </span>
                            )}
                            {m.fenologie && (
                              <span>
                                <span className="text-muted-foreground">Fase:</span>{" "}
                                {m.fenologie}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Nog geen metingen — tik om eerste in te voeren
                          </div>
                        )}
                      </div>
                      <Plus className="h-5 w-5 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
