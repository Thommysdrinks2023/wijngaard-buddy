import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO, startOfWeek, getISOWeek } from "date-fns";
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
  ComposedChart,
} from "recharts";
import { fetchMetingen, fetchObservaties, fetchRijen } from "@/lib/data";
import { OBSERVATIE_TYPES, type Ras, type Rij } from "@/lib/types";
import { RAS_OPTIONS } from "@/lib/seed-rijen";
import { AppHeader } from "@/components/app-header";
import { YearSelector } from "@/components/year-selector";
import { EmptyState, SEIZOEN_LEEG_MSG } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useSeizoen } from "@/lib/seizoen";
import {
  fetchSteekproefMetingen,
  fetchSteekproefPlanten,
  getOogst,
  ZIEKTEDRUK_KLEUR,
  ZIEKTEDRUK_OPTIES,
  type ZiekteDruk,
} from "@/lib/steekproef";
import { fetchOogst } from "@/lib/extra-data";

export const Route = createFileRoute("/grafieken")({
  component: GrafiekenPage,
  head: () => ({
    meta: [
      { title: "Grafieken — Wijngaard" },
      {
        name: "description",
        content: "Visuele analyses van metingen, observaties en steekproeven per ras en seizoen.",
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

const PLANT_PALET = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#7c3aed",
  "#0d9488",
];

function ChartEmpty({ msg = SEIZOEN_LEEG_MSG }: { msg?: string }) {
  return (
    <div className="flex h-64 items-center justify-center">
      <EmptyState message={msg} className="w-full" />
    </div>
  );
}

function GrafiekenPage() {
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const metingenQ = useQuery({ queryKey: ["metingen"], queryFn: () => fetchMetingen() });
  const obsQ = useQuery({ queryKey: ["observaties"], queryFn: () => fetchObservaties() });
  const stkPlantenQ = useQuery({
    queryKey: ["steekproef_planten"],
    queryFn: () => fetchSteekproefPlanten(),
  });
  const stkMetingenQ = useQuery({
    queryKey: ["steekproef_metingen"],
    queryFn: () => fetchSteekproefMetingen(),
  });
  // PB-first; valt terug op de lokale registraties als de server niet bereikbaar is
  const oogstQ = useQuery({
    queryKey: ["oogst"],
    queryFn: async () => {
      const records = await fetchOogst();
      return records.length > 0 ? records : getOogst();
    },
  });

  const rijenById = useMemo(() => {
    const m = new Map<string, Rij>();
    rijenQ.data?.forEach((r) => m.set(r.id, r));
    return m;
  }, [rijenQ.data]);

  // Beschikbare jaren
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
    stkMetingenQ.data?.forEach((m) => s.add(m.seizoen));
    s.add(new Date().getFullYear());
    return Array.from(s).sort((a, b) => b - a);
  }, [metingenQ.data, obsQ.data, stkMetingenQ.data]);

  const [jaar] = useSeizoen();
  const [tab, setTab] = useState<"metingen" | "steekproeven">("metingen");

  // ============ Grafiek 1: Brix verloop per ras ============
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

  // ============ Grafiek 2: Gemiddelde Brix per ras ============
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

  // ============ Grafiek 3: Observaties per type ============
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

  // ============ Temperatuur vs Brix per dag ============
  const tempBrixVerloop = useMemo(() => {
    const perDag = new Map<string, { brixSum: number; brixN: number; tempSum: number; tempN: number }>();
    metingenQ.data?.forEach((m) => {
      const d = parseISO(m.datum);
      if (d.getFullYear() !== jaar) return;
      const key = format(d, "yyyy-MM-dd");
      const cur = perDag.get(key) ?? { brixSum: 0, brixN: 0, tempSum: 0, tempN: 0 };
      if (m.brix != null) {
        cur.brixSum += m.brix;
        cur.brixN += 1;
      }
      if (m.temperatuur != null) {
        cur.tempSum += m.temperatuur;
        cur.tempN += 1;
      }
      perDag.set(key, cur);
    });
    return Array.from(perDag.entries())
      .filter(([, v]) => v.tempN > 0 || v.brixN > 0)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([datum, v]) => ({
        datum,
        brix: v.brixN ? Math.round((v.brixSum / v.brixN) * 10) / 10 : null,
        temperatuur: v.tempN ? Math.round((v.tempSum / v.tempN) * 10) / 10 : null,
      }));
  }, [metingenQ.data, jaar]);

  const heeftTemp = useMemo(
    () => tempBrixVerloop.some((r) => r.temperatuur != null),
    [tempBrixVerloop],
  );

  const rasMetData = useMemo(() => {
    const set = new Set<Ras>();
    brixVerloop.forEach((row) => {
      RAS_OPTIONS.forEach((ras) => {
        if (row[ras] != null) set.add(ras);
      });
    });
    return RAS_OPTIONS.filter((r) => set.has(r));
  }, [brixVerloop]);

  // ============ Grafiek 4: Steekproef Brix verloop per plant ============
  const stkPlantById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof stkPlantenQ.data>[number]>();
    stkPlantenQ.data?.forEach((p) => m.set(p.id, p));
    return m;
  }, [stkPlantenQ.data]);

  const stkBrixVerloop = useMemo(() => {
    type Row = { datum: string } & Record<string, string | number>;
    const perDatum = new Map<string, Map<string, number>>();
    stkMetingenQ.data?.forEach((m) => {
      if (m.brix == null) return;
      if (m.seizoen !== jaar) return;
      const key = format(parseISO(m.datum), "yyyy-MM-dd");
      if (!perDatum.has(key)) perDatum.set(key, new Map());
      perDatum.get(key)!.set(m.plantId, m.brix);
    });
    return Array.from(perDatum.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([datum, inner]) => {
        const row: Row = { datum };
        inner.forEach((v, pid) => {
          const naam = stkPlantById.get(pid)?.naam ?? pid;
          row[naam] = v;
        });
        return row;
      });
  }, [stkMetingenQ.data, stkPlantById, jaar]);

  const stkPlantNamen = useMemo(() => {
    const set = new Set<string>();
    stkBrixVerloop.forEach((r) => {
      Object.keys(r).forEach((k) => {
        if (k !== "datum") set.add(k);
      });
    });
    return Array.from(set);
  }, [stkBrixVerloop]);

  // ============ Grafiek 5: Ziektedruk per ras over weken ============
  const [filterRas, setFilterRas] = useState<Ras | "alle">("alle");

  const ziektePerWeek = useMemo(() => {
    type Row = { week: string } & Partial<Record<ZiekteDruk, number>>;
    const perWeek = new Map<string, Map<ZiekteDruk, number>>();
    stkMetingenQ.data?.forEach((m) => {
      if (!m.ziektedruk) return;
      if (m.seizoen !== jaar) return;
      const punt = stkPlantById.get(m.plantId);
      if (filterRas !== "alle" && punt?.ras !== filterRas) return;
      const d = parseISO(m.datum);
      const ws = startOfWeek(d, { weekStartsOn: 1 });
      const wk = `W${getISOWeek(d).toString().padStart(2, "0")} ${format(ws, "d MMM", { locale: nl })}`;
      if (!perWeek.has(wk)) perWeek.set(wk, new Map());
      const inner = perWeek.get(wk)!;
      inner.set(m.ziektedruk, (inner.get(m.ziektedruk) ?? 0) + 1);
    });
    return Array.from(perWeek.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([week, inner]) => {
        const row: Row = { week };
        ZIEKTEDRUK_OPTIES.forEach((z) => {
          row[z] = inner.get(z) ?? 0;
        });
        return row;
      });
  }, [stkMetingenQ.data, stkPlantById, jaar, filterRas]);

  // ============ Grafiek 6: Voorspeld vs werkelijk per ras ============
  const opbrengstVergelijk = useMemo(() => {
    // Voorspeld = laatste opbrengst_kg per plant × aantal_planten van rij
    // Werkelijk = som oogst per ras dit seizoen
    const laatsteOpbrPerPlant = new Map<string, number>();
    stkMetingenQ.data
      ?.filter((m) => m.seizoen === jaar && m.opbrengst_kg != null)
      .sort((a, b) => (a.datum < b.datum ? 1 : -1))
      .forEach((m) => {
        if (!laatsteOpbrPerPlant.has(m.plantId)) {
          laatsteOpbrPerPlant.set(m.plantId, m.opbrengst_kg!);
        }
      });

    const voorspeldPerRas = new Map<Ras, number>();
    laatsteOpbrPerPlant.forEach((kgPerStok, plantId) => {
      const punt = stkPlantById.get(plantId);
      if (!punt) return;
      const rij = rijenById.get(punt.rij);
      if (!rij) return;
      voorspeldPerRas.set(
        punt.ras,
        (voorspeldPerRas.get(punt.ras) ?? 0) + kgPerStok * rij.aantal_planten,
      );
    });

    const werkelijkPerRas = new Map<Ras, number>();
    oogstQ.data
      ?.filter((o) => o.seizoen === jaar)
      .forEach((o) => {
        werkelijkPerRas.set(o.ras, (werkelijkPerRas.get(o.ras) ?? 0) + o.kg);
      });

    return RAS_OPTIONS.map((ras) => ({
      ras,
      voorspeld: Math.round(voorspeldPerRas.get(ras) ?? 0),
      werkelijk: Math.round(werkelijkPerRas.get(ras) ?? 0),
    })).filter((r) => r.voorspeld > 0 || r.werkelijk > 0);
  }, [stkMetingenQ.data, stkPlantById, rijenById, oogstQ.data, jaar]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader title="Grafieken" />
      <main className="mx-auto max-w-screen-md space-y-5 px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Grafieken</h1>
          <YearSelector extra={beschikbareJaren} />
        </div>

        {(rijenQ.isError || metingenQ.isError || obsQ.isError || stkPlantenQ.isError || stkMetingenQ.isError || oogstQ.isError) && (
          <ErrorState
            error={rijenQ.error || metingenQ.error || obsQ.error || stkPlantenQ.error || stkMetingenQ.error || oogstQ.error}
            onRetry={() => {
              rijenQ.refetch();
              metingenQ.refetch();
              obsQ.refetch();
              stkPlantenQ.refetch();
              stkMetingenQ.refetch();
              oogstQ.refetch();
            }}
            invoerHref="/perceelkaart"
            invoerLabel="Naar perceelkaart"
          />
        )}

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/30 p-1">
          {(["metingen", "steekproeven"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? "bg-card shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t === "metingen" ? "Metingen" : "Steekproeven"}
            </button>
          ))}
        </div>

        {tab === "metingen" && (
          <>
            <ChartCard title="Brix verloop per ras">
              {brixVerloop.length === 0 ? (
                <ChartEmpty />
              ) : (
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
              )}
            </ChartCard>

            <ChartCard title="Gemiddelde Brix per ras">
              {brixGemPerRas.length === 0 ? (
                <ChartEmpty />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={brixGemPerRas} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
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
              )}
            </ChartCard>

            <ChartCard title="Observaties per type">
              {obsPerType.length === 0 ? (
                <ChartEmpty />
              ) : (
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
              )}
            </ChartCard>

            <ChartCard title="Temperatuur & Brix per dag">
              {!heeftTemp ? (
                <ChartEmpty msg="Nog geen temperatuur ingevoerd bij metingen." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={tempBrixVerloop} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="datum"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => format(parseISO(v), "d MMM", { locale: nl })}
                    />
                    <YAxis yAxisId="brix" domain={[0, 30]} tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="temp"
                      orientation="right"
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 11 }}
                      unit="°"
                    />
                    <Tooltip
                      labelFormatter={(v) => format(parseISO(String(v)), "d MMM yyyy", { locale: nl })}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      yAxisId="brix"
                      type="monotone"
                      dataKey="brix"
                      name="Brix (gem.)"
                      stroke="#7e22ce"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="temperatuur"
                      name="Temperatuur °C"
                      stroke="#ea580c"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </>
        )}

        {tab === "steekproeven" && (
          <>
            <ChartCard title="Steekproef Brix verloop">
              {stkBrixVerloop.length === 0 ? (
                <ChartEmpty msg="Nog geen steekproefmetingen — voer je eerste steekproef in." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stkBrixVerloop} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
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
                    {stkPlantNamen.map((naam, i) => (
                      <Line
                        key={naam}
                        type="monotone"
                        dataKey={naam}
                        stroke={PLANT_PALET[i % PLANT_PALET.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Ziektedruk per week">
              <div className="mb-2 flex flex-wrap gap-2">
                {(["alle", ...RAS_OPTIONS] as const).map((r) => {
                  const active = filterRas === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setFilterRas(r as Ras | "alle")}
                      className={`h-8 rounded-full border px-3 text-xs font-medium ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-card"
                      }`}
                    >
                      {r === "alle" ? "Alle rassen" : r}
                    </button>
                  );
                })}
              </div>
              {ziektePerWeek.length === 0 ? (
                <ChartEmpty msg="Nog geen steekproefmetingen met ziektedruk." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ziektePerWeek} margin={{ top: 8, right: 12, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 10 }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {ZIEKTEDRUK_OPTIES.map((z) => (
                      <Bar key={z} dataKey={z} stackId="z" fill={ZIEKTEDRUK_KLEUR[z]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Opbrengst voorspeld vs werkelijk (kg)">
              {opbrengstVergelijk.length === 0 ? (
                <ChartEmpty msg="Nog geen opbrengstvoorspelling of oogst geregistreerd." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={opbrengstVergelijk}
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
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="voorspeld" fill="#94a3b8" name="Voorspeld" />
                    <Bar dataKey="werkelijk" fill="#16a34a" name="Werkelijk" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </>
        )}
      </main>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div className="h-72 w-full">{children}</div>
    </section>
  );
}
