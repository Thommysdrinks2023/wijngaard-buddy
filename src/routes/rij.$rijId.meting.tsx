import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { z } from "zod";
import { createMeting, fetchRijen, isPbConfigured } from "@/lib/data";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { RijpheidStars } from "@/components/rijpheid-stars";
import { Camera, Loader2 } from "lucide-react";

const searchSchema = z.object({
  plant: z.coerce.number().int().positive().optional(),
});

export const Route = createFileRoute("/rij/$rijId/meting")({
  component: MetingPage,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Nieuwe meting — Wijngaard" }] }),
});

function MetingPage() {
  const { rijId } = Route.useParams();
  const { plant } = Route.useSearch();
  const router = useRouter();
  const qc = useQueryClient();
  const [invoerder, setInvoerder] = useInvoerder();

  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const rij = rijenQ.data?.find((r) => r.id === rijId);

  // Defaults: vandaag, score 3
  const [datum, setDatum] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [brix, setBrix] = useState("");
  const [ph, setPh] = useState("");
  const [zuur, setZuur] = useState("");
  const [score, setScore] = useState<number>(3);
  const [notitie, setNotitie] = useState("");
  const [foto, setFoto] = useState<File | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      if (!invoerder.trim()) {
        throw new Error("Vul je naam in bij 'Ingevoerd door'");
      }
      if (!datum) {
        throw new Error("Kies een datum");
      }
      return createMeting({
        rij: rijId,
        plant: plant ?? null,
        datum,
        brix: brix ? Number(brix) : null,
        ph: ph ? Number(ph) : null,
        zuurgraad: zuur ? Number(zuur) : null,
        rijpheid_score: score,
        notitie,
        fotoFile: foto,
        ingevoerd_door: invoerder,
      });
    },
    onSuccess: () => {
      toast.success("Meting opgeslagen ✓");
      qc.invalidateQueries({ queryKey: ["metingen"] });
      router.history.back();
    },
    onError: (e: Error) => {
      toast.error(e?.message ?? "Opslaan mislukt");
    },
  });

  const handleSave = () => {
    if (m.isPending) return;
    m.mutate();
  };

  return (
    <>
      <AppHeader
        back
        title={plant ? `Meting plant ${plant}` : "Nieuwe meting"}
        subtitle={
          rij
            ? `Rij ${rij.rijnummer} · ${rij.ras}${plant ? ` · plant ${plant}` : ""}`
            : "Rij laden…"
        }
      />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <Field label="Datum">
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Brix">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={brix}
              onChange={(e) => setBrix(e.target.value)}
              className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
              placeholder="—"
            />
          </Field>
          <Field label="pH">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={ph}
              onChange={(e) => setPh(e.target.value)}
              className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
              placeholder="—"
            />
          </Field>
          <Field label="Zuur (g/L)">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={zuur}
              onChange={(e) => setZuur(e.target.value)}
              className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
              placeholder="—"
            />
          </Field>
        </div>

        <Field label={`Rijpheid (${score}/5)`}>
          <div className="rounded-xl border border-input bg-card p-2">
            <RijpheidStars value={score} onChange={(v) => setScore(v)} />
          </div>
        </Field>

        <Field label="Notitie">
          <textarea
            value={notitie}
            onChange={(e) => setNotitie(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-input bg-card p-3 text-base"
            placeholder="Optioneel…"
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
          />
        </Field>

        <div
          className="sticky -mx-3 border-t border-border bg-background/95 px-3 py-3 backdrop-blur"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)", zIndex: 50 }}
        >
          <button
            type="button"
            onClick={handleSave}
            disabled={m.isPending}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {m.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Meting opslaan
          </button>
        </div>
      </div>
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
