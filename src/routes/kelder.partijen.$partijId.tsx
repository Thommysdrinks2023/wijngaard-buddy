import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { differenceInDays, format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import {
  createAnalyse,
  createKelderlog,
  createVoedingswaardeBerekening,
  fetchAnalyses,
  fetchBottelrondes,
  fetchKelderlog,
  fetchProducenten,
  fetchTankboek,
  fetchTanks,
  fetchToevoegingen,
  fetchVoedingswaardeBerekeningen,
  fetchVoorraadFlessen,
} from "@/lib/kelder-data";
import { fetchPartijById, updatePartij } from "@/lib/partijen-data";
import {
  foutenPerVeld,
  isGeldig,
  valideerAnalyse,
  valideerKelderlog,
  valideerVoedingswaarde,
} from "@/lib/validatie";
import { vanBrix, vanOechsle } from "@/lib/dichtheid";
import {
  alcoholPctNaarGramLiter,
  berekenVoedingswaarde,
  GLYCERINE_DEFAULT_GRAM_LITER,
} from "@/lib/voedingswaarde";
import { useInvoerder } from "@/lib/use-invoerder";
import {
  KELDERLOG_ACTIES,
  KELDERLOG_EENHEDEN,
  PARTIJ_STATUSSEN,
  TANKBOEK_ACTIES,
  TOEVOEGING_EENHEDEN,
  VEELGEBRUIKTE_TOEVOEGINGEN,
  type KelderlogActie,
  type KelderlogEenheid,
  type PartijStatus,
} from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import {
  ArrowLeftRight,
  Beaker,
  Copy,
  FlaskConical,
  Loader2,
  NotebookPen,
  Wine,
} from "lucide-react";

export const Route = createFileRoute("/kelder/partijen/$partijId")({
  component: PartijDetailPage,
  head: () => ({ meta: [{ title: "Partij — Kelder" }] }),
});

function PartijDetailPage() {
  const { partijId } = Route.useParams();
  const qc = useQueryClient();
  const [invoerder, setInvoerder] = useInvoerder();

  const partijQ = useQuery({
    queryKey: ["partij", partijId],
    queryFn: () => fetchPartijById(partijId),
  });
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const producentenQ = useQuery({ queryKey: ["producenten"], queryFn: fetchProducenten });
  const tankboekQ = useQuery({
    queryKey: ["tankboek", partijId],
    queryFn: () => fetchTankboek({ partij: partijId }),
  });
  const analysesQ = useQuery({
    queryKey: ["analyses", partijId],
    queryFn: () => fetchAnalyses(partijId),
  });
  const kelderlogQ = useQuery({
    queryKey: ["kelderlog", partijId],
    queryFn: () => fetchKelderlog(partijId),
  });
  const toevoegingenQ = useQuery({
    queryKey: ["toevoegingen", partijId],
    queryFn: () => fetchToevoegingen(partijId),
  });
  const voedingswaardeQ = useQuery({
    queryKey: ["voedingswaarde", partijId],
    queryFn: () => fetchVoedingswaardeBerekeningen(partijId),
  });
  const bottelrondesQ = useQuery({
    queryKey: ["bottelrondes", partijId],
    queryFn: () => fetchBottelrondes(partijId),
  });
  const voorraadVanPartijQ = useQuery({
    queryKey: ["voorraad", "partij", partijId],
    queryFn: () => fetchVoorraadFlessen({ partij: partijId }),
  });
  const voorraadPerBottelronde = useMemo(() => {
    const m = new Map<string, string>();
    voorraadVanPartijQ.data?.forEach((v) => m.set(v.bottelronde, v.id));
    return m;
  }, [voorraadVanPartijQ.data]);

  const partij = partijQ.data;
  const producentNaam = useMemo(
    () => producentenQ.data?.find((p) => p.id === partij?.producent)?.naam ?? "",
    [producentenQ.data, partij],
  );
  const tanksVanPartij = useMemo(
    () => (tanksQ.data ?? []).filter((t) => t.huidige_partij === partijId),
    [tanksQ.data, partijId],
  );
  const tankCode = useMemo(() => {
    const m = new Map<string, string>();
    tanksQ.data?.forEach((t) => m.set(t.id, t.code));
    return m;
  }, [tanksQ.data]);

  const huidigVolume = Math.round(tanksVanPartij.reduce((acc, t) => acc + t.huidig_volume_l, 0));
  const dagenInKelder = partij?.pers_datum
    ? differenceInDays(new Date(), parseISO(partij.pers_datum))
    : null;
  const laatsteMutatie = tankboekQ.data?.[0];
  const laatsteAnalyse = analysesQ.data?.[0];
  const statusInfo = PARTIJ_STATUSSEN.find((s) => s.value === partij?.status);

  // ---------- status wijzigen ----------
  const statusM = useMutation({
    mutationFn: (status: PartijStatus) => updatePartij(partijId, { status }),
    onSuccess: () => {
      toast.success("Status bijgewerkt ✓");
      qc.invalidateQueries({ queryKey: ["partij", partijId] });
      qc.invalidateQueries({ queryKey: ["partijen"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------- analyse-invoer ----------
  const [toonAnalyse, setToonAnalyse] = useState(false);
  const [aDatum, setADatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [aOechsle, setAOechsle] = useState("");
  const [aBrix, setABrix] = useState("");
  const [aWaarden, setAWaarden] = useState<Record<string, string>>({});
  const [aFouten, setAFouten] = useState<Record<string, string>>({});

  const aDichtheid = useMemo(() => {
    if (aOechsle) return vanOechsle(Number(aOechsle));
    if (aBrix) return vanBrix(Number(aBrix));
    return null;
  }, [aOechsle, aBrix]);

  const aNum = (k: string) => (aWaarden[k] ? Number(aWaarden[k]) : null);

  const analyseM = useMutation({
    mutationFn: () =>
      createAnalyse({
        datum: aDatum,
        partij: partijId,
        tank: tanksVanPartij[0]?.id ?? null,
        dichtheid_oechsle: aDichtheid?.oechsle ?? null,
        dichtheid_brix: aDichtheid?.brix ?? null,
        dichtheid_sg: aDichtheid?.sg ?? null,
        ph: aNum("ph"),
        alcohol_pct: aNum("alcohol_pct"),
        restsuiker_g_l: aNum("restsuiker_g_l"),
        totaalzuur_g_l: aNum("totaalzuur_g_l"),
        vluchtig_zuur_g_l: aNum("vluchtig_zuur_g_l"),
        so2_vrij: aNum("so2_vrij"),
        so2_totaal: aNum("so2_totaal"),
        methode: "eigen_meting",
        ingevoerd_door: invoerder,
      }),
    onSuccess: () => {
      toast.success("Analyse opgeslagen ✓");
      qc.invalidateQueries({ queryKey: ["analyses", partijId] });
      setAOechsle("");
      setABrix("");
      setAWaarden({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bewaarAnalyse = () => {
    if (analyseM.isPending) return;
    const validatie = valideerAnalyse({
      partij: partijId,
      datum: aDatum,
      ph: aNum("ph"),
      alcohol_pct: aNum("alcohol_pct"),
      so2_vrij: aNum("so2_vrij"),
      so2_totaal: aNum("so2_totaal"),
      dichtheid_oechsle: aDichtheid?.oechsle ?? null,
      ingevoerd_door: invoerder,
    });
    if (!isGeldig(validatie)) {
      setAFouten(foutenPerVeld(validatie));
      toast.error(validatie[0].bericht);
      return;
    }
    setAFouten({});
    analyseM.mutate();
  };

  // ---------- kelderlog-invoer ----------
  const [toonLog, setToonLog] = useState(false);
  const [lDatum, setLDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [lActie, setLActie] = useState<KelderlogActie>("roeren");
  const [lMiddel, setLMiddel] = useState("");
  const [lHoeveelheid, setLHoeveelheid] = useState("");
  const [lEenheid, setLEenheid] = useState<KelderlogEenheid>("g");
  const [lNotitie, setLNotitie] = useState("");

  const logM = useMutation({
    mutationFn: () =>
      createKelderlog({
        datum: lDatum,
        partij: partijId,
        tank: tanksVanPartij[0]?.id ?? null,
        actie: lActie,
        middel: lMiddel,
        hoeveelheid: lHoeveelheid ? Number(lHoeveelheid) : null,
        eenheid: lHoeveelheid ? lEenheid : null,
        notitie: lNotitie,
        ingevoerd_door: invoerder,
      }),
    onSuccess: () => {
      toast.success("Logregel opgeslagen ✓");
      qc.invalidateQueries({ queryKey: ["kelderlog", partijId] });
      setLMiddel("");
      setLHoeveelheid("");
      setLNotitie("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bewaarLog = () => {
    if (logM.isPending) return;
    const validatie = valideerKelderlog({
      datum: lDatum,
      partij: partijId,
      actie: lActie,
      hoeveelheid: lHoeveelheid ? Number(lHoeveelheid) : null,
      ingevoerd_door: invoerder,
    });
    if (!isGeldig(validatie)) {
      toast.error(validatie[0].bericht);
      return;
    }
    logM.mutate();
  };

  // ---------- voedingswaarde-/etiketberekening ----------
  const [vAlcohol, setVAlcohol] = useState("");
  const [vRestsuiker, setVRestsuiker] = useState("");
  const [vZuur, setVZuur] = useState("");
  const [vGlycerine, setVGlycerine] = useState(String(GLYCERINE_DEFAULT_GRAM_LITER));
  const [vFouten, setVFouten] = useState<Record<string, string>>({});

  const vulInVanuitAnalyse = () => {
    if (!laatsteAnalyse) return;
    if (laatsteAnalyse.alcohol_pct != null)
      setVAlcohol(
        String(Math.round(alcoholPctNaarGramLiter(laatsteAnalyse.alcohol_pct) * 10) / 10),
      );
    if (laatsteAnalyse.restsuiker_g_l != null)
      setVRestsuiker(String(laatsteAnalyse.restsuiker_g_l));
    if (laatsteAnalyse.totaalzuur_g_l != null) setVZuur(String(laatsteAnalyse.totaalzuur_g_l));
  };

  const voedingswaardeM = useMutation({
    mutationFn: () => {
      const invoer = {
        alcohol_gram_liter: Number(vAlcohol),
        restsuiker_gram_liter: Number(vRestsuiker),
        zuur_gram_liter: Number(vZuur),
        glycerine_gram_liter: Number(vGlycerine),
      };
      const resultaat = berekenVoedingswaarde(invoer);
      return createVoedingswaardeBerekening({
        partij: partijId,
        berekening_datum: format(new Date(), "yyyy-MM-dd"),
        ...invoer,
        kcal_totaal: resultaat.kcal_totaal,
        kj_totaal: resultaat.kj_totaal,
        etiket_tekst: resultaat.etiket_tekst,
        ingevoerd_door: invoerder,
      });
    },
    onSuccess: () => {
      toast.success("Berekening opgeslagen ✓");
      qc.invalidateQueries({ queryKey: ["voedingswaarde", partijId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bewaarVoedingswaarde = () => {
    if (voedingswaardeM.isPending) return;
    const validatie = valideerVoedingswaarde({
      partij: partijId,
      berekening_datum: format(new Date(), "yyyy-MM-dd"),
      alcohol_gram_liter: vAlcohol ? Number(vAlcohol) : undefined,
      restsuiker_gram_liter: vRestsuiker ? Number(vRestsuiker) : undefined,
      zuur_gram_liter: vZuur ? Number(vZuur) : undefined,
      glycerine_gram_liter: vGlycerine ? Number(vGlycerine) : undefined,
    });
    if (!isGeldig(validatie)) {
      setVFouten(foutenPerVeld(validatie));
      toast.error(validatie[0].bericht);
      return;
    }
    setVFouten({});
    voedingswaardeM.mutate();
  };

  const kopieerEtiket = async (tekst: string) => {
    try {
      await navigator.clipboard.writeText(tekst);
      toast.success("Etikettekst gekopieerd ✓");
    } catch {
      toast.error("Kopiëren mislukt — selecteer en kopieer de tekst handmatig.");
    }
  };

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  if (partijQ.isError || (partijQ.isFetched && !partij)) {
    return (
      <>
        <AppHeader back title="Partij" />
        <div className="mx-auto max-w-screen-md px-3 py-4">
          <ErrorState
            message="Partij niet gevonden of geen verbinding."
            onRetry={() => partijQ.refetch()}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader
        back
        title={partij?.naam ?? "Partij"}
        subtitle={partij ? `${partij.jaargang} · ${producentNaam}` : ""}
      />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        {/* Statuspaneel */}
        <section
          className="rounded-xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
          style={{ backgroundColor: "var(--nav)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-white">
                {partij?.naam} · {partij?.jaargang}
              </p>
              <p className="text-xs text-white/80">
                {producentNaam}
                {partij?.lotnummer ? ` · lot ${partij.lotnummer}` : ""}
                {partij?.samenstelling ? ` · ${partij.samenstelling}` : ""}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ backgroundColor: "var(--accent-gold)", color: "#1a1a1a" }}
            >
              {statusInfo?.emoji} {statusInfo?.label}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--accent-gold)" }}
              >
                Volume
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
                {huidigVolume} <span className="text-xs font-normal">L</span>
              </p>
              <p className="text-[10px] text-white/70">
                {tanksVanPartij.length > 0
                  ? `tank ${tanksVanPartij.map((t) => t.code).join(", ")}`
                  : "niet op tank"}
              </p>
            </div>
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--accent-gold)" }}
              >
                In kelder
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
                {dagenInKelder != null ? dagenInKelder : "—"}
                <span className="text-xs font-normal"> dgn</span>
              </p>
              <p className="text-[10px] text-white/70">
                {partij?.pers_datum
                  ? `pers ${format(parseISO(partij.pers_datum), "d MMM", { locale: nl })}`
                  : ""}
              </p>
            </div>
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--accent-gold)" }}
              >
                Dichtheid
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
                {laatsteAnalyse?.dichtheid_oechsle ?? partij?.start_dichtheid_oechsle ?? "—"}
                <span className="text-xs font-normal"> °Oe</span>
              </p>
              <p className="text-[10px] text-white/70">
                {laatsteAnalyse?.dichtheid_brix ?? partij?.start_dichtheid_brix ?? "—"} °Bx · SG{" "}
                {laatsteAnalyse?.dichtheid_sg ?? partij?.start_dichtheid_sg ?? "—"}
              </p>
            </div>
          </div>
        </section>

        {/* Acties */}
        <div className="grid grid-cols-3 gap-2">
          <Link
            to="/kelder/overhevelen"
            search={{ partij: partijId }}
            className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-primary text-xs font-semibold text-primary-foreground active:scale-[0.98]"
          >
            <ArrowLeftRight className="h-5 w-5" />
            Overhevelen
          </Link>
          <button
            type="button"
            onClick={() => setToonAnalyse((v) => !v)}
            className={`flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-semibold active:scale-[0.98] ${
              toonAnalyse ? "border-primary bg-primary-soft text-primary" : "border-border bg-card"
            }`}
          >
            <FlaskConical className="h-5 w-5" />
            Analyse
          </button>
          <button
            type="button"
            onClick={() => setToonLog((v) => !v)}
            className={`flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-semibold active:scale-[0.98] ${
              toonLog ? "border-primary bg-primary-soft text-primary" : "border-border bg-card"
            }`}
          >
            <NotebookPen className="h-5 w-5" />
            Logboek
          </button>
          <button
            type="button"
            onClick={() => {
              setLActie("toevoeging");
              setToonLog(true);
            }}
            className={`flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-semibold active:scale-[0.98] ${
              toonLog && lActie === "toevoeging"
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-card"
            }`}
          >
            <Beaker className="h-5 w-5" />
            Toevoeging
          </button>
          <Link
            to="/kelder/partijen/$partijId/bottelen"
            params={{ partijId }}
            className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card text-xs font-semibold active:scale-[0.98]"
          >
            <Wine className="h-5 w-5" />
            Bottelen
          </Link>
        </div>

        {/* Status wijzigen */}
        <section className="rounded-2xl border border-border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {PARTIJ_STATUSSEN.map((s) => (
              <button
                key={s.value}
                type="button"
                disabled={statusM.isPending}
                onClick={() => partij && s.value !== partij.status && statusM.mutate(s.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  partij?.status === s.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background"
                }`}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </section>

        {/* Verwerking: velden uit Logboek_leeg.xlsx, alleen tonen als er iets ingevuld is.
            Let op: PocketBase-nummervelden die nooit expliciet gezet zijn staan op 0,
            niet op null — pH/zuur van 0 komt in de praktijk nooit voor (echte pH ligt
            altijd > 2), dus > 0 is hier de betrouwbare "is ingevuld"-check. */}
        {partij &&
          (partij.ontstelen ||
            partij.voorklaren ||
            (partij.ph_bij_aanmaak ?? 0) > 0 ||
            (partij.totaal_zuur_bij_aanmaak ?? 0) > 0 ||
            partij.standtijd ||
            partij.koeling) && (
            <section className="rounded-2xl border border-border bg-card p-3">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Verwerking
              </h2>
              <p className="text-sm">
                {[
                  partij.ontstelen ? "Ontsteeld" : null,
                  partij.voorklaren ? "Voorgeklaard" : null,
                  (partij.ph_bij_aanmaak ?? 0) > 0 ? `pH ${partij.ph_bij_aanmaak}` : null,
                  (partij.totaal_zuur_bij_aanmaak ?? 0) > 0
                    ? `Totaal zuur ${partij.totaal_zuur_bij_aanmaak}`
                    : null,
                  partij.standtijd ? `Standtijd ${partij.standtijd}` : null,
                  partij.koeling ? `Koeling: ${partij.koeling}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </section>
          )}

        {/* Analyse-invoer */}
        {toonAnalyse && (
          <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Nieuwe analyse
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Datum</span>
                <input
                  type="date"
                  value={aDatum}
                  onChange={(e) => setADatum(e.target.value)}
                  className={`${veldClass} ${aFouten.datum ? "border-destructive" : ""}`}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">°Oechsle</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={aOechsle}
                  onChange={(e) => {
                    setAOechsle(e.target.value);
                    if (e.target.value) setABrix("");
                  }}
                  className={veldClass}
                  placeholder="—"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">of Brix</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={aBrix}
                  onChange={(e) => {
                    setABrix(e.target.value);
                    if (e.target.value) setAOechsle("");
                  }}
                  className={veldClass}
                  placeholder="—"
                />
              </label>
            </div>
            {aDichtheid && (
              <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm">
                {aDichtheid.oechsle} °Oe · {aDichtheid.brix} °Bx · SG {aDichtheid.sg}
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              {[
                { k: "ph", label: "pH" },
                { k: "alcohol_pct", label: "Alcohol %" },
                { k: "restsuiker_g_l", label: "Restsuiker g/L" },
                { k: "totaalzuur_g_l", label: "Totaalzuur g/L" },
                { k: "vluchtig_zuur_g_l", label: "Vl. zuur g/L" },
                { k: "so2_vrij", label: "SO₂ vrij mg/L" },
                { k: "so2_totaal", label: "SO₂ tot. mg/L" },
              ].map((v) => (
                <label key={v.k} className="block">
                  <span className="mb-1.5 block text-xs font-medium">{v.label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={aWaarden[v.k] ?? ""}
                    onChange={(e) => setAWaarden((w) => ({ ...w, [v.k]: e.target.value }))}
                    className={`${veldClass} ${aFouten[v.k] ? "border-destructive" : ""}`}
                    placeholder="—"
                  />
                  {aFouten[v.k] && (
                    <span className="mt-1 block text-xs text-destructive">{aFouten[v.k]}</span>
                  )}
                </label>
              ))}
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Ingevoerd door</span>
              <input
                value={invoerder}
                onChange={(e) => setInvoerder(e.target.value)}
                className={veldClass}
              />
            </label>
            <button
              type="button"
              onClick={bewaarAnalyse}
              disabled={analyseM.isPending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {analyseM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Analyse opslaan
            </button>
          </section>
        )}

        {/* Kelderlog-invoer */}
        {toonLog && (
          <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Nieuwe logregel
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Datum</span>
                <input
                  type="date"
                  value={lDatum}
                  onChange={(e) => setLDatum(e.target.value)}
                  className={veldClass}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Bewerking</span>
                <select
                  value={lActie}
                  onChange={(e) => setLActie(e.target.value as KelderlogActie)}
                  className={veldClass}
                >
                  {KELDERLOG_ACTIES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.emoji} {a.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-1 block">
                <span className="mb-1.5 block text-sm font-medium">Middel</span>
                <input
                  list="veelgebruikte-toevoegingen"
                  value={lMiddel}
                  onChange={(e) => setLMiddel(e.target.value)}
                  className={veldClass}
                  placeholder="bijv. sulfiet"
                />
                <datalist id="veelgebruikte-toevoegingen">
                  {VEELGEBRUIKTE_TOEVOEGINGEN.map((naam) => (
                    <option key={naam} value={naam} />
                  ))}
                </datalist>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Hoeveelheid</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={lHoeveelheid}
                  onChange={(e) => setLHoeveelheid(e.target.value)}
                  className={veldClass}
                  placeholder="—"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Eenheid</span>
                <select
                  value={lEenheid}
                  onChange={(e) => setLEenheid(e.target.value as KelderlogEenheid)}
                  className={veldClass}
                >
                  {KELDERLOG_EENHEDEN.map((e2) => (
                    <option key={e2.value} value={e2.value}>
                      {e2.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Notitie</span>
              <input
                value={lNotitie}
                onChange={(e) => setLNotitie(e.target.value)}
                className={veldClass}
                placeholder="Optioneel…"
              />
            </label>
            <button
              type="button"
              onClick={bewaarLog}
              disabled={logM.isPending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {logM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Logregel opslaan
            </button>
          </section>
        )}

        {/* Tankboek van deze partij */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Tankboek ({tankboekQ.data?.length ?? 0})
          </h2>
          {(tankboekQ.data ?? []).length === 0 ? (
            <EmptyState message="Nog geen boekingen voor deze partij." />
          ) : (
            <ul className="space-y-1.5">
              {(tankboekQ.data ?? []).map((r) => {
                const actie = TANKBOEK_ACTIES.find((a) => a.value === r.actie);
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {actie?.emoji} {actie?.label ?? r.actie}
                        {r.van_tank ? ` · van tank ${tankCode.get(r.van_tank) ?? "?"}` : ""}
                        {r.naar_tank ? ` · naar tank ${tankCode.get(r.naar_tank) ?? "?"}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(r.datum), "d MMM yyyy", { locale: nl })}
                        {r.middel ? ` · ${r.middel}${r.dosering ? ` ${r.dosering}` : ""}` : ""}
                        {` · ${r.verantwoordelijke}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {r.volume_l > 0 ? `${r.volume_l} L` : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Botteling */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Botteling ({bottelrondesQ.data?.length ?? 0})
          </h2>
          {(bottelrondesQ.data ?? []).length === 0 ? (
            <EmptyState message="Nog niet gebotteld." icon={<Wine className="h-6 w-6" />} />
          ) : (
            <ul className="space-y-1.5">
              {(bottelrondesQ.data ?? []).map((b) => {
                const voorraadId = voorraadPerBottelronde.get(b.id);
                const inhoud = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {b.aantal_flessen} flessen × {b.flesinhoud_ml} ml
                        {b.flestype ? ` · ${b.flestype}` : ""}
                        {b.parelwijn ? " · parelwijn" : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(b.botteldatum), "d MMM yyyy", { locale: nl })}
                        {b.lotnummer ? ` · lot ${b.lotnummer}` : ""}
                      </p>
                    </div>
                    {voorraadId && <span className="text-muted-foreground">→</span>}
                  </>
                );
                return (
                  <li key={b.id}>
                    {voorraadId ? (
                      <Link
                        to="/voorraad/$voorraadId"
                        params={{ voorraadId }}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 active:scale-[0.99]"
                      >
                        {inhoud}
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
                        {inhoud}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Analyses */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Analyses (laatste 5)
          </h2>
          {(analysesQ.data ?? []).length === 0 ? (
            <EmptyState message="Nog geen analyses." icon={<FlaskConical className="h-6 w-6" />} />
          ) : (
            <ul className="space-y-1.5">
              {(analysesQ.data ?? []).slice(0, 5).map((a) => (
                <li key={a.id} className="rounded-xl border border-border bg-card px-3 py-2">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-medium">
                      {a.dichtheid_oechsle != null ? `${a.dichtheid_oechsle} °Oe` : "Analyse"}
                      {a.dichtheid_brix != null ? ` · ${a.dichtheid_brix} °Bx` : ""}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(a.datum), "d MMM", { locale: nl })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      a.ph != null ? `pH ${a.ph}` : null,
                      a.alcohol_pct != null ? `${a.alcohol_pct}% vol` : null,
                      a.restsuiker_g_l != null ? `RS ${a.restsuiker_g_l} g/L` : null,
                      a.totaalzuur_g_l != null ? `TZ ${a.totaalzuur_g_l} g/L` : null,
                      a.so2_vrij != null ? `SO₂v ${a.so2_vrij}` : null,
                      a.so2_totaal != null ? `SO₂t ${a.so2_totaal}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Geen meetwaarden"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Toevoegingen (oud systeem, alleen-lezen): sinds Blok A (WERKLOG.md) gaan
            nieuwe toevoegingen via het Logboek hieronder (actie "toevoeging"). Deze
            sectie toont alleen nog records uit vóór die samenvoeging, en verdwijnt
            vanzelf zodra een partij daar geen data van heeft. */}
        {(toevoegingenQ.data ?? []).length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Toevoegingen (oud, {toevoegingenQ.data?.length})
            </h2>
            <ul className="space-y-1.5">
              {(toevoegingenQ.data ?? []).map((t) => {
                const eenheid = TOEVOEGING_EENHEDEN.find((e2) => e2.value === t.eenheid);
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {t.naam} · {t.hoeveelheid} {eenheid?.label ?? t.eenheid}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(t.datum), "d MMM yyyy", { locale: nl })}
                        {t.notities ? ` · ${t.notities}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Kelderlog */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Logboek
          </h2>
          {(kelderlogQ.data ?? []).length === 0 ? (
            <EmptyState
              message="Nog geen bewerkingen gelogd."
              icon={<NotebookPen className="h-6 w-6" />}
            />
          ) : (
            <ul className="space-y-1.5">
              {(kelderlogQ.data ?? []).slice(0, 10).map((r) => {
                const actie = KELDERLOG_ACTIES.find((a) => a.value === r.actie);
                const eenheid = KELDERLOG_EENHEDEN.find((e2) => e2.value === r.eenheid);
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {actie?.emoji} {actie?.label ?? r.actie}
                        {r.middel ? ` · ${r.middel}` : ""}
                        {r.hoeveelheid != null ? ` · ${r.hoeveelheid} ${eenheid?.label ?? ""}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(r.datum), "d MMM yyyy", { locale: nl })}
                        {r.notitie ? ` · ${r.notitie}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Voedingswaarde-/etiketberekening */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Voedingswaarde berekenen
          </h2>
          {laatsteAnalyse && (
            <button
              type="button"
              onClick={vulInVanuitAnalyse}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Vul in vanuit laatste analyse
            </button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Alcohol (g/L)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={vAlcohol}
                onChange={(e) => setVAlcohol(e.target.value)}
                className={`${veldClass} ${vFouten.alcohol_gram_liter ? "border-destructive" : ""}`}
                placeholder="bijv. 85"
              />
              {vFouten.alcohol_gram_liter && (
                <span className="mt-1 block text-xs text-destructive">
                  {vFouten.alcohol_gram_liter}
                </span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Restsuiker (g/L)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={vRestsuiker}
                onChange={(e) => setVRestsuiker(e.target.value)}
                className={`${veldClass} ${vFouten.restsuiker_gram_liter ? "border-destructive" : ""}`}
                placeholder="bijv. 2"
              />
              {vFouten.restsuiker_gram_liter && (
                <span className="mt-1 block text-xs text-destructive">
                  {vFouten.restsuiker_gram_liter}
                </span>
              )}
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Zuur (g/L)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={vZuur}
                onChange={(e) => setVZuur(e.target.value)}
                className={`${veldClass} ${vFouten.zuur_gram_liter ? "border-destructive" : ""}`}
                placeholder="bijv. 6"
              />
              {vFouten.zuur_gram_liter && (
                <span className="mt-1 block text-xs text-destructive">
                  {vFouten.zuur_gram_liter}
                </span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Glycerine (g/L)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={vGlycerine}
                onChange={(e) => setVGlycerine(e.target.value)}
                className={`${veldClass} ${vFouten.glycerine_gram_liter ? "border-destructive" : ""}`}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={bewaarVoedingswaarde}
            disabled={voedingswaardeM.isPending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {voedingswaardeM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Bereken
          </button>

          {(voedingswaardeQ.data ?? []).length > 0 && (
            <div className="space-y-2 pt-1">
              {(voedingswaardeQ.data ?? []).map((v, i) => (
                <div key={v.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {i === 0 ? "Laatste berekening" : "Eerdere berekening"} ·{" "}
                      {format(parseISO(v.berekening_datum), "d MMM yyyy", { locale: nl })}
                    </p>
                    <button
                      type="button"
                      onClick={() => kopieerEtiket(v.etiket_tekst ?? "")}
                      className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-xs font-medium"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Kopieer
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm">{v.etiket_tekst}</pre>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
