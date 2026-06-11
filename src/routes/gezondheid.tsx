import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { fetchRijen } from "@/lib/data";
import { createGezondheid, fetchGezondheid, type Gezondheid } from "@/lib/extra-data";
import { useInvoerder } from "@/lib/use-invoerder";
import { useSeizoen } from "@/lib/seizoen";
import { AppHeader } from "@/components/app-header";
import { YearSelector } from "@/components/year-selector";
import { EmptyState } from "@/components/empty-state";
import { type Ras, type Rij } from "@/lib/types";
import { HeartPulse, Loader2 } from "lucide-react";

export const Route = createFileRoute("/gezondheid")({
  component: GezondheidPage,
  head: () => ({
    meta: [
      { title: "Gezondheid — Wijngaard" },
      { name: "description", content: "Vine health: vigor, snoeigewicht en uitval per rij." },
    ],
  }),
});

const RAS_KLEUR: Record<string, string> = {
  Muscaris: "#caa53d",
  "Souveginier Gris": "#eab308",
  Johanniter: "#5f9e54",
  Regent: "#7e22ce",
  "Pinot Noir": "#7f1d1d",
  Chardonnay: "#a1a35b",
  Pinotin: "#5c1a2b",
};

function jaarOf(item: { seizoen?: number; datum: string }): number {
  return item.seizoen ?? parseISO(item.datum).getFullYear();
}

function GezondheidPage() {
  const qc = useQueryClient();
  const [jaar] = useSeizoen();
  const [invoerder, setInvoerder] = useInvoerder();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const gezQ = useQuery({ queryKey: ["gezondheid"], queryFn: fetchGezondheid });

  // formulier
  const [rijId, setRijId] = useState("");
  const [datum, setDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [vigor, setVigor] = useState(3);
  const [snoeigewicht, setSnoeigewicht] = useState("");
  const [dodePlanten, setDodePlanten] = useState("");
  const [korteScheuten, setKorteScheuten] = useState("");
  const [notitie, setNotitie] = useState("");

  const rijenById = useMemo(() => {
    const m = new Map<string, Rij>();
    rijenQ.data?.forEach((r) => m.set(r.id, r));
    return m;
  }, [rijenQ.data]);

  const m = useMutation({
    mutationFn: async () => {
      if (!rijId) throw new Error("Kies een rij");
      if (!invoerder.trim()) throw new Error("Vul je naam in");
      const pct = korteScheuten ? Number(korteScheuten) : null;
      if (pct != null && (pct < 0 || pct > 100))
        throw new Error("Korte scheuten moet tussen 0 en 100% liggen");
      return createGezondheid({
        rij: rijId,
        datum,
        seizoen: new Date(datum).getFullYear(),
        vigor,
        snoeigewicht: snoeigewicht ? Number(snoeigewicht) : null,
        dode_planten: dodePlanten ? Number(dodePlanten) : null,
        korte_scheuten: pct,
        notitie,
        ingevoerd_door: invoerder,
      });
    },
    onSuccess: () => {
      toast.success("Gezondheid geregistreerd ✓");
      qc.invalidateQueries({ queryKey: ["gezondheid"] });
      setSnoeigewicht("");
      setDodePlanten("");
      setKorteScheuten("");
      setNotitie("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seizoenData = useMemo(
    () => (gezQ.data ?? []).filter((g) => jaarOf(g) === jaar),
    [gezQ.data, jaar],
  );

  // Grafiek: gemiddelde vigor per ras per maand
  const chartData = useMemo(() => {
    const perMaandRas = new Map<string, Map<Ras, { sum: number; n: number }>>();
    seizoenData.forEach((g) => {
      const r = rijenById.get(g.rij);
      if (!r) return;
      const maand = g.datum.slice(0, 7);
      const rasMap = perMaandRas.get(maand) ?? new Map();
      const cur = rasMap.get(r.ras) ?? { sum: 0, n: 0 };
      cur.sum += g.vigor;
      cur.n += 1;
      rasMap.set(r.ras, cur);
      perMaandRas.set(maand, rasMap);
    });
    return Array.from(perMaandRas.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([maand, rasMap]) => {
        const punt: Record<string, number | string> = {
          maand: format(parseISO(`${maand}-01`), "MMM", { locale: nl }),
        };
        rasMap.forEach((v, ras) => {
          punt[ras] = Math.round((v.sum / v.n) * 10) / 10;
        });
        return punt;
      });
  }, [seizoenData, rijenById]);

  const rassenInChart = useMemo(() => {
    const s = new Set<Ras>();
    seizoenData.forEach((g) => {
      const r = rijenById.get(g.rij);
      if (r) s.add(r.ras);
    });
    return Array.from(s);
  }, [seizoenData, rijenById]);

  const recent = useMemo(() => seizoenData.slice(0, 10), [seizoenData]);

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  return (
    <>
      <AppHeader back title="Gezondheid" subtitle="Vine health per rij" />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gezondheid</h1>
            <p className="text-sm text-muted-foreground">
              Vigor, snoeigewicht en uitval per rij
            </p>
          </div>
          <YearSelector />
        </div>

        {/* Registratieformulier */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <HeartPulse className="h-4 w-4" /> Nieuwe registratie
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Rij</span>
              <select value={rijId} onChange={(e) => setRijId(e.target.value)} className={veldClass}>
                <option value="">Kies rij…</option>
                {(rijenQ.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    Rij {r.rijnummer} · {r.ras}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Datum</span>
              <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className={veldClass} />
            </label>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium">Vigor (groeikracht): {vigor}/5</span>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVigor(v)}
                  className={`h-12 rounded-xl border-2 text-base font-bold transition ${
                    vigor === v
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">1 = zeer zwak · 5 = zeer sterk</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Snoeigewicht (g)</span>
              <input type="number" inputMode="decimal" value={snoeigewicht} onChange={(e) => setSnoeigewicht(e.target.value)} className={veldClass} placeholder="—" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Dode planten</span>
              <input type="number" inputMode="numeric" value={dodePlanten} onChange={(e) => setDodePlanten(e.target.value)} className={veldClass} placeholder="—" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Korte scheuten (%)</span>
              <input type="number" inputMode="numeric" value={korteScheuten} onChange={(e) => setKorteScheuten(e.target.value)} className={veldClass} placeholder="—" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Notitie</span>
            <input value={notitie} onChange={(e) => setNotitie(e.target.value)} className={veldClass} placeholder="Optioneel…" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Ingevoerd door</span>
            <input value={invoerder} onChange={(e) => setInvoerder(e.target.value)} className={veldClass} placeholder="Je naam" />
          </label>

          <button
            type="button"
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {m.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Registratie opslaan
          </button>
        </section>

        {/* Grafiek: vigor over tijd per ras */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Gezondheid over tijd per ras ({jaar})
          </h2>
          {chartData.length === 0 ? (
            <EmptyState message="Nog geen gezondheidsregistraties dit seizoen." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cac17655" />
                  <XAxis dataKey="maand" fontSize={12} />
                  <YAxis domain={[1, 5]} fontSize={12} />
                  <Tooltip />
                  <Legend />
                  {rassenInChart.map((ras) => (
                    <Line
                      key={ras}
                      type="monotone"
                      dataKey={ras}
                      stroke={RAS_KLEUR[ras] ?? "#27232a"}
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
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
              {recent.map((g: Gezondheid) => {
                const r = rijenById.get(g.rij);
                return (
                  <li key={g.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex items-baseline justify-between">
                      <p className="text-sm font-semibold">
                        {r ? `Rij ${r.rijnummer} · ${r.ras}` : "Rij"}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(g.datum), "d MMM", { locale: nl })}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Vigor {g.vigor}/5
                      {g.snoeigewicht ? ` · snoei ${g.snoeigewicht} g` : ""}
                      {g.dode_planten ? ` · ${g.dode_planten} dood` : ""}
                      {g.korte_scheuten ? ` · ${g.korte_scheuten}% kort` : ""}
                    </p>
                    {g.notitie && <p className="mt-1 text-xs text-muted-foreground">{g.notitie}</p>}
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
