import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchEigenaars, fetchVoorraadFlessen } from "@/lib/kelder-data";
import { VOORRAAD_STATUSSEN, type VoorraadStatus, eigenaarLabel } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { ErrorState } from "@/components/error-state";
import { Wine } from "lucide-react";

export const Route = createFileRoute("/voorraad/")({
  component: VoorraadOverzicht,
  head: () => ({
    meta: [{ title: "Voorraad" }, { name: "description", content: "Flessenvoorraad per wijn." }],
  }),
});

function statusInfo(status: VoorraadStatus) {
  return VOORRAAD_STATUSSEN.find((s) => s.value === status);
}

function VoorraadOverzicht() {
  const voorraadQ = useQuery({ queryKey: ["voorraad"], queryFn: () => fetchVoorraadFlessen() });
  const eigenaarsQ = useQuery({ queryKey: ["eigenaars"], queryFn: fetchEigenaars });
  const [eigenaarFilter, setEigenaarFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<VoorraadStatus | "">("");

  const eigenaarNaam = useMemo(() => {
    const m = new Map<string, string>();
    eigenaarsQ.data?.forEach((p) => m.set(p.id, eigenaarLabel(p)));
    return m;
  }, [eigenaarsQ.data]);

  const gefilterd = useMemo(
    () =>
      (voorraadQ.data ?? []).filter(
        (v) =>
          (!eigenaarFilter || v.eigenaar === eigenaarFilter) &&
          (!statusFilter || v.status === statusFilter),
      ),
    [voorraadQ.data, eigenaarFilter, statusFilter],
  );

  const totaalFlessen = gefilterd.reduce((acc, v) => acc + v.aantal_huidig, 0);

  return (
    <>
      <AppHeader back title="Voorraad" subtitle="Van fles tot verkoop" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        {/* Fase 13 Blok F — dit scherm begon met een raster kale getallen,
            zonder kop in de pagina zelf en zonder terugknop. Je landde op
            "2 / 30" en moest raden waar je was. Nu dezelfde opzet als /kelder
            en /oogst: titel, ondertitel, en terug via de header. */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Voorraad</h1>
          <p className="text-sm text-muted-foreground">Flessen per wijn en jaargang</p>
        </div>

        {/* Fase 15 Blok B — nieuwe lege-flessenvoorraad, los van deze pagina
            (die volle flessen toont en in Blok E wordt uitgefaseerd). */}
        <Link
          to="/voorraad/flessen"
          className="block rounded-xl border border-border bg-card p-3 text-sm font-semibold active:scale-[0.99]"
        >
          📦 Flessenvoorraad (lege flessen) →
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Wijnen
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">{gefilterd.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Flessen op voorraad
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">{totaalFlessen}</p>
          </div>
        </div>

        {voorraadQ.isError && (
          <ErrorState error={voorraadQ.error} onRetry={() => voorraadQ.refetch()} />
        )}

        <div className="flex gap-2">
          {(eigenaarsQ.data ?? []).length > 1 && (
            <select
              value={eigenaarFilter}
              onChange={(e) => setEigenaarFilter(e.target.value)}
              className="h-11 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
            >
              <option value="">Alle eigenaars</option>
              {(eigenaarsQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {eigenaarLabel(p)}
                </option>
              ))}
            </select>
          )}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as VoorraadStatus | "")}
            className="h-11 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
          >
            <option value="">Alle statussen</option>
            {VOORRAAD_STATUSSEN.map((s) => (
              <option key={s.value} value={s.value}>
                {s.emoji} {s.label}
              </option>
            ))}
          </select>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Wijnen
          </h2>
          {voorraadQ.isLoading ? (
            <ListSkeleton />
          ) : gefilterd.length === 0 ? (
            <EmptyState
              message="Nog geen voorraad. Bottel een partij vanuit de partijdetailpagina."
              icon={<Wine className="h-6 w-6" />}
            />
          ) : (
            <ul className="space-y-2">
              {gefilterd.map((v) => {
                const info = statusInfo(v.status);
                return (
                  <li key={v.id}>
                    <Link
                      to="/voorraad/$voorraadId"
                      params={{ voorraadId: v.id }}
                      className="block rounded-xl border border-border bg-card p-3 active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{v.wijnnaam}</p>
                          <p className="text-xs text-muted-foreground">
                            {v.jaargang}
                            {v.eigenaar ? ` · ${eigenaarNaam.get(v.eigenaar) ?? ""}` : ""}
                            {v.locatie ? ` · ${v.locatie}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                          {info?.emoji} {info?.label ?? v.status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold tabular-nums">
                        {v.aantal_huidig}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          / {v.aantal_beginvoorraad} flessen
                        </span>
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
