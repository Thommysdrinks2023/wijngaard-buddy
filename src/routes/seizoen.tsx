import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import {
  createFenologie,
  deleteFenologie,
  fetchFenologie,
  fetchRijen,
  updateFenologie,
} from "@/lib/data";
import {
  FENOLOGIE_MOMENTEN,
  type Fenologie,
  type FenologieMoment,
} from "@/lib/types";
import { RAS_OPTIONS, type Ras } from "@/lib/seed-rijen";
import {
  WERK_KOLOMMEN,
  type WerkKolom,
  type WerkEntry,
  getWerkkalender,
  upsertWerkEntry,
  deleteWerkEntry,
} from "@/lib/werkkalender";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { YearSelector } from "@/components/year-selector";
import { EmptyState, SEIZOEN_LEEG_MSG } from "@/components/empty-state";
import { useSeizoen } from "@/lib/seizoen";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/seizoen")({
  component: SeizoenPage,
  head: () => ({
    meta: [
      { title: "Seizoen — Wijngaard" },
      { name: "description", content: "Fenologie en werkkalender per ras." },
    ],
  }),
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

interface FenCellState {
  ras: Ras;
  moment: FenologieMoment;
  existing?: Fenologie;
}

interface WerkCellState {
  ras: Ras;
  kolom: WerkKolom;
  existing?: WerkEntry;
}

function SeizoenPage() {
  const qc = useQueryClient();
  const fenQ = useQuery({ queryKey: ["fenologie"], queryFn: () => fetchFenologie() });
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const huidigJaar = new Date().getFullYear();
  const [jaar] = useSeizoen();
  const [invoerder, setInvoerderName] = useInvoerder();

  // Werkkalender (localStorage) — bump nonce on changes for re-render
  const [werkNonce, setWerkNonce] = useState(0);
  const werkEntries = useMemo(() => getWerkkalender(), [werkNonce]);

  const beschikbareJaren = useMemo(() => {
    const set = new Set<number>([huidigJaar]);
    fenQ.data?.forEach((f) => {
      try {
        set.add(parseISO(f.datum).getFullYear());
      } catch {
        // ignore
      }
    });
    werkEntries.forEach((e) => set.add(e.jaar));
    return Array.from(set).sort((a, b) => b - a);
  }, [fenQ.data, werkEntries, huidigJaar]);

  // earliest entry per ras x moment for selected year
  const fenGrid = useMemo(() => {
    const map = new Map<string, Fenologie>();
    fenQ.data?.forEach((f) => {
      try {
        const d = parseISO(f.datum);
        if (d.getFullYear() !== jaar) return;
      } catch {
        return;
      }
      const key = `${f.ras}|${f.moment}`;
      const existing = map.get(key);
      if (!existing || f.datum < existing.datum) {
        map.set(key, f);
      }
    });
    return map;
  }, [fenQ.data, jaar]);

  const werkGrid = useMemo(() => {
    const map = new Map<string, WerkEntry>();
    werkEntries
      .filter((e) => e.jaar === jaar)
      .forEach((e) => map.set(`${e.ras}|${e.kolom}`, e));
    return map;
  }, [werkEntries, jaar]);

  // Dialog state
  const [fenCell, setFenCell] = useState<FenCellState | null>(null);
  const [werkCell, setWerkCell] = useState<WerkCellState | null>(null);

  // Fenologie mutation
  const fenMut = useMutation({
    mutationFn: async (input: {
      ras: Ras;
      moment: FenologieMoment;
      datum: string;
      notitie: string;
      existing?: Fenologie;
    }) => {
      if (input.existing) {
        return updateFenologie(input.existing.id, {
          moment: input.moment,
          datum: input.datum,
          notitie: input.notitie || undefined,
          ingevoerd_door: invoerder || "—",
        });
      }
      // find any rij with matching ras for the foreign key
      const rij = rijenQ.data?.find((r) => r.ras === input.ras);
      if (!rij) throw new Error(`Geen rij gevonden voor ${input.ras}`);
      return createFenologie({
        rij: rij.id,
        ras: input.ras,
        moment: input.moment,
        datum: input.datum,
        notitie: input.notitie || undefined,
        ingevoerd_door: invoerder || "—",
      });
    },
    onSuccess: () => {
      toast.success("Fenologie opgeslagen ✓");
      qc.invalidateQueries({ queryKey: ["fenologie"] });
      setFenCell(null);
    },
    onError: (e: Error) => toast.error(e.message ?? "Opslaan mislukt"),
  });

  const fenDelMut = useMutation({
    mutationFn: (id: string) => deleteFenologie(id),
    onSuccess: () => {
      toast.success("Fenologie verwijderd");
      qc.invalidateQueries({ queryKey: ["fenologie"] });
      setFenCell(null);
    },
    onError: (e: Error) => toast.error(e.message ?? "Verwijderen mislukt"),
  });

  return (
    <>
      <AppHeader title="Seizoen" />
      <div className="mx-auto max-w-screen-md space-y-6 px-3 py-4 pb-24">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Seizoensoverzicht</h1>
          <p className="text-sm text-muted-foreground">
            Fenologie en werkzaamheden per ras. Tik op een cel om in te vullen.
          </p>
        </div>

        {/* Jaarselector */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Seizoen</span>
          <YearSelector extra={beschikbareJaren} />
        </div>

        {/* Fenologie tabel */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Fenologie</h2>
          <div className="rounded-2xl border border-border bg-card p-2">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Ras
                    </th>
                    {FENOLOGIE_MOMENTEN.map((m) => (
                      <th
                        key={m.value}
                        className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-base">{m.emoji}</span>
                          <span>{m.value}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RAS_OPTIONS.map((ras: Ras) => (
                    <tr key={ras}>
                      <th className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-2 text-left text-sm font-semibold text-foreground">
                        {ras}
                      </th>
                      {FENOLOGIE_MOMENTEN.map((m) => {
                        const entry = fenGrid.get(`${ras}|${m.value}`);
                        const filled = Boolean(entry);
                        return (
                          <td key={m.value} className="px-1 py-1">
                            <button
                              type="button"
                              onClick={() =>
                                setFenCell({ ras, moment: m.value, existing: entry })
                              }
                              className={`flex h-12 min-w-[70px] w-full items-center justify-center rounded-lg px-2 text-center text-xs font-semibold transition active:scale-[0.97] ${
                                filled
                                  ? "bg-success text-success-foreground"
                                  : "bg-muted text-muted-foreground hover:bg-muted/70"
                              }`}
                              title={
                                entry
                                  ? `${ras} — ${m.value}: ${entry.datum}`
                                  : `${ras} — ${m.value}: nog niet ingevuld`
                              }
                            >
                              {entry
                                ? format(parseISO(entry.datum), "d MMM", { locale: nl })
                                : "+"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
              ← scroll horizontaal →
            </p>
          </div>
        </section>

        {/* Werkkalender tabel */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Werkkalender</h2>
          <p className="text-xs text-muted-foreground">
            Snoei, loofwerk en oogst per ras.
          </p>
          <div className="rounded-2xl border border-border bg-card p-2">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Ras
                    </th>
                    {WERK_KOLOMMEN.map((k) => (
                      <th
                        key={k.value}
                        className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-base">{k.emoji}</span>
                          <span className="whitespace-nowrap">{k.label}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RAS_OPTIONS.map((ras: Ras) => (
                    <tr key={ras}>
                      <th className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-2 text-left text-sm font-semibold text-foreground">
                        {ras}
                      </th>
                      {WERK_KOLOMMEN.map((k) => {
                        const entry = werkGrid.get(`${ras}|${k.value}`);
                        const filled = Boolean(entry);
                        return (
                          <td key={k.value} className="px-1 py-1">
                            <button
                              type="button"
                              onClick={() =>
                                setWerkCell({ ras, kolom: k.value, existing: entry })
                              }
                              className={`flex h-12 min-w-[80px] w-full items-center justify-center rounded-lg px-2 text-center text-xs font-semibold transition active:scale-[0.97] ${
                                filled
                                  ? "bg-success text-success-foreground"
                                  : "bg-muted text-muted-foreground hover:bg-muted/70"
                              }`}
                              title={
                                entry
                                  ? `${ras} — ${k.label}: ${entry.datum}`
                                  : `${ras} — ${k.label}: nog niet ingevuld`
                              }
                            >
                              {entry
                                ? format(parseISO(entry.datum), "d MMM", { locale: nl })
                                : "+"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
              ← scroll horizontaal →
            </p>
          </div>
        </section>

        <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-4 w-6 rounded bg-success" />
            <span>Geregistreerd</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-4 w-6 rounded bg-muted" />
            <span>Nog niet geregistreerd</span>
          </div>
        </div>
      </div>

      {/* Fenologie dialog */}
      <FenDialog
        cell={fenCell}
        invoerder={invoerder}
        onInvoerderChange={setInvoerderName}
        onClose={() => setFenCell(null)}
        onSave={(datum, notitie) =>
          fenCell &&
          fenMut.mutate({
            ras: fenCell.ras,
            moment: fenCell.moment,
            datum,
            notitie,
            existing: fenCell.existing,
          })
        }
        onDelete={() =>
          fenCell?.existing && fenDelMut.mutate(fenCell.existing.id)
        }
        saving={fenMut.isPending}
        deleting={fenDelMut.isPending}
      />

      {/* Werk dialog */}
      <WerkDialog
        cell={werkCell}
        jaar={jaar}
        onClose={() => setWerkCell(null)}
        onSave={(datum, notitie) => {
          if (!werkCell) return;
          upsertWerkEntry({
            ras: werkCell.ras,
            kolom: werkCell.kolom,
            jaar,
            datum,
            notitie: notitie || undefined,
          });
          toast.success("Werkkalender opgeslagen ✓");
          setWerkNonce((n) => n + 1);
          setWerkCell(null);
        }}
        onDelete={() => {
          if (!werkCell) return;
          deleteWerkEntry(werkCell.ras, werkCell.kolom, jaar);
          toast.success("Verwijderd");
          setWerkNonce((n) => n + 1);
          setWerkCell(null);
        }}
      />
    </>
  );
}

// ============= Fenologie dialog =============
function FenDialog({
  cell,
  invoerder,
  onInvoerderChange,
  onClose,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  cell: FenCellState | null;
  invoerder: string;
  onInvoerderChange: (n: string) => void;
  onClose: () => void;
  onSave: (datum: string, notitie: string) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [datum, setDatum] = useState(todayIso());
  const [notitie, setNotitie] = useState("");

  useEffect(() => {
    if (cell) {
      setDatum(cell.existing?.datum ?? todayIso());
      setNotitie(cell.existing?.notitie ?? "");
    }
  }, [cell]);

  const open = cell !== null;
  const momentInfo = cell ? FENOLOGIE_MOMENTEN.find((m) => m.value === cell.moment) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {momentInfo?.emoji} {cell?.moment} — {cell?.ras}
          </DialogTitle>
          <DialogDescription>
            {cell?.existing ? "Bewerk deze registratie." : "Leg de datum vast."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Datum</span>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              Notitie <span className="text-muted-foreground">(optioneel)</span>
            </span>
            <textarea
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-card p-3 text-base"
              placeholder="Bijv. eerste rij in volle bloei…"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Ingevoerd door</span>
            <input
              value={invoerder}
              onChange={(e) => onInvoerderChange(e.target.value)}
              placeholder="Je naam"
              className="h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
            />
          </label>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {cell?.existing ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting || saving}
              className="flex h-11 items-center justify-center gap-1 rounded-lg border border-destructive/50 px-3 text-sm font-semibold text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Verwijderen
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deleting}
              className="h-11 flex-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold sm:flex-none"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => onSave(datum, notitie)}
              disabled={!datum || saving || deleting}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:flex-none"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Opslaan
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============= Werk dialog =============
function WerkDialog({
  cell,
  jaar,
  onClose,
  onSave,
  onDelete,
}: {
  cell: WerkCellState | null;
  jaar: number;
  onClose: () => void;
  onSave: (datum: string, notitie: string) => void;
  onDelete: () => void;
}) {
  const [datum, setDatum] = useState(todayIso());
  const [notitie, setNotitie] = useState("");

  useEffect(() => {
    if (cell) {
      setDatum(cell.existing?.datum ?? todayIso());
      setNotitie(cell.existing?.notitie ?? "");
    }
  }, [cell]);

  const open = cell !== null;
  const kolomInfo = cell ? WERK_KOLOMMEN.find((k) => k.value === cell.kolom) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kolomInfo?.emoji} {kolomInfo?.label} — {cell?.ras}
          </DialogTitle>
          <DialogDescription>
            {cell?.existing
              ? `Bewerk werkkalender ${jaar}.`
              : `Leg de datum vast voor ${jaar}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Datum</span>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              Notitie <span className="text-muted-foreground">(optioneel)</span>
            </span>
            <textarea
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-card p-3 text-base"
              placeholder="Bijv. begonnen in zuidelijk perceel…"
            />
          </label>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {cell?.existing ? (
            <button
              type="button"
              onClick={onDelete}
              className="flex h-11 items-center justify-center gap-1 rounded-lg border border-destructive/50 px-3 text-sm font-semibold text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Verwijderen
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold sm:flex-none"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => onSave(datum, notitie)}
              disabled={!datum}
              className="flex h-11 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:flex-none"
            >
              Opslaan
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
