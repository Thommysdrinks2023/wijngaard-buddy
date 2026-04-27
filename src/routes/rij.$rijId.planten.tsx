import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { createObservatie, fetchMetingen, fetchObservaties, fetchRijen } from "@/lib/data";
import { computePlantStatus, STATUS_INFO, type PlantStatus } from "@/lib/plant-status";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Check, ChevronLeft, FlaskConical, Eye, Loader2 } from "lucide-react";

export const Route = createFileRoute("/rij/$rijId/planten")({
  component: PlantenPage,
  head: () => ({ meta: [{ title: "Planten — Wijngaard" }] }),
});

function PlantenPage() {
  const { rijId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [invoerder] = useInvoerder();

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
  const [openPlant, setOpenPlant] = useState<number | null>(null);

  const gezondM = useMutation({
    mutationFn: (plantNr: number) =>
      createObservatie({
        rij: rijId,
        plant: plantNr,
        datum: format(new Date(), "yyyy-MM-dd"),
        type: "gezond",
        notitie: "Gezond — geen bijzonderheden",
        ingevoerd_door: invoerder || "Onbekend",
      }),
    onSuccess: () => {
      toast.success("Plant gemarkeerd als gezond ✓");
      qc.invalidateQueries({ queryKey: ["observaties"] });
      setOpenPlant(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const plantStatuses = useMemo(() => {
    if (!rij) return [];
    const metingen = metingenQ.data ?? [];
    const obs = obsQ.data ?? [];
    return Array.from({ length: rij.aantal_planten }, (_, i) => {
      const nr = i + 1;
      return { nr, ...computePlantStatus(rijId, nr, metingen, obs) };
    });
  }, [rij, rijId, metingenQ.data, obsQ.data]);

  const openInfo = openPlant != null ? plantStatuses[openPlant - 1] : null;

  return (
    <>
      <AppHeader
        back
        title={rij ? `Rij ${rij.rijnummer}` : "Rij"}
        subtitle={rij ? `${rij.ras} · ${rij.aantal_planten} planten` : ""}
      />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        {/* Back to map */}
        <Link
          to="/perceelkaart"
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Terug naar perceelkaart
        </Link>

        {/* Status legend */}
        <div className="rounded-xl border border-border bg-card p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status-legenda
          </h2>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {(Object.keys(STATUS_INFO) as PlantStatus[]).map((s) => (
              <li key={s} className="flex items-center gap-2 text-sm">
                <span
                  className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: STATUS_INFO[s].color }}
                />
                <span className="font-medium">{STATUS_INFO[s].label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  — {STATUS_INFO[s].description}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Plant grid */}
        {rij ? (
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Planten ({rij.aantal_planten})
            </h2>
            <div className="rounded-2xl border border-border bg-card p-3">
              {/* Render planten in groepjes van 5 met palen ertussen.
                  Elk groepje is een inline-flex blok dat als geheel wrapt,
                  zodat palen nooit midden in een groep terechtkomen. */}
              <div className="flex flex-wrap items-center gap-y-3">
                {Array.from(
                  { length: Math.ceil(plantStatuses.length / 5) },
                  (_, groupIdx) => {
                    const group = plantStatuses.slice(groupIdx * 5, groupIdx * 5 + 5);
                    const isLastGroup = groupIdx === Math.ceil(plantStatuses.length / 5) - 1;
                    return (
                      <div key={groupIdx} className="flex items-center">
                        <div className="flex items-center gap-1.5">
                          {group.map((p) => {
                            const info = STATUS_INFO[p.status];
                            return (
                              <button
                                key={p.nr}
                                onClick={() => setOpenPlant(p.nr)}
                                aria-label={`Plant ${p.nr} – ${info.label}`}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[11px] font-bold shadow-sm ring-2 ring-card transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                style={{ backgroundColor: info.color }}
                              >
                                <span
                                  className={
                                    p.status === "geel"
                                      ? "text-foreground/80"
                                      : "text-white drop-shadow-sm"
                                  }
                                >
                                  {p.nr}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {!isLastGroup && (
                          <div
                            aria-hidden
                            title="Paal"
                            className="mx-2 shrink-0 rounded-sm"
                            style={{
                              width: 8,
                              height: 52,
                              backgroundColor: "#9E9E9E",
                              boxShadow: "inset -1px 0 0 rgba(0,0,0,0.15)",
                            }}
                          />
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Tik op een plant voor details en acties · paal na elke 5 planten
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Rij niet gevonden.
          </p>
        )}
      </div>

      {/* Bottom sheet */}
      <Drawer
        open={openPlant != null}
        onOpenChange={(o) => !o && setOpenPlant(null)}
      >
        <DrawerContent>
          {openInfo && rij && (
            <>
              <DrawerHeader className="text-left">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white shadow ring-2 ring-card"
                    style={{ backgroundColor: STATUS_INFO[openInfo.status].color }}
                  >
                    {openInfo.nr}
                  </span>
                  <div>
                    <DrawerTitle>Plant {openInfo.nr}</DrawerTitle>
                    <DrawerDescription>
                      Rij {rij.rijnummer} · {rij.ras}
                    </DrawerDescription>
                  </div>
                </div>
              </DrawerHeader>

              <div className="space-y-4 px-4 pb-2">
                {/* Status badge */}
                <div
                  className="flex items-center gap-2 rounded-xl border p-3"
                  style={{
                    backgroundColor: STATUS_INFO[openInfo.status].color + "22",
                    borderColor: STATUS_INFO[openInfo.status].color + "55",
                  }}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: STATUS_INFO[openInfo.status].color }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      {STATUS_INFO[openInfo.status].label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {STATUS_INFO[openInfo.status].description}
                    </p>
                  </div>
                </div>

                {/* Last activity */}
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Laatste activiteit
                  </h3>
                  {openInfo.latest ? (
                    <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium capitalize">
                          {openInfo.latest.kind}
                          {!openInfo.latest.fromPlant && (
                            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                              hele rij
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(openInfo.latest.datum), "d MMM yyyy", {
                            locale: nl,
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground">
                        {openInfo.latest.label}
                      </p>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
                      Nog niets geregistreerd voor deze plant.
                    </p>
                  )}
                </div>

                {/* Quick action: mark healthy */}
                <button
                  type="button"
                  onClick={() => gezondM.mutate(openInfo.nr)}
                  disabled={gezondM.isPending}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[var(--color-status-groen,#4CAF50)] bg-[color-mix(in_oklab,#4CAF50_15%,transparent)] text-base font-semibold text-foreground disabled:opacity-50"
                >
                  {gezondM.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Check className="h-5 w-5" style={{ color: "#2E7D32" }} />
                  )}
                  Markeer als gezond
                </button>

                {/* Actions */}
                <div
                  className="grid grid-cols-2 gap-3 pb-6"
                  style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
                >
                  <button
                    onClick={() =>
                      navigate({
                        to: "/rij/$rijId/observatie",
                        params: { rijId },
                        search: { plant: openInfo.nr },
                      })
                    }
                    className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent text-base font-semibold text-accent-foreground"
                  >
                    <Eye className="h-5 w-5" />
                    Observatie
                  </button>
                  <button
                    onClick={() =>
                      navigate({
                        to: "/rij/$rijId/meting",
                        params: { rijId },
                        search: { plant: openInfo.nr },
                      })
                    }
                    className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground"
                  >
                    <FlaskConical className="h-5 w-5" />
                    Meting
                  </button>
                </div>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
