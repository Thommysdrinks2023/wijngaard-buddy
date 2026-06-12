import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { z } from "zod";
import {
  createObservatie,
  fetchRijen,
  isPbConfigured,
} from "@/lib/data";
import { foutenPerVeld, isGeldig, valideerObservatie } from "@/lib/validatie";
import { OBSERVATIE_TYPES, type ObservatieType } from "@/lib/types";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { useVerbinding } from "@/components/verbinding-status";
import { comprimeerFoto } from "@/lib/foto-compressie";
import { Camera, Loader2 } from "lucide-react";

const searchSchema = z.object({
  plant: z.coerce.number().int().positive().optional(),
});

export const Route = createFileRoute("/rij/$rijId/observatie")({
  component: ObservatiePage,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Nieuwe observatie — Wijngaard" }] }),
});

function ObservatiePage() {
  const { rijId } = Route.useParams();
  const { plant } = Route.useSearch();
  const router = useRouter();
  const qc = useQueryClient();
  const [invoerder, setInvoerder] = useInvoerder();
  const verbinding = useVerbinding();

  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const rij = rijenQ.data?.find((r) => r.id === rijId);

  const [datum, setDatum] = useState(format(new Date(), "yyyy-MM-dd"));
  const [type, setType] = useState<ObservatieType>("groei");
  const [notitie, setNotitie] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [fouten, setFouten] = useState<Record<string, string>>({});

  const NEGATIVE_TYPES: ObservatieType[] = ["ziekte", "schade", "uitval"];

  const m = useMutation({
    mutationFn: () => {
      const trimmed = notitie.trim();
      const finalNotitie = trimmed.length > 0 ? trimmed : "Geen bijzonderheden";
      return createObservatie({
        rij: rijId,
        plant: plant ?? null,
        datum,
        type,
        notitie: finalNotitie,
        fotoFile: foto,
        ingevoerd_door: invoerder,
      });
    },
    onSuccess: () => {
      toast.success("Observatie opgeslagen");
      qc.invalidateQueries({ queryKey: ["observaties"] });
      router.history.back();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const showSoftWarning =
    notitie.trim().length === 0 && NEGATIVE_TYPES.includes(type);

  const canSave = invoerder.trim().length > 0 && !m.isPending;

  return (
    <>
      <AppHeader
        back
        title={plant ? `Observatie plant ${plant}` : "Nieuwe observatie"}
        subtitle={
          rij
            ? `Rij ${rij.rijnummer} · ${rij.ras}${plant ? ` · plant ${plant}` : ""}`
            : ""
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSave) return;
          const trimmed = notitie.trim();
          const validatie = valideerObservatie({
            rij: rijId,
            datum,
            type,
            notitie: trimmed.length > 0 ? trimmed : "Geen bijzonderheden",
            ingevoerd_door: invoerder,
          });
          if (!isGeldig(validatie)) {
            setFouten(foutenPerVeld(validatie));
            toast.error(validatie[0].bericht);
            return;
          }
          setFouten({});
          m.mutate();
        }}
        className="mx-auto max-w-screen-md space-y-4 px-3 py-4"
      >
        <Field label="Datum">
          <input
            type="date"
            value={datum}
            onChange={(e) => {
              setDatum(e.target.value);
              setFouten((f) => ({ ...f, datum: "" }));
            }}
            className={`h-12 w-full rounded-xl border bg-card px-3 text-base ${fouten.datum ? "border-destructive" : "border-input"}`}
            required
          />
          {fouten.datum && <p className="mt-1 text-sm text-destructive">{fouten.datum}</p>}
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

        <Field label="Notitie (optioneel)">
          <textarea
            value={notitie}
            onChange={(e) => setNotitie(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-input bg-card p-3 text-base"
            placeholder="Wat zie je? (optioneel)"
          />
          {showSoftWarning && (
            <p className="mt-1.5 text-sm text-amber-600 dark:text-amber-400">
              Wil je een korte omschrijving toevoegen?
            </p>
          )}
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
                onChange={async (e) => {
                  const gekozen = e.target.files?.[0] ?? null;
                  if (!gekozen) {
                    setFoto(null);
                    return;
                  }
                  const res = await comprimeerFoto(gekozen);
                  setFoto(res.file);
                  if (res.gecomprimeerdKb < res.origineelKb) {
                    toast.success(
                      `Foto verkleind: ${res.origineelKb} kB → ${res.gecomprimeerdKb} kB`,
                    );
                  }
                }}
                className="hidden"
              />
            </label>
            {foto && (!verbinding.online || !verbinding.ingelogd) && (
              <p className="mt-1.5 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
                📷 {!verbinding.online ? "Geen verbinding" : "Niet ingelogd"} — de foto wordt
                lokaal bewaard en automatisch meegestuurd zodra de verbinding terug is.
              </p>
            )}
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
