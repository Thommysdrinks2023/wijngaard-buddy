import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { fetchFenologie, fetchMetingen, fetchObservaties, fetchRijen } from "@/lib/data";
import { fetchGezondheid, fetchOogst, fetchWerkuren } from "@/lib/extra-data";
import { OBSERVATIE_TYPES, type Rij } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { Search } from "lucide-react";

export const Route = createFileRoute("/zoeken")({
  component: ZoekenPage,
  head: () => ({ meta: [{ title: "Zoeken — Wijngaard" }] }),
});

interface ZoekResultaat {
  id: string;
  soort: string;
  emoji: string;
  datum: string;
  titel: string;
  detail: string;
  rijId?: string;
  // alles waarop gezocht kan worden, in kleine letters
  zoektekst: string;
}

const MAANDEN = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

function ZoekenPage() {
  const [term, setTerm] = useState("");
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const metingenQ = useQuery({ queryKey: ["metingen"], queryFn: () => fetchMetingen() });
  const obsQ = useQuery({ queryKey: ["observaties"], queryFn: () => fetchObservaties() });
  const fenQ = useQuery({ queryKey: ["fenologie"], queryFn: () => fetchFenologie() });
  const oogstQ = useQuery({ queryKey: ["oogst-records"], queryFn: fetchOogst });
  const gezQ = useQuery({ queryKey: ["gezondheid"], queryFn: fetchGezondheid });
  const urenQ = useQuery({ queryKey: ["werkuren"], queryFn: fetchWerkuren });

  const rijenById = useMemo(() => {
    const m = new Map<string, Rij>();
    rijenQ.data?.forEach((r) => m.set(r.id, r));
    return m;
  }, [rijenQ.data]);

  // Alle records omzetten naar doorzoekbare regels
  const alles = useMemo<ZoekResultaat[]>(() => {
    const uit: ZoekResultaat[] = [];
    const rijTekst = (rijId?: string | null) => {
      const r = rijId ? rijenById.get(rijId) : undefined;
      return r ? `rij ${r.rijnummer} ${r.ras}` : "";
    };
    const datumTekst = (datum: string) => {
      try {
        const d = parseISO(datum);
        return `${datum} ${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
      } catch {
        return datum;
      }
    };

    metingenQ.data?.forEach((m) => {
      const r = rijenById.get(m.rij);
      uit.push({
        id: `m-${m.id}`,
        soort: "Meting",
        emoji: "🧪",
        datum: m.datum,
        titel: r ? `Meting · rij ${r.rijnummer} · ${r.ras}` : "Meting",
        detail: [
          m.brix != null ? `Brix ${m.brix}` : null,
          m.ph != null ? `pH ${m.ph}` : null,
          `rijpheid ${m.rijpheid_score}/5`,
          m.notitie || null,
        ]
          .filter(Boolean)
          .join(" · "),
        rijId: m.rij,
        zoektekst:
          `meting brix ph ${rijTekst(m.rij)} ${datumTekst(m.datum)} ${m.notitie ?? ""}`.toLowerCase(),
      });
    });
    obsQ.data?.forEach((o) => {
      const r = rijenById.get(o.rij);
      const t = OBSERVATIE_TYPES.find((x) => x.value === o.type);
      uit.push({
        id: `o-${o.id}`,
        soort: "Observatie",
        emoji: t?.emoji ?? "👁",
        datum: o.datum,
        titel: r ? `${t?.label ?? o.type} · rij ${r.rijnummer} · ${r.ras}` : (t?.label ?? o.type),
        detail: o.notitie,
        rijId: o.rij,
        zoektekst:
          `observatie ${o.type} ${t?.label ?? ""} ${rijTekst(o.rij)} ${datumTekst(o.datum)} ${o.notitie}`.toLowerCase(),
      });
    });
    fenQ.data?.forEach((f) => {
      uit.push({
        id: `f-${f.id}`,
        soort: "Fenologie",
        emoji: "🌱",
        datum: f.datum,
        titel: `${f.moment} · ${f.ras}`,
        detail: f.notitie ?? "",
        rijId: f.rij,
        zoektekst:
          `fenologie ${f.moment} ${f.ras} ${rijTekst(f.rij)} ${datumTekst(f.datum)} ${f.notitie ?? ""}`.toLowerCase(),
      });
    });
    oogstQ.data?.forEach((o) => {
      uit.push({
        id: `g-${o.id}`,
        soort: "Oogst",
        emoji: "🍇",
        datum: o.datum,
        titel: `Oogst ${o.kg} kg · ${o.ras}`,
        detail: o.notitie ?? "",
        rijId: o.rij ?? undefined,
        zoektekst:
          `oogst ${o.ras} ${o.kg} ${rijTekst(o.rij)} ${datumTekst(o.datum)} ${o.notitie ?? ""}`.toLowerCase(),
      });
    });
    gezQ.data?.forEach((g) => {
      const r = rijenById.get(g.rij);
      uit.push({
        id: `z-${g.id}`,
        soort: "Gezondheid",
        emoji: "🫀",
        datum: g.datum,
        titel: r ? `Gezondheid · rij ${r.rijnummer} · ${r.ras}` : "Gezondheid",
        detail: `vigor ${g.vigor}/5${g.notitie ? ` · ${g.notitie}` : ""}`,
        rijId: g.rij,
        zoektekst:
          `gezondheid vigor ${rijTekst(g.rij)} ${datumTekst(g.datum)} ${g.notitie ?? ""}`.toLowerCase(),
      });
    });
    urenQ.data?.forEach((w) => {
      uit.push({
        id: `w-${w.id}`,
        soort: "Werk",
        emoji: "⏱",
        datum: w.datum,
        titel: `${w.taak} · ${w.uren} uur`,
        detail: [w.middel || null, w.notitie || null].filter(Boolean).join(" · "),
        rijId: w.rij ?? undefined,
        zoektekst:
          `werk ${w.taak} ${w.middel ?? ""} ${w.ras ?? ""} ${rijTekst(w.rij)} ${datumTekst(w.datum)} ${w.notitie ?? ""}`.toLowerCase(),
      });
    });
    return uit.sort((a, b) => (a.datum < b.datum ? 1 : -1));
  }, [metingenQ.data, obsQ.data, fenQ.data, oogstQ.data, gezQ.data, urenQ.data, rijenById]);

  const resultaten = useMemo(() => {
    const woorden = term.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (woorden.length === 0) return [];
    return alles.filter((r) => woorden.every((w) => r.zoektekst.includes(w))).slice(0, 50);
  }, [alles, term]);

  const aanHetLaden = metingenQ.isLoading || obsQ.isLoading || fenQ.isLoading || rijenQ.isLoading;

  return (
    <>
      <AppHeader back title="Zoeken" subtitle="Door alle registraties" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder='Bijv. "rij 12", "ziekte juni", "Chardonnay brix"…'
            autoFocus
            className="h-14 w-full rounded-2xl border-2 border-border bg-card pl-11 pr-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </label>

        {term.trim() === "" ? (
          <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Zoektips</p>
            <p>
              • <strong>rij 12</strong> — alles van één rij (nieuwste eerst)
            </p>
            <p>
              • <strong>ziekte juni</strong> — ziekte-observaties uit juni
            </p>
            <p>
              • <strong>Chardonnay oogst</strong> — oogsten van één ras
            </p>
            <p>
              • <strong>zwavel</strong> — spuitregistraties met dat middel
            </p>
          </div>
        ) : aanHetLaden ? (
          <p className="text-sm text-muted-foreground">Gegevens laden…</p>
        ) : resultaten.length === 0 ? (
          <EmptyState message={`Niets gevonden voor "${term}".`} />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {resultaten.length === 50
                ? "Eerste 50 resultaten"
                : `${resultaten.length} resultaten`}{" "}
              — nieuwste eerst
            </p>
            <ul className="space-y-2">
              {resultaten.map((r) => {
                const inhoud = (
                  <>
                    <span className="text-xl">{r.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.titel}</span>
                      {r.detail && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.detail}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format(parseISO(r.datum), "d MMM yyyy", { locale: nl })}
                    </span>
                  </>
                );
                return (
                  <li key={r.id}>
                    {r.rijId ? (
                      <Link
                        to="/rij/$rijId"
                        params={{ rijId: r.rijId }}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 active:scale-[0.99]"
                      >
                        {inhoud}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                        {inhoud}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
