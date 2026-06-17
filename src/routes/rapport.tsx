import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { fetchFenologie, fetchMetingen, fetchObservaties, fetchRijen } from "@/lib/data";
import {
  fetchGezondheid,
  fetchOogst,
  fetchWerkuren,
  VERWACHTE_KG_PER_PLANT,
} from "@/lib/extra-data";
import { fetchGdd, huidigeGdd, isGddBeschikbaar } from "@/lib/gdd";
import { getPerceelOppervlakte, getUurloon } from "@/lib/app-instellingen";
import { getWijngaardConfig } from "@/lib/wijngaard-config";
import { useSeizoen } from "@/lib/seizoen";
import { AppHeader } from "@/components/app-header";
import { YearSelector } from "@/components/year-selector";
import { type Ras, type Rij, FENOLOGIE_MOMENTEN } from "@/lib/types";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/rapport")({
  component: RapportPage,
  head: () => ({ meta: [{ title: "Seizoensrapport — Wijngaard" }] }),
});

function jaarOf(item: { seizoen?: number; datum: string }): number {
  return item.seizoen ?? parseISO(item.datum).getFullYear();
}

function RapportPage() {
  const [jaar] = useSeizoen();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const metingenQ = useQuery({ queryKey: ["metingen"], queryFn: () => fetchMetingen() });
  const obsQ = useQuery({ queryKey: ["observaties"], queryFn: () => fetchObservaties() });
  const fenQ = useQuery({ queryKey: ["fenologie"], queryFn: () => fetchFenologie() });
  const oogstQ = useQuery({ queryKey: ["oogst-records"], queryFn: fetchOogst });
  const urenQ = useQuery({ queryKey: ["werkuren"], queryFn: fetchWerkuren });
  const gezQ = useQuery({ queryKey: ["gezondheid"], queryFn: fetchGezondheid });
  const gddQ = useQuery({
    queryKey: ["gdd", jaar],
    queryFn: () => fetchGdd(jaar),
    enabled: isGddBeschikbaar(),
  });

  const rijenById = useMemo(() => {
    const m = new Map<string, Rij>();
    rijenQ.data?.forEach((r) => m.set(r.id, r));
    return m;
  }, [rijenQ.data]);

  const metingen = useMemo(
    () => (metingenQ.data ?? []).filter((m) => jaarOf(m) === jaar),
    [metingenQ.data, jaar],
  );
  const observaties = useMemo(
    () => (obsQ.data ?? []).filter((o) => jaarOf(o) === jaar),
    [obsQ.data, jaar],
  );
  const fenologie = useMemo(
    () => (fenQ.data ?? []).filter((f) => jaarOf(f) === jaar),
    [fenQ.data, jaar],
  );
  const oogst = useMemo(
    () => (oogstQ.data ?? []).filter((o) => o.seizoen === jaar),
    [oogstQ.data, jaar],
  );
  const uren = useMemo(
    () => (urenQ.data ?? []).filter((w) => jaarOf(w) === jaar),
    [urenQ.data, jaar],
  );
  const gezondheid = useMemo(
    () => (gezQ.data ?? []).filter((g) => jaarOf(g) === jaar),
    [gezQ.data, jaar],
  );

  // Per-ras samenvatting
  const perRas = useMemo(() => {
    const rassen = new Map<
      Ras,
      {
        planten: number;
        metingen: number;
        gemBrix: number | null;
        oogstKg: number;
        verwachtKg: number;
        gemVigor: number | null;
      }
    >();
    rijenQ.data?.forEach((r) => {
      const cur = rassen.get(r.ras) ?? {
        planten: 0,
        metingen: 0,
        gemBrix: null,
        oogstKg: 0,
        verwachtKg: 0,
        gemVigor: null,
      };
      cur.planten += r.aantal_planten;
      cur.verwachtKg = Math.round(cur.planten * VERWACHTE_KG_PER_PLANT);
      rassen.set(r.ras, cur);
    });
    const brixAcc = new Map<Ras, { sum: number; n: number }>();
    metingen.forEach((m) => {
      const r = rijenById.get(m.rij);
      if (!r) return;
      const cur = rassen.get(r.ras);
      if (cur) cur.metingen += 1;
      if (m.brix != null) {
        const acc = brixAcc.get(r.ras) ?? { sum: 0, n: 0 };
        acc.sum += m.brix;
        acc.n += 1;
        brixAcc.set(r.ras, acc);
      }
    });
    brixAcc.forEach((acc, ras) => {
      const cur = rassen.get(ras);
      if (cur) cur.gemBrix = Math.round((acc.sum / acc.n) * 10) / 10;
    });
    oogst.forEach((o) => {
      const cur = rassen.get(o.ras);
      if (cur) cur.oogstKg = Math.round((cur.oogstKg + o.kg) * 10) / 10;
    });
    const vigorAcc = new Map<Ras, { sum: number; n: number }>();
    gezondheid.forEach((g) => {
      const r = rijenById.get(g.rij);
      if (!r) return;
      const acc = vigorAcc.get(r.ras) ?? { sum: 0, n: 0 };
      acc.sum += g.vigor;
      acc.n += 1;
      vigorAcc.set(r.ras, acc);
    });
    vigorAcc.forEach((acc, ras) => {
      const cur = rassen.get(ras);
      if (cur) cur.gemVigor = Math.round((acc.sum / acc.n) * 10) / 10;
    });
    return Array.from(rassen.entries()).map(([ras, v]) => ({ ras, ...v }));
  }, [rijenQ.data, metingen, oogst, gezondheid, rijenById]);

  // Fenologie: eerste datum per moment per ras
  const fenologieTabel = useMemo(() => {
    const map = new Map<Ras, Map<string, string>>();
    fenologie.forEach((f) => {
      const rasMap = map.get(f.ras) ?? new Map<string, string>();
      const cur = rasMap.get(f.moment);
      if (!cur || f.datum < cur) rasMap.set(f.moment, f.datum);
      map.set(f.ras, rasMap);
    });
    return map;
  }, [fenologie]);

  const urenPerTaak = useMemo(() => {
    const map = new Map<string, number>();
    uren.forEach((w) => map.set(w.taak, (map.get(w.taak) ?? 0) + w.uren));
    return Array.from(map.entries()).sort(([, a], [, b]) => b - a);
  }, [uren]);

  const totaalOogst = Math.round(oogst.reduce((acc, o) => acc + o.kg, 0) * 10) / 10;
  const totaalUren = Math.round(uren.reduce((acc, w) => acc + w.uren, 0) * 10) / 10;
  const gddTotaal = Math.round(huidigeGdd(gddQ.data ?? []));
  const oppervlakte = getPerceelOppervlakte();
  const wijngaard = getWijngaardConfig();
  const uurloon = getUurloon();

  const thStijl = "border border-[#cac176] bg-[#d4e6d3] px-2 py-1.5 text-left font-semibold";
  const tdStijl = "border border-[#cac176] px-2 py-1.5";

  return (
    <>
      <style>{`
        @media print {
          header, nav, .geen-print { display: none !important; }
          body { background: white !important; }
          .rapport { padding: 0 !important; }
          section { break-inside: avoid; }
        }
      `}</style>
      <AppHeader back title="Seizoensrapport" subtitle={`Seizoen ${jaar}`} />
      <div className="rapport mx-auto max-w-screen-md space-y-5 px-3 py-4 text-sm">
        <div className="geen-print flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Seizoensrapport</h1>
            <p className="text-sm text-muted-foreground">
              Druk af of kies "Opslaan als PDF" in het printvenster.
            </p>
          </div>
          <YearSelector />
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="geen-print flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: "#27232a", color: "#cac176" }}
        >
          <Printer className="h-4 w-4" /> Afdrukken / Opslaan als PDF
        </button>

        {/* Rapportkop */}
        <section className="rounded-2xl border-2 p-4" style={{ borderColor: "#cac176" }}>
          <div className="flex items-center gap-3">
            <img src="/logo-icon.png" alt="" className="h-14 w-14 object-contain" />
            <div>
              <h2 className="text-xl font-bold" style={{ color: "#27232a" }}>
                {wijngaard.naam} — Seizoensrapport {jaar}
              </h2>
              <p className="text-xs text-muted-foreground">
                {wijngaard.plaats} · {oppervlakte} ha · {rijenQ.data?.length ?? 0} rijen ·
                gegenereerd {format(new Date(), "d MMMM yyyy", { locale: nl })}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            {[
              { label: "Metingen", waarde: String(metingen.length) },
              { label: "Observaties", waarde: String(observaties.length) },
              { label: "Fenologie", waarde: String(fenologie.length) },
              { label: "Oogst", waarde: `${totaalOogst} kg` },
              { label: "Werkuren", waarde: `${totaalUren} u` },
              { label: "Warmtesom", waarde: gddTotaal > 0 ? `${gddTotaal} GDD` : "—" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg p-2" style={{ backgroundColor: "#d4e6d3" }}>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {s.label}
                </p>
                <p className="text-base font-bold tabular-nums">{s.waarde}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Per ras */}
        <section>
          <h3 className="mb-2 text-base font-bold">Samenvatting per ras</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className={thStijl}>Ras</th>
                  <th className={thStijl}>Planten</th>
                  <th className={thStijl}>Metingen</th>
                  <th className={thStijl}>Gem. Brix</th>
                  <th className={thStijl}>Gem. vigor</th>
                  <th className={thStijl}>Oogst (kg)</th>
                  <th className={thStijl}>Verwacht (kg)</th>
                </tr>
              </thead>
              <tbody>
                {perRas.map((r) => (
                  <tr key={r.ras}>
                    <td className={`${tdStijl} font-medium`}>{r.ras}</td>
                    <td className={tdStijl}>{r.planten}</td>
                    <td className={tdStijl}>{r.metingen}</td>
                    <td className={tdStijl}>{r.gemBrix ?? "—"}</td>
                    <td className={tdStijl}>{r.gemVigor ?? "—"}</td>
                    <td className={tdStijl}>{r.oogstKg || "—"}</td>
                    <td className={tdStijl}>{r.verwachtKg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Fenologie */}
        <section>
          <h3 className="mb-2 text-base font-bold">Fenologie {jaar}</h3>
          {fenologieTabel.size === 0 ? (
            <p className="text-muted-foreground">Geen fenologie geregistreerd.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className={thStijl}>Ras</th>
                    {FENOLOGIE_MOMENTEN.map((m) => (
                      <th key={m.value} className={thStijl}>
                        {m.emoji} {m.value}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from(fenologieTabel.entries()).map(([ras, momenten]) => (
                    <tr key={ras}>
                      <td className={`${tdStijl} font-medium`}>{ras}</td>
                      {FENOLOGIE_MOMENTEN.map((m) => {
                        const d = momenten.get(m.value);
                        return (
                          <td key={m.value} className={tdStijl}>
                            {d ? format(parseISO(d), "d MMM", { locale: nl }) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Werkuren */}
        <section>
          <h3 className="mb-2 text-base font-bold">Werkuren per taak</h3>
          {urenPerTaak.length === 0 ? (
            <p className="text-muted-foreground">Geen uren geregistreerd.</p>
          ) : (
            <table className="w-full max-w-sm border-collapse text-xs">
              <thead>
                <tr>
                  <th className={thStijl}>Taak</th>
                  <th className={thStijl}>Uren</th>
                  {uurloon > 0 && <th className={thStijl}>Kosten</th>}
                </tr>
              </thead>
              <tbody>
                {urenPerTaak.map(([taak, u]) => (
                  <tr key={taak}>
                    <td className={`${tdStijl} font-medium`}>{taak}</td>
                    <td className={tdStijl}>{Math.round(u * 10) / 10}</td>
                    {uurloon > 0 && <td className={tdStijl}>€{Math.round(u * uurloon)}</td>}
                  </tr>
                ))}
                <tr>
                  <td className={`${tdStijl} font-bold`}>Totaal</td>
                  <td className={`${tdStijl} font-bold`}>
                    {totaalUren} (
                    {oppervlakte > 0 ? Math.round((totaalUren / oppervlakte) * 10) / 10 : 0}/ha)
                  </td>
                  {uurloon > 0 && (
                    <td className={`${tdStijl} font-bold`}>€{Math.round(totaalUren * uurloon)}</td>
                  )}
                </tr>
              </tbody>
            </table>
          )}
        </section>

        <p className="pb-4 text-center text-[10px] text-muted-foreground">
          Wijngaard Buddy · {wijngaard.naam} ·{" "}
          {format(new Date(), "d MMMM yyyy HH:mm", { locale: nl })}
        </p>
      </div>
    </>
  );
}
