import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { z } from "zod";
import { createMeting, fetchRijen, isPbConfigured, type MetingInput } from "@/lib/data";
import { foutenPerVeld, isGeldig, valideerMeting } from "@/lib/validatie";
import { NEERSLAG_OPTIES, type NeerslagType } from "@/lib/types";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { RijpheidStars } from "@/components/rijpheid-stars";
import { useVerbinding } from "@/components/verbinding-status";
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
  const verbinding = useVerbinding();

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
  const [temp, setTemp] = useState("");
  const [neerslag, setNeerslag] = useState<NeerslagType | "">("");
  const [fouten, setFouten] = useState<Record<string, string>>({});

  const buildInput = (): MetingInput => ({
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
    temperatuur: temp ? Number(temp) : null,
    neerslag: neerslag || null,
  });

  const m = useMutation({
    mutationFn: async () => createMeting(buildInput()),
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
    const validatie = valideerMeting(buildInput());
    if (!isGeldig(validatie)) {
      setFouten(foutenPerVeld(validatie));
      toast.error(validatie[0].bericht);
      return;
    }
    setFouten({});
    m.mutate();
  };

  // veldfout wissen zodra de gebruiker het veld aanpast
  const wisFout = (veld: string) =>
    setFouten((f) => {
      if (!f[veld]) return f;
      const kopie = { ...f };
      delete kopie[veld];
      return kopie;
    });

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
        <Field label="Datum" fout={fouten.datum}>
          <input
            type="date"
            value={datum}
            onChange={(e) => {
              setDatum(e.target.value);
              wisFout("datum");
            }}
            className={`h-12 w-full rounded-xl border bg-card px-3 text-base ${fouten.datum ? "border-destructive" : "border-input"}`}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Brix" fout={fouten.brix}>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={brix}
              onChange={(e) => {
                setBrix(e.target.value);
                wisFout("brix");
              }}
              className={`h-12 w-full rounded-xl border bg-card px-3 text-base ${fouten.brix ? "border-destructive" : "border-input"}`}
              placeholder="—"
            />
          </Field>
          <Field label="pH" fout={fouten.ph}>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={ph}
              onChange={(e) => {
                setPh(e.target.value);
                wisFout("ph");
              }}
              className={`h-12 w-full rounded-xl border bg-card px-3 text-base ${fouten.ph ? "border-destructive" : "border-input"}`}
              placeholder="—"
            />
          </Field>
          <Field label="Zuur (g/L)" fout={fouten.zuurgraad}>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={zuur}
              onChange={(e) => {
                setZuur(e.target.value);
                wisFout("zuurgraad");
              }}
              className={`h-12 w-full rounded-xl border bg-card px-3 text-base ${fouten.zuurgraad ? "border-destructive" : "border-input"}`}
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

        <section className="rounded-xl border border-border bg-card p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Weer (optioneel)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Temperatuur (°C)" fout={fouten.temperatuur}>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={temp}
                onChange={(e) => {
                  setTemp(e.target.value);
                  wisFout("temperatuur");
                }}
                className={`h-12 w-full rounded-xl border bg-card px-3 text-base ${fouten.temperatuur ? "border-destructive" : "border-input"}`}
                placeholder="—"
              />
            </Field>
            <Field label="Neerslag">
              <select
                value={neerslag}
                onChange={(e) => setNeerslag(e.target.value as NeerslagType | "")}
                className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
              >
                <option value="">—</option>
                {NEERSLAG_OPTIES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

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
            {foto && (!verbinding.online || !verbinding.ingelogd) && (
              <p className="mt-1.5 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
                📷 {!verbinding.online ? "Geen verbinding" : "Niet ingelogd"} — de foto wordt
                lokaal bewaard en automatisch meegestuurd zodra de verbinding terug is.
              </p>
            )}
          </Field>
        ) : null}

        <Field label="Ingevoerd door" fout={fouten.ingevoerd_door}>
          <input
            value={invoerder}
            onChange={(e) => {
              setInvoerder(e.target.value);
              wisFout("ingevoerd_door");
            }}
            placeholder="Je naam"
            className={`h-12 w-full rounded-xl border bg-card px-3 text-base ${fouten.ingevoerd_door ? "border-destructive" : "border-input"}`}
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

function Field({
  label,
  fout,
  children,
}: {
  label: string;
  fout?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      {children}
      {fout && <span className="mt-1 block text-sm text-destructive">{fout}</span>}
    </label>
  );
}
