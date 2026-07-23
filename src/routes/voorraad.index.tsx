import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchProducenten, fetchVoorraadFlessen } from "@/lib/kelder-data";
import { VOORRAAD_STATUSSEN, type VoorraadStatus } from "@/lib/types";
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
  const producentenQ = useQuery({ queryKey: ["producenten"], queryFn: fetchProducenten });
  const [producentFilter, setProducentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<VoorraadStatus | "">("");

  const producentNaam = useMemo(() => {
    const m = new Map<string, string>();
    producentenQ.data?.forEach((p) => m.set(p.id, p.naam));
    return m;
  }, [producentenQ.data]);

  const gefilterd = useMemo(
    () =>
      (voorraadQ.data ?? []).filter(
        (v) =>
          (!producentFilter || v.producent === producentFilter) &&
          (!statusFilter || v.status === statusFilter),
      ),
    [voorraadQ.data, producentFilter, statusFilter],
  );

  const totaalFlessen = gefilterd.reduce((acc, v) => acc + v.aantal_huidig, 0);

  return (
    <>
      <AppHeader title="Voorraad" subtitle="Van fles tot verkoop" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
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
          {(producentenQ.data ?? []).length > 1 && (
            <select
              value={producentFilter}
              onChange={(e) => setProducentFilter(e.target.value)}
              className="h-11 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
            >
              <option value="">Alle producenten</option>
              {(producentenQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.naam}
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
                            {v.producent ? ` · ${producentNaam.get(v.producent) ?? ""}` : ""}
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
