import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { createMeting, fetchRijen } from "@/lib/data";
import { readLs, writeLs } from "@/lib/opslag";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { Check, Loader2, Zap } from "lucide-react";

export const Route = createFileRoute("/snel")({
  component: SnelPage,
  head: () => ({ meta: [{ title: "Snelle meting — Wijngaard" }] }),
});

const LS_LAATSTE_RIJ = "wg.snel.laatsterij.v1";

function SnelPage() {
  const qc = useQueryClient();
  const [invoerder] = useInvoerder();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });

  // onthoud de laatst gebruikte rij — in het veld meet je vaak dezelfde rij
  const [rijId, setRijId] = useState(() => readLs<string>(LS_LAATSTE_RIJ, ""));
  const [brix, setBrix] = useState("");
  const [score, setScore] = useState(3);
  const [laatste, setLaatste] = useState<string | null>(null);
  const brixRef = useRef<HTMLInputElement>(null);

  const rij = rijenQ.data?.find((r) => r.id === rijId);

  const m = useMutation({
    mutationFn: async () => {
      if (!rij) throw new Error("Kies eerst een rij");
      const waarde = Number(brix);
      if (!brix || Number.isNaN(waarde)) throw new Error("Vul een Brix-waarde in");
      if (waarde < 0 || waarde > 40) throw new Error("Brix moet tussen 0 en 40 liggen");
      return createMeting({
        rij: rij.id,
        datum: format(new Date(), "yyyy-MM-dd"),
        brix: waarde,
        rijpheid_score: score,
        ingevoerd_door: invoerder || "Onbekend",
      });
    },
    onSuccess: () => {
      writeLs(LS_LAATSTE_RIJ, rijId);
      qc.invalidateQueries({ queryKey: ["metingen"] });
      setLaatste(`Rij ${rij?.rijnummer} · ${rij?.ras} · Brix ${brix} · rijpheid ${score}/5`);
      setBrix("");
      // klaar voor de volgende: cursor terug in het Brix-veld
      setTimeout(() => brixRef.current?.focus(), 50);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AppHeader back title="Snelle meting" subtitle="Brix in 3 tikken" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6" style={{ color: "#cac176" }} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Snelle meting</h1>
            <p className="text-sm text-muted-foreground">
              Rij blijft onthouden — alleen Brix invullen en opslaan
            </p>
          </div>
        </div>

        {/* bevestiging van de vorige invoer */}
        {laatste && (
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
            style={{ backgroundColor: "#27232a", color: "#cac176" }}
          >
            <Check className="h-4 w-4 shrink-0" />
            Opgeslagen: {laatste}
          </div>
        )}

        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Rij</span>
            <select
              value={rijId}
              onChange={(e) => setRijId(e.target.value)}
              className="h-14 w-full rounded-xl border border-input bg-background px-3 text-base"
            >
              <option value="">Kies rij…</option>
              {(rijenQ.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  Rij {r.rijnummer} · {r.ras}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Brix (°Bx)</span>
            <input
              ref={brixRef}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={brix}
              onChange={(e) => setBrix(e.target.value)}
              autoFocus
              className="h-20 w-full rounded-2xl border-2 bg-background px-4 text-center text-4xl font-bold tabular-nums"
              style={{ borderColor: "#cac176" }}
              placeholder="0.0"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium">Rijpheid: {score}/5</span>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setScore(v)}
                  className={`h-12 rounded-xl border-2 text-base font-bold ${
                    score === v
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => m.mutate()}
            disabled={m.isPending || !rijId}
            className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold disabled:opacity-50"
            style={{ backgroundColor: "#27232a", color: "#cac176" }}
          >
            {m.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Zap className="h-5 w-5" />
            )}
            {laatste ? "Nog een meting opslaan" : "Meting opslaan"}
          </button>
        </section>

        <p className="text-center text-xs text-muted-foreground">
          Datum (vandaag) en je naam worden automatisch ingevuld. Voor pH, zuur en foto's gebruik je
          het volledige formulier via de rij-pagina.
        </p>
      </div>
    </>
  );
}
