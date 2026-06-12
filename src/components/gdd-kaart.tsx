import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Thermometer } from "lucide-react";
import { fetchGdd, huidigeGdd, isGddBeschikbaar } from "@/lib/gdd";

// Huisstijl De Tappenmars
const GOUD = "#cac176";
const DONKER = "#27232a";

// Warmtesom (Growing Degree Days, basis 10°C) voor het groeiseizoen.
// Geeft context bij fenologie: hetzelfde moment valt elk jaar rond een
// vergelijkbare GDD-waarde, ook al verschilt de kalenderdatum.
export function GddKaart({ jaar }: { jaar: number }) {
  const beschikbaar = isGddBeschikbaar();
  const gddQ = useQuery({
    queryKey: ["gdd", jaar],
    queryFn: () => fetchGdd(jaar),
    enabled: beschikbaar,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const punten = useMemo(() => gddQ.data ?? [], [gddQ.data]);
  const totaal = useMemo(() => Math.round(huidigeGdd(punten)), [punten]);

  // grafiekdata uitdunnen: 1 punt per 3 dagen houdt de chart vlot
  const chartData = useMemo(
    () =>
      punten
        .filter((_, i) => i % 3 === 0 || i === punten.length - 1)
        .map((p) => ({
          datum: format(parseISO(p.datum), "d MMM", { locale: nl }),
          cumulatief: p.cumulatief,
        })),
    [punten],
  );

  if (!beschikbaar) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Warmtesom (GDD)</h2>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cumulatief sinds 1 april ({jaar})
            </p>
            <p className="text-3xl font-bold tabular-nums" style={{ color: DONKER }}>
              {gddQ.isLoading ? "…" : totaal}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                °C·dagen (basis 10°C)
              </span>
            </p>
          </div>
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: DONKER }}
          >
            <Thermometer className="h-6 w-6" style={{ color: GOUD }} />
          </div>
        </div>

        {gddQ.isError && (
          <p className="text-sm text-muted-foreground">
            Warmtesom kon niet geladen worden (geen verbinding?).
          </p>
        )}

        {chartData.length > 1 && (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gddVerloop" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOUD} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={GOUD} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#cac17655" />
                <XAxis dataKey="datum" fontSize={11} minTickGap={30} />
                <YAxis fontSize={11} width={40} />
                <Tooltip formatter={(v) => [`${v} °C·dagen`, "Warmtesom"]} />
                <Area
                  type="monotone"
                  dataKey="cumulatief"
                  stroke={DONKER}
                  strokeWidth={2}
                  fill="url(#gddVerloop)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Vuistregel: knopbreek ±50, bloei ±350, véraison ±900 GDD. Bron: Open-Meteo.
        </p>
      </div>
    </section>
  );
}
