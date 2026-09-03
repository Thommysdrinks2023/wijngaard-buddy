// Fase 17 Blok D — vooraf-planner. Puur client-side (drukveiligheid.ts),
// geen server-schrijfactie: dit scherm helpt kiezen, het echte starten van
// een run gebeurt op /pasteurisatie/run/nieuw (Blok F, lotnummerkoppeling).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  co2GehalteUitDruk,
  drukUitCo2Gehalte,
  maximaleCarbonatie,
  veiligheidsoordeel,
  verwachteDruk,
} from "@/lib/drukveiligheid";
import { puPerMinuut } from "@/lib/pasteurisatie";
import { fetchFlestypes } from "@/lib/flessen-data";
import { fetchSluitingen } from "@/lib/pasteurisatie-data";
import { maxDrukBekend, type PasteurisatieOordeel } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { StatusBadge } from "@/components/status-badge";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";

const OORDEEL_TOON: Record<PasteurisatieOordeel, "success" | "warning" | "destructive"> = {
  veilig: "success",
  marginaal: "warning",
  onveilig: "destructive",
};

export const Route = createFileRoute("/pasteurisatie/plannen")({
  component: PlannerPagina,
  head: () => ({ meta: [{ title: "Plannen — Pasteurisatie" }] }),
});

function PlannerPagina() {
  const flestypesQ = useQuery({
    queryKey: ["flestypes", { alleenActief: true }],
    queryFn: () => fetchFlestypes({ alleenActief: true }),
  });
  const sluitingenQ = useQuery({
    queryKey: ["sluitingen", { alleenActief: true }],
    queryFn: () => fetchSluitingen({ alleenActief: true }),
  });

  const [flestypeId, setFlestypeId] = useState("");
  const [sluitingId, setSluitingId] = useState("");
  const [vulvolumeMl, setVulvolumeMl] = useState("");
  const [carbonatieModus, setCarbonatieModus] = useState<"bar" | "gl">("bar");
  const [carbonatieWaarde, setCarbonatieWaarde] = useState("1.0");
  const [carbonatieRefTemp, setCarbonatieRefTemp] = useState("10");
  const [doeltemperatuur, setDoeltemperatuur] = useState("48");
  const [doelPuMin, setDoelPuMin] = useState("100");

  const gekozenFlestype = flestypesQ.data?.find((t) => t.id === flestypeId);
  const gekozenSluiting = sluitingenQ.data?.find((s) => s.id === sluitingId);
  const flesinhoudMl = gekozenFlestype?.inhoud_ml ?? 0;
  const refTemp = Number(carbonatieRefTemp || 10);

  // Live omrekening tussen bar-bij-temperatuur en g/L.
  const co2GehalteGl = useMemo(() => {
    const w = Number(carbonatieWaarde || 0);
    return carbonatieModus === "bar" ? co2GehalteUitDruk(w, refTemp) : w;
  }, [carbonatieModus, carbonatieWaarde, refTemp]);
  const equivalenteBarBij10 = useMemo(
    () =>
      carbonatieModus === "gl"
        ? drukUitCo2Gehalte(co2GehalteGl, 10)
        : Number(carbonatieWaarde || 0),
    [carbonatieModus, co2GehalteGl, carbonatieWaarde],
  );

  const kanBerekenen = flesinhoudMl > 0 && Number(vulvolumeMl) > 0 && Number(doeltemperatuur) > 0;

  const drukResultaat = useMemo(() => {
    if (!kanBerekenen) return null;
    return verwachteDruk({
      co2GehalteGl,
      flesinhoudMl,
      vulvolumeMl: Number(vulvolumeMl),
      doeltemperatuurC: Number(doeltemperatuur),
      vulTemperatuurC: refTemp,
    });
  }, [kanBerekenen, co2GehalteGl, flesinhoudMl, vulvolumeMl, doeltemperatuur, refTemp]);

  const sluitingMaxBekend = gekozenSluiting ? maxDrukBekend(gekozenSluiting) : false;
  const oordeel =
    drukResultaat && gekozenSluiting && sluitingMaxBekend
      ? veiligheidsoordeel(drukResultaat, gekozenSluiting.max_druk_bar)
      : null;

  const maxCarbonatieBij10 =
    gekozenSluiting && sluitingMaxBekend && flesinhoudMl > 0 && Number(vulvolumeMl) > 0
      ? maximaleCarbonatie(
          gekozenSluiting.max_druk_bar,
          Number(doeltemperatuur || 48),
          flesinhoudMl,
          Number(vulvolumeMl),
        )
      : null;

  // Benodigde houdtijd bij de gekozen doeltemperatuur om het PU-doel te
  // halen — puur als houdfase, met expliciete kanttekening (opwarmen/
  // afkoelen maken het in de praktijk korter).
  const houdtijdMinuten = useMemo(() => {
    const rate = puPerMinuut(Number(doeltemperatuur || 0));
    if (!(rate > 0)) return null;
    return Number(doelPuMin || 100) / rate;
  }, [doeltemperatuur, doelPuMin]);

  // Gevoeligheidscurve — druk (conservatieve bovengrens) over een reeks
  // doeltemperaturen bij verder gelijke instellingen, zodat je in één oogopslag
  // ziet hoeveel marge de gekozen temperatuur heeft t.o.v. de dopspecificatie.
  const gevoeligheidsdata = useMemo(() => {
    if (!kanBerekenen) return [];
    const punten: { temp: number; drukBovengrens: number }[] = [];
    for (let t = 30; t <= 65; t += 5) {
      const r = verwachteDruk({
        co2GehalteGl,
        flesinhoudMl,
        vulvolumeMl: Number(vulvolumeMl),
        doeltemperatuurC: t,
        vulTemperatuurC: refTemp,
      });
      punten.push({
        temp: t,
        drukBovengrens:
          r.drukGaugeBovengrensBar === Infinity
            ? NaN
            : Math.round(r.drukGaugeBovengrensBar * 100) / 100,
      });
    }
    return punten;
  }, [kanBerekenen, co2GehalteGl, flesinhoudMl, vulvolumeMl, refTemp]);

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  return (
    <>
      <AppHeader back title="Pasteurisatie plannen" subtitle="Drukveiligheid vooraf" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <OfflineWaarschuwing wat="het planningsscherm (flestypes en sluitingen)" />
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Flestype</span>
            <select
              value={flestypeId}
              onChange={(e) => setFlestypeId(e.target.value)}
              className={veldClass}
            >
              <option value="">Kies flestype…</option>
              {(flestypesQ.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.omschrijving || `${t.vorm} ${t.inhoud_ml} ml`}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Sluiting</span>
            <select
              value={sluitingId}
              onChange={(e) => setSluitingId(e.target.value)}
              className={veldClass}
            >
              <option value="">Kies sluiting…</option>
              {(sluitingenQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.naam}
                  {maxDrukBekend(s) ? ` (max ${s.max_druk_bar} bar)` : " (max. druk onbekend)"}
                </option>
              ))}
            </select>
            {gekozenSluiting && !sluitingMaxBekend && (
              <p className="mt-1 text-xs text-warning">
                De dopspecificatie van deze sluiting is niet vastgelegd — er kan geen
                veiligheidsoordeel worden gegeven totdat dat bekend is (zie VRAGEN VOOR THOMAS).
              </p>
            )}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Vulvolume (ml)</span>
            <input
              type="number"
              value={vulvolumeMl}
              onChange={(e) => setVulvolumeMl(e.target.value)}
              className={veldClass}
              placeholder={flesinhoudMl ? `bijv. ${Math.round(flesinhoudMl * 0.9)}` : "bijv. 225"}
            />
            {flesinhoudMl > 0 && Number(vulvolumeMl) > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Kopruimte bij vullen: {(flesinhoudMl - Number(vulvolumeMl)).toFixed(0)} ml (
                {(((flesinhoudMl - Number(vulvolumeMl)) / flesinhoudMl) * 100).toFixed(1)}%)
              </p>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Carbonatie als</span>
              <select
                value={carbonatieModus}
                onChange={(e) => setCarbonatieModus(e.target.value as "bar" | "gl")}
                className={veldClass}
              >
                <option value="bar">bar bij temperatuur</option>
                <option value="gl">g/L</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">
                {carbonatieModus === "bar" ? "Druk (bar gauge)" : "CO2-gehalte (g/L)"}
              </span>
              <input
                type="number"
                step="0.01"
                value={carbonatieWaarde}
                onChange={(e) => setCarbonatieWaarde(e.target.value)}
                className={veldClass}
              />
            </label>
          </div>
          {carbonatieModus === "bar" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Gemeten bij temperatuur (°C)</span>
              <input
                type="number"
                value={carbonatieRefTemp}
                onChange={(e) => setCarbonatieRefTemp(e.target.value)}
                className={veldClass}
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            {carbonatieModus === "bar"
              ? `Komt overeen met ${co2GehalteGl.toFixed(2)} g/L CO2.`
              : `Komt overeen met ${equivalenteBarBij10.toFixed(2)} bar gauge bij 10 °C.`}
          </p>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Doeltemperatuur (°C)</span>
            <input
              type="number"
              value={doeltemperatuur}
              onChange={(e) => setDoeltemperatuur(e.target.value)}
              className={veldClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Doel-PU (ondergrens)</span>
            <input
              type="number"
              value={doelPuMin}
              onChange={(e) => setDoelPuMin(e.target.value)}
              className={veldClass}
            />
          </label>
        </section>

        {drukResultaat && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Verwachte druk bij {doeltemperatuur} °C
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Gekoppeld model</p>
                <p className="text-lg font-bold tabular-nums">
                  {drukResultaat.drukGaugeBar.toFixed(2)} bar
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Conservatieve bovengrens</p>
                <p className="text-lg font-bold tabular-nums">
                  {drukResultaat.drukGaugeBovengrensBar === Infinity
                    ? "∞"
                    : `${drukResultaat.drukGaugeBovengrensBar.toFixed(2)} bar`}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Bovengrens = alsof geen CO2 al naar de kopruimte is overgegaan — overschat de druk
              altijd een beetje, en wordt gebruikt voor het veiligheidsoordeel.
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-muted-foreground">CO2-bijdrage</p>
                <p className="font-semibold tabular-nums">
                  {drukResultaat.bijdrage.co2Bar === Infinity
                    ? "∞"
                    : `${drukResultaat.bijdrage.co2Bar.toFixed(2)} bar`}
                </p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-muted-foreground">Waterdamp</p>
                <p className="font-semibold tabular-nums">
                  {drukResultaat.bijdrage.waterdampBar.toFixed(3)} bar
                </p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-muted-foreground">Thermische uitzetting</p>
                <p className="font-semibold tabular-nums">
                  +{((drukResultaat.thermischeUitzettingsfactor - 1) * 100).toFixed(2)}%
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Kopruimte bij {doeltemperatuur} °C: {drukResultaat.kopruimteMlBijDoeltemp.toFixed(1)}{" "}
              ml
              {drukResultaat.kopruimteOpgebruikt && (
                <span className="font-semibold text-destructive"> — GEEN RUIMTE MEER OVER</span>
              )}
            </p>

            {oordeel && (
              <div
                className={`rounded-xl border p-3 ${
                  oordeel.oordeel === "veilig"
                    ? "border-success/40 bg-success/10"
                    : oordeel.oordeel === "marginaal"
                      ? "border-warning/50 bg-warning/10"
                      : "border-destructive/40 bg-destructive/10"
                }`}
              >
                <StatusBadge
                  label={
                    oordeel.oordeel === "veilig"
                      ? "Veilig"
                      : oordeel.oordeel === "marginaal"
                        ? "Marginaal"
                        : "Onveilig"
                  }
                  emoji={
                    oordeel.oordeel === "veilig"
                      ? "✅"
                      : oordeel.oordeel === "marginaal"
                        ? "⚠️"
                        : "🛑"
                  }
                  toon={OORDEEL_TOON[oordeel.oordeel]}
                />
                <p className="mt-2 text-sm">{oordeel.toelichting}</p>
                {gekozenSluiting && sluitingMaxBekend && (
                  <div className="mt-3">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${
                          oordeel.oordeel === "veilig"
                            ? "bg-success"
                            : oordeel.oordeel === "marginaal"
                              ? "bg-warning"
                              : "bg-destructive"
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            ((drukResultaat?.drukGaugeBovengrensBar ?? 0) /
                              gekozenSluiting.max_druk_bar) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {drukResultaat?.drukGaugeBovengrensBar === Infinity
                        ? "∞"
                        : drukResultaat?.drukGaugeBovengrensBar.toFixed(2)}{" "}
                      / {gekozenSluiting.max_druk_bar} bar (dopspecificatie {gekozenSluiting.naam})
                    </p>
                  </div>
                )}
              </div>
            )}

            {!sluitingMaxBekend && gekozenSluiting && (
              <p className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm">
                Geen dopspecificatie bekend voor {gekozenSluiting.naam} — er kan geen oordeel
                gegeven worden. Vul de specificatie aan bij Sluitingen (Instellingen) zodra bekend.
              </p>
            )}

            {gevoeligheidsdata.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Drukmarge bij verschillende doeltemperaturen
                </h3>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={gevoeligheidsdata}
                      margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="temp" tick={{ fontSize: 10 }} unit="°C" />
                      <YAxis tick={{ fontSize: 10 }} unit=" bar" width={56} />
                      <Tooltip formatter={(v: number) => [`${v.toFixed(2)} bar`, "Bovengrens"]} />
                      {gekozenSluiting && sluitingMaxBekend && (
                        <ReferenceLine
                          y={gekozenSluiting.max_druk_bar}
                          stroke="#d64444"
                          strokeDasharray="4 4"
                          label={{
                            value: "dopspecificatie",
                            fontSize: 10,
                            position: "insideTopLeft",
                          }}
                        />
                      )}
                      <ReferenceLine
                        x={Number(doeltemperatuur)}
                        stroke="#94a3b8"
                        strokeDasharray="2 2"
                      />
                      <Line
                        type="monotone"
                        dataKey="drukBovengrens"
                        stroke="#4a8c5c"
                        dot={{ r: 2 }}
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bij overige instellingen ongewijzigd — alleen de doeltemperatuur varieert.
                </p>
              </div>
            )}

            {oordeel && oordeel.oordeel !== "veilig" && (
              <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
                <p className="font-semibold">Wat zou dit veiliger maken?</p>
                <ul className="list-inside list-disc space-y-1">
                  {maxCarbonatieBij10 != null && (
                    <li>
                      Lagere carbonatie: maximaal ongeveer{" "}
                      <strong>{maxCarbonatieBij10.toFixed(2)} bar bij 10 °C</strong> voor deze
                      sluiting bij deze vulling en temperatuur (nog niet gevalideerd tegen een echte
                      meting).
                    </li>
                  )}
                  <li>
                    Lagere doeltemperatuur — kost meer houdtijd om hetzelfde PU-doel te halen (zie
                    hieronder).
                  </li>
                  <li>
                    Lager vulniveau (meer kopruimte) — elke ml extra kopruimte verkleint de bijdrage
                    van thermische uitzetting.
                  </li>
                  <li>Een sluiting met een hogere, bekende drukspecificatie.</li>
                </ul>
              </div>
            )}
          </section>
        )}

        {houdtijdMinuten != null && (
          <section className="rounded-2xl border border-border bg-card p-4 text-sm">
            <p>
              Bij een constante {doeltemperatuur} °C is de HOUDFASE alleen{" "}
              <strong>{houdtijdMinuten.toFixed(0)} minuten</strong> nodig om {doelPuMin} PU te
              halen.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dit is een naïeve berekening (houdfase alleen, bij een constante temperatuur). In de
              praktijk dragen opwarmen en afkoelen ook PU bij, dus de werkelijk benodigde houdtijd
              is KORTER dan dit getal — zie Blok A/E voor de live berekening over de volledige
              curve.
            </p>
          </section>
        )}

        <Link
          to="/pasteurisatie"
          className="block rounded-xl border border-border bg-card p-3 text-center text-sm font-semibold"
        >
          ← Terug naar pasteurisatie
        </Link>
      </div>
    </>
  );
}
