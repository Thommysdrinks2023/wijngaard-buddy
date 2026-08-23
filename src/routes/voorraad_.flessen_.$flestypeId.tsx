// Fase 15 Blok B — flestypedetail: mutatiehistorie (omgekeerd chronologisch,
// zoals het tankboek), ontvangst boeken en telcorrectie boeken.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  boekFlessenMutatie,
  boekTelcorrectie,
  fetchFlessenMutaties,
  fetchFlessenStanden,
  fetchFlestypes,
} from "@/lib/flessen-data";
import { useInvoerder } from "@/lib/use-invoerder";
import { FLESSEN_MUTATIE_TYPES } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Loader2, PackagePlus, Calculator } from "lucide-react";

export const Route = createFileRoute("/voorraad_/flessen_/$flestypeId")({
  component: FlestypeDetail,
  head: () => ({ meta: [{ title: "Flestype — Voorraad" }] }),
});

function mutatieLabel(type: string) {
  return FLESSEN_MUTATIE_TYPES.find((t) => t.value === type);
}

function FlestypeDetail() {
  const { flestypeId } = Route.useParams();
  const qc = useQueryClient();
  const [invoerder, setInvoerder] = useInvoerder();
  const [scherm, setScherm] = useState<"historie" | "ontvangst" | "telcorrectie">("historie");

  const flestypesQ = useQuery({ queryKey: ["flestypes"], queryFn: () => fetchFlestypes() });
  const standenQ = useQuery({ queryKey: ["flessen-standen"], queryFn: fetchFlessenStanden });
  const mutatiesQ = useQuery({
    queryKey: ["flessen-mutaties", flestypeId],
    queryFn: () => fetchFlessenMutaties({ flestype: flestypeId }),
  });

  const flestype = flestypesQ.data?.find((t) => t.id === flestypeId);
  const stand = standenQ.data?.[flestypeId] ?? 0;

  // ---------- Ontvangst ----------
  const [datum, setDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [aantalPallets, setAantalPallets] = useState("");
  const [aantalPerPallet, setAantalPerPallet] = useState(() =>
    flestype?.standaard_aantal_per_pallet ? String(flestype.standaard_aantal_per_pallet) : "",
  );
  const [aantal, setAantal] = useState("");
  const [leverancier, setLeverancier] = useState("");
  const [toelichting, setToelichting] = useState("");
  const berekendAantal =
    aantalPallets && aantalPerPallet ? Number(aantalPallets) * Number(aantalPerPallet) : null;

  const ontvangstM = useMutation({
    mutationFn: () =>
      boekFlessenMutatie({
        flestype: flestypeId,
        mutatie_type: "ontvangst",
        aantal: Number(aantal || berekendAantal || 0),
        datum,
        leverancier: leverancier || undefined,
        aantal_pallets: aantalPallets ? Number(aantalPallets) : undefined,
        toelichting: toelichting || undefined,
        ingevoerd_door: invoerder || undefined,
      }),
    onSuccess: () => {
      toast.success("Ontvangst geboekt.");
      qc.invalidateQueries({ queryKey: ["flessen-mutaties"] });
      qc.invalidateQueries({ queryKey: ["flessen-standen"] });
      setAantal("");
      setAantalPallets("");
      setToelichting("");
      setScherm("historie");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Boeken mislukt."),
  });

  // ---------- Telcorrectie ----------
  const [geteld, setGeteld] = useState("");
  const [telToelichting, setTelToelichting] = useState("");
  const verschil = geteld !== "" ? Number(geteld) - stand : null;

  const telcorrectieM = useMutation({
    mutationFn: () =>
      boekTelcorrectie({
        flestype: flestypeId,
        geteld_aantal: Number(geteld),
        datum,
        toelichting: telToelichting || undefined,
        ingevoerd_door: invoerder || undefined,
      }),
    onSuccess: (res) => {
      if (!res.regelId) toast.info("Geteld aantal komt overeen — geen correctie nodig.");
      else toast.success(`Telcorrectie geboekt (${verschil! > 0 ? "+" : ""}${verschil}).`);
      qc.invalidateQueries({ queryKey: ["flessen-mutaties"] });
      qc.invalidateQueries({ queryKey: ["flessen-standen"] });
      setGeteld("");
      setTelToelichting("");
      setScherm("historie");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Boeken mislukt."),
  });

  if (flestypesQ.isError)
    return <ErrorState error={flestypesQ.error} onRetry={() => flestypesQ.refetch()} />;

  return (
    <>
      <AppHeader
        back
        title={flestype?.omschrijving || "Flestype"}
        subtitle={`Huidige stand: ${stand} stuks`}
      />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <div className="flex gap-2">
          <button
            onClick={() => setScherm("ontvangst")}
            className="flex-1 rounded-xl border border-border bg-card p-3 text-sm font-semibold active:scale-[0.99]"
          >
            <PackagePlus className="mx-auto mb-1 h-5 w-5" />
            Ontvangst boeken
          </button>
          <button
            onClick={() => setScherm("telcorrectie")}
            className="flex-1 rounded-xl border border-border bg-card p-3 text-sm font-semibold active:scale-[0.99]"
          >
            <Calculator className="mx-auto mb-1 h-5 w-5" />
            Telcorrectie boeken
          </button>
        </div>

        {scherm === "ontvangst" && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-3">
            <h2 className="text-sm font-semibold">Ontvangst boeken</h2>
            <label className="block text-xs font-medium text-muted-foreground">
              Datum
              <input
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-muted-foreground">
                Aantal pallets
                <input
                  type="number"
                  value={aantalPallets}
                  onChange={(e) => setAantalPallets(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                Per pallet (schatting)
                <input
                  type="number"
                  value={aantalPerPallet}
                  onChange={(e) => setAantalPerPallet(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-muted-foreground">
              Aantal (aanpasbaar — telling wint van rekenen)
              <input
                type="number"
                value={aantal || berekendAantal || ""}
                onChange={(e) => setAantal(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Leverancier
              <input
                value={leverancier}
                onChange={(e) => setLeverancier(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Naam (invoerder)
              <input
                value={invoerder}
                onChange={(e) => setInvoerder(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Toelichting
              <textarea
                value={toelichting}
                onChange={(e) => setToelichting(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                rows={2}
              />
            </label>
            <button
              disabled={!(aantal || berekendAantal) || ontvangstM.isPending}
              onClick={() => ontvangstM.mutate()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {ontvangstM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Ontvangst opslaan
            </button>
          </div>
        )}

        {scherm === "telcorrectie" && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-3">
            <h2 className="text-sm font-semibold">Telcorrectie boeken</h2>
            <p className="text-xs text-muted-foreground">
              Systeem toont nu <strong>{stand}</strong> stuks. Voer de fysiek getelde stand in — het
              verschil wordt automatisch geboekt.
            </p>
            <label className="block text-xs font-medium text-muted-foreground">
              Datum
              <input
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Getelde stand
              <input
                type="number"
                value={geteld}
                onChange={(e) => setGeteld(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold"
              />
            </label>
            {verschil !== null && verschil !== 0 && (
              <p className="text-sm font-medium">
                Verschil:{" "}
                <span className="tabular-nums">
                  {verschil > 0 ? "+" : ""}
                  {verschil}
                </span>
              </p>
            )}
            <label className="block text-xs font-medium text-muted-foreground">
              Naam (invoerder)
              <input
                value={invoerder}
                onChange={(e) => setInvoerder(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Toelichting
              <textarea
                value={telToelichting}
                onChange={(e) => setTelToelichting(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                rows={2}
              />
            </label>
            <button
              disabled={geteld === "" || telcorrectieM.isPending}
              onClick={() => telcorrectieM.mutate()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {telcorrectieM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Telcorrectie opslaan
            </button>
          </div>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Mutatiehistorie
          </h2>
          {mutatiesQ.isError && (
            <ErrorState error={mutatiesQ.error} onRetry={() => mutatiesQ.refetch()} />
          )}
          {(mutatiesQ.data ?? []).length === 0 && !mutatiesQ.isLoading ? (
            <EmptyState message="Nog geen mutaties voor dit flestype." />
          ) : (
            <ul className="space-y-2">
              {(mutatiesQ.data ?? []).map((m) => {
                const info = mutatieLabel(m.mutatie_type);
                return (
                  <li key={m.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {info?.emoji} {info?.label ?? m.mutatie_type} · {m.datum}
                      </span>
                      <span
                        className={`text-sm font-bold tabular-nums ${m.aantal < 0 ? "text-destructive" : "text-primary"}`}
                      >
                        {m.aantal > 0 ? "+" : ""}
                        {m.aantal}
                      </span>
                    </div>
                    {m.toelichting && <p className="mt-1 text-xs">{m.toelichting}</p>}
                    {(m.leverancier || m.ingevoerd_door) && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {[m.leverancier, m.ingevoerd_door].filter(Boolean).join(" · ")}
                      </p>
                    )}
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
