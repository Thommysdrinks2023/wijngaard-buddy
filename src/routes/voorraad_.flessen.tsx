// Fase 15 Blok B — flessenvoorraad (lege flessen). Vlakke route (trailing-
// underscore-escape, zie CLAUDE.md) zodat dit los staat van de bestaande
// /voorraad-layout (volle flessen, uitgefaseerd in Blok E — nog niet
// uitgevoerd) zonder die aan te raken.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchFlestypes, fetchFlessenStanden } from "@/lib/flessen-data";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { ErrorState } from "@/components/error-state";
import { PackagePlus } from "lucide-react";

export const Route = createFileRoute("/voorraad_/flessen")({
  component: FlessenvoorraadOverzicht,
  head: () => ({
    meta: [
      { title: "Flessenvoorraad — Voorraad" },
      { name: "description", content: "Lege-flessenvoorraad per flestype." },
    ],
  }),
});

function FlessenvoorraadOverzicht() {
  const flestypesQ = useQuery({
    queryKey: ["flestypes", { alleenActief: true }],
    queryFn: () => fetchFlestypes({ alleenActief: true }),
  });
  const standenQ = useQuery({ queryKey: ["flessen-standen"], queryFn: fetchFlessenStanden });

  const [vormFilter, setVormFilter] = useState("");
  const [inhoudFilter, setInhoudFilter] = useState("");
  const [kleurFilter, setKleurFilter] = useState("");

  const vormen = useMemo(
    () => Array.from(new Set((flestypesQ.data ?? []).map((t) => t.vorm))).sort(),
    [flestypesQ.data],
  );
  const inhouden = useMemo(
    () =>
      Array.from(new Set((flestypesQ.data ?? []).map((t) => t.inhoud_ml))).sort((a, b) => a - b),
    [flestypesQ.data],
  );
  const kleuren = useMemo(
    () => Array.from(new Set((flestypesQ.data ?? []).map((t) => t.kleur).filter(Boolean))).sort(),
    [flestypesQ.data],
  );

  const gefilterd = useMemo(() => {
    const lijst = (flestypesQ.data ?? []).filter(
      (t) =>
        (!vormFilter || t.vorm === vormFilter) &&
        (!inhoudFilter || t.inhoud_ml === Number(inhoudFilter)) &&
        (!kleurFilter || t.kleur === kleurFilter),
    );
    const stand = (id: string) => standenQ.data?.[id] ?? 0;
    // Oplopend op stand: wat bijna op is staat bovenaan (besluit vooraf).
    return [...lijst].sort((a, b) => stand(a.id) - stand(b.id));
  }, [flestypesQ.data, standenQ.data, vormFilter, inhoudFilter, kleurFilter]);

  const isLoading = flestypesQ.isLoading || standenQ.isLoading;

  return (
    <>
      <AppHeader back title="Flessenvoorraad" subtitle="Lege flessen per type" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        {flestypesQ.isError && (
          <ErrorState error={flestypesQ.error} onRetry={() => flestypesQ.refetch()} />
        )}
        {standenQ.isError && (
          <ErrorState error={standenQ.error} onRetry={() => standenQ.refetch()} />
        )}

        <div className="flex flex-wrap gap-2">
          {vormen.length > 1 && (
            <select
              value={vormFilter}
              onChange={(e) => setVormFilter(e.target.value)}
              className="h-10 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
            >
              <option value="">Alle vormen</option>
              {vormen.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
          {inhouden.length > 1 && (
            <select
              value={inhoudFilter}
              onChange={(e) => setInhoudFilter(e.target.value)}
              className="h-10 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
            >
              <option value="">Alle inhoud</option>
              {inhouden.map((ml) => (
                <option key={ml} value={ml}>
                  {ml} ml
                </option>
              ))}
            </select>
          )}
          {kleuren.length > 1 && (
            <select
              value={kleurFilter}
              onChange={(e) => setKleurFilter(e.target.value)}
              className="h-10 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
            >
              <option value="">Alle kleuren</option>
              {kleuren.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          )}
        </div>

        {isLoading ? (
          <ListSkeleton />
        ) : gefilterd.length === 0 ? (
          <EmptyState
            message="Nog geen flestypes. Voeg ze toe onder Instellingen."
            icon={<PackagePlus className="h-6 w-6" />}
          />
        ) : (
          <ul className="space-y-2">
            {gefilterd.map((t) => {
              const stand = standenQ.data?.[t.id] ?? 0;
              const bijnaOp = stand < 200; // globale vuistregel; instelbare drempel volgt (Blok B-signaal)
              return (
                <li key={t.id}>
                  <Link
                    to="/voorraad/flessen/$flestypeId"
                    params={{ flestypeId: t.id }}
                    className="block rounded-xl border border-border bg-card p-3 active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {t.omschrijving || `${t.vorm} ${t.inhoud_ml} ml`}
                        </p>
                        {t.leverancier && (
                          <p className="text-xs text-muted-foreground">{t.leverancier}</p>
                        )}
                      </div>
                      {bijnaOp && (
                        <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                          Bijna op
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-lg font-bold tabular-nums">
                      {stand}{" "}
                      <span className="text-xs font-normal text-muted-foreground">stuks</span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
