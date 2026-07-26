import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { ongekoppeldeOogst } from "@/lib/oogst-naar-partij";
import { fetchRijen, isIngelogd } from "@/lib/data";
import {
  createOogstRecord,
  fetchOogst,
  fetchWerkuren,
  VERWACHTE_KG_PER_PLANT,
} from "@/lib/extra-data";
import { fetchMiddelen } from "@/lib/middelen-data";
import { berekenWachttijden, omschrijfWachttijd } from "@/lib/wachttijd";
import { fetchPartijen } from "@/lib/partijen-data";
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
  // partijen zijn auth-only (Fase 8): zonder sessie niet bevragen — de
  // oogstinvoer zelf blijft offline-first gewoon werken
  const partijenQ = useQuery({
    queryKey: ["partijen"],
    queryFn: fetchPartijen,
    enabled: isIngelogd(),
  });

  const [rijId, setRijId] = useState("");
  const [kg, setKg] = useState("");
  const [datum, setDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [partijId, setPartijId] = useState("");
  const [notitie, setNotitie] = useState("");
  const [fouten, setFouten] = useState<Record<string, string>>({});
  const kgRef = useRef<HTMLInputElement>(null);
  const [toonWachttijdBevestiging, setToonWachttijdBevestiging] = useState(false);
  const [wachttijdBevestigd, setWachttijdBevestigd] = useState(false);

  const partijenJaar = useMemo(
    () => (partijenQ.data ?? []).filter((p) => p.jaargang === jaar),
    [partijenQ.data, jaar],
  );

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

  // Fase 13 Blok B — veiligheidstermijn per rij. Blokkeert niet (op een
  // plukdag moet je door kunnen), maar dwingt wél een bewuste keuze af en legt
  // die vast in het record: zonder dat is de afweging achteraf niet te
  // reconstrueren, en juist dát wil een controleur zien.
  const werkurenQ = useQuery({ queryKey: ["werkuren"], queryFn: fetchWerkuren });
  const middelenQ = useQuery({ queryKey: ["middelen"], queryFn: fetchMiddelen });
  const wachttijden = useMemo(
    () =>
      berekenWachttijden(
        werkurenQ.data ?? [],
        middelenQ.data ?? [],
        (rijenQ.data ?? []).map((r) => r.id),
        format(new Date(), "yyyy-MM-dd"),
      ),
    [werkurenQ.data, middelenQ.data, rijenQ.data],
  );
  const wachttijdVanGekozenRij = rijId ? (wachttijden.get(rijId) ?? null) : null;

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
        partij: partijId || null,
        wachttijd_bevestigd: wachttijdVanGekozenRij
          ? `Geoogst binnen de veiligheidstermijn, bevestigd door ${invoerder} op ${format(new Date(), "yyyy-MM-dd")}. ` +
            omschrijfWachttijd(wachttijdVanGekozenRij, gekozenRij.rijnummer)
          : "",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oogst-records"] });
      setKg("");
      setNotitie("");
      // Fase 11 Blok 4: op een oogstdag worden de rijen op volgorde geplukt en
      // werden er tot 69 achter elkaar ingevoerd — telkens door een keuzelijst
      // van 69 rijen scrollen. Na het opslaan springt de keuze daarom door naar
      // de volgende rij en gaat de cursor terug naar het gewichtsveld, zodat de
      // volgende invoer alleen nog "typen + opslaan" is. Wie niet op volgorde
      // plukt, kiest gewoon zelf een rij — er verandert niets aan wat er kan.
      const rijen = rijenQ.data ?? [];
      const idx = rijen.findIndex((r) => r.id === rijId);
      const volgende = idx >= 0 ? rijen[idx + 1] : undefined;
      setWachttijdBevestigd(false); // per rij opnieuw bevestigen
      if (volgende) {
        setRijId(volgende.id);
        toast.success(`Oogst geregistreerd ✓ — nu rij ${volgende.rijnummer}`);
      } else {
        toast.success("Oogst geregistreerd ✓ — dit was de laatste rij");
      }
      // Fase 13 Blok E — zonder partij is de keten van fles terug naar rij
      // verbroken. Bewust GEEN blokkade: op een plukdag is de partij vaak nog
      // niet aangemaakt, en de kilo's moeten door kunnen. Wel een zichtbare
      // herinnering, want anders blijft die koppeling stilletjes leeg — precies
      // wat er tot nu toe gebeurde. Het overzicht onderaan deze pagina laat de
      // openstaande regels staan tot ze wél gekoppeld zijn.
      if (!partijId) {
        toast.info("Nog niet aan een partij gekoppeld", {
          description: "Onderaan deze pagina koppel je ze later in één keer.",
        });
      }
      kgRef.current?.focus();
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
    // Veiligheidstermijn: één expliciete bevestiging per registratie. Bewust
    // géén blokkade — er kunnen goede redenen zijn (bijv. een bespuiting die
    // deze rij niet echt raakte) — maar wel een bewuste handeling die in het
    // record terechtkomt.
    if (wachttijdVanGekozenRij && !wachttijdBevestigd) {
      setToonWachttijdBevestiging(true);
      return;
    }
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
  const totaalVerwacht = useMemo(() => perRas.reduce((acc, x) => acc + x.verwacht, 0), [perRas]);
  const oppervlakteHa = getPerceelOppervlakte();
  const kgPerHa = oppervlakteHa > 0 ? Math.round(totaalGeoogst / oppervlakteHa) : 0;

  const recent = useMemo(() => seizoenOogst.slice(0, 10), [seizoenOogst]);

  // Fase 13 Blok E — oogst die nog aan geen partij hangt. Dit is de plek waar
  // de keten wijngaard → kelder zichtbaar wordt: zolang hier regels staan, is
  // van die kilo's niet te herleiden in welke fles ze terechtkwamen.
  const ongekoppeld = useMemo(
    () => ongekoppeldeOogst(oogstQ.data ?? [], jaar),
    [oogstQ.data, jaar],
  );
  const [selectie, setSelectie] = useState<Set<string>>(new Set());
  const zichtbareSelectie = useMemo(
    () => ongekoppeld.filter((o) => selectie.has(o.id)),
    [ongekoppeld, selectie],
  );
  const wisselSelectie = (id: string) =>
    setSelectie((s) => {
      const kopie = new Set(s);
      if (kopie.has(id)) kopie.delete(id);
      else kopie.add(id);
      return kopie;
    });
  const selecteerAlles = () =>
    setSelectie((s) =>
      s.size === ongekoppeld.length ? new Set() : new Set(ongekoppeld.map((o) => o.id)),
    );
  const geselecteerdeKg =
    Math.round(zichtbareSelectie.reduce((som, o) => som + (o.kg || 0), 0) * 10) / 10;

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
          className="rounded-xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
          style={{ backgroundColor: "var(--nav)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--accent-gold)" }}
              >
                Totaal geoogst {jaar}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-white">
                {totaalGeoogst} <span className="text-base font-normal">kg</span>
              </p>
              {totaalVerwacht > 0 && (
                <p className="text-xs text-white/70">
                  van ± {totaalVerwacht} kg verwacht (
                  {Math.round((totaalGeoogst / totaalVerwacht) * 100)}%)
                  {" · "}
                  {kgPerHa} kg/ha ({oppervlakteHa} ha)
                </p>
              )}
            </div>
            <Grape className="h-12 w-12" style={{ color: "var(--accent-gold)" }} />
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
                  // bevestiging geldt per rij: hem laten meelopen naar de
                  // volgende rij zou de waarborg waardeloos maken
                  setWachttijdBevestigd(false);
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
              <span className="mb-1.5 block text-sm font-medium">Gewicht (kg)</span>
              <input
                ref={kgRef}
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
              {fouten.kg && (
                <span className="mt-1 block text-sm text-destructive">{fouten.kg}</span>
              )}
            </label>
          </div>
          {gekozenRij && (
            <p className="text-xs text-muted-foreground">
              Ras: <strong>{gekozenRij.ras}</strong> · {gekozenRij.aantal_planten} planten
            </p>
          )}

          {/* Fase 13 Blok B — veiligheidstermijn. Prominent, want dit is het
              enige scherm waar een verkeerde keuze de wijn onverkoopbaar maakt. */}
          {wachttijdVanGekozenRij && (
            <div
              role="alert"
              className="rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2.5"
            >
              <p className="text-sm font-semibold text-destructive">
                ⚠️ Deze rij staat nog in de veiligheidstermijn
              </p>
              <p className="mt-1 text-xs text-destructive/90">
                {omschrijfWachttijd(wachttijdVanGekozenRij, gekozenRij?.rijnummer)}
              </p>
              {wachttijdVanGekozenRij.alleBronnen.length > 1 && (
                <p className="mt-1 text-[11px] text-destructive/80">
                  Er zijn {wachttijdVanGekozenRij.alleBronnen.length} bespuitingen die deze rij
                  raken; de langst lopende bepaalt de datum.
                </p>
              )}
              {wachttijdBevestigd && (
                <p className="mt-1.5 text-[11px] font-medium text-destructive">
                  Bevestigd — dit wordt bij de oogstregistratie vastgelegd.
                </p>
              )}
            </div>
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
            <span className="mb-1.5 block text-sm font-medium">Partij (optioneel)</span>
            <select
              value={partijId}
              onChange={(e) => setPartijId(e.target.value)}
              className={veldClass}
            >
              <option value="">Geen partij</option>
              {partijenJaar.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.naam} · {p.jaargang}
                </option>
              ))}
            </select>
            {partijenJaar.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Nog geen partijen voor {jaar} — aan te maken op de partijenpagina in de kelder.
              </p>
            )}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Notitie</span>
            <input
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              className={veldClass}
              placeholder="Optioneel…"
            />
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

          {/* Fase 13 Blok B — bevestiging bij oogst binnen de veiligheidstermijn.
              Geen blokkade, wel een bewuste handeling die wordt vastgelegd. */}
          {toonWachttijdBevestiging && wachttijdVanGekozenRij && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-sm rounded-2xl border border-destructive bg-card p-5 shadow-xl">
                <h3 className="text-base font-bold text-destructive">
                  Oogsten binnen de veiligheidstermijn?
                </h3>
                <p className="mt-2 text-sm text-foreground">
                  {omschrijfWachttijd(wachttijdVanGekozenRij, gekozenRij?.rijnummer)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Druiven die binnen de termijn geplukt zijn, kunnen de wijn onverkoopbaar maken. Ga
                  je door, dan wordt deze bevestiging bij de oogstregistratie vastgelegd — met
                  middel, datum en termijn.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setWachttijdBevestigd(true);
                      setToonWachttijdBevestiging(false);
                      m.mutate();
                    }}
                    className="h-12 w-full rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground"
                  >
                    Ja, toch registreren
                  </button>
                  <button
                    type="button"
                    onClick={() => setToonWachttijdBevestiging(false)}
                    className="h-12 w-full rounded-xl border border-input bg-card text-sm font-medium"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            </div>
          )}
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
                        style={{ width: `${pct}%`, backgroundColor: "#4a8c5c" }}
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e2" />
                  <XAxis type="number" fontSize={11} unit=" kg" />
                  <YAxis type="category" dataKey="ras" fontSize={11} width={95} />
                  <Tooltip formatter={(v: number) => [`${v} kg`]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="geoogst" name="Geoogst" fill="#4a8c5c" radius={[0, 6, 6, 0]} />
                  <Bar dataKey="verwacht" name="Verwacht" fill="#6b7a6b" radius={[0, 6, 6, 0]} />
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
                  <li
                    key={o.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
                  >
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

        {/* Fase 13 Blok E — nog niet aan een partij gekoppeld */}
        {ongekoppeld.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Nog niet in de kelder
              </h2>
              <button
                type="button"
                onClick={selecteerAlles}
                className="text-xs font-semibold text-primary underline"
              >
                {selectie.size === ongekoppeld.length ? "Selectie wissen" : "Alles selecteren"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {ongekoppeld.length === 1
                ? "1 oogstregel hangt"
                : `${ongekoppeld.length} oogstregels hangen`}{" "}
              nog aan geen enkele partij. Zolang dat zo is, kun je van deze kilo&apos;s niet
              terugvinden in welke fles ze terechtkwamen.
            </p>

            <ul className="space-y-1.5">
              {ongekoppeld.map((o) => {
                const r = o.rij ? rijenById.get(o.rij) : undefined;
                const aan = selectie.has(o.id);
                return (
                  <li key={o.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                        aan ? "border-primary bg-primary/5" : "border-border bg-card"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={aan}
                        onChange={() => wisselSelectie(o.id)}
                        className="h-5 w-5 shrink-0 accent-[var(--primary)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {o.kg} kg · {o.ras}
                          {r ? ` · rij ${r.rijnummer}` : ""}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {format(parseISO(o.datum), "d MMMM", { locale: nl })}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {zichtbareSelectie.length > 0 && (
              <Link
                to="/kelder/partijen/nieuw"
                search={{ oogst: zichtbareSelectie.map((o) => o.id).join(",") }}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                <Grape className="h-4 w-4" />
                Nieuwe partij van {geselecteerdeKg} kg
              </Link>
            )}
          </section>
        )}
      </div>
    </>
  );
}
