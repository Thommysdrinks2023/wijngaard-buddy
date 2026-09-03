// Fase 17 Blok C/D — beheerscherm voor sluitingen (dopspecificaties). Vlakke
// route: instellingen.tsx heeft geen <Outlet/>.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getPb } from "@/lib/data";
import { fetchSluitingen } from "@/lib/pasteurisatie-data";
import { maxDrukBekend, SLUITING_TYPES, type SluitingType } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";
import { EmptyState } from "@/components/empty-state";
import { Loader2, Plus } from "lucide-react";

export const Route = createFileRoute("/instellingen_/sluitingen")({
  component: SluitingenBeheer,
  head: () => ({ meta: [{ title: "Sluitingen — Instellingen" }] }),
});

function SluitingenBeheer() {
  const qc = useQueryClient();
  const sluitingenQ = useQuery({ queryKey: ["sluitingen"], queryFn: () => fetchSluitingen() });

  const [nieuw, setNieuw] = useState(false);
  const [naam, setNaam] = useState("");
  const [type, setType] = useState<SluitingType>("kroonkurk");
  const [maxDruk, setMaxDruk] = useState("");
  const [geschikt, setGeschikt] = useState(true);
  const [liner, setLiner] = useState("");

  const createM = useMutation({
    mutationFn: async () => {
      const pb = getPb();
      if (!pb) throw new Error("Geen verbinding.");
      await pb.collection("sluitingen").create({
        naam,
        type,
        max_druk_bar: maxDruk ? Number(maxDruk) : 0,
        geschikt_voor_gecarboniseerd: geschikt,
        liner,
        actief: true,
      });
    },
    onSuccess: () => {
      toast.success("Sluiting aangemaakt.");
      qc.invalidateQueries({ queryKey: ["sluitingen"] });
      setNaam("");
      setMaxDruk("");
      setLiner("");
      setNieuw(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const drukM = useMutation({
    mutationFn: async (input: { id: string; maxDruk: string }) => {
      const pb = getPb();
      if (!pb) throw new Error("Geen verbinding.");
      await pb.collection("sluitingen").update(input.id, { max_druk_bar: Number(input.maxDruk) });
    },
    onSuccess: () => {
      toast.success("Dopspecificatie opgeslagen.");
      qc.invalidateQueries({ queryKey: ["sluitingen"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [bewerktId, setBewerktId] = useState("");
  const [bewerktDruk, setBewerktDruk] = useState("");

  const veldClass = "h-12 w-full rounded-xl border border-input bg-background px-3 text-base";

  return (
    <>
      <AppHeader back title="Sluitingen" subtitle="Dopspecificaties voor het veiligheidsoordeel" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <OfflineWaarschuwing wat="de sluitingen" />
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Vul `max_druk_bar` alleen in als de fabrieksspecificatie echt bekend is — een geraden
          getal is gevaarlijker dan een zichtbaar "onbekend".
        </p>

        {!nieuw ? (
          <button
            onClick={() => setNieuw(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-semibold text-muted-foreground"
          >
            <Plus className="h-4 w-4" /> Nieuwe sluiting
          </button>
        ) : (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Naam</span>
              <input value={naam} onChange={(e) => setNaam(e.target.value)} className={veldClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as SluitingType)}
                className={veldClass}
              >
                {SLUITING_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">
                Max. druk (bar) — leeg = onbekend
              </span>
              <input
                type="number"
                step="0.1"
                value={maxDruk}
                onChange={(e) => setMaxDruk(e.target.value)}
                className={veldClass}
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={geschikt}
                onChange={(e) => setGeschikt(e.target.checked)}
                className="h-5 w-5"
              />
              Geschikt voor gecarboniseerd product
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Liner (optioneel)</span>
              <input
                value={liner}
                onChange={(e) => setLiner(e.target.value)}
                className={veldClass}
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setNieuw(false)}
                className="h-12 flex-1 rounded-xl border border-border text-sm font-semibold"
              >
                Annuleren
              </button>
              <button
                disabled={!naam || createM.isPending}
                onClick={() => createM.mutate()}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {createM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Opslaan
              </button>
            </div>
          </div>
        )}

        {(sluitingenQ.data ?? []).length === 0 ? (
          <EmptyState message="Nog geen sluitingen." />
        ) : (
          <ul className="space-y-2">
            {(sluitingenQ.data ?? []).map((s) => (
              <li key={s.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{s.naam}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.type} · {s.geschikt_voor_gecarboniseerd ? "geschikt" : "NIET geschikt"}{" "}
                      voor gecarboniseerd
                      {s.liner ? ` · liner: ${s.liner}` : ""}
                    </p>
                  </div>
                  {maxDrukBekend(s) ? (
                    <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                      max {s.max_druk_bar} bar
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                      Max. druk onbekend
                    </span>
                  )}
                </div>
                {!maxDrukBekend(s) &&
                  (bewerktId === s.id ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={bewerktDruk}
                        onChange={(e) => setBewerktDruk(e.target.value)}
                        className="h-11 w-24 rounded-xl border border-input bg-background px-3 text-base"
                        placeholder="bar"
                      />
                      <button
                        disabled={drukM.isPending}
                        onClick={() => drukM.mutate({ id: s.id, maxDruk: bewerktDruk })}
                        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        Opslaan
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setBewerktId(s.id);
                        setBewerktDruk("");
                      }}
                      className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
                    >
                      Specificatie aanvullen
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
