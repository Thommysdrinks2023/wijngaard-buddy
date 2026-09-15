import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { fetchRijen } from "@/lib/data";
import {
  BODEMVOCHT_OPTIES,
  createBodemObservatie,
  fetchBodemObservaties,
  GEBREK_OPTIES,
  type Bodemvocht,
  type Gebrek,
} from "@/lib/bodem-data";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/error-state";
import { Loader2 } from "lucide-react";

// Fase 7 Blok B — bodem-invoer volgens het twee-tikken-principe: tik een rij,
// tik een vochtklasse, klaar. pH/gebrek/notitie zijn optioneel verfijnen.
export const Route = createFileRoute("/bodem")({
  component: BodemPage,
  head: () => ({ meta: [{ title: "Bodem — Wijngaard" }] }),
});

const LS_LAATSTE_RIJ = "wg.bodem.laatsterij.v1";

const VOCHT_LABEL: Record<Bodemvocht, string> = {
  droog: "🌵 Droog",
  vochtig: "💧 Vochtig",
  nat: "💦 Nat",
  verzadigd: "🌊 Verzadigd",
};

function BodemPage() {
  const qc = useQueryClient();
  const [invoerder] = useInvoerder();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const obsQ = useQuery({ queryKey: ["bodem"], queryFn: fetchBodemObservaties });

  const [rijId, setRijId] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_LAATSTE_RIJ) ?? "";
    } catch {
      return "";
    }
  });
  const [ph, setPh] = useState("");
  const [gebrek, setGebrek] = useState<Gebrek | "">("");
  const [verslemping, setVerslemping] = useState(false);
  const [notitie, setNotitie] = useState("");

  const rijen = useMemo(
    () => [...(rijenQ.data ?? [])].sort((a, b) => a.rijnummer - b.rijnummer),
    [rijenQ.data],
  );
  const gekozenRij = rijen.find((r) => r.id === rijId);

  const opslaanM = useMutation({
    mutationFn: (bodemvocht: Bodemvocht) =>
      createBodemObservatie({
        rij: rijId,
        datum: format(new Date(), "yyyy-MM-dd"),
        bodemvocht,
        ph_veld: ph ? Number(ph.replace(",", ".")) : null,
        gebreksverschijnselen: gebrek,
        verslemping,
        notitie,
        ingevoerd_door: invoerder,
      }),
    onSuccess: () => {
      toast.success(`Bodemobservatie rij ${gekozenRij?.rijnummer} opgeslagen`);
      setPh("");
      setGebrek("");
      setVerslemping(false);
      setNotitie("");
      qc.invalidateQueries({ queryKey: ["bodem"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Opslaan mislukt"),
  });

  const recenteObs = (obsQ.data ?? []).slice(0, 5);

  return (
    <>
      <AppHeader title="Bodem" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        {obsQ.isError && <ErrorState error={obsQ.error} onRetry={() => obsQ.refetch()} />}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bodemobservatie</h1>
          <p className="text-sm text-muted-foreground">
            Tik een rij en een vochtklasse — de rest is optioneel. Bekijk het resultaat op de{" "}
            <Link to="/perceelkaart" className="text-primary underline-offset-2 hover:underline">
              perceelkaart
            </Link>
            .
          </p>
        </div>

        {/* Stap 1: rij */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            1. Rij {gekozenRij ? `— rij ${gekozenRij.rijnummer} (${gekozenRij.ras})` : ""}
          </h2>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
            {rijen.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setRijId(r.id);
                  try {
                    localStorage.setItem(LS_LAATSTE_RIJ, r.id);
                  } catch {
                    /* localStorage optioneel */
                  }
                }}
                className={`h-9 rounded-lg border text-xs font-medium tabular-nums ${
                  r.id === rijId
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {r.rijnummer}
              </button>
            ))}
          </div>
        </section>

        {/* Optioneel verfijnen */}
        <section className="space-y-2 rounded-xl border border-border bg-card p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Optioneel
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="pH (veld)"
              value={ph}
              onChange={(e) => setPh(e.target.value)}
              className="h-10 w-24 rounded-lg border border-input bg-background px-2 text-sm"
            />
            {GEBREK_OPTIES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGebrek(gebrek === g ? "" : g)}
                className={`h-10 rounded-lg border px-2.5 text-xs font-medium ${
                  gebrek === g
                    ? "border-warning bg-warning/15 text-warning"
                    : "border-border bg-background"
                }`}
              >
                {g}-gebrek
              </button>
            ))}
            <button
              type="button"
              onClick={() => setVerslemping(!verslemping)}
              className={`h-10 rounded-lg border px-2.5 text-xs font-medium ${
                verslemping
                  ? "border-warning bg-warning/15 text-warning"
                  : "border-border bg-background"
              }`}
            >
              Verslemping
            </button>
          </div>
          <input
            type="text"
            placeholder="Notitie (optioneel)"
            value={notitie}
            onChange={(e) => setNotitie(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
          />
        </section>

        {/* Stap 2: vochtklasse = opslaan */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            2. Bodemvocht — tikken = opslaan
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {BODEMVOCHT_OPTIES.map((v) => (
              <button
                key={v}
                type="button"
                disabled={!rijId || opslaanM.isPending}
                onClick={() => opslaanM.mutate(v)}
                className="flex h-16 items-center justify-center rounded-xl border border-border bg-card text-base font-semibold shadow-sm active:scale-[0.98] disabled:opacity-40"
              >
                {opslaanM.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : VOCHT_LABEL[v]}
              </button>
            ))}
          </div>
          {!rijId && <p className="text-xs text-muted-foreground">Kies eerst een rij hierboven.</p>}
        </section>

        {recenteObs.length > 0 && (
          <section className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent
            </h2>
            <ul className="space-y-1">
              {recenteObs.map((o) => {
                const rij = rijen.find((r) => r.id === o.rij);
                return (
                  <li
                    key={o.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
                  >
                    <span>
                      Rij {rij?.rijnummer ?? "?"} · {o.bodemvocht ?? "—"}
                      {o.ph_veld ? ` · pH ${o.ph_veld}` : ""}
                      {o.gebreksverschijnselen ? ` · ${o.gebreksverschijnselen}-gebrek` : ""}
                      {o.verslemping ? " · verslemping" : ""}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{o.datum}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
