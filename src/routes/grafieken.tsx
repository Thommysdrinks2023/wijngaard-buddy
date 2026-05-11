import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { fetchMetingen, fetchObservaties, fetchRijen } from "@/lib/data";
import { OBSERVATIE_TYPES, type Ras, type Rij } from "@/lib/types";
import { RAS_OPTIONS } from "@/lib/seed-rijen";
import { AppHeader } from "@/components/app-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/grafieken")({
  component: GrafiekenPage,
  head: () => ({
    meta: [
      { title: "Grafieken — Wijngaard" },
      {
        name: "description",
        content: "Visuele analyses van metingen en observaties per ras en seizoen.",
      },
    ],
  }),
});

const RAS_KLEUR: Record<Ras, string> = {
  Muscaris: "#fde68a",
  "Souveginier Gris": "#eab308",
  Johanniter: "#86efac",
  Regent: "#7e22ce",
  "Pinot Noir": "#7f1d1d",
  Chardonnay: "#bbf7d0",
  Pinotin: "#5c1a2b",
};

const OBS_KLEUR: Record<string, string> = {
  gezond: "#22c55e",
  groei: "#10b981",
  ziekte: "#ef4444",
  schade: "#f59e0b",
  uitval: "#6b7280",
  anders: "#3b82f6",
};

function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
      Nog geen metingen beschikbaar — voer je eerste meting in om de grafiek te zien
    </div>
  );
}

function GrafiekenPage() {
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const metingenQ = useQuery({ queryKey: ["metingen"], queryFn: () => fetchMetingen() });
  const obsQ = useQuery({ queryKey: ["observaties"], queryFn: () => fetchObservaties() });

  const rijenById = useMemo(() => {
    const m = new Map<string, Rij>();
    rijenQ.data?.forEach((r) => m.set(r.id, r));
    return m;
  }, [rijenQ.data]);

  // Beschikbare jaren uit metingen
  const beschikbareJaren = useMemo(() => {
    const s = new Set<number>();
    metingenQ.data?.forEach((m) => {
      const j = parseISO(m.datum).getFullYear();
      if (!Number.isNaN(j)) s.add(j);
    });
    obsQ.data?.forEach((o) => {
      const j = parseISO(o.datum).getFullYear();
      if (!Number.isNaN(j)) s.add(j);
    });
    const huidig = new Date().getFullYear();
    s.add(huidig);
    return Array.from(s).sort((a, b) => b - a);
  }, [metingenQ.data, obsQ.data]);

  const [jaar, setJaar] = useState<number>(new Date().getFullYear());

  // Grafiek 1: Brix verloop per ras (lijn per ras, x = datum)
  const brixVerloop = useMemo(() => {
    type Row = { datum: string } & Partial<Record<Ras, number>>;
    const perDatumRas = new Map<string, Map<Ras, { sum: number; n: number }>>();
    metingenQ.data?.forEach((m) => {
      if (m.brix == null) return;
      const d = parseISO(m.datum);
      if (d.getFullYear() !== jaar) return;
      const r = rijenById.get(m.rij);
      if (!r) return;
      const key = format(d, "yyyy-MM-dd");
      if (!perDatumRas.has(key)) perDatumRas.set(key, new Map());
      const inner = perDatumRas.get(key)!;
      const cur = inner.get(r.ras) ?? { sum: 0, n: 0 };
      cur.sum += m.brix;
      cur.n += 1;
      inner.set(r.ras, cur);
    });
    const rows: Row[] = Array.from(perDatumRas.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([datum, inner]) => {
        const row: Row = { datum };
        inner.forEach((v, ras) => {
          row[ras] = Math.round((v.sum / v.n) * 10) / 10;
        });
        return row;
      });
    return rows;
  }, [metingenQ.data, rijenById, jaar]);

  // Grafiek 2: Gemiddelde Brix per ras
  const brixGemPerRas = useMemo(() => {
    const acc = new Map<Ras, { sum: number; n: number }>();
    metingenQ.data?.forEach((m) => {
      if (m.brix == null) return;
      const d = parseISO(m.datum);
      if (d.getFullYear() !== jaar) return;
      const r = rijenById.get(m.rij);
      if (!r) return;
      const cur = acc.get(r.ras) ?? { sum: 0, n: 0 };
      cur.sum += m.brix;
      cur.n += 1;
      acc.set(r.ras, cur);
    });
    return RAS_OPTIONS.map((ras) => {
      const v = acc.get(ras);
      return {
        ras,
        gemiddelde: v ? Math.round((v.sum / v.n) * 10) / 10 : 0,
        kleur: RAS_KLEUR[ras],
      };
    }).filter((r) => r.gemiddelde > 0);
  }, [metingenQ.data, rijenById, jaar]);

  // Grafiek 3: Observaties per type (donut)
  const obsPerType = useMemo(() => {
    const acc = new Map<string, number>();
    obsQ.data?.forEach((o) => {
      const d = parseISO(o.datum);
      if (d.getFullYear() !== jaar) return;
      acc.set(o.type, (acc.get(o.type) ?? 0) + 1);
    });
    return OBSERVATIE_TYPES.map((t) => ({
      type: t.value,
      label: t.label,
      value: acc.get(t.value) ?? 0,
      kleur: OBS_KLEUR[t.value] ?? "#999",
    })).filter((r) => r.value > 0);
  }, [obsQ.data, jaar]);

  const rasMetData = useMemo(() => {
    const set = new Set<Ras>();
    brixVerloop.forEach((row) => {
      RAS_OPTIONS.forEach((ras) => {
        if (row[ras] != null) set.add(ras);
      });
    });
    return RAS_OPTIONS.filter((r) => set.has(r));
  }, [brixVerloop]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader title="Grafieken" />
      <main className="mx-auto max-w-screen-md space-y-6 px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Grafieken</h1>
          <div className="w-32">
            <Select value={String(jaar)} onValueChange={(v) => setJaar(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {beschikbareJaren.map((j) => (
                  <SelectItem key={j} value={String(j)}>
                    {j}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Grafiek 1 */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Brix verloop per ras</h2>
          {brixVerloop.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={brixVerloop} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="datum"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => format(parseISO(v), "d MMM", { locale: nl })}
                  />
                  <YAxis domain={[0, 30]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={(v) => format(parseISO(String(v)), "d MMM yyyy", { locale: nl })}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {rasMetData.map((ras) => (
                    <Line
                      key={ras}
                      type="monotone"
                      dataKey={ras}
                      stroke={RAS_KLEUR[ras]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Grafiek 2 */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Gemiddelde Brix per ras</h2>
          {brixGemPerRas.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={brixGemPerRas}
                  margin={{ top: 8, right: 12, left: 0, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="ras"
                    tick={{ fontSize: 10 }}
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis domain={[0, 30]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="gemiddelde">
                    {brixGemPerRas.map((r) => (
                      <Cell key={r.ras} fill={r.kleur} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Grafiek 3 */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Observaties per type</h2>
          {obsPerType.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={obsPerType}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {obsPerType.map((r) => (
                      <Cell key={r.type} fill={r.kleur} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
