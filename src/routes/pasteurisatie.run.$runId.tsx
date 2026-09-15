// Fase 17 Blok E — live monitor. Dit scherm staat open tijdens een run.
// Meldingen liften mee op de bestaande signaallaag (Fase 10): een
// drempeloverschrijding schrijft een sensor_alerts-record met de
// naamconventie uit Fase 14 §8.4, en de bestaande Vandaag-widget/
// sensorAlertSignalen() pikt dat vanzelf op — geen nieuwe signaalproducent
// nodig.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getPb } from "@/lib/data";
import {
  boekPasteurisatieMeting,
  fetchPasteurisatieMetingen,
  fetchPasteurisatieRunById,
  rondPasteurisatieRunAf,
} from "@/lib/pasteurisatie-data";
import { fetchSluitingen } from "@/lib/pasteurisatie-data";
import { puOverCurve, voorspelPuVerloop, type TemperatuurMeting } from "@/lib/pasteurisatie";
import { verwachteDruk, veiligheidsoordeel } from "@/lib/drukveiligheid";
import { maxDrukBekend, PASTEURISATIE_OORDELEN, type PasteurisatieOordeel } from "@/lib/types";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";
import { Loader2, Thermometer } from "lucide-react";

const OORDEEL_TOON: Record<PasteurisatieOordeel, "success" | "warning" | "destructive"> = {
  veilig: "success",
  marginaal: "warning",
  onveilig: "destructive",
  onbekend: "warning",
};

function oordeelBadge(oordeel: PasteurisatieOordeel | null | undefined) {
  const def = PASTEURISATIE_OORDELEN.find((o) => o.value === oordeel);
  if (!def) return null;
  return <StatusBadge label={def.label} emoji={def.emoji} toon={OORDEEL_TOON[def.value]} />;
}

export const Route = createFileRoute("/pasteurisatie/run/$runId")({
  component: MonitorPagina,
  head: () => ({ meta: [{ title: "Live monitor — Pasteurisatie" }] }),
});

const POLL_MS = 10_000;
const SENSORUITVAL_MINUTEN = 2;

// Schrijft — indien nog niet gedaan — een sensor_alerts-record voor deze
// melding. De unieke index op signaal_id (Fase 14) voorkomt dubbele
// meldingen: een tweede poging op hetzelfde signaal faalt stil.
async function meldEenmalig(signaalId: string, titel: string, waarom: string, ernst: string) {
  const pb = getPb();
  if (!pb) return;
  try {
    await pb.collection("sensor_alerts").create({
      signaal_id: signaalId,
      ernst,
      titel,
      waarom,
      bron_type: "pasteurisatie_run",
      bron_id: signaalId.split("-")[1] ?? "",
      actief: true,
    });
  } catch {
    // Al gemeld (unieke index) of geen verbinding — negeren, dit is een
    // best-effort melding, geen kritiek pad.
  }
}

function MonitorPagina() {
  const { runId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [invoerder, setInvoerder] = useInvoerder();

  const runQ = useQuery({
    queryKey: ["pasteurisatie-run", runId],
    queryFn: () => fetchPasteurisatieRunById(runId),
    refetchInterval: POLL_MS,
  });
  const metingenQ = useQuery({
    queryKey: ["pasteurisatie-metingen", runId],
    queryFn: () => fetchPasteurisatieMetingen(runId),
    refetchInterval: POLL_MS,
  });
  const sluitingenQ = useQuery({ queryKey: ["sluitingen"], queryFn: () => fetchSluitingen() });

  const run = runQ.data;
  const sluiting = sluitingenQ.data?.find((s) => s.id === run?.sluiting);

  // Alleen de referentiefles telt voor de PU — sensor_positie/label op de
  // run zegt welke dat is (default "referentiefles", zie Blok C).
  const referentieLabel = run?.sensor_positie || "referentiefles";
  const referentieMetingen: TemperatuurMeting[] = useMemo(
    () =>
      (metingenQ.data ?? [])
        .filter((m) => m.sensorLabel === referentieLabel)
        .map((m) => ({ tijdstip: m.tijdstip, temperatuurC: m.temperatuurC })),
    [metingenQ.data, referentieLabel],
  );
  const andereSensoren = useMemo(
    () =>
      Array.from(new Set((metingenQ.data ?? []).map((m) => m.sensorLabel))).filter(
        (l) => l !== referentieLabel,
      ),
    [metingenQ.data, referentieLabel],
  );

  const puResultaat = useMemo(
    () => puOverCurve(referentieMetingen, { doelPu: run?.doel_pu_min ?? 100 }),
    [referentieMetingen, run?.doel_pu_min],
  );
  const voorspelling = useMemo(
    () => voorspelPuVerloop(referentieMetingen, run?.doel_pu_min ?? 100),
    [referentieMetingen, run?.doel_pu_min],
  );

  const laatsteMeting = referentieMetingen[referentieMetingen.length - 1];
  const drukNu = useMemo(() => {
    if (!laatsteMeting || !run?.vulvolume_ml || !run.co2_gehalte_gl) return null;
    // flesinhoud komt niet los mee op de run (zit op het flestype) — we
    // gebruiken hier vulvolume + 10% als benadering als er geen flestype-
    // relatie is opgehaald; in de praktijk is de flesinhoud al bekend uit
    // de planner en op de run vastgelegd via vulvolume_ml.
    return verwachteDruk({
      co2GehalteGl: run.co2_gehalte_gl,
      flesinhoudMl: run.vulvolume_ml / 0.9,
      vulvolumeMl: run.vulvolume_ml,
      doeltemperatuurC: laatsteMeting.temperatuurC,
    });
  }, [laatsteMeting, run?.vulvolume_ml, run?.co2_gehalte_gl]);
  const drukOordeelNu =
    drukNu && sluiting && maxDrukBekend(sluiting)
      ? veiligheidsoordeel(drukNu, sluiting.max_druk_bar)
      : null;

  // ---------- Meldingen (liften op de bestaande signaallaag) ----------
  const gemeld = useRef(new Set<string>());
  useEffect(() => {
    if (!run || run.status !== "actief") return;

    if (puResultaat.totalePu >= run.doel_pu_min) {
      const id = `pasteurisatie_run-${runId}-pu-ondergrens`;
      if (!gemeld.current.has(id)) {
        gemeld.current.add(id);
        void meldEenmalig(
          id,
          "Doel-PU (ondergrens) bereikt",
          `Run ${run.lotnummer}: ${puResultaat.totalePu.toFixed(0)} PU bereikt (doel ${run.doel_pu_min}-${run.doel_pu_max}).`,
          "info",
        );
      }
    }
    if (puResultaat.totalePu >= run.doel_pu_max) {
      const id = `pasteurisatie_run-${runId}-pu-bovengrens`;
      if (!gemeld.current.has(id)) {
        gemeld.current.add(id);
        void meldEenmalig(
          id,
          "Bovengrens doel-PU bereikt of overschreden",
          `Run ${run.lotnummer}: ${puResultaat.totalePu.toFixed(0)} PU — overweeg af te ronden.`,
          "waarschuwing",
        );
      }
    }
    if (drukOordeelNu && drukOordeelNu.oordeel !== "veilig") {
      const id = `pasteurisatie_run-${runId}-druk-marge`;
      if (!gemeld.current.has(id)) {
        gemeld.current.add(id);
        void meldEenmalig(
          id,
          "Drukmarge overschreden",
          `Run ${run.lotnummer}: ${drukOordeelNu.toelichting}`,
          drukOordeelNu.oordeel === "onveilig" ? "kritiek" : "waarschuwing",
        );
      }
    }
    if (laatsteMeting) {
      const minutenSinds = (Date.now() - laatsteMeting.tijdstip.getTime()) / 60000;
      if (minutenSinds > SENSORUITVAL_MINUTEN) {
        const id = `pasteurisatie_run-${runId}-sensor-uitval`;
        if (!gemeld.current.has(id)) {
          gemeld.current.add(id);
          void meldEenmalig(
            id,
            "Sensoruitval",
            `Run ${run.lotnummer}: geen meting van de referentiefles binnen ${SENSORUITVAL_MINUTEN} minuten. Een monitor die stilletjes stopt is gevaarlijker dan geen monitor — controleer de sensor of voer handmatig in.`,
            "kritiek",
          );
        }
      } else {
        gemeld.current.delete(`pasteurisatie_run-${runId}-sensor-uitval`);
      }
    }
  }, [run, puResultaat, drukOordeelNu, laatsteMeting, runId]);

  // ---------- Handmatige invoer ----------
  const [handmatigeTemp, setHandmatigeTemp] = useState("");
  const metingM = useMutation({
    mutationFn: () =>
      boekPasteurisatieMeting({
        run_id: runId,
        temperatuur_c: Number(handmatigeTemp),
        sensor_label: referentieLabel,
      }),
    onSuccess: () => {
      setHandmatigeTemp("");
      qc.invalidateQueries({ queryKey: ["pasteurisatie-metingen", runId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------- Afronden ----------
  const [afrondenOpen, setAfrondenOpen] = useState(false);
  const afrondenM = useMutation({
    mutationFn: () =>
      rondPasteurisatieRunAf({
        run_id: runId,
        totale_pu: puResultaat.totalePu,
        pu_opwarm: puResultaat.puOpwarm,
        pu_houd: puResultaat.puHoud,
        pu_afkoel: puResultaat.puAfkoel,
        piektemperatuur_c: puResultaat.piektemperatuurC,
        meetgaten: puResultaat.gaten.length,
        uitgevoerd_door: invoerder,
        ingevoerd_door: invoerder,
      }),
    onSuccess: () => {
      toast.success("Run afgerond ✓");
      qc.invalidateQueries({ queryKey: ["pasteurisatie-run", runId] });
      navigate({ to: "/pasteurisatie/run/$runId/certificaat", params: { runId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (runQ.isError || (runQ.isFetched && !run)) {
    return (
      <>
        <AppHeader back title="Pasteurisatie" />
        <div className="mx-auto max-w-screen-md px-3 py-4">
          <ErrorState
            message="Run niet gevonden of geen verbinding."
            onRetry={() => runQ.refetch()}
          />
        </div>
      </>
    );
  }
  if (!run) return null;

  const chartData = referentieMetingen.map((m) => ({
    tijd: m.tijdstip.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }),
    temperatuur: m.temperatuurC,
  }));
  let cumulatief = 0;
  const puChartData: { tijd: string; pu: number }[] = [];
  for (let i = 0; i < referentieMetingen.length; i++) {
    if (i > 0) {
      const deel = puOverCurve(referentieMetingen.slice(0, i + 1));
      cumulatief = deel.totalePu;
    }
    puChartData.push({
      tijd: referentieMetingen[i].tijdstip.toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      pu: Math.round(cumulatief * 10) / 10,
    });
  }

  return (
    <>
      <AppHeader
        back
        title={`Run — lot ${run.lotnummer}`}
        subtitle={run.status === "actief" ? "Live monitor" : "Overzicht"}
      />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <OfflineWaarschuwing wat="de rungegevens" />
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={
              run.status === "actief"
                ? "Actief"
                : run.status === "afgerond"
                  ? "Afgerond"
                  : run.status === "afgebroken"
                    ? "Afgebroken"
                    : "Gepland"
            }
            emoji={run.status === "actief" ? "🔴" : run.status === "afgerond" ? "✅" : undefined}
            toon={
              run.status === "actief"
                ? "info"
                : run.status === "afgebroken"
                  ? "destructive"
                  : "neutraal"
            }
          />
          {oordeelBadge(run.veiligheidsoordeel)}
        </div>

        {!puResultaat.betrouwbaar && (
          <p className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm">
            {puResultaat.gaten.length} meetgat(en) gevonden — de PU-berekening is minder zeker.
            Grootste gat: {Math.max(...puResultaat.gaten.map((g) => g.minuten)).toFixed(0)} minuten.
          </p>
        )}

        {/* PU-teller */}
        <section className="rounded-2xl border border-border bg-card p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Opgebouwde PU
          </p>
          <p
            className={`text-5xl font-bold tabular-nums ${
              puResultaat.totalePu >= run.doel_pu_min && puResultaat.totalePu <= run.doel_pu_max
                ? "text-success"
                : puResultaat.totalePu > run.doel_pu_max
                  ? "text-warning"
                  : ""
            }`}
          >
            {puResultaat.totalePu.toFixed(0)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Doelband: {run.doel_pu_min}–{run.doel_pu_max} PU
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {voorspelling.mogelijk
              ? `Verwacht ondergrens-doel te bereiken over ${voorspelling.resterendeMinuten.toFixed(0)} min (bij gelijkblijvende temperatuur).`
              : `Nog niet te voorspellen: ${voorspelling.reden}`}
          </p>
        </section>

        {/* Temperatuurcurve */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Temperatuur — referentiefles ({referentieLabel})
            {andereSensoren.length > 0 && (
              <span className="font-normal normal-case">
                {" "}
                · overig: {andereSensoren.join(", ")}
              </span>
            )}
          </h2>
          {referentieMetingen.length === 0 ? (
            <EmptyState
              message={
                run.status === "actief"
                  ? "Nog geen metingen binnen — zodra de sensor meldt of je handmatig invoert, verschijnt de curve hier."
                  : "Geen metingen vastgelegd voor deze run."
              }
              icon={<Thermometer className="h-6 w-6" />}
            />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tijd" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="°C" />
                  <Tooltip />
                  <Legend />
                  {run.doeltemperatuur_c && (
                    <ReferenceArea
                      y1={run.doeltemperatuur_c - 1}
                      y2={run.doeltemperatuur_c + 1}
                      fill="#4a8c5c"
                      fillOpacity={0.08}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="temperatuur"
                    name="Referentiefles"
                    stroke="#4a8c5c"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Cumulatieve PU-curve */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            PU-opbouw over de tijd
          </h2>
          {puChartData.length === 0 ? (
            <EmptyState
              message="Nog geen PU-opbouw om te tonen — die verschijnt zodra er metingen binnenkomen."
              icon={<Thermometer className="h-6 w-6" />}
            />
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={puChartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tijd" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <ReferenceArea
                    y1={run.doel_pu_min}
                    y2={run.doel_pu_max}
                    fill="#c9b84c"
                    fillOpacity={0.15}
                  />
                  <Line
                    type="monotone"
                    dataKey="pu"
                    name="Cumulatieve PU"
                    stroke="#c9b84c"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Live drukschatting */}
        {drukNu && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Live drukschatting bij {laatsteMeting?.temperatuurC.toFixed(1)} °C
            </h2>
            <p className="text-2xl font-bold tabular-nums">
              {drukNu.drukGaugeBovengrensBar === Infinity
                ? "∞"
                : drukNu.drukGaugeBovengrensBar.toFixed(2)}{" "}
              bar
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                (conservatieve bovengrens)
              </span>
            </p>
            {sluiting && maxDrukBekend(sluiting) ? (
              <p className="mt-1 text-sm">
                Dopspecificatie {sluiting.naam}: {sluiting.max_druk_bar} bar
              </p>
            ) : (
              <p className="mt-1 text-sm text-warning">
                Geen dopspecificatie bekend — geen oordeel mogelijk.
              </p>
            )}
            {drukOordeelNu && drukOordeelNu.oordeel !== "veilig" && (
              <p
                className={`mt-2 rounded-lg p-2 text-sm font-semibold ${
                  drukOordeelNu.oordeel === "onveilig"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-warning/10 text-warning"
                }`}
              >
                {drukOordeelNu.oordeel === "onveilig" ? "🛑" : "⚠️"} {drukOordeelNu.toelichting}
              </p>
            )}
          </section>
        )}

        {/* Handmatige invoer */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Handmatige temperatuurinvoer
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Voor als er nog geen sensor is aangesloten of hij is uitgevallen — meet met een
            thermometer en voer hier in.
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.1"
              value={handmatigeTemp}
              onChange={(e) => setHandmatigeTemp(e.target.value)}
              className="h-12 flex-1 rounded-xl border border-input bg-background px-3 text-base"
              placeholder="°C"
            />
            <button
              disabled={!handmatigeTemp || metingM.isPending}
              onClick={() => metingM.mutate()}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {metingM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Vastleggen
            </button>
          </div>
        </section>

        {run.status === "actief" && (
          <>
            {!afrondenOpen ? (
              <button
                onClick={() => setAfrondenOpen(true)}
                className="h-14 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground"
              >
                Run afronden
              </button>
            ) : (
              <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
                <p className="text-sm">
                  Definitieve PU over de volledige curve (incl. afkoeling):{" "}
                  <strong>{puResultaat.totalePu.toFixed(1)}</strong> (opwarm{" "}
                  {puResultaat.puOpwarm.toFixed(1)} / houd {puResultaat.puHoud.toFixed(1)} / afkoel{" "}
                  {puResultaat.puAfkoel.toFixed(1)})
                </p>
                {!puResultaat.betrouwbaar && (
                  <p className="text-sm font-semibold text-warning">
                    Let op: {puResultaat.gaten.length} meetgat(en) tijdens deze run.
                  </p>
                )}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Naam (invoerder)</span>
                  <input
                    value={invoerder}
                    onChange={(e) => setInvoerder(e.target.value)}
                    className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAfrondenOpen(false)}
                    className="h-12 flex-1 rounded-xl border border-border text-sm font-semibold"
                  >
                    Terug
                  </button>
                  <button
                    disabled={afrondenM.isPending}
                    onClick={() => afrondenM.mutate()}
                    className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {afrondenM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Bevestig en rond af
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {run.status === "afgerond" && (
          <div className="rounded-2xl border border-success/40 bg-success/10 p-4 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              Afgerond: {run.totale_pu?.toFixed(1)} PU
              {oordeelBadge(run.veiligheidsoordeel)}
            </p>
            <Link
              to="/pasteurisatie/run/$runId/certificaat"
              params={{ runId }}
              className="mt-2 inline-block text-primary underline-offset-2 hover:underline"
            >
              Certificaat bekijken →
            </Link>
          </div>
        )}

        <Link to="/pasteurisatie" className="block text-center text-sm text-muted-foreground">
          ← Terug naar runoverzicht
        </Link>
      </div>
    </>
  );
}
