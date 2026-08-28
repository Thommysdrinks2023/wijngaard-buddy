import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchMetingen } from "@/lib/data";
import { fetchOogst, koppelOogstAanPartij } from "@/lib/extra-data";
import {
  MAX_MEETOUDERDOM_DAGEN,
  STANDAARD_RENDEMENT_L_PER_100KG,
  stelPartijVoor,
} from "@/lib/oogst-naar-partij";
import { format } from "date-fns";
import { toast } from "sonner";
import { createPartijViaEndpoint, fetchEigenaars, fetchTanks } from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { foutenPerVeld, isGeldig, valideerPartij } from "@/lib/validatie";
import { vanBrix, vanOechsle } from "@/lib/dichtheid";
import { genereerLotnummer } from "@/lib/lotnummer";
import { useInvoerder } from "@/lib/use-invoerder";
import { useSeizoen } from "@/lib/seizoen";
import {
  OPDRACHT_TYPES,
  PARTIJ_STATUSSEN,
  PARTIJ_TYPES,
  type OpdrachtType,
  type PartijStatus,
  type PartijType,
  eigenaarLabel,
} from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/kelder/partijen/nieuw")({
  component: NieuwePartijPage,
  head: () => ({ meta: [{ title: "Nieuwe partij — Kelder" }] }),
  // Fase 13 Blok E — met ?oogst=<id>,<id> komt het formulier voorgevuld binnen
  // vanaf /oogst. Bewust een lijst ids in de URL en geen globale staat: dan is
  // de stap deelbaar, herlaadbaar en te bookmarken, en blijft dit scherm ook
  // zonder die parameter gewoon werken.
  validateSearch: (zoek: Record<string, unknown>): { oogst?: string } => ({
    oogst: typeof zoek.oogst === "string" && zoek.oogst ? zoek.oogst : undefined,
  }),
});

function NieuwePartijPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [jaar] = useSeizoen();
  const [invoerder, setInvoerder] = useInvoerder();
  const { oogst: oogstParam } = Route.useSearch();
  const eigenaarsQ = useQuery({ queryKey: ["eigenaars"], queryFn: fetchEigenaars });
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });

  // Voorgevuld vanuit de oogst: alleen ophalen wanneer er ids meekomen.
  const gevraagdeOogstIds = useMemo(
    () => (oogstParam ? oogstParam.split(",").filter(Boolean) : []),
    [oogstParam],
  );
  const oogstQ = useQuery({
    queryKey: ["oogst-records"],
    queryFn: fetchOogst,
    enabled: gevraagdeOogstIds.length > 0,
  });
  const metingenQ = useQuery({
    queryKey: ["metingen"],
    queryFn: () => fetchMetingen(),
    enabled: gevraagdeOogstIds.length > 0,
  });

  const [rendement, setRendement] = useState(STANDAARD_RENDEMENT_L_PER_100KG);

  const gekozenOogst = useMemo(() => {
    if (gevraagdeOogstIds.length === 0) return [];
    const wil = new Set(gevraagdeOogstIds);
    return (oogstQ.data ?? []).filter((o) => wil.has(o.id));
  }, [oogstQ.data, gevraagdeOogstIds]);

  const voorstel = useMemo(
    () =>
      gekozenOogst.length > 0
        ? stelPartijVoor(
            gekozenOogst.map((o) => ({
              id: o.id,
              rij: o.rij,
              ras: o.ras,
              datum: o.datum,
              kg: o.kg,
              partij: o.partij,
            })),
            (metingenQ.data ?? []).map((m) => ({ rij: m.rij, datum: m.datum, brix: m.brix })),
            rendement,
          )
        : null,
    [gekozenOogst, metingenQ.data, rendement],
  );

  const [naam, setNaam] = useState("");
  const [jaargang, setJaargang] = useState(String(jaar));
  const [type, setType] = useState<PartijType>("wit");
  const [status, setStatus] = useState<PartijStatus>("most");
  const [eigenaar, setEigenaar] = useState("");
  const [opdrachtType, setOpdrachtType] = useState<OpdrachtType>("eigen_wijn");
  const [lotnummer, setLotnummer] = useState("");
  const [samenstelling, setSamenstelling] = useState("");
  const [gist, setGist] = useState("");
  const [persDatum, setPersDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [ontstelen, setOntstelen] = useState(false);
  const [voorklaren, setVoorklaren] = useState(false);
  const [phBijAanmaak, setPhBijAanmaak] = useState("");
  const [totaalZuurBijAanmaak, setTotaalZuurBijAanmaak] = useState("");
  const [standtijd, setStandtijd] = useState("");
  const [koeling, setKoeling] = useState("");
  const [oechsle, setOechsle] = useState("");
  const [brixInvoer, setBrixInvoer] = useState("");
  const [startTank, setStartTank] = useState("");
  const [startVolume, setStartVolume] = useState("");
  const [notitie, setNotitie] = useState("");
  const [fouten, setFouten] = useState<Record<string, string>>({});

  // °Oe is leidend; wie Brix invoert krijgt °Oe automatisch (en andersom)
  const dichtheid = useMemo(() => {
    if (oechsle) return vanOechsle(Number(oechsle));
    if (brixInvoer) return vanBrix(Number(brixInvoer));
    return null;
  }, [oechsle, brixInvoer]);

  // Blok E — lotnummer-autosuggestie (ARCHITECTURE.md v1.1, besluit A2).
  // Alleen een voorstel: overschrijft nooit wat de gebruiker al intypte.
  const lotnummerSuggestie = useMemo(() => {
    if (!naam.trim() || !jaargang) return "";
    const bestaande = (partijenQ.data ?? [])
      .map((p) => p.lotnummer)
      .filter((l): l is string => !!l);
    return genereerLotnummer(naam, Number(jaargang), bestaande);
  }, [naam, jaargang, partijenQ.data]);

  // Het voorstel één keer in de velden zetten. Daarna niet meer: wie een veld
  // aanpast moet niet overschreven worden door een herberekening. Het rendement
  // is de uitzondering — dat schuifje is er juist om het volume live te laten
  // meebewegen (zie hieronder).
  //
  // WACHTEN OP BEIDE QUERIES IS ESSENTIEEL, en dat is hier fout gegaan tijdens
  // het testen (26 juli 2026). `voorstel` is al bruikbaar zodra de OOGST binnen
  // is, maar de startdichtheid komt uit de METINGEN — een tweede query die
  // later kan landen. Vulde je op het eerste moment, dan zette de vlag zichzelf
  // op "gedaan" terwijl dichtheid nog null was, en werd de °Oechsle nooit meer
  // ingevuld: de partij ging zonder startdichtheid de kelder in.
  //
  // Gemeen detail: bij een tweede bezoek kwamen beide queries uit de cache en
  // wérkte het wel. Koud kapot, warm goed — dus precies bij het eerste gebruik
  // van de dag zou het misgaan, en in een snelle test nooit opvallen.
  const oogstGereed = gevraagdeOogstIds.length === 0 || !oogstQ.isPending;
  const metingenGereed = gevraagdeOogstIds.length === 0 || !metingenQ.isPending;
  const voorgevuld = useRef(false);
  useEffect(() => {
    if (voorgevuld.current || !voorstel) return;
    if (!oogstGereed || !metingenGereed) return;
    voorgevuld.current = true;
    setNaam(voorstel.naam);
    setJaargang(String(voorstel.jaargang));
    setSamenstelling(voorstel.samenstelling);
    setPersDatum(voorstel.persDatum);
    setStartVolume(String(voorstel.startVolumeL));
    if (voorstel.dichtheid) setOechsle(String(voorstel.dichtheid.oechsle));
  }, [voorstel, oogstGereed, metingenGereed]);

  // Het rendement verschuiven hoort het volume mee te nemen, óók nadat het
  // formulier is voorgevuld — anders is het schuifje een dood bedieningselement.
  // Bewust alleen op startVolumeL reageren. Met `voorstel` in de lijst vuurt
  // dit effect bij elke herberekening en overschrijft het een handmatig
  // aangepast volume — precies wat de eenmalige vulling hierboven voorkomt.
  useEffect(() => {
    if (!voorgevuld.current || !voorstel) return;
    setStartVolume(String(voorstel.startVolumeL));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voorstel?.startVolumeL]);

  const wisFout = (veld: string) =>
    setFouten((f) => {
      if (!f[veld]) return f;
      const kopie = { ...f };
      delete kopie[veld];
      return kopie;
    });

  const m = useMutation({
    mutationFn: () =>
      createPartijViaEndpoint({
        naam,
        jaargang: Number(jaargang),
        type,
        status,
        eigenaar: eigenaar || null,
        opdracht_type: opdrachtType,
        lotnummer,
        samenstelling,
        gist,
        pers_datum: persDatum,
        ontstelen,
        voorklaren,
        ph_bij_aanmaak: phBijAanmaak ? Number(phBijAanmaak) : null,
        totaal_zuur_bij_aanmaak: totaalZuurBijAanmaak ? Number(totaalZuurBijAanmaak) : null,
        standtijd,
        koeling,
        start_dichtheid_oechsle: dichtheid?.oechsle ?? null,
        start_dichtheid_brix: dichtheid?.brix ?? null,
        start_dichtheid_sg: dichtheid?.sg ?? null,
        start_volume_l: startVolume ? Number(startVolume) : null,
        start_tank: startTank || undefined,
        verantwoordelijke: invoerder,
        notitie,
      }),
    onSuccess: async (r) => {
      toast.success("Partij aangemaakt ✓");
      if (r.waarschuwing) toast.warning(r.waarschuwing);

      // Fase 13 Blok E — de koppeling is het hele punt van deze stap, maar hij
      // gebeurt ná het aanmaken en kan dus apart mislukken. De partij bestaat
      // dan al; die mag niet stilletjes zonder oogst achterblijven. Daarom een
      // expliciete melding die zegt wat er wél gelukt is en wat niet.
      if (voorstel && voorstel.oogstIds.length > 0) {
        try {
          const n = await koppelOogstAanPartij(voorstel.oogstIds, r.id);
          toast.success(`${n} oogstregel${n === 1 ? "" : "s"} gekoppeld aan deze partij ✓`);
          qc.invalidateQueries({ queryKey: ["oogst-records"] });
        } catch (fout) {
          toast.error("Partij aangemaakt, maar de oogst is niet gekoppeld", {
            description: (fout as Error).message,
            duration: 10_000,
          });
        }
      }

      qc.invalidateQueries({ queryKey: ["partijen"] });
      qc.invalidateQueries({ queryKey: ["tanks"] });
      qc.invalidateQueries({ queryKey: ["tankboek"] });
      navigate({ to: "/kelder/partijen/$partijId", params: { partijId: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSave = () => {
    if (m.isPending) return;
    const validatie = valideerPartij({
      naam,
      jaargang: jaargang ? Number(jaargang) : undefined,
      type,
      status,
      start_volume_l: startVolume ? Number(startVolume) : undefined,
    });
    if (!eigenaar) validatie.push({ veld: "eigenaar", bericht: "Kies een eigenaar" });
    if (startTank && !startVolume)
      validatie.push({ veld: "start_volume_l", bericht: "Vul het startvolume in (liter)" });
    if (!invoerder.trim())
      validatie.push({ veld: "verantwoordelijke", bericht: "Invoerder is verplicht" });
    if (!isGeldig(validatie)) {
      setFouten(foutenPerVeld(validatie));
      toast.error(validatie[0].bericht);
      return;
    }
    setFouten({});
    m.mutate();
  };

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  return (
    <>
      <AppHeader back title="Nieuwe partij" subtitle="Kelder" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        {/* Fase 13 Blok E — herkomst van het voorstel. Alles hieronder is een
            AANNAME en staat er daarom bij: wie het niet ziet, kan het niet
            corrigeren. De velden eronder zijn gewoon te overschrijven. */}
        {voorstel && (
          <section className="space-y-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
            <div>
              <h2 className="text-sm font-semibold">Voorgevuld uit de oogst</h2>
              <p className="text-xs text-muted-foreground">
                {voorstel.oogstIds.length} oogstregel
                {voorstel.oogstIds.length === 1 ? "" : "s"} · {voorstel.totaalKg} kg ·{" "}
                {voorstel.samenstelling}
              </p>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium">
                Verwachte opbrengst: {rendement} liter per 100 kg
              </span>
              <input
                type="range"
                min={40}
                max={90}
                step={1}
                value={rendement}
                onChange={(e) => setRendement(Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Vuistregel — hangt af van pers, ras en rijpheid. Geeft{" "}
                <strong>{voorstel.startVolumeL} L</strong> most.
              </span>
            </label>

            {voorstel.dichtheid ? (
              <p className="text-xs text-muted-foreground">
                Startdichtheid <strong>{voorstel.dichtheid.oechsle} °Oe</strong> (
                {voorstel.dichtheid.brix} °Bx), gewogen op kilo&apos;s uit veldmetingen van{" "}
                {voorstel.dichtheid.vanDatum === voorstel.dichtheid.totDatum
                  ? voorstel.dichtheid.vanDatum
                  : `${voorstel.dichtheid.vanDatum} t/m ${voorstel.dichtheid.totDatum}`}
                {voorstel.dichtheid.rijenMetMeting < voorstel.dichtheid.rijenTotaal && (
                  <>
                    {" "}
                    — let op: gebaseerd op {voorstel.dichtheid.rijenMetMeting} van de{" "}
                    {voorstel.dichtheid.rijenTotaal} betrokken rijen
                    {voorstel.dichtheid.rijenTeOud > 0 && (
                      <>
                        , want bij {voorstel.dichtheid.rijenTeOud}{" "}
                        {voorstel.dichtheid.rijenTeOud === 1 ? "rij was" : "rijen was"} de laatste
                        meting ouder dan {MAX_MEETOUDERDOM_DAGEN} dagen
                      </>
                    )}
                  </>
                )}
                . Een most-monster na het persen wijkt hier meestal van af.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Geen bruikbare veldmeting gevonden voor deze rijen
                {gekozenOogst.length > 0 &&
                  ` (of alleen metingen ouder dan ${MAX_MEETOUDERDOM_DAGEN} dagen)`}{" "}
                — vul de startdichtheid zelf in.
              </p>
            )}
          </section>
        )}

        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Eigenaar</span>
              <select
                value={eigenaar}
                onChange={(e) => {
                  setEigenaar(e.target.value);
                  wisFout("eigenaar");
                }}
                disabled={eigenaarsQ.isError}
                className={`${veldClass} ${fouten.eigenaar || eigenaarsQ.isError ? "border-destructive" : ""}`}
              >
                <option value="">
                  {eigenaarsQ.isError ? "Kon eigenaars niet laden" : "Kies eigenaar…"}
                </option>
                {(eigenaarsQ.data ?? [])
                  .filter((p) => p.actief)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {eigenaarLabel(p)}
                    </option>
                  ))}
              </select>
              {eigenaarsQ.isError && (
                <span className="mt-1 flex items-center justify-between gap-2 text-sm text-destructive">
                  {eigenaarsQ.error instanceof Error
                    ? eigenaarsQ.error.message
                    : "Kon eigenaars niet laden — probeer opnieuw."}
                  <button
                    type="button"
                    onClick={() => eigenaarsQ.refetch()}
                    className="shrink-0 underline underline-offset-2"
                  >
                    Opnieuw
                  </button>
                </span>
              )}
              {!eigenaarsQ.isError && fouten.eigenaar && (
                <span className="mt-1 block text-sm text-destructive">{fouten.eigenaar}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Opdracht</span>
              <select
                value={opdrachtType}
                onChange={(e) => setOpdrachtType(e.target.value as OpdrachtType)}
                className={veldClass}
              >
                {OPDRACHT_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Naam</span>
              <input
                value={naam}
                onChange={(e) => {
                  setNaam(e.target.value);
                  wisFout("naam");
                }}
                className={`${veldClass} ${fouten.naam ? "border-destructive" : ""}`}
                placeholder="bijv. Johanniter 2026"
              />
              {fouten.naam && (
                <span className="mt-1 block text-sm text-destructive">{fouten.naam}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Jaargang</span>
              <input
                type="number"
                inputMode="numeric"
                value={jaargang}
                onChange={(e) => {
                  setJaargang(e.target.value);
                  wisFout("jaargang");
                }}
                className={`${veldClass} ${fouten.jaargang ? "border-destructive" : ""}`}
              />
              {fouten.jaargang && (
                <span className="mt-1 block text-sm text-destructive">{fouten.jaargang}</span>
              )}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as PartijType)}
                className={veldClass}
              >
                {PARTIJ_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PartijStatus)}
                className={veldClass}
              >
                {PARTIJ_STATUSSEN.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.emoji} {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Lotnummer</span>
              <input
                value={lotnummer}
                onChange={(e) => setLotnummer(e.target.value)}
                className={veldClass}
                placeholder="bijv. L26-JOH-01"
              />
              {!lotnummer && lotnummerSuggestie && (
                <button
                  type="button"
                  onClick={() => setLotnummer(lotnummerSuggestie)}
                  className="mt-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Voorstel: {lotnummerSuggestie} — gebruiken
                </button>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Persdatum</span>
              <input
                type="date"
                value={persDatum}
                onChange={(e) => setPersDatum(e.target.value)}
                className={veldClass}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Samenstelling / rassen</span>
            <input
              value={samenstelling}
              onChange={(e) => setSamenstelling(e.target.value)}
              className={veldClass}
              placeholder="bijv. 70% Johanniter, 30% Souvignier Gris"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Gist</span>
            <input
              value={gist}
              onChange={(e) => setGist(e.target.value)}
              className={veldClass}
              placeholder="Optioneel…"
            />
          </label>
        </section>

        {/* Dichtheid: °Oe leidend, Brix/SG rekenen live mee */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Startdichtheid
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">°Oechsle</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={oechsle}
                onChange={(e) => {
                  setOechsle(e.target.value);
                  if (e.target.value) setBrixInvoer("");
                }}
                className={veldClass}
                placeholder="bijv. 75"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">of Brix</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={brixInvoer}
                onChange={(e) => {
                  setBrixInvoer(e.target.value);
                  if (e.target.value) setOechsle("");
                }}
                className={veldClass}
                placeholder="bijv. 18.2"
              />
            </label>
          </div>
          {dichtheid && (
            <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm">
              {dichtheid.oechsle} °Oe · {dichtheid.brix} °Bx · SG {dichtheid.sg} — alle drie worden
              opgeslagen
            </p>
          )}
        </section>

        {/* Verwerking: velden uit Logboek_leeg.xlsx die vóór de eerste analyse al ingevuld worden */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Verwerking
          </h2>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={ontstelen}
                onChange={(e) => setOntstelen(e.target.checked)}
                className="h-5 w-5 rounded border-input"
              />
              Ontstelen
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={voorklaren}
                onChange={(e) => setVoorklaren(e.target.checked)}
                className="h-5 w-5 rounded border-input"
              />
              Voorklaren
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">pH (bij aanmaak)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={phBijAanmaak}
                onChange={(e) => setPhBijAanmaak(e.target.value)}
                className={veldClass}
                placeholder="Optioneel…"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Totaal zuur (bij aanmaak)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={totaalZuurBijAanmaak}
                onChange={(e) => setTotaalZuurBijAanmaak(e.target.value)}
                className={veldClass}
                placeholder="Optioneel…"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Standtijd</span>
              <input
                value={standtijd}
                onChange={(e) => setStandtijd(e.target.value)}
                className={veldClass}
                placeholder="bijv. 24 uur"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Koeling</span>
              <input
                value={koeling}
                onChange={(e) => setKoeling(e.target.value)}
                className={veldClass}
                placeholder="Optioneel…"
              />
            </label>
          </div>
        </section>

        {/* Starttank + volume → eerste vullen-boeking in het tankboek */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Eerste vulling (optioneel)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Starttank</span>
              <select
                value={startTank}
                onChange={(e) => setStartTank(e.target.value)}
                disabled={tanksQ.isError}
                className={`${veldClass} ${tanksQ.isError ? "border-destructive" : ""}`}
              >
                <option value="">
                  {tanksQ.isError ? "Kon tanks niet laden" : "Nog geen tank"}
                </option>
                {(tanksQ.data ?? [])
                  .filter((t) => t.status === "leeg" || t.huidige_partij === null)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      Tank {t.code} · {t.soort} ({t.capaciteit_l} L)
                    </option>
                  ))}
              </select>
              {tanksQ.isError && (
                <span className="mt-1 flex items-center justify-between gap-2 text-sm text-destructive">
                  {tanksQ.error instanceof Error
                    ? tanksQ.error.message
                    : "Kon tanks niet laden — probeer opnieuw."}
                  <button
                    type="button"
                    onClick={() => tanksQ.refetch()}
                    className="shrink-0 underline underline-offset-2"
                  >
                    Opnieuw
                  </button>
                </span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Startvolume (L)</span>
              <input
                type="number"
                inputMode="decimal"
                value={startVolume}
                onChange={(e) => {
                  setStartVolume(e.target.value);
                  wisFout("start_volume_l");
                }}
                className={`${veldClass} ${fouten.start_volume_l ? "border-destructive" : ""}`}
              />
              {fouten.start_volume_l && (
                <span className="mt-1 block text-sm text-destructive">{fouten.start_volume_l}</span>
              )}
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Met starttank en volume wordt automatisch de eerste "vullen"-regel in het tankboek
            geboekt — alles of niets.
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Ingevoerd door</span>
            <input
              value={invoerder}
              onChange={(e) => {
                setInvoerder(e.target.value);
                wisFout("verantwoordelijke");
              }}
              className={`${veldClass} ${fouten.verantwoordelijke ? "border-destructive" : ""}`}
              placeholder="Je naam"
            />
            {fouten.verantwoordelijke && (
              <span className="mt-1 block text-sm text-destructive">
                {fouten.verantwoordelijke}
              </span>
            )}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Notitie</span>
            <input
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              className={veldClass}
              placeholder="Optioneel…"
            />
          </label>
          <button
            type="button"
            onClick={handleSave}
            disabled={m.isPending}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {m.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Partij aanmaken
          </button>
        </section>
      </div>
    </>
  );
}
