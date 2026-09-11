// Fase 17 Blok I — validatiestatus per rekenmodel. Zolang Thomas een model
// niet met een echte, nagemeten run heeft bevestigd, blijft het op
// "nog niet gevalideerd" staan. Vlakke route: instellingen.tsx heeft geen
// <Outlet/>.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { fetchRekenmodelValidaties, zetRekenmodelValidatie } from "@/lib/pasteurisatie-data";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/instellingen_/rekenmodel-validaties")({
  component: ValidatiesBeheer,
  head: () => ({ meta: [{ title: "Validatiestatus — Instellingen" }] }),
});

const MODEL_LABELS: Record<string, string> = {
  pasteurisatie_pu: "PU-rekenkern (pasteurisatie.ts)",
  drukveiligheid_co2: "Drukveiligheid (drukveiligheid.ts)",
};

function ValidatiesBeheer() {
  const qc = useQueryClient();
  const [invoerder] = useInvoerder();
  const validatiesQ = useQuery({
    queryKey: ["rekenmodel-validaties"],
    queryFn: fetchRekenmodelValidaties,
  });
  const [toelichting, setToelichting] = useState<Record<string, string>>({});

  const zetM = useMutation({
    mutationFn: (input: { id: string; gevalideerd: boolean }) =>
      zetRekenmodelValidatie(input.id, {
        gevalideerd: input.gevalideerd,
        toelichting: toelichting[input.id] || "",
        gevalideerd_door: invoerder,
      }),
    onSuccess: () => {
      toast.success("Validatiestatus bijgewerkt.");
      qc.invalidateQueries({ queryKey: ["rekenmodel-validaties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AppHeader
        back
        title="Validatiestatus rekenmodellen"
        subtitle="Pasteurisatie & drukveiligheid"
      />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <OfflineWaarschuwing wat="de validatiestatussen" />
        <p className="text-sm text-muted-foreground">
          Zet een model pas op "gevalideerd" nadat een echte run is nagemeten en de uitkomst is
          vergeleken met wat het model voorspelde.
        </p>
        {/* Zonder deze takken rendert een mislukte query simpelweg niets: een
            lege pagina zonder uitleg, uitgerekend op het scherm dat bepaalt of
            een rekenmodel als gevalideerd geldt. "Ik zie geen modellen" mag
            hier nooit hetzelfde zijn als "de lijst kon niet geladen worden". */}
        {validatiesQ.isError && (
          <ErrorState error={validatiesQ.error} onRetry={() => validatiesQ.refetch()} />
        )}
        {!validatiesQ.isError &&
          !validatiesQ.isPending &&
          (validatiesQ.data ?? []).length === 0 && (
            <EmptyState message="Nog geen rekenmodellen geregistreerd." />
          )}
        {(validatiesQ.data ?? []).map((v) => (
          <section key={v.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {MODEL_LABELS[v.model_sleutel] ?? v.model_sleutel}
              </h2>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  v.gevalideerd ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                }`}
              >
                {v.gevalideerd ? "✅ Gevalideerd" : "⚠️ Nog niet gevalideerd"}
              </span>
            </div>
            {v.gevalideerd_op && (
              <p className="text-xs text-muted-foreground">
                Laatst gezet: {v.gevalideerd_op} door {v.gevalideerd_door}
              </p>
            )}
            {v.toelichting && <p className="text-sm">{v.toelichting}</p>}
            <label className="block">
              <span className="mb-1 block text-xs font-medium">
                Toelichting (bijv. welke run, wat gemeten)
              </span>
              <textarea
                value={toelichting[v.id] ?? ""}
                onChange={(e) => setToelichting((prev) => ({ ...prev, [v.id]: e.target.value }))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                rows={2}
              />
            </label>
            <div className="flex gap-2">
              {!v.gevalideerd ? (
                <button
                  disabled={zetM.isPending}
                  onClick={() => zetM.mutate({ id: v.id, gevalideerd: true })}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {zetM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Markeer als gevalideerd
                </button>
              ) : (
                <button
                  disabled={zetM.isPending}
                  onClick={() => zetM.mutate({ id: v.id, gevalideerd: false })}
                  className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold"
                >
                  Terugzetten naar "nog niet gevalideerd"
                </button>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
