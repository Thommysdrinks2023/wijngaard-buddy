// Fase 15 Blok A — flestypebeheer. Vlakke route (trailing-underscore-escape):
// instellingen.tsx heeft geen <Outlet/> en is zelf al een volledige pagina.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { createFlestype, fetchFlestypes, zetFlestypeActief } from "@/lib/flessen-data";
import {
  VEELGEBRUIKTE_FLESKLEUREN_LEEG,
  VEELGEBRUIKTE_FLESSLUITINGEN,
  VEELGEBRUIKTE_FLESVORMEN,
} from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";
import { Loader2, Plus } from "lucide-react";

export const Route = createFileRoute("/instellingen_/flestypes")({
  component: FlestypesBeheer,
  head: () => ({ meta: [{ title: "Flestypes — Instellingen" }] }),
});

function FlestypesBeheer() {
  const qc = useQueryClient();
  const flestypesQ = useQuery({ queryKey: ["flestypes"], queryFn: () => fetchFlestypes() });

  const [nieuw, setNieuw] = useState(false);
  const [vorm, setVorm] = useState("");
  const [inhoudMl, setInhoudMl] = useState("750");
  const [kleur, setKleur] = useState("");
  const [sluiting, setSluiting] = useState("");
  const [leverancier, setLeverancier] = useState("");
  const [perPallet, setPerPallet] = useState("");

  const createM = useMutation({
    mutationFn: () =>
      createFlestype({
        vorm,
        inhoud_ml: Number(inhoudMl),
        kleur: kleur || undefined,
        sluiting: sluiting || undefined,
        leverancier: leverancier || undefined,
        standaard_aantal_per_pallet: perPallet ? Number(perPallet) : undefined,
      }),
    onSuccess: () => {
      toast.success("Flestype aangemaakt.");
      qc.invalidateQueries({ queryKey: ["flestypes"] });
      setVorm("");
      setKleur("");
      setSluiting("");
      setLeverancier("");
      setPerPallet("");
      setNieuw(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Aanmaken mislukt."),
  });

  const toggleM = useMutation({
    mutationFn: (input: { id: string; actief: boolean }) =>
      zetFlestypeActief(input.id, input.actief),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flestypes"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Wijzigen mislukt."),
  });

  return (
    <>
      <AppHeader back title="Flestypes" subtitle="Vorm, inhoud, kleur en sluiting" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <OfflineWaarschuwing wat="de flestypes" />
        {flestypesQ.isError && (
          <ErrorState error={flestypesQ.error} onRetry={() => flestypesQ.refetch()} />
        )}

        {!nieuw ? (
          <button
            onClick={() => setNieuw(true)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-semibold text-muted-foreground active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" /> Nieuw flestype
          </button>
        ) : (
          <div className="space-y-3 rounded-xl border border-border bg-card p-3">
            <label className="block text-xs font-medium text-muted-foreground">
              Vorm
              <input
                list="flesvormen"
                value={vorm}
                onChange={(e) => setVorm(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              />
              <datalist id="flesvormen">
                {VEELGEBRUIKTE_FLESVORMEN.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-muted-foreground">
                Inhoud (ml)
                <input
                  type="number"
                  value={inhoudMl}
                  onChange={(e) => setInhoudMl(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                Kleur
                <input
                  list="fleskleuren"
                  value={kleur}
                  onChange={(e) => setKleur(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                />
                <datalist id="fleskleuren">
                  {VEELGEBRUIKTE_FLESKLEUREN_LEEG.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </label>
            </div>
            <label className="block text-xs font-medium text-muted-foreground">
              Sluiting
              <input
                list="flessluitingen"
                value={sluiting}
                onChange={(e) => setSluiting(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              />
              <datalist id="flessluitingen">
                {VEELGEBRUIKTE_FLESSLUITINGEN.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-muted-foreground">
                Leverancier (optioneel)
                <input
                  value={leverancier}
                  onChange={(e) => setLeverancier(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                Aantal per pallet (hulp)
                <input
                  type="number"
                  value={perPallet}
                  onChange={(e) => setPerPallet(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setNieuw(false)}
                className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold"
              >
                Annuleren
              </button>
              <button
                disabled={!vorm || !inhoudMl || createM.isPending}
                onClick={() => createM.mutate()}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {createM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Opslaan
              </button>
            </div>
          </div>
        )}

        {(flestypesQ.data ?? []).length === 0 && !flestypesQ.isLoading ? (
          <EmptyState message="Nog geen flestypes." />
        ) : (
          <ul className="space-y-2">
            {(flestypesQ.data ?? []).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {t.omschrijving || `${t.vorm} ${t.inhoud_ml} ml`}
                  </p>
                  {t.leverancier && (
                    <p className="text-xs text-muted-foreground">{t.leverancier}</p>
                  )}
                </div>
                <button
                  onClick={() => toggleM.mutate({ id: t.id, actief: !t.actief })}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
                    t.actief
                      ? "border-border bg-muted/40"
                      : "border-amber-300 bg-amber-50 text-amber-800"
                  }`}
                >
                  {t.actief ? "Actief" : "Inactief"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
