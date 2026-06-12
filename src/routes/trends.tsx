import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { format, parseISO, getISOWeek } from "date-fns";
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
import { fetchMetingen, fetchRijen } from "@/lib/data";
import { fetchGezondheid, fetchOogst } from "@/lib/extra-data";
import { useSeizoen } from "@/lib/seizoen";
import { AppHeader } from "@/components/app-header";
import { YearSelector } from "@/components/year-selector";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { type Rij } from "@/lib/types";
import { Download } from "lucide-react";

export const Route = createFileRoute("/trends")({
  component: TrendsPage,
  head: () => ({
    meta: [
      { title: "Trends — Wijngaard" },
      { name: "description", content: "Zelf grafieken samenstellen: vergelijk rassen en rijen." },
    ],
  }),
});

// Welke meetwaarden kun je op de Y-as zetten?
const METRICS = [
  { key: "brix", label: "Brix (suiker)", bron: "meting" },
  { key: "ph", label: "pH", bron: "meting" },
  { key: "zuurgraad", label: "Zuurgraad (g/L)", bron: "meting" },
  { key: "rijpheid_score", label: "Rijpheid (1-5)", bron: "meting" },
  { key: "temperatuur", label: "Temperatuur (°C)", bron: "meting" },
  { key: "vigor", label: "Vigor (1-5)", bron: "gezondheid" },
  { key: "kg", label: "Oogst (kg)", bron: "oogst" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

const X_OPTIES = [
  { key: "maand", label: "Per maand" },
  { key: "week", label: "Per week" },
] as const;
type XKey = (typeof X_OPTIES)[number]["key"];

const SERIE_KLEUREN = ["#27232a", "#cac176", "#a1a35b", "#7e22ce", "#7f1d1d", "#0891b2", "#ea580c"];

function jaarOf(item: { seizoen?: number; datum: string }): number {
  return item.seizoen ?? parseISO(item.datum).getFullYear();
}

function TrendsPage() {
  const [jaar] = useSeizoen();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const metingenQ = useQuery({ queryKey: ["metingen"], queryFn: () => fetchMetingen() });
  const gezQ = useQuery({ queryKey: ["gezondheid"], queryFn: fetchGezondheid });
  const oogstQ = useQuery({ queryKey: ["oogst-records"], queryFn: fetchOogst });

  const [metric, setMetric] = useState<MetricKey>("brix");
  const [xAs, setXAs] = useState<XKey>("maand");
  const [groepering, setGroepering] = useState<"ras" | "rij">("ras");
  const [rijA, setRijA] = useState("");
  const [rijB, setRijB] = useState("");
  const chartRef = useRef<HTMLDivElement>(null);

  const rijenById = useMemo(() => {
    const m = new Map<string, Rij>();
    rijenQ.data?.forEach((r) => m.set(r.id, r));
    return m;
  }, [rijenQ.data]);

  // Bron-records normaliseren naar {datum, waarde, rijId}
  const records = useMemo(() => {
    const metricDef = METRICS.find((x) => x.key === metric)!;
    const out: { datum: string; waarde: number; rijId: string | null }[] = [];
    if (metricDef.bron === "meting") {
      (metingenQ.data ?? []).forEach((m) => {
        if (jaarOf(m) !== jaar) return;
        const v = (m as unknown as Record<string, unknown>)[metric];
        if (typeof v === "number") out.push({ datum: m.datum, waarde: v, rijId: m.rij });
      });
    } else if (metricDef.bron === "gezondheid") {
      (gezQ.data ?? []).forEach((g) => {
        if (jaarOf(g) !== jaar) return;
        out.push({ datum: g.datum, waarde: g.vigor, rijId: g.rij });
      });
    } else {
      (oogstQ.data ?? []).forEach((o) => {
        if (o.seizoen !== jaar) return;
        out.push({ datum: o.datum, waarde: o.kg, rijId: o.rij ?? null });
      });
    }
    return out;
  }, [metric, jaar, metingenQ.data, gezQ.data, oogstQ.data]);

  // Series bepalen: per ras, of de gekozen rijen
  const series = useMemo(() => {
    if (groepering === "ras") {
      const s = new Set<string>();
      records.forEach((r) => {
        const rij = r.rijId ? rijenById.get(r.rijId) : undefined;
        if (rij) s.add(rij.ras);
      });
      return Array.from(s);
    }
    return [rijA, rijB]
      .filter(Boolean)
      .map((id) => {
        const rij = rijenById.get(id);
        return rij ? `Rij ${rij.rijnummer}` : "";
      })
      .filter(Boolean);
  }, [groepering, records, rijenById, rijA, rijB]);

  // Chartdata: gemiddelde per periode per serie
  const chartData = useMemo(() => {
    const perPeriode = new Map<string, Map<string, { sum: number; n: number }>>();
    records.forEach((rec) => {
      const rij = rec.rijId ? rijenById.get(rec.rijId) : undefined;
      let serie: string | null = null;
      if (groepering === "ras") {
        serie = rij?.ras ?? null;
      } else {
        if (rec.rijId === rijA && rij) serie = `Rij ${rij.rijnummer}`;
        else if (rec.rijId === rijB && rij) serie = `Rij ${rij.rijnummer}`;
      }
      if (!serie) return;
      const d = parseISO(rec.datum);
      const periode =
        xAs === "maand"
          ? format(d, "yyyy-MM")
          : `${d.getFullYear()}-W${String(getISOWeek(d)).padStart(2, "0")}`;
      const serieMap = perPeriode.get(periode) ?? new Map();
      const cur = serieMap.get(serie) ?? { sum: 0, n: 0 };
      cur.sum += rec.waarde;
      cur.n += 1;
      serieMap.set(serie, cur);
      perPeriode.set(periode, serieMap);
    });
    return Array.from(perPeriode.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([periode, serieMap]) => {
        const label =
          xAs === "maand"
            ? format(parseISO(`${periode}-01`), "MMM", { locale: nl })
            : periode.split("-")[1];
        const punt: Record<string, string | number> = { periode: label };
        serieMap.forEach((v, serie) => {
          punt[serie] = Math.round((v.sum / v.n) * 100) / 100;
        });
        return punt;
      });
  }, [records, groepering, rijA, rijB, rijenById, xAs]);

  // Grafiek exporteren als PNG-afbeelding
  const exporteer = () => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) {
      toast.error("Geen grafiek om te exporteren");
      return;
    }
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const schaal = 2; // scherpere export
      const canvas = document.createElement("canvas");
      canvas.width = img.width * schaal;
      canvas.height = img.height * schaal;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(schaal, schaal);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.download = `trend-${metric}-${jaar}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      toast.success("Grafiek geëxporteerd als afbeelding");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("Exporteren mislukt");
    };
    img.src = url;
  };

  const metricLabel = METRICS.find((x) => x.key === metric)?.label ?? metric;
  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  return (
    <>
      <AppHeader back title="Trends" subtitle="Zelf grafieken samenstellen" />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Trends</h1>
            <p className="text-sm text-muted-foreground">Kies wat je wilt vergelijken</p>
          </div>
          <YearSelector />
        </div>

        {metingenQ.isError && (
          <ErrorState error={metingenQ.error} onRetry={() => metingenQ.refetch()} />
        )}

        {/* Samenstellen */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Y-as (meetwaarde)</span>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value as MetricKey)}
                className={veldClass}
              >
                {METRICS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">X-as (periode)</span>
              <select
                value={xAs}
                onChange={(e) => setXAs(e.target.value as XKey)}
                className={veldClass}
              >
                {X_OPTIES.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium">Vergelijk</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGroepering("ras")}
                className={`h-12 rounded-xl border-2 text-sm font-semibold ${
                  groepering === "ras"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background"
                }`}
              >
                Rassen
              </button>
              <button
                type="button"
                onClick={() => setGroepering("rij")}
                className={`h-12 rounded-xl border-2 text-sm font-semibold ${
                  groepering === "rij"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background"
                }`}
              >
                Rijen
              </button>
            </div>
          </div>

          {groepering === "rij" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Rij A</span>
                <select
                  value={rijA}
                  onChange={(e) => setRijA(e.target.value)}
                  className={veldClass}
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
                <span className="mb-1.5 block text-sm font-medium">Rij B (optioneel)</span>
                <select
                  value={rijB}
                  onChange={(e) => setRijB(e.target.value)}
                  className={veldClass}
                >
                  <option value="">—</option>
                  {(rijenQ.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      Rij {r.rijnummer} · {r.ras}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </section>

        {/* Grafiek */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {metricLabel} — {jaar}
            </h2>
            <button
              type="button"
              onClick={exporteer}
              className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium"
              style={{ backgroundColor: "#27232a", color: "#cac176" }}
            >
              <Download className="h-4 w-4" /> Exporteer
            </button>
          </div>
          {chartData.length === 0 || series.length === 0 ? (
            <EmptyState
              message={
                groepering === "rij" && !rijA
                  ? "Kies eerst een rij om te vergelijken."
                  : "Geen gegevens voor deze combinatie dit seizoen."
              }
            />
          ) : (
            <div className="h-72" ref={chartRef}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cac17655" />
                  <XAxis dataKey="periode" fontSize={12} />
                  <YAxis fontSize={12} domain={["auto", "auto"]} />
                  <Tooltip />
                  <Legend />
                  {series.map((serie, i) => (
                    <Line
                      key={serie}
                      type="monotone"
                      dataKey={serie}
                      stroke={SERIE_KLEUREN[i % SERIE_KLEUREN.length]}
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
      </div>
    </>
  );
}
