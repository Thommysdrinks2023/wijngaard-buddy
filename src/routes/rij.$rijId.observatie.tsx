import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  createObservatie,
  fetchRijen,
  isPbConfigured,
} from "@/lib/data";
import { OBSERVATIE_TYPES, type ObservatieType } from "@/lib/types";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { Camera, Loader2 } from "lucide-react";

export const Route = createFileRoute("/rij/$rijId/observatie")({
  component: ObservatiePage,
  head: () => ({ meta: [{ title: "Nieuwe observatie — Wijngaard" }] }),
});

function ObservatiePage() {
  const { rijId } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [invoerder, setInvoerder] = useInvoerder();

  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const rij = rijenQ.data?.find((r) => r.id === rijId);

  const [datum, setDatum] = useState(format(new Date(), "yyyy-MM-dd"));
  const [type, setType] = useState<ObservatieType>("groei");
  const [notitie, setNotitie] = useState("");
  const [foto, setFoto] = useState<File | null>(null);

  const m = useMutation({
    mutationFn: () =>
      createObservatie({
        rij: rijId,
        datum,
        type,
        notitie,
        fotoFile: foto,
        ingevoerd_door: invoerder,
      }),
    onSuccess: () => {
      toast.success("Observatie opgeslagen");
      qc.invalidateQueries({ queryKey: ["observaties"] });
      router.history.back();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave =
    invoerder.trim().length > 0 && notitie.trim().length > 0 && !m.isPending;

  return (
    <>
      <AppHeader
        back
        title="Nieuwe observatie"
        subtitle={rij ? `Rij ${rij.rijnummer} · ${rij.ras}` : ""}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) m.mutate();
        }}
        className="mx-auto max-w-screen-md space-y-4 px-3 py-4"
      >
        <Field label="Datum">
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
            required
          />
        </Field>

        <Field label="Type observatie">
          <div className="grid grid-cols-2 gap-2">
            {OBSERVATIE_TYPES.map((t) => {
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`flex h-16 items-center justify-center gap-2 rounded-xl border-2 text-base font-semibold transition ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  <span className="text-2xl">{t.emoji}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Notitie">
          <textarea
            value={notitie}
            onChange={(e) => setNotitie(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-input bg-card p-3 text-base"
            placeholder="Wat zie je?"
            required
          />
        </Field>

        {isPbConfigured() ? (
          <Field label="Foto">
            <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-card text-sm font-medium">
              <Camera className="h-5 w-5" />
              {foto ? foto.name : "Kies foto of maak één"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </Field>
        ) : null}

        <Field label="Ingevoerd door">
          <input
            value={invoerder}
            onChange={(e) => setInvoerder(e.target.value)}
            placeholder="Je naam"
            className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
            required
          />
        </Field>

        <div className="sticky bottom-20 -mx-3 border-t border-border bg-background/95 px-3 py-3 backdrop-blur">
          <button
            type="submit"
            disabled={!canSave}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {m.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Observatie opslaan
          </button>
        </div>
      </form>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
