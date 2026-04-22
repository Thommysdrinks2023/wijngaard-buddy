import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { fetchMetingen, fetchObservaties, fetchRijen } from "@/lib/data";
import { OBSERVATIE_TYPES } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { RijpheidStars } from "@/components/rijpheid-stars";
import { Plus, FlaskConical, Eye } from "lucide-react";

export const Route = createFileRoute("/rij/$rijId")({
  component: RijDetail,
  head: () => ({ meta: [{ title: "Rij — Wijngaard" }] }),
});

function RijDetail() {
  const { rijId } = Route.useParams();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const metingenQ = useQuery({
    queryKey: ["metingen", rijId],
    queryFn: () => fetchMetingen(rijId),
  });
  const obsQ = useQuery({
    queryKey: ["observaties", rijId],
    queryFn: () => fetchObservaties(rijId),
  });

  const rij = rijenQ.data?.find((r) => r.id === rijId);
  const metingen = (metingenQ.data ?? []).slice(0, 5);
  const observaties = (obsQ.data ?? []).slice(0, 5);

  return (
    <>
      <AppHeader
        back
        title={rij ? `Rij ${rij.rijnummer}` : "Rij"}
        subtitle={rij ? `${rij.ras} · ${rij.aantal_planten} planten` : ""}
      />
      <div className="mx-auto max-w-screen-md px-3 py-4 space-y-5">
        {/* Plant view link */}
        <Link
          to="/rij/$rijId/planten"
          params={{ rijId }}
          className="flex items-center justify-between rounded-2xl border border-border bg-card p-3 text-sm font-medium active:scale-[0.99] transition"
        >
          <span>🌿 Bekijk planten in deze rij</span>
          <span className="text-muted-foreground">→</span>
        </Link>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/rij/$rijId/meting"
            params={{ rijId }}
            className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-primary text-primary-foreground font-semibold shadow-sm active:scale-[0.98] transition"
          >
            <FlaskConical className="h-6 w-6" />
            Meting toevoegen
          </Link>
          <Link
            to="/rij/$rijId/observatie"
            params={{ rijId }}
            className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-accent text-accent-foreground font-semibold shadow-sm active:scale-[0.98] transition"
          >
            <Eye className="h-6 w-6" />
            Observatie toevoegen
          </Link>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Laatste metingen
          </h2>
          {metingen.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nog geen metingen voor deze rij.
            </p>
          ) : (
            <ul className="space-y-2">
              {metingen.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {format(parseISO(m.datum), "d MMM yyyy", { locale: nl })}
                    </p>
                    <RijpheidStars value={m.rijpheid_score} size="sm" />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {m.brix != null && <span>Brix {m.brix}</span>}
                    {m.ph != null && <span>pH {m.ph}</span>}
                    {m.zuurgraad != null && <span>Zuur {m.zuurgraad}</span>}
                    {m.ingevoerd_door && (
                      <span className="ml-auto text-xs">— {m.ingevoerd_door}</span>
                    )}
                  </div>
                  {m.notitie && (
                    <p className="mt-1 text-sm">{m.notitie}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Laatste observaties
          </h2>
          {observaties.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nog geen observaties.
            </p>
          ) : (
            <ul className="space-y-2">
              {observaties.map((o) => {
                const t = OBSERVATIE_TYPES.find((x) => x.value === o.type);
                return (
                  <li
                    key={o.id}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        {t?.emoji} {t?.label ?? o.type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(o.datum), "d MMM yyyy", { locale: nl })}
                      </p>
                    </div>
                    {o.notitie && <p className="mt-1 text-sm">{o.notitie}</p>}
                    {o.ingevoerd_door && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        — {o.ingevoerd_door}
                      </p>
                    )}
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
