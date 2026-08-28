import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { boekTankboek, fetchKelderlog, fetchTankboek, fetchTanks } from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { foutenPerVeld, isGeldig, valideerBoeking } from "@/lib/validatie";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/error-state";
import { ArrowDown, Loader2 } from "lucide-react";

interface OverhevelenSearch {
  van?: string;
  partij?: string;
}

const VERLIES_TYPES = ["droesem", "verdamping", "morsen", "overig"] as const;

export const Route = createFileRoute("/kelder/overhevelen")({
  component: OverhevelenPage,
  validateSearch: (search: Record<string, unknown>): OverhevelenSearch => ({
    van: typeof search.van === "string" ? search.van : undefined,
    partij: typeof search.partij === "string" ? search.partij : undefined,
  }),
  head: () => ({ meta: [{ title: "Overhevelen — Kelder" }] }),
});

function OverhevelenPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [invoerder, setInvoerder] = useInvoerder();
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });

  const [vanTank, setVanTank] = useState(search.van ?? "");
  const [naarTank, setNaarTank] = useState("");
  const [volume, setVolume] = useState("");
  const [aangekomen, setAangekomen] = useState("");
  const [verliesType, setVerliesType] = useState<(typeof VERLIES_TYPES)[number]>("droesem");
  const [datum, setDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [notitie, setNotitie] = useState("");
  const [fouten, setFouten] = useState<Record<string, string>>({});

  // Fase 7 Blok D — verliezenboekhouding: als er minder aankomt dan vertrok,
  // stellen we het verschil voor als aparte verliesboeking. Opt-in: de
  // gebruiker ziet en bevestigt het voorstel, er wordt nooit stil geboekt.
  const volumeN = Number(volume) || 0;
  const aangekomenN = aangekomen === "" ? null : Number(aangekomen) || 0;
  const verschil =
    aangekomenN !== null && volumeN > 0 && aangekomenN < volumeN
      ? Math.round((volumeN - aangekomenN) * 100) / 100
      : 0;

  const bron = useMemo(() => tanksQ.data?.find((t) => t.id === vanTank), [tanksQ.data, vanTank]);
  // de partij volgt uit de brontank — overhevelen kan alleen wat er echt in zit
  const partij = useMemo(
    () => partijenQ.data?.find((p) => p.id === bron?.huidige_partij),
    [partijenQ.data, bron],
  );

  const bronTanks = useMemo(
    () => (tanksQ.data ?? []).filter((t) => t.huidig_volume_l > 0),
    [tanksQ.data],
  );
  // Fase 7 Blok D — hygiëne-waarschuwing (niet blokkerend): doeltank is leeg
  // maar de laatste reiniging ligt vóór de laatste tankboek-activiteit (of er
  // is nooit een reiniging gelogd).
  const doelReinigingQ = useQuery({
    queryKey: ["kelderlog", "reiniging", naarTank],
    queryFn: () => fetchKelderlog({ tank: naarTank, actie: "reiniging" }),
    enabled: !!naarTank,
  });
  const doelTankboekQ = useQuery({
    queryKey: ["tankboek", "tank", naarTank],
    queryFn: () => fetchTankboek({ tank: naarTank }),
    enabled: !!naarTank,
  });
  const doel = useMemo(() => tanksQ.data?.find((t) => t.id === naarTank), [tanksQ.data, naarTank]);
  const hygieneWaarschuwing = useMemo(() => {
    if (!naarTank || !doel || doel.huidige_partij) return null;
    const laatsteActiviteit = doelTankboekQ.data?.[0]?.datum ?? null;
    if (!laatsteActiviteit) return null; // nooit gebruikt — geen signaal nodig
    const laatsteReiniging = doelReinigingQ.data?.[0]?.datum ?? null;
    if (!laatsteReiniging)
      return `Tank ${doel.code} is na de laatste lediging (${laatsteActiviteit}) niet als gereinigd gelogd.`;
    if (laatsteReiniging < laatsteActiviteit)
      return `Laatste reiniging van tank ${doel.code} (${laatsteReiniging}) ligt vóór de laatste lediging (${laatsteActiviteit}).`;
    return null;
  }, [naarTank, doel, doelTankboekQ.data, doelReinigingQ.data]);

  const doelTanks = useMemo(
    () =>
      (tanksQ.data ?? []).filter(
        (t) =>
          t.id !== vanTank &&
          t.status !== "reiniging" &&
          t.status !== "defect" &&
          (!t.huidige_partij || t.huidige_partij === bron?.huidige_partij),
      ),
    [tanksQ.data, vanTank, bron],
  );

  const m = useMutation({
    mutationFn: async () => {
      // met verliesvoorstel: overheveling voor het aangekomen volume + aparte
      // verliesregel uit de brontank; zonder verschil: één gewone boeking
      const overhevelVolume = verschil > 0 ? aangekomenN! : Number(volume);
      const r = await boekTankboek({
        datum,
        partij: partij!.id,
        eigenaar: partij?.eigenaar ?? undefined,
        actie: "overhevelen",
        van_tank: vanTank,
        naar_tank: naarTank,
        volume_l: overhevelVolume,
        verantwoordelijke: invoerder,
        notitie,
      });
      if (verschil > 0) {
        await boekTankboek({
          datum,
          partij: partij!.id,
          eigenaar: partij?.eigenaar ?? undefined,
          actie: "verlies",
          van_tank: vanTank,
          volume_l: verschil,
          verantwoordelijke: invoerder,
          notitie: `Verlies bij overhevelen naar tank (${verliesType})${notitie ? ` — ${notitie}` : ""}`,
        });
      }
      return r;
    },
    onSuccess: (r) => {
      toast.success(
        verschil > 0
          ? `Overheveling + verlies (${verschil} L, ${verliesType}) geboekt ✓`
          : "Overheveling geboekt ✓",
      );
      if (r.waarschuwing) toast.warning(r.waarschuwing);
      qc.invalidateQueries({ queryKey: ["tanks"] });
      qc.invalidateQueries({ queryKey: ["tankboek"] });
      navigate({ to: "/kelder" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSave = () => {
    if (m.isPending) return;
    const validatie = valideerBoeking({
      partij: partij?.id,
      actie: "overhevelen",
      datum,
      van_tank: vanTank,
      naar_tank: naarTank,
      volume_l: volume ? Number(volume) : undefined,
      verantwoordelijke: invoerder,
    });
    if (!partij) validatie.unshift({ veld: "van_tank", bericht: "Kies een gevulde brontank" });
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
      <AppHeader back title="Overhevelen" subtitle="Tank naar tank" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        {(tanksQ.isError || partijenQ.isError) && (
          <ErrorState
            error={tanksQ.error || partijenQ.error}
            onRetry={() => {
              tanksQ.refetch();
              partijenQ.refetch();
            }}
          />
        )}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Van tank</span>
            <select
              value={vanTank}
              onChange={(e) => {
                setVanTank(e.target.value);
                setNaarTank("");
              }}
              className={`${veldClass} ${fouten.van_tank ? "border-destructive" : ""}`}
            >
              <option value="">Kies brontank…</option>
              {bronTanks.map((t) => (
                <option key={t.id} value={t.id}>
                  Tank {t.code} · {Math.round(t.huidig_volume_l)} L
                </option>
              ))}
            </select>
            {fouten.van_tank && (
              <span className="mt-1 block text-sm text-destructive">{fouten.van_tank}</span>
            )}
          </label>

          {bron && partij && (
            <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm">
              {partij.naam} · {partij.jaargang} — systeem toont{" "}
              <strong>{Math.round(bron.huidig_volume_l)} L</strong> in tank {bron.code}
            </p>
          )}

          <div className="flex justify-center">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Naar tank</span>
            <select
              value={naarTank}
              onChange={(e) => setNaarTank(e.target.value)}
              className={`${veldClass} ${fouten.naar_tank ? "border-destructive" : ""}`}
            >
              <option value="">Kies doeltank…</option>
              {doelTanks.map((t) => (
                <option key={t.id} value={t.id}>
                  Tank {t.code} · {t.soort}
                  {t.capaciteit_l > 0
                    ? ` (${Math.round(t.capaciteit_l - t.huidig_volume_l)} L vrij)`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          {hygieneWaarschuwing && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              🧽 {hygieneWaarschuwing} Vullen kan gewoon, maar log zo nodig eerst een reiniging via
              het tankdetail.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Volume (L)</span>
              <input
                type="number"
                inputMode="decimal"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className={`${veldClass} ${fouten.volume_l ? "border-destructive" : ""}`}
                placeholder={bron ? `max ${Math.round(bron.huidig_volume_l)}` : ""}
              />
              {fouten.volume_l && (
                <span className="mt-1 block text-sm text-destructive">{fouten.volume_l}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Datum</span>
              <input
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className={`${veldClass} ${fouten.datum ? "border-destructive" : ""}`}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              In doeltank aangekomen (L) — optioneel
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={aangekomen}
              onChange={(e) => setAangekomen(e.target.value)}
              className={veldClass}
              placeholder="leeg = gelijk aan verzonden volume"
            />
          </label>

          {verschil > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">
                Verschil van {verschil} L — de app stelt een verliesboeking voor (niets wordt
                stilzwijgend geboekt):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {VERLIES_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setVerliesType(t)}
                    className={`h-9 rounded-lg border px-3 text-xs font-medium ${
                      verliesType === t
                        ? "border-amber-600 bg-amber-600 text-white"
                        : "border-amber-300 bg-white"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-xs text-amber-800">
                Boekt: overheveling van {aangekomenN} L + verliesregel van {verschil} L (
                {verliesType}) uit tank {bron?.code ?? "?"}. Telt mee in accijns- en jaaroverzicht.
              </p>
            </div>
          )}

          {bron && volume && Number(volume) === Math.round(bron.huidig_volume_l) && (
            <p className="text-xs text-muted-foreground">
              Volledig overhevelen: tank {bron.code} komt hiermee leeg te staan.
            </p>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Verantwoordelijke</span>
            <input
              value={invoerder}
              onChange={(e) => setInvoerder(e.target.value)}
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
            <span className="mb-1.5 block text-sm font-medium">Notitie / reden</span>
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
            Overheveling boeken
          </button>
          <p className="text-xs text-muted-foreground">
            De server controleert capaciteit, inhoud en partij vóór het boeken; bij een verschil
            tussen systeem en werkelijkheid wordt de boeking geweigerd met uitleg.
          </p>
        </section>
      </div>
    </>
  );
}
