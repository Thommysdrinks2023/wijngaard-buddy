// Fase 17 Blok F — run starten op lotnummer. Zoekt de partij op, toont ter
// bevestiging eigenaar/product/laatste logboekregels, en biedt bij een
// onbekend lotnummer aan een "alleen bottelen"-partij aan te maken — nooit
// een losse run zonder koppeling.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { fetchKelderlog } from "@/lib/kelder-data";
import { fetchPartijByLotnummer } from "@/lib/partijen-data";
import { fetchEigenaars } from "@/lib/kelder-data";
import { fetchFlestypes, fetchFlessenStanden } from "@/lib/flessen-data";
import { fetchSluitingen, startPasteurisatieRun } from "@/lib/pasteurisatie-data";
import { co2GehalteUitDruk } from "@/lib/drukveiligheid";
import { verwachteDruk, veiligheidsoordeel } from "@/lib/drukveiligheid";
import { eigenaarLabel, maxDrukBekend, PRODUCT_SOORTEN, type ProductSoort } from "@/lib/types";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { StatusBadge } from "@/components/status-badge";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";
import { Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/pasteurisatie/run/nieuw")({
  component: RunStartenPagina,
  head: () => ({ meta: [{ title: "Run starten — Pasteurisatie" }] }),
});

function RunStartenPagina() {
  const navigate = useNavigate();
  const [invoerder, setInvoerder] = useInvoerder();

  const [lotnummer, setLotnummer] = useState("");
  const [gezocht, setGezocht] = useState(false);

  const partijQ = useQuery({
    queryKey: ["partij-op-lotnummer", lotnummer],
    queryFn: () => fetchPartijByLotnummer(lotnummer),
    enabled: gezocht && lotnummer.length > 0,
  });
  const logboekQ = useQuery({
    queryKey: ["kelderlog", partijQ.data?.id],
    queryFn: () => fetchKelderlog(partijQ.data!.id),
    enabled: !!partijQ.data,
  });
  const eigenaarsQ = useQuery({ queryKey: ["eigenaars"], queryFn: fetchEigenaars });
  const flestypesQ = useQuery({
    queryKey: ["flestypes", { alleenActief: true }],
    queryFn: () => fetchFlestypes({ alleenActief: true }),
  });
  const standenQ = useQuery({ queryKey: ["flessen-standen"], queryFn: fetchFlessenStanden });
  const sluitingenQ = useQuery({
    queryKey: ["sluitingen", { alleenActief: true }],
    queryFn: () => fetchSluitingen({ alleenActief: true }),
  });

  const eigenaarNaam = (id?: string | null) =>
    id
      ? eigenaarsQ.data?.find((e) => e.id === id)
        ? eigenaarLabel(eigenaarsQ.data.find((e) => e.id === id)!)
        : ""
      : "";

  // Nieuwe "alleen bottelen"-partij, als het lotnummer onbekend is.
  const [nieuweNaam, setNieuweNaam] = useState("");
  const [nieuweJaargang, setNieuweJaargang] = useState(String(new Date().getFullYear()));
  const [nieuweEigenaar, setNieuweEigenaar] = useState("");

  // Run-parameters
  const [productSoort, setProductSoort] = useState<ProductSoort>("wijn");
  const [flestypeId, setFlestypeId] = useState("");
  const [sluitingId, setSluitingId] = useState("");
  const [aantalFlessen, setAantalFlessen] = useState("");
  const [vulvolumeMl, setVulvolumeMl] = useState("");
  const [carbonatieBar, setCarbonatieBar] = useState("1.0");
  const [doeltemperatuur, setDoeltemperatuur] = useState("48");
  const [doelPuMin, setDoelPuMin] = useState("100");
  const [doelPuMax, setDoelPuMax] = useState("150");
  const [sensorPositie, setSensorPositie] = useState("referentiefles");
  const [akkoordOndanksOordeel, setAkkoordOndanksOordeel] = useState(false);

  const gekozenFlestype = flestypesQ.data?.find((t) => t.id === flestypeId);
  const gekozenSluiting = sluitingenQ.data?.find((s) => s.id === sluitingId);
  const flesinhoudMl = gekozenFlestype?.inhoud_ml ?? 0;
  const co2GehalteGl = co2GehalteUitDruk(Number(carbonatieBar || 0), 10);

  const drukResultaat =
    flesinhoudMl > 0 && Number(vulvolumeMl) > 0 && Number(doeltemperatuur) > 0
      ? verwachteDruk({
          co2GehalteGl,
          flesinhoudMl,
          vulvolumeMl: Number(vulvolumeMl),
          doeltemperatuurC: Number(doeltemperatuur),
        })
      : null;
  const sluitingMaxBekend = gekozenSluiting ? maxDrukBekend(gekozenSluiting) : false;
  const oordeel =
    drukResultaat && gekozenSluiting && sluitingMaxBekend
      ? veiligheidsoordeel(drukResultaat, gekozenSluiting.max_druk_bar)
      : null;

  const flessenStand = flestypeId ? (standenQ.data?.[flestypeId] ?? 0) : null;
  const flessenTekort = flessenStand != null && Number(aantalFlessen || 0) > flessenStand;

  const startM = useMutation({
    mutationFn: () =>
      startPasteurisatieRun({
        lotnummer,
        partij: partijQ.data?.id,
        nieuwe_partij: !partijQ.data
          ? { naam: nieuweNaam || lotnummer, jaargang: Number(nieuweJaargang) }
          : undefined,
        eigenaar: partijQ.data?.eigenaar ?? nieuweEigenaar ?? undefined,
        product_soort: productSoort,
        flestype: flestypeId || undefined,
        sluiting: sluitingId || undefined,
        aantal_flessen: aantalFlessen ? Number(aantalFlessen) : undefined,
        vulvolume_ml: vulvolumeMl ? Number(vulvolumeMl) : undefined,
        co2_gehalte_gl: co2GehalteGl,
        doel_pu_min: Number(doelPuMin),
        doel_pu_max: Number(doelPuMax),
        doeltemperatuur_c: Number(doeltemperatuur),
        berekende_max_druk_bar: gekozenSluiting?.max_druk_bar || undefined,
        veiligheidsoordeel: oordeel?.oordeel,
        oordeel_geaccepteerd_door: oordeel && oordeel.oordeel !== "veilig" ? invoerder : undefined,
        sensor_positie: sensorPositie,
        uitgevoerd_door: invoerder,
        ingevoerd_door: invoerder,
      }),
    onSuccess: (r) => {
      toast.success(r.partij_aangemaakt ? "Nieuwe partij + run aangemaakt ✓" : "Run gestart ✓");
      navigate({ to: "/pasteurisatie/run/$runId", params: { runId: r.run_id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";
  const magStarten =
    lotnummer &&
    Number(doeltemperatuur) > 0 &&
    oordeel?.oordeel !== "onbekend" &&
    (!oordeel || oordeel.oordeel === "veilig" || akkoordOndanksOordeel) &&
    (partijQ.data || nieuweNaam);

  return (
    <>
      <AppHeader back title="Run starten" subtitle="Op lotnummer" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <OfflineWaarschuwing wat="de lijsten (flestypes, sluitingen, flessenvoorraad)" />
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            1. Partij
          </h2>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Lotnummer</span>
            <div className="flex gap-2">
              <input
                value={lotnummer}
                onChange={(e) => {
                  setLotnummer(e.target.value);
                  setGezocht(false);
                }}
                className={veldClass}
                placeholder="bijv. L26-JOH-01"
              />
              <button
                onClick={() => setGezocht(true)}
                disabled={!lotnummer}
                className="flex h-12 items-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Search className="h-4 w-4" /> Zoeken
              </button>
            </div>
          </label>

          {gezocht && partijQ.isFetching && (
            <p className="mt-2 text-sm text-muted-foreground">Zoeken…</p>
          )}

          {gezocht && !partijQ.isFetching && partijQ.data && (
            <div className="mt-3 rounded-xl border border-success/40 bg-success/10 p-3 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <StatusBadge label="Partij gevonden" emoji="✅" toon="success" />
                {partijQ.data.naam} ({partijQ.data.jaargang})
              </p>
              <p className="text-muted-foreground">
                Eigenaar: {eigenaarNaam(partijQ.data.eigenaar) || "onbekend"} · status:{" "}
                {partijQ.data.status}
              </p>
              {logboekQ.data && logboekQ.data.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Laatste logboekregels
                  </p>
                  <ul className="mt-1 space-y-1">
                    {logboekQ.data.slice(0, 3).map((r) => (
                      <li key={r.id} className="text-xs">
                        {r.datum} — {r.actie}: {r.notitie}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {gezocht && !partijQ.isFetching && !partijQ.data && (
            <div className="mt-3 space-y-3 rounded-xl border border-warning/50 bg-warning/10 p-3">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <StatusBadge label="Onbekend lotnummer" emoji="⚠️" toon="warning" />
              </p>
              <p className="text-sm">
                Geen partij gevonden voor dit lotnummer. Maak een nieuwe "alleen bottelen"-partij
                aan — geen losse run zonder koppeling.
              </p>
              <label className="block">
                <span className="mb-1 block text-xs font-medium">Naam</span>
                <input
                  value={nieuweNaam}
                  onChange={(e) => setNieuweNaam(e.target.value)}
                  className={veldClass}
                  placeholder={lotnummer}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium">Jaargang</span>
                <input
                  type="number"
                  value={nieuweJaargang}
                  onChange={(e) => setNieuweJaargang(e.target.value)}
                  className={veldClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium">Eigenaar</span>
                <select
                  value={nieuweEigenaar}
                  onChange={(e) => setNieuweEigenaar(e.target.value)}
                  className={veldClass}
                >
                  <option value="">Kies eigenaar…</option>
                  {(eigenaarsQ.data ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {eigenaarLabel(e)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            2. Product &amp; verpakking
          </h2>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Product</span>
            <select
              value={productSoort}
              onChange={(e) => setProductSoort(e.target.value as ProductSoort)}
              className={veldClass}
            >
              {PRODUCT_SOORTEN.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

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
                  {t.omschrijving || `${t.vorm} ${t.inhoud_ml} ml`} · {standenQ.data?.[t.id] ?? 0}{" "}
                  op voorraad
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
                  {maxDrukBekend(s) ? ` (max ${s.max_druk_bar} bar)` : " (max. onbekend)"}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Aantal flessen</span>
              <input
                type="number"
                value={aantalFlessen}
                onChange={(e) => setAantalFlessen(e.target.value)}
                className={veldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Vulvolume (ml)</span>
              <input
                type="number"
                value={vulvolumeMl}
                onChange={(e) => setVulvolumeMl(e.target.value)}
                className={veldClass}
                placeholder={flesinhoudMl ? String(Math.round(flesinhoudMl * 0.9)) : ""}
              />
            </label>
          </div>
          {flessenTekort && (
            <p className="text-xs text-warning">
              Let op: flessenvoorraad toont {flessenStand} stuks, minder dan de {aantalFlessen}{" "}
              nodig.
            </p>
          )}

          <h2 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            3. Proces
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Carbonatie (bar bij 10°C)</span>
              <input
                type="number"
                step="0.01"
                value={carbonatieBar}
                onChange={(e) => setCarbonatieBar(e.target.value)}
                className={veldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Doeltemperatuur (°C)</span>
              <input
                type="number"
                value={doeltemperatuur}
                onChange={(e) => setDoeltemperatuur(e.target.value)}
                className={veldClass}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Doel-PU min</span>
              <input
                type="number"
                value={doelPuMin}
                onChange={(e) => setDoelPuMin(e.target.value)}
                className={veldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Doel-PU max</span>
              <input
                type="number"
                value={doelPuMax}
                onChange={(e) => setDoelPuMax(e.target.value)}
                className={veldClass}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              Referentiesensor (positie/label)
            </span>
            <input
              value={sensorPositie}
              onChange={(e) => setSensorPositie(e.target.value)}
              className={veldClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Naam (invoerder)</span>
            <input
              value={invoerder}
              onChange={(e) => setInvoerder(e.target.value)}
              className={veldClass}
            />
          </label>
        </section>

        {oordeel && (
          <section
            className={`rounded-2xl border p-4 ${
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
                    : oordeel.oordeel === "onbekend"
                      ? "Onvoldoende gegevens"
                      : "Onveilig"
              }
              emoji={
                oordeel.oordeel === "veilig" ? "✅" : oordeel.oordeel === "marginaal" ? "⚠️" : "🛑"
              }
              toon={
                oordeel.oordeel === "veilig"
                  ? "success"
                  : oordeel.oordeel === "marginaal"
                    ? "warning"
                    : "destructive"
              }
            />
            <p className="mt-1 text-sm">{oordeel.toelichting}</p>
            {oordeel.oordeel !== "veilig" && oordeel.oordeel !== "onbekend" && (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={akkoordOndanksOordeel}
                  onChange={(e) => setAkkoordOndanksOordeel(e.target.checked)}
                  className="mt-0.5 h-5 w-5"
                />
                <span>
                  Ik ({invoerder || "…"}) bevestig dat ik deze run toch start ondanks het{" "}
                  {oordeel.oordeel}-oordeel. Dit wordt vastgelegd.
                </span>
              </label>
            )}
          </section>
        )}
        {gekozenSluiting && !sluitingMaxBekend && (
          <p className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm">
            Geen dopspecificatie bekend voor deze sluiting — er kan geen veiligheidsoordeel berekend
            worden.
          </p>
        )}

        <button
          disabled={!magStarten || startM.isPending}
          onClick={() => startM.mutate()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {startM.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          Run starten
        </button>
      </div>
    </>
  );
}
