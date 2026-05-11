import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { useInvoerder } from "@/lib/use-invoerder";
import {
  createSteekproefMeting,
  getSteekproefPlanten,
  BIODIV_OPTIES,
  BLADGROEI_OPTIES,
  BODEM_OPTIES,
  WATERSTRESS_OPTIES,
  ZIEKTEDRUK_OPTIES,
} from "@/lib/steekproef";
import { FENOLOGIE_MOMENTEN } from "@/lib/types";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/steekproeven/$puntId/invoer")({
  component: InvoerPage,
  head: () => ({ meta: [{ title: "Steekproef invoer — Wijngaard" }] }),
});

function InvoerPage() {
  const { puntId } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [invoerder, setInvoerder] = useInvoerder();

  const punt = getSteekproefPlanten().find((p) => p.id === puntId);

  const [datum, setDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [trosaantal, setTrosaantal] = useState("");
  const [trosgewicht, setTrosgewicht] = useState("");
  const [brix, setBrix] = useState("");
  const [zuur, setZuur] = useState("");
  const [fenologie, setFenologie] = useState<string>("");
  const [ziektedruk, setZiektedruk] = useState<string>("");
  const [bladgroei, setBladgroei] = useState<string>("");
  const [bodem, setBodem] = useState<string>("");
  const [biodiv, setBiodiv] = useState<string>("");
  const [waterstress, setWaterstress] = useState<string>("");
  const [opbrengst, setOpbrengst] = useState("");
  const [notitie, setNotitie] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      if (!punt) throw new Error("Steekproefplant niet gevonden");
      if (!invoerder.trim()) throw new Error("Vul je naam in");
      createSteekproefMeting({
        plantId: puntId,
        datum,
        trosaantal: trosaantal ? Number(trosaantal) : null,
        trosgewicht: trosgewicht ? Number(trosgewicht) : null,
        brix: brix ? Number(brix) : null,
        zuurgraad: zuur ? Number(zuur) : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fenologie: (fenologie || null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ziektedruk: (ziektedruk || null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bladgroei: (bladgroei || null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bodem: (bodem || null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        biodiversiteit: (biodiv || null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        waterstress: (waterstress || null) as any,
        opbrengst_kg: opbrengst ? Number(opbrengst) : null,
        notitie,
        ingevoerd_door: invoerder,
      });
    },
    onSuccess: () => {
      toast.success("Steekproef opgeslagen ✓");
      qc.invalidateQueries({ queryKey: ["steekproef_metingen"] });
      router.history.back();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!punt) {
    return (
      <>
        <AppHeader back title="Steekproef" />
        <div className="p-6 text-center text-sm text-muted-foreground">
          Steekproefplant niet gevonden.
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader
        back
        title={punt.naam}
        subtitle={`${punt.ras} · rij ${punt.rijnummer} · plant ${punt.plant}`}
      />
      <main className="mx-auto max-w-screen-md space-y-4 px-4 py-4 pb-32">
        <Field label="Datum">
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Trosaantal (per stok)">
            <NumInput value={trosaantal} onChange={setTrosaantal} />
          </Field>
          <Field label="Trosgewicht (g)">
            <NumInput value={trosgewicht} onChange={setTrosgewicht} />
          </Field>
          <Field label="Brix">
            <NumInput value={brix} onChange={setBrix} step="0.1" />
          </Field>
          <Field label="Zuur (g/L)">
            <NumInput value={zuur} onChange={setZuur} step="0.1" />
          </Field>
        </div>

        <ChipPicker
          label="Fenologie moment"
          value={fenologie}
          onChange={setFenologie}
          options={FENOLOGIE_MOMENTEN.map((f) => ({ value: f.value, label: `${f.emoji} ${f.value}` }))}
        />
        <ChipPicker
          label="Ziektedruk"
          value={ziektedruk}
          onChange={setZiektedruk}
          options={ZIEKTEDRUK_OPTIES.map((v) => ({ value: v, label: v }))}
        />
        <ChipPicker
          label="Bladgroei"
          value={bladgroei}
          onChange={setBladgroei}
          options={BLADGROEI_OPTIES.map((v) => ({ value: v, label: v }))}
        />
        <ChipPicker
          label="Bodemconditie"
          value={bodem}
          onChange={setBodem}
          options={BODEM_OPTIES.map((v) => ({ value: v, label: v }))}
        />
        <ChipPicker
          label="Biodiversiteit"
          value={biodiv}
          onChange={setBiodiv}
          options={BIODIV_OPTIES.map((v) => ({ value: v, label: v }))}
        />
        <ChipPicker
          label="Waterstress"
          value={waterstress}
          onChange={setWaterstress}
          options={WATERSTRESS_OPTIES.map((v) => ({ value: v, label: v }))}
        />

        <Field label="Opbrengstvoorspelling (kg per stok, optioneel)">
          <NumInput value={opbrengst} onChange={setOpbrengst} step="0.1" />
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

        <Field label="Ingevoerd door">
          <input
            value={invoerder}
            onChange={(e) => setInvoerder(e.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
            placeholder="Je naam"
          />
        </Field>

        <div
          className="sticky -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)", zIndex: 50 }}
        >
          <button
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {m.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Steekproef opslaan
          </button>
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  step = "1",
}: {
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
      placeholder="—"
    />
  );
}

function ChipPicker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(active ? "" : o.value)}
              className={`h-11 rounded-xl border px-4 text-sm font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
