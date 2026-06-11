import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { fetchFenologie, fetchMetingen, fetchObservaties, fetchRijen } from "@/lib/data";
import { FENOLOGIE_MOMENTEN, OBSERVATIE_TYPES } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { RijpheidStars } from "@/components/rijpheid-stars";
import { FlaskConical, Eye, Sprout, Pencil } from "lucide-react";

export const Route = createFileRoute("/rij/$rijId/")({
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
  const fenQ = useQuery({
    queryKey: ["fenologie", rijId],
    queryFn: () => fetchFenologie(rijId),
  });

  const rij = rijenQ.data?.find((r) => r.id === rijId);
  const metingen = (metingenQ.data ?? []).slice(0, 5);
  const observaties = (obsQ.data ?? []).slice(0, 5);
  const fenologie = (fenQ.data ?? []).slice(0, 10);

  // Foto-tijdlijn: alle foto's van metingen en observaties, nieuwste eerst
  const fotos = [
    ...(metingenQ.data ?? [])
      .filter((m) => m.foto)
      .map((m) => ({ id: `m-${m.id}`, url: m.foto!, datum: m.datum, label: "Meting" })),
    ...(obsQ.data ?? [])
      .filter((o) => o.foto)
      .map((o) => {
        const t = OBSERVATIE_TYPES.find((x) => x.value === o.type);
        return { id: `o-${o.id}`, url: o.foto!, datum: o.datum, label: t?.label ?? "Observatie" };
      }),
  ].sort((a, b) => (a.datum < b.datum ? 1 : -1));

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
        <div className="grid grid-cols-3 gap-2">
          <Link
            to="/rij/$rijId/meting"
            params={{ rijId }}
            className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-primary text-primary-foreground text-xs font-semibold shadow-sm active:scale-[0.98] transition px-1 text-center"
          >
            <FlaskConical className="h-5 w-5" />
            Meting
          </Link>
          <Link
            to="/rij/$rijId/observatie"
            params={{ rijId }}
            className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-accent text-accent-foreground text-xs font-semibold shadow-sm active:scale-[0.98] transition px-1 text-center"
          >
            <Eye className="h-5 w-5" />
            Observatie
          </Link>
          <Link
            to="/rij/$rijId/fenologie"
            params={{ rijId }}
            className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-secondary text-secondary-foreground text-xs font-semibold shadow-sm active:scale-[0.98] transition px-1 text-center"
          >
            <Sprout className="h-5 w-5" />
            Fenologie
          </Link>
        </div>

        {/* Foto-tijdlijn */}
        {fotos.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              📷 Foto's ({fotos.length})
            </h2>
            <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
              {fotos.map((f) => (
                <a
                  key={f.id}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 overflow-hidden rounded-xl border border-border bg-card"
                >
                  <img
                    src={f.url}
                    alt={f.label}
                    loading="lazy"
                    className="h-28 w-28 object-cover"
                  />
                  <p className="px-2 py-1 text-center text-[10px] text-muted-foreground">
                    {f.label} · {format(parseISO(f.datum), "d MMM", { locale: nl })}
                  </p>
                </a>
              ))}
            </div>
          </section>
        )}

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

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Fenologie
          </h2>
          {fenologie.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nog geen fenologie geregistreerd.
            </p>
          ) : (
            <ul className="space-y-2">
              {fenologie.map((f) => {
                const m = FENOLOGIE_MOMENTEN.find((x) => x.value === f.moment);
                return (
                  <li key={f.id} className="rounded-xl border border-border bg-card">
                    <Link
                      to="/fenologie/$fenId/bewerken"
                      params={{ fenId: f.id }}
                      className="flex items-center gap-3 p-3 active:scale-[0.99] transition"
                    >
                      <span className="text-xl">{m?.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{f.moment}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(f.datum), "d MMM yyyy", { locale: nl })}
                          </p>
                        </div>
                        {f.notitie && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {f.notitie}
                          </p>
                        )}
                      </div>
                      <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
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
