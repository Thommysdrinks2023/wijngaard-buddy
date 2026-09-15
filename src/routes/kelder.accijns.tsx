import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  berekenAccijnsBijBotteling,
  berekenAccijnsOverzicht,
  kwartaalPeriode,
  leesBelastbaarMoment,
  maandPeriode,
  tariefGeverifieerd,
  type Tarief,
} from "@/lib/accijns";
import { fetchAccijnsCategorieen } from "@/lib/flessen-data";
import {
  fetchRegelgevingInstellingen,
  REGELGEVING_SLEUTELS,
  updateRegelgevingInstelling,
  type RegelgevingInstelling,
} from "@/lib/regelgeving-data";
import {
  fetchAnalyses,
  fetchBottelrondes,
  fetchTankboek,
  fetchVoorraadFlessen,
} from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { exporteerCsv } from "@/lib/csv-export";
import { getPb } from "@/lib/data";
import { useSeizoen } from "@/lib/seizoen";
import { YearSelector } from "@/components/year-selector";
import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/error-state";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";
import { AlertTriangle, FolderArchive, Printer, Sheet, ShieldAlert } from "lucide-react";
import { maakControlePakket } from "@/lib/controle-pakket";
import type { RecordModel } from "pocketbase";

// Eindsprint Blok K — accijnsoverzicht per aangifteperiode. ALLES hier is een
// INDICATIE: de app rekent alleen met door Thomas geverifieerde tarieven en
// verwijst voor de aangifte zelf altijd naar de Douane.
export const Route = createFileRoute("/kelder/accijns")({
  component: AccijnsPage,
  head: () => ({ meta: [{ title: "Accijns — Kelder" }] }),
});

const veldClass = "h-10 w-full rounded-xl border border-input bg-card px-2.5 text-sm";
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

async function fetchAlleMutaties() {
  const pb = getPb();
  if (!pb) return [];
  const records = await pb.collection("voorraad_mutaties").getFullList({ sort: "datum" });
  return records.map((r: RecordModel) => ({
    id: r.id,
    voorraad: r["voorraad"] as string,
    mutatie_type: r["mutatie_type"] as import("@/lib/types").VoorraadMutatieType,
    aantal: r["aantal"] as number,
    datum: r["datum"] as string,
    afnemer_of_reden: (r["afnemer_of_reden"] ?? "") as string,
    notities: (r["notities"] ?? "") as string,
    created: r["created"] as string,
  }));
}

function AccijnsPage() {
  const qc = useQueryClient();
  const [jaar] = useSeizoen();
  const [soortPeriode, setSoortPeriode] = useState<"maand" | "kwartaal">("kwartaal");
  const [maand, setMaand] = useState(new Date().getMonth() + 1);
  const [kwartaal, setKwartaal] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const periode =
    soortPeriode === "maand" ? maandPeriode(jaar, maand) : kwartaalPeriode(jaar, kwartaal);

  const instellingenQ = useQuery({
    queryKey: ["regelgeving"],
    queryFn: fetchRegelgevingInstellingen,
  });
  const bottelrondesQ = useQuery({
    queryKey: ["bottelrondes", "alle"],
    queryFn: () => fetchBottelrondes(),
  });
  const voorraadQ = useQuery({
    queryKey: ["voorraad", "accijns"],
    queryFn: () => fetchVoorraadFlessen(),
  });
  const mutatiesQ = useQuery({
    queryKey: ["voorraad-mutaties", "alle"],
    queryFn: fetchAlleMutaties,
  });
  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });
  const analysesQ = useQuery({ queryKey: ["analyses", "alle"], queryFn: () => fetchAnalyses() });
  const categorieenQ = useQuery({
    queryKey: ["accijns-categorieen"],
    queryFn: fetchAccijnsCategorieen,
  });
  // Fase 7 Blok D — kelderverliezen (tankboek-actie "verlies") in de periode
  const tankboekQ = useQuery({
    queryKey: ["tankboek", "accijns", "verlies", periode.van, periode.tot],
    queryFn: () => fetchTankboek({ actie: "verlies", vanaf: periode.van, tot: periode.tot }),
  });

  const instelling = (sleutel: string) =>
    (instellingenQ.data ?? []).find((i) => i.sleutel === sleutel);
  const alsTarief = (i?: RegelgevingInstelling): Tarief | null =>
    i ? { waarde: i.waarde, laatst_gecontroleerd: i.laatst_gecontroleerd || null } : null;
  const tariefStil = alsTarief(instelling(REGELGEVING_SLEUTELS.accijnsStil));
  const tariefMousserend = alsTarief(instelling(REGELGEVING_SLEUTELS.accijnsMousserend));
  const agpDrempel = instelling(REGELGEVING_SLEUTELS.agpDrempel);
  // Fase 15 Blok D — het belastbare moment bepaalt de grondslag van de
  // bedragen. Bij "botteling" (De Tappenmars, zoals genoteerd bij de Douane)
  // telt wat gebotteld is; de uitslagcijfers blijven dan voorraadinformatie.
  const belastbaarMoment = leesBelastbaarMoment(
    instelling(REGELGEVING_SLEUTELS.belastbaarMoment)?.waarde_tekst,
  );
  const bijBotteling = useMemo(
    () =>
      berekenAccijnsBijBotteling({
        periode,
        bottelrondes: bottelrondesQ.data ?? [],
        categorieen: categorieenQ.data ?? [],
        tariefPerSleutel: new Map(
          (instellingenQ.data ?? []).map((i) => [i.sleutel, alsTarief(i)] as const),
        ),
      }),
    [periode, bottelrondesQ.data, categorieenQ.data, instellingenQ.data],
  );

  const kelderverliesRegels = useMemo(
    () =>
      (tankboekQ.data ?? []).filter(
        (r) => r.actie === "verlies" && r.datum >= periode.van && r.datum <= periode.tot,
      ),
    [tankboekQ.data, periode.van, periode.tot],
  );
  const kelderverliesLiters = Math.round(
    kelderverliesRegels.reduce((acc, r) => acc + r.volume_l, 0),
  );

  const overzicht = useMemo(() => {
    const bottelrondePerId = new Map((bottelrondesQ.data ?? []).map((b) => [b.id, b]));
    const partijNaam = new Map((partijenQ.data ?? []).map((p) => [p.id, p.naam]));
    const flesinhoudPerVoorraad = new Map<string, number>();
    const parelwijnPerVoorraad = new Map<string, boolean>();
    const partijnaamPerVoorraad = new Map<string, string>();
    for (const v of voorraadQ.data ?? []) {
      const b = bottelrondePerId.get(v.bottelronde);
      flesinhoudPerVoorraad.set(v.id, b?.flesinhoud_ml ?? 750);
      parelwijnPerVoorraad.set(v.id, !!b?.parelwijn);
      partijnaamPerVoorraad.set(v.id, partijNaam.get(v.partij) ?? v.wijnnaam);
    }
    // laatste alcohol% per partijnaam (analyses staan nieuw->oud gesorteerd)
    const alcoholPerPartijnaam = new Map<string, number | null>();
    for (const a of analysesQ.data ?? []) {
      const naam = partijNaam.get(a.partij);
      if (!naam || alcoholPerPartijnaam.has(naam)) continue;
      alcoholPerPartijnaam.set(naam, a.alcohol_pct ?? null);
    }
    return berekenAccijnsOverzicht({
      periode,
      bottelrondes: bottelrondesQ.data ?? [],
      mutaties: mutatiesQ.data ?? [],
      flesinhoudPerVoorraad,
      parelwijnPerVoorraad,
      partijnaamPerVoorraad,
      alcoholPerPartijnaam,
      tariefStil,
      tariefMousserend,
    });
  }, [
    periode,
    bottelrondesQ.data,
    voorraadQ.data,
    mutatiesQ.data,
    partijenQ.data,
    analysesQ.data,
    tariefStil,
    tariefMousserend,
  ]);

  // AGP-drempelsignaal: jaarproductie (som start_volume_l van partijen dit jaar)
  const jaarProductie = useMemo(
    () =>
      (partijenQ.data ?? [])
        .filter((p) => p.jaargang === jaar)
        .reduce((acc, p) => acc + (p.start_volume_l ?? 0), 0),
    [partijenQ.data, jaar],
  );
  const overDrempel =
    (agpDrempel?.waarde ?? 0) > 0 && jaarProductie > (agpDrempel?.waarde as number);

  const euro = (n: number) =>
    n.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
  const periodeLabel =
    soortPeriode === "maand" ? `${MAANDEN[maand - 1]} ${jaar}` : `Q${kwartaal} ${jaar}`;

  // ---------- tarievenbeheer ----------
  // Was ooit "alleen beheerder" (`eigenRol` uit `authStore.record.rol`), maar
  // sinds het verwijderen van inloggen (22 augustus 2026, zie CLAUDE.md)
  // wordt `authStore.record` nooit meer gevuld — deze check was daardoor voor
  // IEDEREEN altijd false, terwijl de server (`rolVan()` in kelder_logica.js)
  // een anonieme aanvrager al als beheerder behandelt. De check verborg dus
  // alleen de knoppen, zonder iets serverside te beschermen. Verwijderd,
  // zelfde aanpak als bij jaarafsluiting/configsync (Fase 19).
  const [bewerk, setBewerk] = useState<Record<string, { waarde: string; datum: string }>>({});
  // Fase 7 Blok E — dezelfde regels als de Excel-export, herbruikt voor het
  // controle-pakket (bundeling van alle registers over de periode).
  const accijnsRegels: unknown[][] = [
    ["Periode", periodeLabel],
    ["Gebotteld (flessen)", overzicht.gebotteldFlessen],
    ["Gebotteld (liters)", overzicht.gebotteldLiters],
    ["Uitslag stil (flessen)", overzicht.uitslagStil.flessen],
    ["Uitslag stil (liters)", overzicht.uitslagStil.liters],
    ["Uitslag mousserend (flessen)", overzicht.uitslagMousserend.flessen],
    ["Uitslag mousserend (liters)", overzicht.uitslagMousserend.liters],
    ["Breuk (flessen)", overzicht.breuk.flessen],
    ["Kelderverlies tank (liters)", kelderverliesLiters],
    ["Beginvoorraad (flessen)", overzicht.beginvoorraadFlessen],
    ["Eindvoorraad (flessen)", overzicht.eindvoorraadFlessen],
    ["Belastbaar moment", belastbaarMoment],
    ...(belastbaarMoment === "botteling"
      ? [
          ...bijBotteling.accijns.map((r) => [
            `Accijns ${r.categorie.naam} (${r.liters} L, indicatie EUR)`,
            r.bedragEur ?? "tarief niet geverifieerd",
          ]),
          ...bijBotteling.verbruiksbelasting.map((r) => [
            `Verbruiksbelasting ${r.categorie.naam} (${r.liters} L, indicatie EUR)`,
            r.bedragEur ?? "tarief niet geverifieerd",
          ]),
          [
            "Accijns totaal (indicatie EUR)",
            bijBotteling.totaalAccijnsEur ?? "tarief niet geverifieerd",
          ],
          [
            "Bottelrondes zonder accijnscategorie",
            bijBotteling.zonderCategorie.length === 0
              ? "geen"
              : bijBotteling.zonderCategorie
                  .map((z) => `${z.botteldatum} (${z.liters} L)`)
                  .join("; "),
          ],
        ]
      : [
          ["Accijns stil (indicatie EUR)", overzicht.accijnsStilEur ?? "tarief niet geverifieerd"],
          [
            "Accijns mousserend (indicatie EUR)",
            overzicht.accijnsMousserendEur ?? "tarief niet geverifieerd",
          ],
        ]),
  ];
  const pakketM = useMutation({
    mutationFn: () =>
      maakControlePakket(
        { van: periode.van, tot: periode.tot, label: periodeLabel },
        accijnsRegels,
      ),
    onSuccess: () => toast.success("Controle-pakket gedownload ✓"),
    onError: (e: Error) => toast.error(e.message),
  });

  const tariefM = useMutation({
    mutationFn: ({ id, waarde, datum }: { id: string; waarde: number; datum: string }) =>
      updateRegelgevingInstelling(id, { waarde, laatst_gecontroleerd: datum }),
    onSuccess: () => {
      toast.success("Tarief bijgewerkt ✓");
      qc.invalidateQueries({ queryKey: ["regelgeving"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AppHeader back title="Accijns" subtitle="Indicatief overzicht per aangifteperiode" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4 print:max-w-none">
        <OfflineWaarschuwing wat="het accijnsoverzicht" />
        {(bottelrondesQ.isError ||
          voorraadQ.isError ||
          mutatiesQ.isError ||
          tankboekQ.isError ||
          categorieenQ.isError ||
          instellingenQ.isError) && (
          <ErrorState
            error={
              bottelrondesQ.error ||
              voorraadQ.error ||
              mutatiesQ.error ||
              tankboekQ.error ||
              categorieenQ.error ||
              instellingenQ.error
            }
            onRetry={() => {
              bottelrondesQ.refetch();
              voorraadQ.refetch();
              mutatiesQ.refetch();
              tankboekQ.refetch();
              categorieenQ.refetch();
              instellingenQ.refetch();
            }}
          />
        )}
        {/* Fase 15 Blok D — grondslag altijd zichtbaar, ook op de print */}
        <div className="rounded-xl border border-border bg-card p-3 text-sm">
          <p className="font-medium">Belastbaar moment: {belastbaarMoment}</p>
          <p className="text-xs text-muted-foreground">
            {belastbaarMoment === "botteling"
              ? "De accijns wordt afgedragen over wat gebotteld is, per bevestigde categorie. Verkoop en eigen gebruik hieronder zijn voorraadinformatie, geen heffingsgrondslag."
              : "De accijns wordt afgedragen bij uitslag: verkoop en eigen gebruik. Gebottelde volumes hieronder zijn voorraadinformatie."}{" "}
            Instelling: <code>accijns_belastbaar_moment</code>.
          </p>
        </div>
        {/* AGP-signaal */}
        {overDrempel && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p>
              Jaarproductie {jaar} ({Math.round(jaarProductie)} L) ligt boven de ingestelde
              AGP-drempel ({agpDrempel?.waarde} L). De juridische duiding is aan jou — check dit bij
              de Douane.
            </p>
          </div>
        )}

        {/* Periode-keuze */}
        <section className="flex flex-wrap items-center gap-2 print:hidden">
          <YearSelector />
          <select
            value={soortPeriode}
            onChange={(e) => setSoortPeriode(e.target.value as "maand" | "kwartaal")}
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
          >
            <option value="kwartaal">Per kwartaal</option>
            <option value="maand">Per maand</option>
          </select>
          {soortPeriode === "maand" ? (
            <select
              value={maand}
              onChange={(e) => setMaand(Number(e.target.value))}
              className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
            >
              {MAANDEN.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={kwartaal}
              onChange={(e) => setKwartaal(Number(e.target.value))}
              className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </select>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() =>
                exporteerCsv(
                  `accijns_${periodeLabel.replace(/\s/g, "_")}`,
                  ["Onderdeel", "Waarde"],
                  accijnsRegels,
                )
              }
              className="flex h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium"
            >
              <Sheet className="h-3.5 w-3.5" /> Excel
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium"
            >
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
            <button
              type="button"
              disabled={pakketM.isPending}
              onClick={() => pakketM.mutate()}
              className="flex h-11 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              <FolderArchive className="h-3.5 w-3.5" />
              {pakketM.isPending ? "Bundelen…" : "Controle-pakket (ZIP)"}
            </button>
          </div>
        </section>

        <h1 className="text-lg font-bold">Aangifteperiode {periodeLabel}</h1>

        {/* Overzicht */}
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              label: "Gebotteld",
              waarde: `${overzicht.gebotteldLiters} L`,
              sub: `${overzicht.gebotteldFlessen} flessen`,
            },
            {
              label: "Uitslag stil",
              waarde: `${overzicht.uitslagStil.liters} L`,
              sub: `${overzicht.uitslagStil.flessen} flessen (verkocht + eigen gebruik)`,
            },
            {
              label: "Uitslag mousserend",
              waarde: `${overzicht.uitslagMousserend.liters} L`,
              sub: `${overzicht.uitslagMousserend.flessen} flessen`,
            },
            {
              label: "Breuk",
              waarde: `${overzicht.breuk.flessen} flessen`,
              sub: `${overzicht.breuk.regels.length} bewijsregel(s)`,
            },
            {
              label: "Kelderverlies (tank)",
              waarde: `${kelderverliesLiters} L`,
              sub: `${kelderverliesRegels.length} verliesregel(s) in het tankboek`,
            },
            {
              label: "Beginvoorraad",
              waarde: `${overzicht.beginvoorraadFlessen} flessen`,
              sub: `per ${periode.van}`,
            },
            {
              label: "Eindvoorraad",
              waarde: `${overzicht.eindvoorraadFlessen} flessen`,
              sub: `per ${periode.tot}`,
            },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {k.label}
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums">{k.waarde}</p>
              <p className="text-xs text-muted-foreground">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Accijnsindicatie */}
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Accijns — indicatie, controleer bij aangifte
          </h2>
          {belastbaarMoment === "botteling" ? (
            <>
              {bijBotteling.accijns.length === 0 && bijBotteling.zonderCategorie.length === 0 && (
                <p className="text-sm text-muted-foreground">Geen bottelrondes in deze periode.</p>
              )}
              {[...bijBotteling.accijns, ...bijBotteling.verbruiksbelasting].map((r) => (
                <div
                  key={r.categorie.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span>
                    {r.categorie.heffing === "verbruiksbelasting" && (
                      <span className="text-xs text-muted-foreground">(aparte aangifte) </span>
                    )}
                    {r.categorie.naam}{" "}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {r.liters} L · {r.flessen} fl.
                    </span>
                  </span>
                  {r.bedragEur != null ? (
                    <span className="shrink-0 text-right tabular-nums">
                      {euro(r.bedragEur)}{" "}
                      <span className="text-xs text-muted-foreground">
                        (€{r.tarief?.waarde}/hl, gecontroleerd {r.tarief?.laatst_gecontroleerd})
                      </span>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5" /> tarief nog niet geverifieerd
                    </span>
                  )}
                </div>
              ))}
              {bijBotteling.accijns.length > 0 && (
                <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm font-semibold">
                  <span>Accijns totaal</span>
                  {bijBotteling.totaalAccijnsEur != null ? (
                    <span className="tabular-nums">{euro(bijBotteling.totaalAccijnsEur)}</span>
                  ) : (
                    <span className="text-xs font-normal text-muted-foreground">
                      onvolledig — niet elk tarief is geverifieerd
                    </span>
                  )}
                </div>
              )}
              {bijBotteling.zonderCategorie.length > 0 && (
                <p className="text-xs text-destructive" role="status">
                  ⚠️ {bijBotteling.zonderCategorie.length} bottelronde(s) zonder accijnscategorie —
                  hierover is geen bedrag berekend:{" "}
                  {bijBotteling.zonderCategorie
                    .map((z) => `${z.botteldatum} (${z.liters} L)`)
                    .join(", ")}
                  . Koppel de categorie via de partij vóór de aangifte.
                </p>
              )}
            </>
          ) : (
            [
              { naam: "Stille wijn", bedrag: overzicht.accijnsStilEur, tarief: tariefStil },
              {
                naam: "Mousserende wijn",
                bedrag: overzicht.accijnsMousserendEur,
                tarief: tariefMousserend,
              },
            ].map((r) => (
              <div key={r.naam} className="flex items-center justify-between text-sm">
                <span>{r.naam}</span>
                {r.bedrag != null ? (
                  <span className="tabular-nums">
                    {euro(r.bedrag)}{" "}
                    <span className="text-xs text-muted-foreground">
                      (tarief €{r.tarief?.waarde}/hl, gecontroleerd {r.tarief?.laatst_gecontroleerd}
                      )
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" /> tarief nog niet geverifieerd
                  </span>
                )}
              </div>
            ))
          )}
          {belastbaarMoment === "uitslag" && overzicht.partijenZonderAlcohol.length > 0 && (
            <p className="text-xs text-destructive">
              ⚠️ Geen alcohol% bekend voor: {overzicht.partijenZonderAlcohol.join(", ")} — voer een
              analyse met alcohol% in vóór de aangifte.
            </p>
          )}
          {overzicht.breuk.regels.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Breuk-bewijsregels:{" "}
              {overzicht.breuk.regels
                .map((b) => `${b.datum}: ${b.aantal}× (${b.reden})`)
                .join("; ")}
            </div>
          )}
        </section>

        {/* Tarievenbeheer */}
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4 print:hidden">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Tarieven & drempels
          </h2>
          {(instellingenQ.data ?? [])
            .filter(
              (i) =>
                i.sleutel !== REGELGEVING_SLEUTELS.agentLimiet &&
                i.sleutel !== REGELGEVING_SLEUTELS.belastbaarMoment &&
                i.sleutel !== "laatste_backup",
            )
            .map((i) => {
              const b = bewerk[i.id] ?? {
                waarde: i.waarde != null ? String(i.waarde) : "",
                datum: i.laatst_gecontroleerd || format(new Date(), "yyyy-MM-dd"),
              };
              const geverifieerd = tariefGeverifieerd({
                waarde: i.waarde,
                laatst_gecontroleerd: i.laatst_gecontroleerd || null,
              });
              return (
                <div key={i.id} className="space-y-1 border-b border-border/60 pb-2 last:border-0">
                  <p className="text-sm font-medium">
                    {i.sleutel} <span className="text-xs text-muted-foreground">({i.eenheid})</span>{" "}
                    {geverifieerd ? "✅" : "⚠️ niet geverifieerd"}
                  </p>
                  <p className="text-xs text-muted-foreground">{i.bron}</p>
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={b.waarde}
                      onChange={(e) =>
                        setBewerk((s) => ({ ...s, [i.id]: { ...b, waarde: e.target.value } }))
                      }
                      className={veldClass}
                      placeholder="waarde"
                    />
                    <input
                      type="date"
                      value={b.datum}
                      onChange={(e) =>
                        setBewerk((s) => ({ ...s, [i.id]: { ...b, datum: e.target.value } }))
                      }
                      className={veldClass}
                      title="Laatst gecontroleerd bij de bron"
                    />
                    <button
                      type="button"
                      disabled={tariefM.isPending}
                      onClick={() => {
                        const waarde = Number(b.waarde);
                        if (!waarde || waarde <= 0 || !b.datum)
                          return void toast.error("Waarde én controle-datum zijn verplicht");
                        // Beveiligingsblok (9 sep. 2026) — tarieven sturen de
                        // accijnsberekening voor iedereen; zonder authenticatie
                        // is deze drempel de enige rem tegen een verkeerde klik
                        // (zie WERKLOG.md "Beveiligingsblok", Blok C).
                        if (
                          !confirm(
                            `Tarief "${i.sleutel}" wijzigen naar ${waarde} ${i.eenheid}? Dit verandert de accijnsberekening voor iedereen.`,
                          )
                        )
                          return;
                        tariefM.mutate({ id: i.id, waarde, datum: b.datum });
                      }}
                      className="h-10 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      Opslaan
                    </button>
                  </div>
                </div>
              );
            })}
          <p className="text-xs text-muted-foreground">
            Vul waarden pas in ná verificatie bij de Douane; de controle-datum verschijnt bij elke
            berekening.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">
          Dit overzicht is een hulpmiddel op basis van je eigen administratie (bottelrondes en
          voorraadmutaties) en géén belastingaangifte. Controleer bedragen en tarieven altijd bij de
          Douane vóór je aangifte doet.
        </p>
      </div>
    </>
  );
}
