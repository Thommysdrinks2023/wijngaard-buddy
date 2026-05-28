import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { fetchRijen } from "@/lib/data";
import {
  createSteekproefPlant,
  deleteSteekproefPlant,
  getSteekproefPlanten,
} from "@/lib/steekproef";
import { RAS_OPTIONS } from "@/lib/seed-rijen";
import type { Ras } from "@/lib/types";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/steekproeven/beheer")({
  component: BeheerPage,
  head: () => ({ meta: [{ title: "Steekproef beheer — Wijngaard" }] }),
});

function BeheerPage() {
  const qc = useQueryClient();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const puntenQ = useQuery({
    queryKey: ["steekproef_planten"],
    queryFn: async () => getSteekproefPlanten(),
  });

  const [naam, setNaam] = useState("");
  const [ras, setRas] = useState<Ras>("Muscaris");
  const [rijId, setRijId] = useState<string>("");
  const [plant, setPlant] = useState("");

  const rijenVoorRas = useMemo(
    () => (rijenQ.data ?? []).filter((r) => r.ras === ras),
    [rijenQ.data, ras],
  );
  const huidigeRij = rijenVoorRas.find((r) => r.id === rijId) ?? rijenVoorRas[0];

  const addM = useMutation({
    mutationFn: async () => {
      if (!naam.trim()) throw new Error("Geef een naam op");
      if (!huidigeRij) throw new Error("Kies een rij");
      const pNum = Number(plant);
      if (!pNum || pNum < 1 || pNum > huidigeRij.aantal_planten)
        throw new Error(`Plantnummer 1-${huidigeRij.aantal_planten}`);
      createSteekproefPlant({
        naam: naam.trim(),
        ras,
        rij: huidigeRij.id,
        rijnummer: huidigeRij.rijnummer,
        plant: pNum,
      });
    },
    onSuccess: () => {
      toast.success("Steekproefplant toegevoegd");
      setNaam("");
      setPlant("");
      qc.invalidateQueries({ queryKey: ["steekproef_planten"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: async (id: string) => deleteSteekproefPlant(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["steekproef_planten"] });
      qc.invalidateQueries({ queryKey: ["steekproef_metingen"] });
      toast.success("Verwijderd");
    },
  });

  return (
    <>
      <AppHeader back title="Steekproef beheer" />
      <main className="mx-auto max-w-screen-md space-y-6 px-4 py-5 pb-24">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Nieuwe steekproefplant
          </h2>
          <Field label="Naam (bijv. Johanniter A)">
            <input
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
              placeholder="Naam"
            />
          </Field>
          <Field label="Ras">
            <select
              value={ras}
              onChange={(e) => {
                setRas(e.target.value as Ras);
                setRijId("");
              }}
              className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
            >
              {RAS_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rij">
            <select
              value={huidigeRij?.id ?? ""}
              onChange={(e) => setRijId(e.target.value)}
              className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
            >
              {rijenVoorRas.map((r) => (
                <option key={r.id} value={r.id}>
                  Rij {r.rijnummer} ({r.aantal_planten} planten)
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={`Plantnummer${huidigeRij ? ` (1-${huidigeRij.aantal_planten})` : ""}`}
          >
            <input
              type="number"
              inputMode="numeric"
              value={plant}
              onChange={(e) => setPlant(e.target.value)}
              className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
              placeholder="Bijv. 12"
            />
          </Field>
          <button
            onClick={() => addM.mutate()}
            disabled={addM.isPending}
            className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            Toevoegen
          </button>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Bestaand ({puntenQ.data?.length ?? 0})
          </h2>
          {puntenQ.data && puntenQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Nog niets aangewezen.</p>
          )}
          <ul className="space-y-2">
            {puntenQ.data?.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-semibold">{p.naam}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.ras} · rij {p.rijnummer} · plant {p.plant}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Verwijder ${p.naam}? Bijbehorende metingen worden ook gewist.`))
                      delM.mutate(p.id);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                  aria-label="Verwijder"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
          <Link
            to="/steekproeven"
            className="mt-3 block text-center text-sm text-primary underline"
          >
            ← Terug naar overzicht
          </Link>
        </section>
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
