import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteFenologie,
  fetchFenologieById,
  fetchRijen,
  updateFenologie,
} from "@/lib/data";
import { FENOLOGIE_MOMENTEN, type FenologieMoment } from "@/lib/types";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/fenologie/$fenId/bewerken")({
  component: FenologieBewerkenPage,
  head: () => ({ meta: [{ title: "Fenologie bewerken — Wijngaard" }] }),
});

function FenologieBewerkenPage() {
  const { fenId } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [invoerder, setInvoerder] = useInvoerder();

  const fenQ = useQuery({
    queryKey: ["fenologie", "byId", fenId],
    queryFn: () => fetchFenologieById(fenId),
  });
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });

  const fen = fenQ.data;
  const rij = rijenQ.data?.find((r) => r.id === fen?.rij);

  const [moment, setMoment] = useState<FenologieMoment | null>(null);
  const [datum, setDatum] = useState("");
  const [notitie, setNotitie] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (fen) {
      setMoment(fen.moment);
      setDatum(fen.datum);
      setNotitie(fen.notitie ?? "");
    }
  }, [fen]);

  const updateM = useMutation({
    mutationFn: () => {
      if (!moment) throw new Error("Kies een moment");
      return updateFenologie(fenId, {
        moment,
        datum,
        notitie: notitie || undefined,
        ingevoerd_door: invoerder,
      });
    },
    onSuccess: () => {
      toast.success("Fenologie bijgewerkt");
      qc.invalidateQueries({ queryKey: ["fenologie"] });
      router.history.back();
    },
    onError: (e: Error) => toast.error(e.message ?? "Opslaan mislukt"),
  });

  const deleteM = useMutation({
    mutationFn: () => deleteFenologie(fenId),
    onSuccess: () => {
      toast.success("Fenologie verwijderd");
      qc.invalidateQueries({ queryKey: ["fenologie"] });
      router.history.back();
    },
    onError: (e: Error) => toast.error(e.message ?? "Verwijderen mislukt"),
  });

  const canSave =
    invoerder.trim().length > 0 &&
    moment !== null &&
    datum.length > 0 &&
    !updateM.isPending &&
    !deleteM.isPending;

  const handleSave = () => {
    if (!canSave) {
      if (!moment) toast.error("Kies eerst een moment");
      else if (!invoerder.trim()) toast.error("Vul je naam in");
      return;
    }
    updateM.mutate();
  };

  if (fenQ.isLoading) {
    return (
      <>
        <AppHeader back title="Fenologie bewerken" />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (!fen) {
    return (
      <>
        <AppHeader back title="Fenologie bewerken" />
        <div className="mx-auto max-w-screen-md space-y-3 px-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Fenologie-regel niet gevonden.
          </p>
          <Link to="/seizoen" className="text-sm font-medium text-primary underline">
            Terug naar seizoen
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader
        back
        title="Fenologie bewerken"
        subtitle={rij ? `Rij ${rij.rijnummer} · ${fen.ras}` : fen.ras}
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
                    <span className="text-base font-semibold leading-tight">
                      {opt.value}
                    </span>
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
            onChange={(e) => setDatum(e.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
            required
          />
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
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            Ingevoerd door
          </span>
          <input
            value={invoerder}
            onChange={(e) => setInvoerder(e.target.value)}
            placeholder="Je naam"
            className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
            required
          />
        </label>

        {/* Verwijder zone */}
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-destructive/50 text-sm font-semibold text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Fenologie verwijderen
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">
                Weet je zeker dat je deze regel wilt verwijderen?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold"
                  disabled={deleteM.isPending}
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  onClick={() => deleteM.mutate()}
                  disabled={deleteM.isPending}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground disabled:opacity-50"
                >
                  {deleteM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Ja, verwijder
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-20 -mx-3 border-t border-border bg-background/95 px-3 py-3 backdrop-blur">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {updateM.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Wijzigingen opslaan
          </button>
        </div>
      </div>
    </>
  );
}
