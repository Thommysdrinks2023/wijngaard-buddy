import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { fetchRijen } from "@/lib/data";
import {
  createOogstRecord,
  fetchOogst,
  VERWACHTE_KG_PER_PLANT,
} from "@/lib/extra-data";
import { foutenPerVeld, isGeldig, valideerOogst } from "@/lib/validatie";
import { useInvoerder } from "@/lib/use-invoerder";
import { useSeizoen } from "@/lib/seizoen";
import { getPerceelOppervlakte } from "@/lib/app-instellingen";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { AppHeader } from "@/components/app-header";
import { YearSelector } from "@/components/year-selector";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { type Ras, type Rij } from "@/lib/types";
import { Grape, Loader2 } from "lucide-react";

export const Route = createFileRoute("/oogst")({
  component: OogstPage,
  head: () => ({
    meta: [
      { title: "Oogst — Wijngaard" },
      { name: "description", content: "Oogstregistratie en opbrengst per ras." },
    ],
  }),
});

function OogstPage() {
  const qc = useQueryClient();
  const [jaar] = useSeizoen();
  const [invoerder, setInvoerder] = useInvoerder();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const oogstQ = useQuery({ queryKey: ["oogst-records"], queryFn: fetchOogst });

  const [rijId, setRijId] = useState("");
  const [kg, setKg] = useState("");
  const [datum, setDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
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

  const gekozenRij = rijId ? rijenById.get(rijId) : undefined;

  const m = useMutation({
    mutationFn: async () => {
      if (!gekozenRij) throw new Error("Kies een rij");
      return createOogstRecord({
        rij: gekozenRij.id,
        ras: gekozenRij.ras,
        datum,
        seizoen: new Date(datum).getFullYear(),
        kg: Number(kg),
        notitie,
        ingevoerd_door: invoerder,
      });
    },
    onSuccess: () => {
      toast.success("Oogst geregistreerd ✓");
      qc.invalidateQueries({ queryKey: ["oogst-records"] });
      setKg("");
      setNotitie("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSave = () => {
    if (m.isPending) return;
    const validatie = valideerOogst({
      rij: rijId || null,
      datum,
      kg: kg ? Number(kg) : undefined,
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

  const seizoenOogst = useMemo(
    () => (oogstQ.data ?? []).filter((o) => o.seizoen === jaar),
    [oogstQ.data, jaar],
  );

  // Totalen + verwachting per ras
  const perRas = useMemo(() => {
    const totalen = new Map<Ras, number>();
    seizoenOogst.forEach((o) => {
      totalen.set(o.ras, (totalen.get(o.ras) ?? 0) + o.kg);
    });
    const plantenPerRas = new Map<Ras, number>();
    rijenQ.data?.forEach((r) => {
      plantenPerRas.set(r.ras, (plantenPerRas.get(r.ras) ?? 0) + r.aantal_planten);
    });
    const rassen = new Set<Ras>([...totalen.keys(), ...plantenPerRas.keys()]);
    return Array.from(rassen)
      .map((ras) => {
        const geoogst = Math.round((totalen.get(ras) ?? 0) * 10) / 10;
        const verwacht = Math.round((plantenPerRas.get(ras) ?? 0) * VERWACHTE_KG_PER_PLANT);
        return { ras, geoogst, verwacht, pct: verwacht > 0 ? (geoogst / verwacht) * 100 : 0 };
      })
      .filter((x) => x.geoogst > 0 || x.verwacht > 0)
      .sort((a, b) => b.geoogst - a.geoogst);
  }, [seizoenOogst, rijenQ.data]);

  const totaalGeoogst = useMemo(
    () => Math.round(perRas.reduce((acc, x) => acc + x.geoogst, 0) * 10) / 10,
    [perRas],
  );
  const totaalVerwacht = useMemo(
    () => perRas.reduce((acc, x) => acc + x.verwacht, 0),
    [perRas],
  );
  const oppervlakteHa = getPerceelOppervlakte();
  const kgPerHa = oppervlakteHa > 0 ? Math.round(totaalGeoogst / oppervlakteHa) : 0;

  const recent = useMemo(() => seizoenOogst.slice(0, 10), [seizoenOogst]);

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  return (
    <>
      <AppHeader back title="Oogst" subtitle="Registratie en opbrengst" />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Oogst</h1>
            <p className="text-sm text-muted-foreground">Seizoen {jaar}</p>
          </div>
          <YearSelector />
        </div>

        {oogstQ.isError && <ErrorState error={oogstQ.error} onRetry={() => oogstQ.refetch()} />}

        {/* Seizoenstotaal */}
        <section
          className="rounded-2xl border p-4"
          style={{ backgroundColor: "#27232a", borderColor: "#cac176" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#cac176" }}>
                Totaal geoogst {jaar}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-white">
                {totaalGeoogst} <span className="text-base font-normal">kg</span>
              </p>
              {totaalVerwacht > 0 && (
                <p className="text-xs text-white/70">
                  van ± {totaalVerwacht} kg verwacht ({Math.round((totaalGeoogst / totaalVerwacht) * 100)}%)
                  {" · "}{kgPerHa} kg/ha ({oppervlakteHa} ha)
                </p>
              )}
            </div>
            <Grape className="h-12 w-12" style={{ color: "#cac176" }} />
          </div>
        </section>

        {/* Registratieformulier */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Nieuwe oogstregistratie
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
              {fouten.rij && <span className="mt-1 block text-sm text-destructive">{fouten.rij}</span>}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Gewicht (kg)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={kg}
                onChange={(e) => {
                  setKg(e.target.value);
                  wisFout("kg");
                }}
                className={`${veldClass} ${fouten.kg ? "border-destructive" : ""}`}
                placeholder="bijv. 12.5"
              />
              {fouten.kg && <span className="mt-1 block text-sm text-destructive">{fouten.kg}</span>}
            </label>
          </div>
          {gekozenRij && (
            <p className="text-xs text-muted-foreground">
              Ras: <strong>{gekozenRij.ras}</strong> · {gekozenRij.aantal_planten} planten
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Notitie</span>
            <input value={notitie} onChange={(e) => setNotitie(e.target.value)} className={veldClass} placeholder="Optioneel…" />
          </label>
          <button
            type="button"
            onClick={handleSave}
            disabled={m.isPending}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {m.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Oogst opslaan
          </button>
        </section>

        {/* Opbrengst vs verwachting per ras */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Opbrengst per ras (vs. verwachting {VERWACHTE_KG_PER_PLANT} kg/plant)
          </h2>
          {perRas.length === 0 ? (
            <EmptyState message="Nog geen oogst geregistreerd dit seizoen." />
          ) : (
            <div className="space-y-2">
              {perRas.map((x) => {
                const pct = Math.min(100, x.pct);
                return (
                  <div key={x.ras} className="rounded-xl border border-border bg-card p-3">
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="font-medium">{x.ras}</span>
                      <span className="text-sm tabular-nums">
                        <strong>{x.geoogst} kg</strong>
                        <span className="text-muted-foreground"> / ± {x.verwacht} kg</span>
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: "#cac176" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Grafiek: geoogst vs verwacht per ras */}
        {perRas.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Oogst vs. verwachting per ras
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perRas} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cac17655" />
                  <XAxis type="number" fontSize={11} unit=" kg" />
                  <YAxis type="category" dataKey="ras" fontSize={11} width={95} />
                  <Tooltip formatter={(v: number) => [`${v} kg`]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="geoogst" name="Geoogst" fill="#cac176" radius={[0, 6, 6, 0]} />
                  <Bar dataKey="verwacht" name="Verwacht" fill="#27232a" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Inclusief oogsten die via de steekproevenpagina zijn geregistreerd.
            </p>
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
              {recent.map((o) => {
                const r = o.rij ? rijenById.get(o.rij) : undefined;
                return (
                  <li key={o.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {o.kg} kg · {o.ras}
                        {r ? ` · rij ${r.rijnummer}` : ""}
                      </p>
                      {o.notitie && <p className="text-xs text-muted-foreground">{o.notitie}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(o.datum), "d MMM", { locale: nl })}
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
