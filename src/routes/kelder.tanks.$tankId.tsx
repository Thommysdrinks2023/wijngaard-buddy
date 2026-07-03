import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { fetchTankboek, fetchTanks, updateTank } from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { TANK_STATUSSEN, TANKBOEK_ACTIES, type TankStatus } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ArrowLeftRight } from "lucide-react";

export const Route = createFileRoute("/kelder/tanks/$tankId")({
  component: TankDetailPage,
  head: () => ({ meta: [{ title: "Tank — Kelder" }] }),
});

function TankDetailPage() {
  const { tankId } = Route.useParams();
  const qc = useQueryClient();
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });
  const tankboekQ = useQuery({
    queryKey: ["tankboek", "tank", tankId],
    queryFn: () => fetchTankboek({ tank: tankId }),
  });

  const tank = useMemo(() => tanksQ.data?.find((t) => t.id === tankId), [tanksQ.data, tankId]);
  const partijNaam = useMemo(() => {
    const m = new Map<string, string>();
    partijenQ.data?.forEach((p) => m.set(p.id, p.naam));
    return m;
  }, [partijenQ.data]);
  const tankCode = useMemo(() => {
    const m = new Map<string, string>();
    tanksQ.data?.forEach((t) => m.set(t.id, t.code));
    return m;
  }, [tanksQ.data]);

  const [notitie, setNotitie] = useState<string | null>(null);
  const [capaciteit, setCapaciteit] = useState<string | null>(null);

  const updateM = useMutation({
    mutationFn: (input: Parameters<typeof updateTank>[1]) => updateTank(tankId, input),
    onSuccess: () => {
      toast.success("Tank bijgewerkt ✓");
      qc.invalidateQueries({ queryKey: ["tanks"] });
      setNotitie(null);
      setCapaciteit(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const info = TANK_STATUSSEN.find((s) => s.value === tank?.status);
  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  if (tanksQ.isFetched && !tank) {
    return (
      <>
        <AppHeader back title="Tank" />
        <div className="mx-auto max-w-screen-md px-3 py-4">
          <ErrorState message="Tank niet gevonden." onRetry={() => tanksQ.refetch()} />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader
        back
        title={tank ? `Tank ${tank.code}` : "Tank"}
        subtitle={
          tank?.soort
            ? tank.soort.toUpperCase().startsWith("IM")
              ? `${tank.soort} (zwemdekseltank)`
              : tank.soort
            : ""
        }
      />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        {/* Status + inhoud */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-lg font-bold">
                {tank?.huidig_volume_l ? `${Math.round(tank.huidig_volume_l)} L` : "Leeg"}
                {tank && tank.capaciteit_l > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / {tank.capaciteit_l} L
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {tank?.huidige_partij ? (
                  <Link
                    to="/kelder/partijen/$partijId"
                    params={{ partijId: tank.huidige_partij }}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {partijNaam.get(tank.huidige_partij) ?? "…"}
                  </Link>
                ) : (
                  `${info?.emoji} ${info?.label ?? ""}`
                )}
                {tank?.locatie ? ` · ${tank.locatie}` : ""}
              </p>
            </div>
            <Link
              to="/kelder/overhevelen"
              search={{ van: tankId }}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
            >
              <ArrowLeftRight className="h-4 w-4" />
              Overhevelen
            </Link>
          </div>
          {tank && tank.capaciteit_l > 0 && tank.huidig_volume_l > 0 && (
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (tank.huidig_volume_l / tank.capaciteit_l) * 100)}%`,
                  backgroundColor: "var(--primary)",
                }}
              />
            </div>
          )}
        </section>

        {/* Beheer: status (alleen zonder inhoud), capaciteit, notitie */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Beheer
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {TANK_STATUSSEN.map((s) => {
              const geblokkeerd =
                (tank?.huidig_volume_l ?? 0) > 0 && (s.value === "leeg" || s.value === "reiniging");
              return (
                <button
                  key={s.value}
                  type="button"
                  disabled={updateM.isPending || geblokkeerd || tank?.status === s.value}
                  onClick={() => updateM.mutate({ status: s.value as TankStatus })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                    tank?.status === s.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background"
                  }`}
                >
                  {s.emoji} {s.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            De inhoud (partij en liters) volgt uit het tankboek en is hier bewust niet handmatig te
            wijzigen. Klopt de stand niet? Boek een correctie of gebruik "Herbereken" bij Tanks.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Capaciteit (L)</span>
              <input
                type="number"
                inputMode="numeric"
                value={capaciteit ?? String(tank?.capaciteit_l ?? "")}
                onChange={(e) => setCapaciteit(e.target.value)}
                onBlur={() => {
                  if (capaciteit != null && Number(capaciteit) >= 0)
                    updateM.mutate({ capaciteit_l: Number(capaciteit) });
                }}
                className={veldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Notitie</span>
              <input
                value={notitie ?? tank?.notitie ?? ""}
                onChange={(e) => setNotitie(e.target.value)}
                onBlur={() => {
                  if (notitie != null) updateM.mutate({ notitie });
                }}
                className={veldClass}
                placeholder="Optioneel…"
              />
            </label>
          </div>
        </section>

        {/* Tankboek van deze tank */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Tankboek van deze tank ({tankboekQ.data?.length ?? 0})
          </h2>
          {(tankboekQ.data ?? []).length === 0 ? (
            <EmptyState message="Nog geen boekingen voor deze tank." />
          ) : (
            <ul className="space-y-1.5">
              {(tankboekQ.data ?? []).map((r) => {
                const actie = TANKBOEK_ACTIES.find((a) => a.value === r.actie);
                const richtingIn = r.naar_tank === tankId;
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {actie?.emoji} {actie?.label ?? r.actie} · {partijNaam.get(r.partij) ?? "…"}
                        {r.actie === "overhevelen" && r.van_tank && r.naar_tank
                          ? ` (${tankCode.get(r.van_tank)} → ${tankCode.get(r.naar_tank)})`
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(r.datum), "d MMM yyyy", { locale: nl })} ·{" "}
                        {r.verantwoordelijke}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        richtingIn ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {richtingIn ? "+" : "−"}
                      {r.volume_l} L
                    </span>
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
