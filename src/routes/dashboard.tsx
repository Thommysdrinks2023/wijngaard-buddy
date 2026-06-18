import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { differenceInDays, format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { fetchFenologie, fetchMetingen, fetchObservaties, fetchRijen } from "@/lib/data";
import { FENOLOGIE_MOMENTEN, OBSERVATIE_TYPES, type Rij } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { YearSelector } from "@/components/year-selector";
import { EmptyState, SEIZOEN_LEEG_MSG } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useSeizoen } from "@/lib/seizoen";
import { getMetingDrempel } from "@/lib/app-instellingen";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  FileText,
  FlaskConical,
  Grape,
  HeartPulse,
  Map as MapIcon,
  ScanLine,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { WeerKaart } from "@/components/weer-kaart";
import { fetchGezondheid, fetchOogst } from "@/lib/extra-data";
import { formatGetal } from "@/lib/utils";
import { fetchSteekproefMetingen, fetchSteekproefPlanten } from "@/lib/steekproef";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard — Wijngaard" },
      { name: "description", content: "Overzicht: brix per ras, uitval, recente activiteiten." },
    ],
  }),
});

function jaarOf(item: { seizoen?: number; datum: string }): number {
  return item.seizoen ?? parseISO(item.datum).getFullYear();
}

function Dashboard() {
  const [jaar] = useSeizoen();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const metingenQ = useQuery({ queryKey: ["metingen"], queryFn: () => fetchMetingen() });
  const obsQ = useQuery({ queryKey: ["observaties"], queryFn: () => fetchObservaties() });
  const fenQ = useQuery({ queryKey: ["fenologie"], queryFn: () => fetchFenologie() });
  const gezQ = useQuery({ queryKey: ["gezondheid"], queryFn: fetchGezondheid });
  const oogstDashQ = useQuery({ queryKey: ["oogst-records"], queryFn: fetchOogst });
  const stkPlantenQ = useQuery({
    queryKey: ["steekproef_planten"],
    queryFn: () => fetchSteekproefPlanten(),
  });
  const stkMetingenQ = useQuery({
    queryKey: ["steekproef_metingen"],
    queryFn: () => fetchSteekproefMetingen(),
  });

  const [drempel, setDrempel] = useState<number>(() => getMetingDrempel());
  const [showStale, setShowStale] = useState(false);
  useEffect(() => {
    const upd = () => setDrempel(getMetingDrempel());
    window.addEventListener("wg.drempel.changed", upd);
    return () => window.removeEventListener("wg.drempel.changed", upd);
  }, []);

  const staleRijen = useMemo(() => {
    if (!rijenQ.data) return [];
    const laatste = new Map<string, string>();
    const consider = (rij: string, datum: string) => {
      const cur = laatste.get(rij);
      if (!cur || cur < datum) laatste.set(rij, datum);
    };
    metingenQ.data?.forEach((m) => consider(m.rij, m.datum));
    obsQ.data?.forEach((o) => consider(o.rij, o.datum));
    const now = new Date();
    return rijenQ.data
      .map((r) => {
        const d = laatste.get(r.id);
        const days = d ? differenceInDays(now, parseISO(d)) : null;
        return { rij: r, days, laatste: d };
      })
      .filter(
        (x): x is { rij: Rij; days: number; laatste: string } =>
          x.days !== null && x.days > drempel,
      )
      .sort((a, b) => b.days - a.days);
  }, [rijenQ.data, metingenQ.data, obsQ.data, drempel]);

  const rijenById = useMemo(() => {
    const m = new Map<string, Rij>();
    rijenQ.data?.forEach((r) => m.set(r.id, r));
    return m;
  }, [rijenQ.data]);

  const metingenSeizoen = useMemo(
    () => metingenQ.data?.filter((m) => jaarOf(m) === jaar) ?? [],
    [metingenQ.data, jaar],
  );
  const obsSeizoen = useMemo(
    () => obsQ.data?.filter((o) => jaarOf(o) === jaar) ?? [],
    [obsQ.data, jaar],
  );
  const fenSeizoen = useMemo(
    () => fenQ.data?.filter((f) => jaarOf(f) === jaar) ?? [],
    [fenQ.data, jaar],
  );

  // Avg Brix per ras (deze week, binnen seizoen)
  const brixPerRas = useMemo(() => {
    const acc = new Map<string, { sum: number; n: number }>();
    const now = new Date();
    metingenSeizoen.forEach((m) => {
      if (m.brix == null) return;
      const days = differenceInDays(now, parseISO(m.datum));
      if (days > 7 || days < 0) return;
      const r = rijenById.get(m.rij);
      if (!r) return;
      const cur = acc.get(r.ras) ?? { sum: 0, n: 0 };
      cur.sum += m.brix;
      cur.n += 1;
      acc.set(r.ras, cur);
    });
    return Array.from(acc.entries())
      .map(([ras, v]) => ({ ras, avg: v.sum / v.n, n: v.n }))
      .sort((a, b) => b.avg - a.avg);
  }, [metingenSeizoen, rijenById]);

  // Gezondheid: gemiddelde vigor per ras (laatste registratie per rij, dit seizoen)
  const gezondheidPerRas = useMemo(() => {
    const laatstePerRij = new Map<string, { vigor: number; datum: string }>();
    (gezQ.data ?? []).forEach((g) => {
      if (jaarOf(g) !== jaar) return;
      const cur = laatstePerRij.get(g.rij);
      if (!cur || cur.datum < g.datum) laatstePerRij.set(g.rij, { vigor: g.vigor, datum: g.datum });
    });
    const acc = new Map<string, { sum: number; n: number }>();
    laatstePerRij.forEach((v, rijId) => {
      const r = rijenById.get(rijId);
      if (!r) return;
      const cur = acc.get(r.ras) ?? { sum: 0, n: 0 };
      cur.sum += v.vigor;
      cur.n += 1;
      acc.set(r.ras, cur);
    });
    return Array.from(acc.entries())
      .map(([ras, v]) => ({ ras, avg: v.sum / v.n, n: v.n }))
      .sort((a, b) => a.avg - b.avg);
  }, [gezQ.data, jaar, rijenById]);

  // Waarschuwingen: dalende vigor + hoge ziektedruk (compacte dashboard-variant)
  const gezondheidsWaarschuwingen = useMemo(() => {
    const lijst: string[] = [];
    const nu = Date.now();
    const DAG = 24 * 60 * 60 * 1000;
    const perRas = new Map<string, { recent: number[]; ervoor: number[] }>();
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
      if (gem(groep.recent) < gem(groep.ervoor) - 0.4) lijst.push(`${ras}: gezondheid daalt`);
    });
    const plantRas = new Map<string, string>();
    stkPlantenQ.data?.forEach((p) => plantRas.set(p.id, p.ras));
    const nieuwste = new Map<string, { druk: string; datum: string }>();
    stkMetingenQ.data?.forEach((m) => {
      if (m.seizoen !== jaar || !m.ziektedruk) return;
      const ras = plantRas.get(m.plantId);
      if (!ras) return;
      const cur = nieuwste.get(ras);
      if (!cur || cur.datum < m.datum) nieuwste.set(ras, { druk: m.ziektedruk, datum: m.datum });
    });
    nieuwste.forEach((v, ras) => {
      if (v.druk === "Matig" || v.druk === "Zwaar")
        lijst.push(`${ras}: ${v.druk.toLowerCase()}e ziektedruk`);
    });
    // rassen die al te lang geen meting hebben (gaten in de data)
    const laatstePerRas = new Map<string, string>();
    (metingenQ.data ?? []).forEach((m) => {
      const r = rijenById.get(m.rij);
      if (!r) return;
      const cur = laatstePerRas.get(r.ras);
      if (!cur || cur < m.datum) laatstePerRas.set(r.ras, m.datum);
    });
    laatstePerRas.forEach((laatste, ras) => {
      const dagen = Math.floor((nu - new Date(laatste).getTime()) / DAG);
      if (dagen > drempel) lijst.push(`${ras}: ${dagen} dagen geen meting`);
    });
    return lijst;
  }, [gezQ.data, stkPlantenQ.data, stkMetingenQ.data, metingenQ.data, rijenById, jaar, drempel]);

  // Seizoensvergelijking: dit jaar vs vorig jaar
  const vergelijking = useMemo(() => {
    const telVoor = (j: number) => {
      const m = (metingenQ.data ?? []).filter((x) => jaarOf(x) === j);
      const brix = m.filter((x) => x.brix != null);
      const gemBrix =
        brix.length > 0
          ? Math.round((brix.reduce((acc, x) => acc + (x.brix ?? 0), 0) / brix.length) * 10) / 10
          : null;
      const oogstKg =
        Math.round(
          (oogstDashQ.data ?? []).filter((o) => o.seizoen === j).reduce((acc, o) => acc + o.kg, 0) *
            10,
        ) / 10;
      return { metingen: m.length, gemBrix, oogstKg };
    };
    return { dit: telVoor(jaar), vorig: telVoor(jaar - 1) };
  }, [metingenQ.data, oogstDashQ.data, jaar]);

  // Rijen with uitval observations dit seizoen
  const uitvalRijen = useMemo(() => {
    const ids = new Set<string>();
    obsSeizoen.forEach((o) => {
      if (o.type !== "uitval") return;
      ids.add(o.rij);
    });
    return Array.from(ids)
      .map((id) => rijenById.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .sort((a, b) => a.rijnummer - b.rijnummer);
  }, [obsSeizoen, rijenById]);

  // Fenologie momenten geregistreerd dit seizoen
  const fenMomenten = useMemo(() => {
    const set = new Set<string>();
    fenSeizoen.forEach((f) => set.add(f.moment));
    return FENOLOGIE_MOMENTEN.filter((m) => set.has(m.value));
  }, [fenSeizoen]);

  // Last 10 activities (binnen seizoen)
  const recent = useMemo(() => {
    const items: Array<{
      id: string;
      datum: string;
      kind: "meting" | "observatie";
      label: string;
      rijId: string;
      rijLabel: string;
    }> = [];
    metingenSeizoen.forEach((m) => {
      const r = rijenById.get(m.rij);
      items.push({
        id: `m-${m.id}`,
        datum: m.datum,
        kind: "meting",
        label:
          m.brix != null
            ? `Brix ${m.brix} · ${m.rijpheid_score}/5`
            : `Rijpheid ${m.rijpheid_score}/5`,
        rijId: m.rij,
        rijLabel: r ? `Rij ${r.rijnummer} · ${r.ras}` : "Rij",
      });
    });
    obsSeizoen.forEach((o) => {
      const r = rijenById.get(o.rij);
      const t = OBSERVATIE_TYPES.find((x) => x.value === o.type);
      items.push({
        id: `o-${o.id}`,
        datum: o.datum,
        kind: "observatie",
        label: `${t?.emoji ?? ""} ${t?.label ?? o.type}`,
        rijId: o.rij,
        rijLabel: r ? `Rij ${r.rijnummer} · ${r.ras}` : "Rij",
      });
    });
    return items.sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, 10);
  }, [metingenSeizoen, obsSeizoen, rijenById]);

  return (
    <>
      <AppHeader title="Dashboard" />
      <div className="mx-auto max-w-screen-md space-y-6 px-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Overzicht van het seizoen</p>
          </div>
          <YearSelector />
        </div>

        <WeerKaart />

        {/* Snelkoppelingen naar registratiepagina's */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { to: "/gezondheid", label: "Gezondheid", icon: HeartPulse },
            { to: "/oogst", label: "Oogst", icon: Grape },
            { to: "/werkrapport", label: "Werk", icon: Clock },
            { to: "/trends", label: "Trends", icon: TrendingUp },
            { to: "/assistent", label: "Assistent", icon: Sparkles },
            { to: "/scan", label: "Scan QR", icon: ScanLine },
            { to: "/kaart", label: "GPS-kaart", icon: MapIcon },
            { to: "/lab", label: "Lab", icon: FlaskConical },
            { to: "/rapport", label: "Rapport", icon: FileText },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.to}
                to={s.to}
                className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition hover:bg-primary-soft active:scale-[0.97]"
              >
                <Icon className="h-5 w-5 text-primary" />
                {s.label}
              </Link>
            );
          })}
        </div>

        {/* Gezondheidswaarschuwingen */}
        {gezondheidsWaarschuwingen.length > 0 && (
          <Link
            to="/gezondheid"
            className="block rounded-2xl border border-destructive/40 bg-destructive/10 p-4"
          >
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Aandachtspunten gezondheid
            </p>
            <ul className="space-y-0.5">
              {gezondheidsWaarschuwingen.map((w) => (
                <li key={w} className="text-sm text-destructive">
                  • {w}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">Tik voor details →</p>
          </Link>
        )}

        {/* Seizoensvergelijking */}
        {(vergelijking.vorig.metingen > 0 || vergelijking.vorig.oogstKg > 0) && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {jaar} vs. {jaar - 1}
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                {
                  label: "Metingen",
                  dit: String(vergelijking.dit.metingen),
                  vorig: String(vergelijking.vorig.metingen),
                },
                {
                  label: "Gem. Brix",
                  dit: vergelijking.dit.gemBrix != null ? String(vergelijking.dit.gemBrix) : "—",
                  vorig:
                    vergelijking.vorig.gemBrix != null ? String(vergelijking.vorig.gemBrix) : "—",
                },
                {
                  label: "Oogst (kg)",
                  dit: String(vergelijking.dit.oogstKg || "—"),
                  vorig: String(vergelijking.vorig.oogstKg || "—"),
                },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-muted/40 px-2 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="text-lg font-bold tabular-nums">{s.dit}</p>
                  <p className="text-xs text-muted-foreground">vorig jaar: {s.vorig}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Gezondheid per ras */}
        {gezondheidPerRas.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Gezondheid per ras
              </h2>
              <Link to="/gezondheid" className="text-xs text-muted-foreground underline">
                Alles bekijken
              </Link>
            </div>
            <div className="space-y-2">
              {gezondheidPerRas.map((g) => {
                const pct = (g.avg / 5) * 100;
                const kleur = g.avg >= 4 ? "#4a8c5c" : g.avg >= 3 ? "#e6a817" : "#d64444";
                return (
                  <div key={g.ras}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="font-medium">{g.ras}</span>
                      <span className="tabular-nums text-muted-foreground">
                        vigor {formatGetal(g.avg)}/5 · {g.n} {g.n === 1 ? "rij" : "rijen"}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: kleur }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {staleRijen.length > 0 && (
          <section className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
            <button
              type="button"
              onClick={() => setShowStale((v) => !v)}
              className="flex w-full items-start gap-3 text-left"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  ⚠️ {staleRijen.length} {staleRijen.length === 1 ? "rij is" : "rijen zijn"} meer
                  dan {drempel} dagen niet gemeten
                </p>
                <p className="text-xs text-muted-foreground">
                  {showStale ? "Verberg lijst" : "Bekijk welke"}
                </p>
              </div>
              <ChevronDown className={`h-5 w-5 transition ${showStale ? "rotate-180" : ""}`} />
            </button>
            {showStale && (
              <ul className="mt-3 space-y-2">
                {staleRijen.map(({ rij, days, laatste }) => (
                  <li key={rij.id} className="flex items-center gap-2 rounded-lg bg-card p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        Rij {rij.rijnummer} ·{" "}
                        <span className="text-muted-foreground">{rij.ras}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Number.isFinite(days)
                          ? `${days} dagen geleden${laatste ? ` (${format(parseISO(laatste), "d MMM", { locale: nl })})` : ""}`
                          : "Nog nooit gemeten"}
                      </p>
                    </div>
                    <Link
                      to="/rij/$rijId/meting"
                      params={{ rijId: rij.id }}
                      className="h-9 shrink-0 rounded-lg bg-primary px-3 text-sm font-medium leading-9 text-primary-foreground"
                    >
                      Meten
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {(rijenQ.isError || metingenQ.isError || obsQ.isError || fenQ.isError) && (
          <ErrorState
            error={rijenQ.error || metingenQ.error || obsQ.error || fenQ.error}
            onRetry={() => {
              rijenQ.refetch();
              metingenQ.refetch();
              obsQ.refetch();
              fenQ.refetch();
            }}
            invoerHref="/perceelkaart"
            invoerLabel="Naar perceelkaart"
          />
        )}

        {/* Seizoen samenvatting */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Seizoen samenvatting
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Seizoen" value={String(jaar)} />
            <Stat label="Metingen" value={String(metingenSeizoen.length)} />
            <Stat label="Observaties" value={String(obsSeizoen.length)} />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Fenologie dit seizoen
            </p>
            {fenMomenten.length === 0 ? (
              <p className="text-sm text-muted-foreground">{SEIZOEN_LEEG_MSG}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {fenMomenten.map((m) => (
                  <span
                    key={m.value}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium"
                  >
                    <span>{m.emoji}</span>
                    {m.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Gemiddelde Brix per ras (deze week)
          </h2>
          {brixPerRas.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {brixPerRas.map((b) => {
                const pct = Math.min(100, (b.avg / 25) * 100);
                return (
                  <div key={b.ras} className="rounded-xl border border-border bg-card p-3">
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="font-medium">{b.ras}</span>
                      <span className="text-lg font-bold tabular-nums text-primary">
                        {formatGetal(b.avg)}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          °Bx · {b.n}×
                        </span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Rijen met uitval dit seizoen
          </h2>
          {uitvalRijen.length === 0 ? (
            <EmptyState message="Geen uitval-observaties dit seizoen." />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {uitvalRijen.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/rij/$rijId"
                    params={{ rijId: r.id }}
                    className="flex h-12 items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 text-sm font-medium text-destructive"
                  >
                    💀 Rij {r.rijnummer}
                    <span className="text-xs opacity-80">{r.ras}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Laatste 10 activiteiten
          </h2>
          {recent.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-2">
              {recent.map((it) => (
                <li key={it.id}>
                  <Link
                    to="/rij/$rijId"
                    params={{ rijId: it.rijId }}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
                        it.kind === "meting"
                          ? "bg-primary-soft text-primary"
                          : "bg-accent/30 text-accent-foreground"
                      }`}
                    >
                      {it.kind === "meting" ? "M" : "O"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{it.rijLabel}</p>
                      <p className="truncate text-xs text-muted-foreground">{it.label}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(it.datum), "d MMM", { locale: nl })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
