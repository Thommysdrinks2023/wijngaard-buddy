import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import {
  createMaterieel,
  createOnderhoud,
  fetchMaterieel,
  fetchOnderhoud,
  MATERIEEL_TYPES,
  ONDERHOUD_TYPES,
  onderhoudBinnenkort,
  type MaterieelType,
  type OnderhoudType,
} from "@/lib/materieel-data";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";
import { CalendarClock, Loader2, Plus, Tractor, Wrench } from "lucide-react";

// Eindsprint Blok M — materieel & onderhoud. Bewust klein: een logboek per
// machine plus de widget "onderhoud binnenkort", geen assetmanagement.
export const Route = createFileRoute("/materieel")({
  component: MaterieelPage,
  head: () => ({ meta: [{ title: "Materieel — De Tappenmars Buddy" }] }),
});

const veldClass = "h-11 w-full rounded-xl border border-input bg-card px-3 text-sm";

function MaterieelPage() {
  const qc = useQueryClient();
  const [invoerder, setInvoerder] = useInvoerder();
  const materieelQ = useQuery({ queryKey: ["materieel"], queryFn: fetchMaterieel });
  const onderhoudQ = useQuery({ queryKey: ["onderhoud"], queryFn: () => fetchOnderhoud() });

  const materieelNaam = useMemo(() => {
    const m = new Map<string, string>();
    materieelQ.data?.forEach((x) => m.set(x.id, x.naam));
    return m;
  }, [materieelQ.data]);

  const binnenkort = useMemo(
    () => onderhoudBinnenkort(onderhoudQ.data ?? [], 30),
    [onderhoudQ.data],
  );

  // ---------- nieuw materieel ----------
  const [toonMaterieel, setToonMaterieel] = useState(false);
  const [mNaam, setMNaam] = useState("");
  const [mType, setMType] = useState<MaterieelType>("tractor");
  const [mBouwjaar, setMBouwjaar] = useState("");
  const materieelM = useMutation({
    mutationFn: () =>
      createMaterieel({
        naam: mNaam,
        type: mType,
        bouwjaar: mBouwjaar ? Number(mBouwjaar) : null,
      }),
    onSuccess: () => {
      toast.success("Materieel toegevoegd ✓");
      qc.invalidateQueries({ queryKey: ["materieel"] });
      setMNaam("");
      setMBouwjaar("");
      setToonMaterieel(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------- nieuwe onderhoudsregel ----------
  const [toonOnderhoud, setToonOnderhoud] = useState(false);
  const [oMaterieel, setOMaterieel] = useState("");
  const [oDatum, setODatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [oType, setOType] = useState<OnderhoudType>("onderhoud");
  const [oOmschrijving, setOOmschrijving] = useState("");
  const [oKosten, setOKosten] = useState("");
  const [oVolgende, setOVolgende] = useState("");
  const onderhoudM = useMutation({
    mutationFn: () =>
      createOnderhoud({
        materieel: oMaterieel,
        datum: oDatum,
        type: oType,
        omschrijving: oOmschrijving,
        kosten: oKosten ? Number(oKosten) : null,
        volgende_keer: oVolgende,
        ingevoerd_door: invoerder,
      }),
    onSuccess: () => {
      toast.success("Onderhoudsregel opgeslagen ✓");
      qc.invalidateQueries({ queryKey: ["onderhoud"] });
      setOOmschrijving("");
      setOKosten("");
      setOVolgende("");
      setToonOnderhoud(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bewaarOnderhoud = () => {
    if (onderhoudM.isPending) return;
    if (!oMaterieel) return void toast.error("Kies een machine");
    if (!oOmschrijving.trim()) return void toast.error("Omschrijving is verplicht");
    onderhoudM.mutate();
  };

  return (
    <>
      <AppHeader back title="Materieel" subtitle="Machines en onderhoud" />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <OfflineWaarschuwing wat="het materieel" />
        {/* Widget: onderhoud binnenkort */}
        {binnenkort.length > 0 && (
          <section className="rounded-2xl border border-warning/50 bg-card p-3">
            <h2 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="h-4 w-4" /> Onderhoud binnenkort (30 dagen)
            </h2>
            <ul className="space-y-1 text-sm">
              {binnenkort.map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span>{materieelNaam.get(r.materieel) ?? "…"}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {format(parseISO(r.volgende_keer as string), "d MMM yyyy", { locale: nl })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(materieelQ.isError || onderhoudQ.isError) && (
          <ErrorState
            error={materieelQ.error || onderhoudQ.error}
            onRetry={() => {
              materieelQ.refetch();
              onderhoudQ.refetch();
            }}
          />
        )}

        {/* Acties */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setToonOnderhoud((v) => !v)}
            className={`flex h-14 items-center justify-center gap-2 rounded-2xl text-sm font-semibold active:scale-[0.98] ${
              toonOnderhoud
                ? "border border-primary bg-primary-soft text-primary"
                : "bg-primary text-primary-foreground"
            }`}
          >
            <Wrench className="h-4 w-4" /> Onderhoud loggen
          </button>
          <button
            type="button"
            onClick={() => setToonMaterieel((v) => !v)}
            className={`flex h-14 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold active:scale-[0.98] ${
              toonMaterieel
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-card"
            }`}
          >
            <Plus className="h-4 w-4" /> Nieuwe machine
          </button>
        </div>

        {/* Nieuwe machine */}
        {toonMaterieel && (
          <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Naam</span>
                <input
                  value={mNaam}
                  onChange={(e) => setMNaam(e.target.value)}
                  className={veldClass}
                  placeholder="bijv. Fendt 208"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Type</span>
                <select
                  value={mType}
                  onChange={(e) => setMType(e.target.value as MaterieelType)}
                  className={veldClass}
                >
                  {MATERIEEL_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.emoji} {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Bouwjaar</span>
              <input
                type="number"
                inputMode="numeric"
                value={mBouwjaar}
                onChange={(e) => setMBouwjaar(e.target.value)}
                className={veldClass}
                placeholder="Optioneel"
              />
            </label>
            <button
              type="button"
              onClick={() =>
                mNaam.trim() ? materieelM.mutate() : toast.error("Naam is verplicht")
              }
              disabled={materieelM.isPending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {materieelM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Machine opslaan
            </button>
          </section>
        )}

        {/* Onderhoud loggen */}
        {toonOnderhoud && (
          <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Machine</span>
                <select
                  value={oMaterieel}
                  onChange={(e) => setOMaterieel(e.target.value)}
                  className={veldClass}
                >
                  <option value="">Kies machine…</option>
                  {(materieelQ.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.naam}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Type</span>
                <select
                  value={oType}
                  onChange={(e) => setOType(e.target.value as OnderhoudType)}
                  className={veldClass}
                >
                  {ONDERHOUD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.emoji} {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Omschrijving</span>
              <input
                value={oOmschrijving}
                onChange={(e) => setOOmschrijving(e.target.value)}
                className={veldClass}
                placeholder="bijv. oliefilter vervangen"
              />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Datum</span>
                <input
                  type="date"
                  value={oDatum}
                  onChange={(e) => setODatum(e.target.value)}
                  className={veldClass}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Kosten €</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={oKosten}
                  onChange={(e) => setOKosten(e.target.value)}
                  className={veldClass}
                  placeholder="—"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Volgende keer</span>
                <input
                  type="date"
                  value={oVolgende}
                  onChange={(e) => setOVolgende(e.target.value)}
                  className={veldClass}
                />
              </label>
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
              onClick={bewaarOnderhoud}
              disabled={onderhoudM.isPending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {onderhoudM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Onderhoudsregel opslaan
            </button>
          </section>
        )}

        {/* Machinepark + log */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Machinepark ({materieelQ.data?.length ?? 0})
          </h2>
          {(materieelQ.data ?? []).length === 0 ? (
            <EmptyState
              message="Nog geen machines — voeg de tractor, spuit of bottellijn toe."
              icon={<Tractor className="h-6 w-6" />}
            />
          ) : (
            <ul className="space-y-1.5">
              {(materieelQ.data ?? []).map((m) => {
                const info = MATERIEEL_TYPES.find((t) => t.value === m.type);
                const log = (onderhoudQ.data ?? []).filter((r) => r.materieel === m.id);
                return (
                  <li key={m.id} className="rounded-xl border border-border bg-card px-3 py-2">
                    <p className="text-sm font-medium">
                      {info?.emoji} {m.naam}
                      {m.bouwjaar ? (
                        <span className="text-xs text-muted-foreground"> · {m.bouwjaar}</span>
                      ) : null}
                    </p>
                    {log.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {log.slice(0, 3).map((r) => (
                          <li key={r.id}>
                            {format(parseISO(r.datum), "d MMM yyyy", { locale: nl })} ·{" "}
                            {ONDERHOUD_TYPES.find((t) => t.value === r.type)?.label}:{" "}
                            {r.omschrijving}
                            {r.kosten ? ` (€${r.kosten})` : ""}
                            {r.volgende_keer
                              ? ` → volgende: ${format(parseISO(r.volgende_keer), "d MMM yyyy", { locale: nl })}`
                              : ""}
                          </li>
                        ))}
                      </ul>
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
