import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { createFenologie, fetchRijen } from "@/lib/data";
import { foutenPerVeld, isGeldig, valideerFenologie } from "@/lib/validatie";
import { FENOLOGIE_MOMENTEN, type FenologieMoment } from "@/lib/types";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/rij/$rijId/fenologie")({
  component: FenologiePage,
  head: () => ({ meta: [{ title: "Fenologie vastleggen — Wijngaard" }] }),
});

function FenologiePage() {
  const { rijId } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [invoerder, setInvoerder] = useInvoerder();

  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const rij = rijenQ.data?.find((r) => r.id === rijId);

  const [moment, setMoment] = useState<FenologieMoment | null>(null);
  const [datum, setDatum] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notitie, setNotitie] = useState("");
  const [fouten, setFouten] = useState<Record<string, string>>({});

  const m = useMutation({
    mutationFn: () => {
      if (!rij) throw new Error("Rij niet gevonden");
      if (!moment) throw new Error("Kies een moment");
      return createFenologie({
        rij: rijId,
        ras: rij.ras,
        moment,
        datum,
        notitie: notitie || undefined,
        ingevoerd_door: invoerder,
      });
    },
    onSuccess: () => {
      toast.success("Fenologie opgeslagen");
      qc.invalidateQueries({ queryKey: ["fenologie"] });
      router.history.back();
    },
    onError: (e: Error) => toast.error(e.message ?? "Opslaan mislukt"),
  });

  const canSave = invoerder.trim().length > 0 && moment !== null && !m.isPending;

  const handleSave = () => {
    if (!canSave) {
      if (!moment) toast.error("Kies eerst een moment");
      else if (!invoerder.trim()) toast.error("Vul je naam in");
      return;
    }
    const validatie = valideerFenologie({
      rij: rijId,
      ras: rij?.ras,
      moment: moment ?? undefined,
      datum,
      ingevoerd_door: invoerder,
    });
    if (!isGeldig(validatie)) {
      setFouten(foutenPerVeld(validatie));
      toast.error(validatie[0].bericht);
      return;
    }
    setFouten({});
    m.mutate();
  };

  return (
    <>
      <AppHeader
        back
        title="Fenologie vastleggen"
        subtitle={rij ? `Rij ${rij.rijnummer} · ${rij.ras}` : ""}
      />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Moment</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FENOLOGIE_MOMENTEN.map((opt) => {
              const active = moment === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMoment(opt.value)}
                  className={`flex h-16 items-center gap-3 rounded-2xl border px-4 text-left transition active:scale-[0.99] ${
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  <div className="flex flex-col">
                    <span className="text-base font-semibold leading-tight">{opt.value}</span>
                    <span
                      className={`text-xs leading-tight ${
                        active ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      {opt.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Datum</span>
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
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            Notitie <span className="text-muted-foreground">(optioneel)</span>
          </span>
          <textarea
            value={notitie}
            onChange={(e) => setNotitie(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-input bg-card p-3 text-base"
            placeholder="Bijv. eerste rij in volle bloei…"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Ingevoerd door</span>
          <input
            value={invoerder}
            onChange={(e) => setInvoerder(e.target.value)}
            placeholder="Je naam"
            className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
            required
          />
        </label>

        <div className="sticky bottom-20 -mx-3 border-t border-border bg-background/95 px-3 py-3 backdrop-blur">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {m.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Fenologie opslaan
          </button>
        </div>
      </div>
    </>
  );
}
