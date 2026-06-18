import { createFileRoute, Link } from "@tanstack/react-router";
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
import { foutenPerVeld, isGeldig, valideerGezondheid } from "@/lib/validatie";
import {
  fetchSteekproefMetingen,
  fetchSteekproefPlanten,
  ZIEKTEDRUK_KLEUR,
  type ZiekteDruk,
} from "@/lib/steekproef";
import { useInvoerder } from "@/lib/use-invoerder";
import { useSeizoen } from "@/lib/seizoen";
import { AppHeader } from "@/components/app-header";
import { YearSelector } from "@/components/year-selector";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { type Ras, type Rij } from "@/lib/types";
import { AlertTriangle, HeartPulse, Loader2 } from "lucide-react";

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
  const stkPlantenQ = useQuery({
    queryKey: ["steekproef_planten"],
    queryFn: () => fetchSteekproefPlanten(),
  });
  const stkMetingenQ = useQuery({
    queryKey: ["steekproef_metingen"],
    queryFn: () => fetchSteekproefMetingen(),
  });

  // formulier
  const [rijId, setRijId] = useState("");
  const [datum, setDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [vigor, setVigor] = useState(3);
  const [snoeigewicht, setSnoeigewicht] = useState("");
  const [dodePlanten, setDodePlanten] = useState("");
  const [korteScheuten, setKorteScheuten] = useState("");
  const [notitie, setNotitie] = useState("");
  const [fouten, setFouten] = useState<Record<string, string>>({});

  const wisFout = (veld: string) =>
    setFouten((f) => {
      if (!f[veld]) return f;
      const kopie = { ...f };
      delete kopie[veld];
      return kopie;
    });

  const rijenById = useMemo(() => {
    const m = new Map<string, Rij>();
    rijenQ.data?.forEach((r) => m.set(r.id, r));
    return m;
  }, [rijenQ.data]);

  const buildInput = () => ({
    rij: rijId,
    datum,
    seizoen: new Date(datum).getFullYear(),
    vigor,
    snoeigewicht: snoeigewicht ? Number(snoeigewicht) : null,
    dode_planten: dodePlanten ? Number(dodePlanten) : null,
    korte_scheuten: korteScheuten ? Number(korteScheuten) : null,
    notitie,
    ingevoerd_door: invoerder,
  });

  const m = useMutation({
    mutationFn: async () => createGezondheid(buildInput()),
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

  const handleSave = () => {
    if (m.isPending) return;
    const validatie = valideerGezondheid(buildInput());
    if (!isGeldig(validatie)) {
      setFouten(foutenPerVeld(validatie));
      toast.error(validatie[0].bericht);
      return;
    }
    setFouten({});
    m.mutate();
  };

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

  const alleRassen = useMemo(() => {
    const s = new Set<Ras>();
    (gezQ.data ?? []).forEach((g) => {
      const r = rijenById.get(g.rij);
      if (r) s.add(r.ras);
    });
    return Array.from(s);
  }, [gezQ.data, rijenById]);

  const recent = useMemo(() => seizoenData.slice(0, 10), [seizoenData]);

  // Ziektedruk per ras: nieuwste steekproefmeting met ziektedruk dit seizoen
  const ziektedrukPerRas = useMemo(() => {
    const plantRas = new Map<string, Ras>();
    stkPlantenQ.data?.forEach((p) => plantRas.set(p.id, p.ras));
    const nieuwste = new Map<Ras, { druk: ZiekteDruk; datum: string }>();
    stkMetingenQ.data?.forEach((m) => {
      if (m.seizoen !== jaar || !m.ziektedruk) return;
      const ras = plantRas.get(m.plantId);
      if (!ras) return;
      const cur = nieuwste.get(ras);
      if (!cur || cur.datum < m.datum) nieuwste.set(ras, { druk: m.ziektedruk, datum: m.datum });
    });
    return Array.from(nieuwste.entries()).map(([ras, v]) => ({ ras, ...v }));
  }, [stkPlantenQ.data, stkMetingenQ.data, jaar]);

  // Waarschuwingen: dalende vigor (laatste 30 dgn vs 30-60 dgn ervoor) en hoge ziektedruk
  const waarschuwingen = useMemo(() => {
    const lijst: string[] = [];
    const nu = Date.now();
    const DAG = 24 * 60 * 60 * 1000;
    const perRas = new Map<Ras, { recent: number[]; ervoor: number[] }>();
    (gezQ.data ?? []).forEach((g) => {
      const r = rijenById.get(g.rij);
      if (!r) return;
      const leeftijd = nu - new Date(g.datum).getTime();
      const groep = perRas.get(r.ras) ?? { recent: [], ervoor: [] };
      if (leeftijd <= 30 * DAG) groep.recent.push(g.vigor);
      else if (leeftijd <= 60 * DAG) groep.ervoor.push(g.vigor);
      perRas.set(r.ras, groep);
    });
    perRas.forEach((groep, ras) => {
      if (groep.recent.length === 0 || groep.ervoor.length === 0) return;
      const gem = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      const recentGem = gem(groep.recent);
      const ervoorGem = gem(groep.ervoor);
      if (recentGem < ervoorGem - 0.4) {
        lijst.push(`${ras}: vigor daalt (${ervoorGem.toFixed(1)} → ${recentGem.toFixed(1)})`);
      }
    });
    ziektedrukPerRas.forEach((z) => {
      if (z.druk === "Matig" || z.druk === "Zwaar") {
        lijst.push(`${z.ras}: ${z.druk.toLowerCase()}e ziektedruk in steekproef`);
      }
    });
    return lijst;
  }, [gezQ.data, rijenById, ziektedrukPerRas]);

  // Meerjarenvergelijking: gemiddelde vigor per seizoen per ras
  const seizoensChart = useMemo(() => {
    const perSeizoenRas = new Map<number, Map<Ras, { sum: number; n: number }>>();
    (gezQ.data ?? []).forEach((g) => {
      const r = rijenById.get(g.rij);
      if (!r) return;
      const s = jaarOf(g);
      const rasMap = perSeizoenRas.get(s) ?? new Map();
      const cur = rasMap.get(r.ras) ?? { sum: 0, n: 0 };
      cur.sum += g.vigor;
      cur.n += 1;
      rasMap.set(r.ras, cur);
      perSeizoenRas.set(s, rasMap);
    });
    return Array.from(perSeizoenRas.entries())
      .sort(([a], [b]) => a - b)
      .map(([s, rasMap]) => {
        const punt: Record<string, number | string> = { seizoen: String(s) };
        rasMap.forEach((v, ras) => {
          punt[ras] = Math.round((v.sum / v.n) * 10) / 10;
        });
        return punt;
      });
  }, [gezQ.data, rijenById]);

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  return (
    <>
      <AppHeader back title="Gezondheid" subtitle="Vine health per rij" />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gezondheid</h1>
            <p className="text-sm text-muted-foreground">Vigor, snoeigewicht en uitval per rij</p>
          </div>
          <YearSelector />
        </div>

        {/* afbakening met steekproeven, zodat nieuwe medewerkers het verschil snappen */}
        <p className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          💡 Hier registreer je de gezondheid <strong>per rij</strong> (overzicht). Gedetailleerde
          metingen aan vaste planten — incl. ziektedruk — doe je bij{" "}
          <Link to="/steekproeven" className="font-semibold underline">
            Steekproeven
          </Link>
          ; de ziektedruk verschijnt dan hieronder automatisch.
        </p>

        {gezQ.isError && <ErrorState error={gezQ.error} onRetry={() => gezQ.refetch()} />}

        {/* Waarschuwingen bij dalende gezondheid of hoge ziektedruk */}
        {waarschuwingen.length > 0 && (
          <section className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Aandachtspunten
            </p>
            <ul className="space-y-1">
              {waarschuwingen.map((w) => (
                <li key={w} className="text-sm text-destructive">
                  • {w}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Ziektedruk per ras (uit steekproeven) */}
        {ziektedrukPerRas.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Ziektedruk per ras ({jaar}, uit steekproeven)
            </h2>
            <div className="flex flex-wrap gap-2">
              {ziektedrukPerRas.map((z) => (
                <span
                  key={z.ras}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: ZIEKTEDRUK_KLEUR[z.druk] }}
                  />
                  {z.ras}: {z.druk}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Registratieformulier */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <HeartPulse className="h-4 w-4" /> Nieuwe registratie
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Rij</span>
              <select
                value={rijId}
                onChange={(e) => {
                  setRijId(e.target.value);
                  wisFout("rij");
                }}
                className={`${veldClass} ${fouten.rij ? "border-destructive" : ""}`}
              >
                <option value="">Kies rij…</option>
                {(rijenQ.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    Rij {r.rijnummer} · {r.ras}
                  </option>
                ))}
              </select>
              {fouten.rij && (
                <span className="mt-1 block text-sm text-destructive">{fouten.rij}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Datum</span>
              <input
                type="date"
                value={datum}
                onChange={(e) => {
                  setDatum(e.target.value);
                  wisFout("datum");
                }}
                className={`${veldClass} ${fouten.datum ? "border-destructive" : ""}`}
              />
              {fouten.datum && (
                <span className="mt-1 block text-sm text-destructive">{fouten.datum}</span>
              )}
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
              <input
                type="number"
                inputMode="decimal"
                value={snoeigewicht}
                onChange={(e) => {
                  setSnoeigewicht(e.target.value);
                  wisFout("snoeigewicht");
                }}
                className={`${veldClass} ${fouten.snoeigewicht ? "border-destructive" : ""}`}
                placeholder="—"
              />
              {fouten.snoeigewicht && (
                <span className="mt-1 block text-sm text-destructive">{fouten.snoeigewicht}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Dode planten</span>
              <input
                type="number"
                inputMode="numeric"
                value={dodePlanten}
                onChange={(e) => {
                  setDodePlanten(e.target.value);
                  wisFout("dode_planten");
                }}
                className={`${veldClass} ${fouten.dode_planten ? "border-destructive" : ""}`}
                placeholder="—"
              />
              {fouten.dode_planten && (
                <span className="mt-1 block text-sm text-destructive">{fouten.dode_planten}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Korte scheuten (%)</span>
              <input
                type="number"
                inputMode="numeric"
                value={korteScheuten}
                onChange={(e) => {
                  setKorteScheuten(e.target.value);
                  wisFout("korte_scheuten");
                }}
                className={`${veldClass} ${fouten.korte_scheuten ? "border-destructive" : ""}`}
                placeholder="—"
              />
              {fouten.korte_scheuten && (
                <span className="mt-1 block text-sm text-destructive">{fouten.korte_scheuten}</span>
              )}
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Notitie</span>
            <input
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              className={veldClass}
              placeholder="Optioneel…"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Ingevoerd door</span>
            <input
              value={invoerder}
              onChange={(e) => {
                setInvoerder(e.target.value);
                wisFout("ingevoerd_door");
              }}
              className={`${veldClass} ${fouten.ingevoerd_door ? "border-destructive" : ""}`}
              placeholder="Je naam"
            />
            {fouten.ingevoerd_door && (
              <span className="mt-1 block text-sm text-destructive">{fouten.ingevoerd_door}</span>
            )}
          </label>

          <button
            type="button"
            onClick={handleSave}
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e2" />
                  <XAxis dataKey="maand" fontSize={12} />
                  <YAxis domain={[1, 5]} fontSize={12} />
                  <Tooltip />
                  <Legend />
                  {rassenInChart.map((ras) => (
                    <Line
                      key={ras}
                      type="monotone"
                      dataKey={ras}
                      stroke={RAS_KLEUR[ras] ?? "#4a8c5c"}
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

        {/* Meerjarenvergelijking */}
        {seizoensChart.length > 1 && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Gezondheid per seizoen (alle jaren)
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={seizoensChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e2" />
                  <XAxis dataKey="seizoen" fontSize={12} />
                  <YAxis domain={[1, 5]} fontSize={12} />
                  <Tooltip />
                  <Legend />
                  {alleRassen.map((ras) => (
                    <Line
                      key={ras}
                      type="monotone"
                      dataKey={ras}
                      stroke={RAS_KLEUR[ras] ?? "#4a8c5c"}
                      strokeWidth={2.5}
                      dot={{ r: 5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

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
