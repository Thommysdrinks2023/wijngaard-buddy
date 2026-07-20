import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  berekenAccijnsOverzicht,
  kwartaalPeriode,
  maandPeriode,
  tariefGeverifieerd,
  type Tarief,
} from "@/lib/accijns";
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
  // Fase 7 Blok D — kelderverliezen (tankboek-actie "verlies") in de periode
  const tankboekQ = useQuery({ queryKey: ["tankboek", "accijns"], queryFn: () => fetchTankboek() });

  const instelling = (sleutel: string) =>
    (instellingenQ.data ?? []).find((i) => i.sleutel === sleutel);
  const alsTarief = (i?: RegelgevingInstelling): Tarief | null =>
    i ? { waarde: i.waarde, laatst_gecontroleerd: i.laatst_gecontroleerd || null } : null;
  const tariefStil = alsTarief(instelling(REGELGEVING_SLEUTELS.accijnsStil));
  const tariefMousserend = alsTarief(instelling(REGELGEVING_SLEUTELS.accijnsMousserend));
  const agpDrempel = instelling(REGELGEVING_SLEUTELS.agpDrempel);

  const periode =
    soortPeriode === "maand" ? maandPeriode(jaar, maand) : kwartaalPeriode(jaar, kwartaal);

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

  // ---------- tarievenbeheer (alleen beheerder, UI + API-rule) ----------
  const eigenRol = (getPb()?.authStore.record?.["rol"] as string) || "";
  const isBeheerder = eigenRol === "beheerder";
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
    ["Accijns stil (indicatie EUR)", overzicht.accijnsStilEur ?? "tarief niet geverifieerd"],
    [
      "Accijns mousserend (indicatie EUR)",
      overzicht.accijnsMousserendEur ?? "tarief niet geverifieerd",
    ],
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
        {(bottelrondesQ.isError || voorraadQ.isError || mutatiesQ.isError || tankboekQ.isError) && (
          <ErrorState
            error={bottelrondesQ.error || voorraadQ.error || mutatiesQ.error || tankboekQ.error}
            onRetry={() => {
              bottelrondesQ.refetch();
              voorraadQ.refetch();
              mutatiesQ.refetch();
              tankboekQ.refetch();
            }}
          />
        )}
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
                  [
                    ["Periode", periodeLabel],
                    ["Gebotteld (flessen)", overzicht.gebotteldFlessen],
                    ["Gebotteld (liters)", overzicht.gebotteldLiters],
                    ["Uitslag stil (flessen)", overzicht.uitslagStil.flessen],
                    ["Uitslag stil (liters)", overzicht.uitslagStil.liters],
                    ["Uitslag mousserend (flessen)", overzicht.uitslagMousserend.flessen],
                    ["Uitslag mousserend (liters)", overzicht.uitslagMousserend.liters],
                    ["Breuk (flessen)", overzicht.breuk.flessen],
                    ["Beginvoorraad (flessen)", overzicht.beginvoorraadFlessen],
                    ["Eindvoorraad (flessen)", overzicht.eindvoorraadFlessen],
                    [
                      "Accijns stil (indicatie EUR)",
                      overzicht.accijnsStilEur ?? "tarief niet geverifieerd",
                    ],
                    [
                      "Accijns mousserend (indicatie EUR)",
                      overzicht.accijnsMousserendEur ?? "tarief niet geverifieerd",
                    ],
                  ],
                )
              }
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium"
            >
              <Sheet className="h-3.5 w-3.5" /> Excel
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium"
            >
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
            {isBeheerder && (
              <button
                type="button"
                disabled={pakketM.isPending}
                onClick={() => pakketM.mutate()}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                <FolderArchive className="h-3.5 w-3.5" />
                {pakketM.isPending ? "Bundelen…" : "Controle-pakket (ZIP)"}
              </button>
            )}
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
          {[
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
                    (tarief €{r.tarief?.waarde}/hl, gecontroleerd {r.tarief?.laatst_gecontroleerd})
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" /> tarief nog niet geverifieerd
                </span>
              )}
            </div>
          ))}
          {overzicht.partijenZonderAlcohol.length > 0 && (
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

        {/* Tarievenbeheer — alleen beheerder */}
        {isBeheerder && (
          <section className="space-y-2 rounded-2xl border border-border bg-card p-4 print:hidden">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Tarieven & drempels (beheerder)
            </h2>
            {(instellingenQ.data ?? [])
              .filter(
                (i) =>
                  i.sleutel !== REGELGEVING_SLEUTELS.agentLimiet && i.sleutel !== "laatste_backup",
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
                  <div
                    key={i.id}
                    className="space-y-1 border-b border-border/60 pb-2 last:border-0"
                  >
                    <p className="text-sm font-medium">
                      {i.sleutel}{" "}
                      <span className="text-xs text-muted-foreground">({i.eenheid})</span>{" "}
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
        )}

        <p className="text-xs text-muted-foreground">
          Dit overzicht is een hulpmiddel op basis van je eigen administratie (bottelrondes en
          voorraadmutaties) en géén belastingaangifte. Controleer bedragen en tarieven altijd bij de
          Douane vóór je aangifte doet.
        </p>
      </div>
    </>
  );
}
