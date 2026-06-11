import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { fetchRijen } from "@/lib/data";
import { createWerkuur, fetchWerkuren, TAAK_TYPES, type TaakType } from "@/lib/extra-data";
import { useInvoerder } from "@/lib/use-invoerder";
import { useSeizoen } from "@/lib/seizoen";
import { getPerceelOppervlakte } from "@/lib/app-instellingen";
import { AppHeader } from "@/components/app-header";
import { YearSelector } from "@/components/year-selector";
import { EmptyState } from "@/components/empty-state";
import { RAS_OPTIONS } from "@/lib/seed-rijen";
import { type Ras, type Rij } from "@/lib/types";
import { Clock, Loader2 } from "lucide-react";

export const Route = createFileRoute("/werkrapport")({
  component: WerkrapportPage,
  head: () => ({
    meta: [
      { title: "Werkrapport — Wijngaard" },
      { name: "description", content: "Urenregistratie per taak, rij en ras." },
    ],
  }),
});

function jaarOf(item: { seizoen?: number; datum: string }): number {
  return item.seizoen ?? parseISO(item.datum).getFullYear();
}

function WerkrapportPage() {
  const qc = useQueryClient();
  const [jaar] = useSeizoen();
  const [invoerder, setInvoerder] = useInvoerder();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const urenQ = useQuery({ queryKey: ["werkuren"], queryFn: fetchWerkuren });

  // formulier
  const [taak, setTaak] = useState<TaakType>("Snoeien");
  const [rijId, setRijId] = useState("");
  const [uren, setUren] = useState("");
  const [datum, setDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [notitie, setNotitie] = useState("");

  // filters voor het overzicht
  const [filterRas, setFilterRas] = useState<Ras | "">("");
  const [filterRij, setFilterRij] = useState("");

  const rijenById = useMemo(() => {
    const m = new Map<string, Rij>();
    rijenQ.data?.forEach((r) => m.set(r.id, r));
    return m;
  }, [rijenQ.data]);

  const m = useMutation({
    mutationFn: async () => {
      const u = Number(uren);
      if (!uren || Number.isNaN(u) || u <= 0) throw new Error("Vul een geldig aantal uren in");
      if (u > 24) throw new Error("Meer dan 24 uur op één dag kan niet");
      if (!invoerder.trim()) throw new Error("Vul je naam in");
      const rij = rijId ? rijenById.get(rijId) : undefined;
      return createWerkuur({
        datum,
        seizoen: new Date(datum).getFullYear(),
        taak,
        rij: rijId || null,
        ras: rij?.ras ?? null,
        uren: u,
        notitie,
        ingevoerd_door: invoerder,
      });
    },
    onSuccess: () => {
      toast.success("Werk geregistreerd ✓");
      qc.invalidateQueries({ queryKey: ["werkuren"] });
      setUren("");
      setNotitie("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seizoenUren = useMemo(
    () => (urenQ.data ?? []).filter((w) => jaarOf(w) === jaar),
    [urenQ.data, jaar],
  );

  const gefilterd = useMemo(
    () =>
      seizoenUren.filter((w) => {
        if (filterRij && w.rij !== filterRij) return false;
        if (filterRas && w.ras !== filterRas) return false;
        return true;
      }),
    [seizoenUren, filterRas, filterRij],
  );

  // Uren per taaktype (voor grafiek)
  const perTaak = useMemo(() => {
    const totalen = new Map<TaakType, number>();
    gefilterd.forEach((w) => totalen.set(w.taak, (totalen.get(w.taak) ?? 0) + w.uren));
    return TAAK_TYPES.filter((t) => totalen.has(t)).map((t) => ({
      taak: t,
      uren: Math.round((totalen.get(t) ?? 0) * 10) / 10,
    }));
  }, [gefilterd]);

  const totaalUren = useMemo(
    () => Math.round(gefilterd.reduce((acc, w) => acc + w.uren, 0) * 10) / 10,
    [gefilterd],
  );
  const oppervlakteHa = getPerceelOppervlakte();
  const urenPerHa = oppervlakteHa > 0 ? Math.round((totaalUren / oppervlakteHa) * 10) / 10 : 0;

  const recent = useMemo(() => gefilterd.slice(0, 12), [gefilterd]);

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  return (
    <>
      <AppHeader back title="Werkrapport" subtitle="Uren per taak" />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Werkrapport</h1>
            <p className="text-sm text-muted-foreground">
              {totaalUren} uur in {jaar} · {urenPerHa} uur/ha ({oppervlakteHa} ha)
            </p>
          </div>
          <YearSelector />
        </div>

        {/* Registratie */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="h-4 w-4" /> Werk registreren
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {TAAK_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTaak(t)}
                className={`h-12 rounded-xl border-2 text-sm font-semibold transition ${
                  taak === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Rij (optioneel)</span>
              <select value={rijId} onChange={(e) => setRijId(e.target.value)} className={veldClass}>
                <option value="">Hele wijngaard</option>
                {(rijenQ.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    Rij {r.rijnummer} · {r.ras}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Duur (uren)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={uren}
                onChange={(e) => setUren(e.target.value)}
                className={veldClass}
                placeholder="bijv. 2.5"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Datum</span>
              <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className={veldClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Ingevoerd door</span>
              <input value={invoerder} onChange={(e) => setInvoerder(e.target.value)} className={veldClass} placeholder="Je naam" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Notitie</span>
            <input value={notitie} onChange={(e) => setNotitie(e.target.value)} className={veldClass} placeholder="Optioneel…" />
          </label>
          <button
            type="button"
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {m.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Werk opslaan
          </button>
        </section>

        {/* Filters */}
        <section className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Filter op ras</span>
            <select
              value={filterRas}
              onChange={(e) => {
                setFilterRas(e.target.value as Ras | "");
                setFilterRij("");
              }}
              className={veldClass}
            >
              <option value="">Alle rassen</option>
              {RAS_OPTIONS.map((ras) => (
                <option key={ras} value={ras}>
                  {ras}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Filter op rij</span>
            <select
              value={filterRij}
              onChange={(e) => {
                setFilterRij(e.target.value);
                setFilterRas("");
              }}
              className={veldClass}
            >
              <option value="">Alle rijen</option>
              {(rijenQ.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  Rij {r.rijnummer} · {r.ras}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* Uren per taaktype */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Uren per taak ({jaar})
          </h2>
          {perTaak.length === 0 ? (
            <EmptyState message="Nog geen uren geregistreerd dit seizoen." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perTaak} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cac17655" />
                  <XAxis type="number" fontSize={12} unit=" u" />
                  <YAxis type="category" dataKey="taak" fontSize={12} width={90} />
                  <Tooltip formatter={(v) => [`${v} uur`, "Duur"]} />
                  <Bar dataKey="uren" fill="#cac176" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Recente registraties */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Laatste registraties
          </h2>
          {recent.length === 0 ? (
            <EmptyState message="Nog geen registraties." />
          ) : (
            <ul className="space-y-2">
              {recent.map((w) => {
                const r = w.rij ? rijenById.get(w.rij) : undefined;
                return (
                  <li key={w.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {w.taak} · {w.uren} uur
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r ? `Rij ${r.rijnummer} · ${r.ras}` : w.ras || "Hele wijngaard"}
                        {w.ingevoerd_door ? ` · ${w.ingevoerd_door}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(w.datum), "d MMM", { locale: nl })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
