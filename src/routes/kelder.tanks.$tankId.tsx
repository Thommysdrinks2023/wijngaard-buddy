import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import {
  boekTankboek,
  createKelderlog,
  fetchKelderlog,
  fetchTankboek,
  fetchTanks,
  updateTank,
} from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { useInvoerder } from "@/lib/use-invoerder";
import { TANK_STATUSSEN, TANKBOEK_ACTIES, type TankStatus } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ArrowLeftRight, Loader2, Ruler, SprayCan } from "lucide-react";

const REINIGING_METHODEN = ["heet water", "CIP", "stoom", "sodaoplossing", "handmatig"] as const;

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
  // Fase 7 Blok D — reinigingslog van deze tank (kelderlog-actie "reiniging")
  const reinigingQ = useQuery({
    queryKey: ["kelderlog", "reiniging", tankId],
    queryFn: () => fetchKelderlog({ tank: tankId, actie: "reiniging" }),
  });
  const laatstGereinigd = reinigingQ.data?.[0]?.datum ?? null;

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
  const [invoerder, setInvoerder] = useInvoerder();

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

  // ---------- peiling / correctieboeking (ARCHITECTURE.md §7.3) ----------
  const [toonPeiling, setToonPeiling] = useState(false);
  const [gemeten, setGemeten] = useState("");
  const [peilingNotitie, setPeilingNotitie] = useState("");
  const huidigVolume = tank?.huidig_volume_l ?? 0;
  const verschil = gemeten !== "" ? Number(gemeten) - huidigVolume : null;

  const peilingM = useMutation({
    mutationFn: () => {
      if (!tank || !tank.huidige_partij || verschil == null)
        throw new Error("Vul eerst een gemeten volume in.");
      const datum = format(new Date(), "yyyy-MM-dd");
      const basisNotitie = `Peiling: systeem toonde ${huidigVolume} L, gemeten ${Number(gemeten)} L.`;
      return boekTankboek({
        datum,
        partij: tank.huidige_partij,
        actie: "correctie",
        van_tank: verschil < 0 ? tankId : undefined,
        naar_tank: verschil > 0 ? tankId : undefined,
        volume_l: Math.abs(verschil),
        verantwoordelijke: invoerder,
        notitie: peilingNotitie ? `${basisNotitie} ${peilingNotitie}` : basisNotitie,
      });
    },
    onSuccess: (r) => {
      toast.success("Correctie geboekt ✓");
      if (r.waarschuwing) toast.warning(r.waarschuwing);
      qc.invalidateQueries({ queryKey: ["tanks"] });
      qc.invalidateQueries({ queryKey: ["tankboek", "tank", tankId] });
      setToonPeiling(false);
      setGemeten("");
      setPeilingNotitie("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const boekPeiling = () => {
    if (peilingM.isPending || verschil == null || verschil === 0) return;
    if (!invoerder.trim()) {
      toast.error("Vul je naam in als verantwoordelijke");
      return;
    }
    peilingM.mutate();
  };

  // ---------- reiniging (Fase 7 Blok D): twee tikken — methode kiezen = loggen
  const [toonReiniging, setToonReiniging] = useState(false);
  const [reinigingMiddel, setReinigingMiddel] = useState("");
  const reinigingM = useMutation({
    mutationFn: (methode: string) =>
      createKelderlog({
        datum: format(new Date(), "yyyy-MM-dd"),
        tank: tankId,
        partij: tank?.huidige_partij || null,
        actie: "reiniging",
        middel: reinigingMiddel || methode,
        notitie: `Methode: ${methode}`,
        ingevoerd_door: invoerder,
      }),
    onSuccess: () => {
      toast.success("Reiniging gelogd ✓");
      qc.invalidateQueries({ queryKey: ["kelderlog", "reiniging", tankId] });
      setToonReiniging(false);
      setReinigingMiddel("");
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
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setToonReiniging((v) => !v)}
                className={`flex h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold ${
                  toonReiniging
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-card"
                }`}
              >
                <SprayCan className="h-4 w-4" />
                Reiniging
              </button>
              {tank?.huidige_partij && (
                <button
                  type="button"
                  onClick={() => setToonPeiling((v) => !v)}
                  className={`flex h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold ${
                    toonPeiling
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-card"
                  }`}
                >
                  <Ruler className="h-4 w-4" />
                  Peiling
                </button>
              )}
              <Link
                to="/kelder/overhevelen"
                search={{ van: tankId }}
                className="flex h-11 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
              >
                <ArrowLeftRight className="h-4 w-4" />
                Overhevelen
              </Link>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Laatst gereinigd:{" "}
            {laatstGereinigd
              ? format(parseISO(laatstGereinigd), "d MMM yyyy", { locale: nl })
              : "geen reiniging gelogd"}
          </p>
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

        {/* Reiniging: twee tikken — methode tikken = loggen (Fase 7 Blok D) */}
        {toonReiniging && (
          <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Reiniging loggen — tik de methode
            </h2>
            <input
              value={reinigingMiddel}
              onChange={(e) => setReinigingMiddel(e.target.value)}
              className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
              placeholder="Middel (optioneel, bijv. soda 2%)"
            />
            <div className="grid grid-cols-2 gap-2">
              {REINIGING_METHODEN.map((methode) => (
                <button
                  key={methode}
                  type="button"
                  disabled={reinigingM.isPending}
                  onClick={() => reinigingM.mutate(methode)}
                  className="flex h-14 items-center justify-center rounded-xl border border-border bg-background text-sm font-semibold active:scale-[0.98] disabled:opacity-40"
                >
                  {reinigingM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : methode}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Peiling: gemeten volume invoeren → app stelt de correctieboeking voor
            (ARCHITECTURE.md §7.3). Alleen zinvol met een gekoppelde partij. */}
        {toonPeiling && tank && (
          <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Peiling
            </h2>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Gemeten volume (L)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={gemeten}
                onChange={(e) => setGemeten(e.target.value)}
                className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
                placeholder={`systeem toont ${Math.round(huidigVolume)}`}
              />
            </label>
            {verschil != null &&
              (verschil === 0 ? (
                <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm">
                  Klopt precies — geen correctie nodig.
                </p>
              ) : (
                <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm">
                  Verschil:{" "}
                  <strong>
                    {verschil > 0 ? "+" : ""}
                    {Math.round(verschil * 10) / 10} L
                  </strong>{" "}
                  — er wordt een correctie {verschil > 0 ? "naar boven" : "naar beneden"}{" "}
                  voorgesteld.
                </p>
              ))}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Verantwoordelijke</span>
              <input
                value={invoerder}
                onChange={(e) => setInvoerder(e.target.value)}
                className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
                placeholder="Je naam"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Notitie</span>
              <input
                value={peilingNotitie}
                onChange={(e) => setPeilingNotitie(e.target.value)}
                className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
                placeholder="Optioneel — bijv. reden van het verschil"
              />
            </label>
            <button
              type="button"
              onClick={boekPeiling}
              disabled={peilingM.isPending || verschil == null || verschil === 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {peilingM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Correctie boeken
            </button>
          </section>
        )}

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

        {/* Tankhistorie: tankboek + reinigingen gemengd op datum (Fase 7 Blok D) */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Tankhistorie ({(tankboekQ.data?.length ?? 0) + (reinigingQ.data?.length ?? 0)})
          </h2>
          {(reinigingQ.data ?? []).length > 0 && (
            <ul className="mb-1.5 space-y-1.5">
              {(reinigingQ.data ?? []).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-background px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      🧽 Reiniging{r.middel ? ` · ${r.middel}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(r.datum), "d MMM yyyy", { locale: nl })}
                      {r.notitie ? ` · ${r.notitie}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
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
