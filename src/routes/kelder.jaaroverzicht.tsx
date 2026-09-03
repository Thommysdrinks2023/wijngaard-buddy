import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchBottelrondes, fetchTankboek } from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { fetchOogst } from "@/lib/extra-data";
import { exporteerCsv } from "@/lib/csv-export";
import { useSeizoen } from "@/lib/seizoen";
import { YearSelector } from "@/components/year-selector";
import { AppHeader } from "@/components/app-header";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";
import { Archive, Loader2, Printer, Sheet } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { getPb } from "@/lib/data";
import { useInvoerder } from "@/lib/use-invoerder";
import type { RecordModel } from "pocketbase";

// Blok F — jaaroverzicht per jaargang: geoogst (kg per ras), geproduceerd (L,
// uit partijen.start_volume_l bij de pers), gebotteld (flessen per lot),
// verliezen (uit tankboek-acties "verlies"). Puur een leesweergave, geen
// nieuwe collectie nodig — alle brondata bestaat al.
export const Route = createFileRoute("/kelder/jaaroverzicht")({
  component: JaaroverzichtPage,
  head: () => ({ meta: [{ title: "Jaaroverzicht — Kelder" }] }),
});

// Blok O — jaarafsluiting: het overzicht van een jaargang definitief
// vastleggen in de append-only archief-collectie (update/delete = null).
// Er wordt niets verwijderd of gewijzigd; 2027-invoer kan gewoon doorgaan
// naast 2026-raadpleging via de bestaande seizoenskiezer.
async function fetchArchief(jaar: number) {
  const pb = getPb();
  if (!pb) return [];
  const records = await pb.collection("archief").getFullList({
    filter: `jaar = ${jaar} && type = "jaaroverzicht"`,
    sort: "-created",
  });
  return records as RecordModel[];
}

function JaaroverzichtPage() {
  const [jaar] = useSeizoen();
  const [invoerder] = useInvoerder();
  const [afsluitNotitie, setAfsluitNotitie] = useState("");
  const archiefQ = useQuery({ queryKey: ["archief", jaar], queryFn: () => fetchArchief(jaar) });
  const qc = useQueryClient();
  const afsluitM = useMutation({
    mutationFn: async () => {
      const pb = getPb();
      if (!pb || !pb.authStore.isValid)
        throw new Error("Log in om een jaar af te sluiten (archief vereist een account).");
      return pb.collection("archief").create({
        jaar,
        type: "jaaroverzicht",
        notitie: afsluitNotitie,
        ingevoerd_door: invoerder,
        samenvatting: {
          geoogst_kg: Math.round(totaalKg),
          oogst_per_ras: Object.fromEntries(oogstPerRas.map(([ras, kg]) => [ras, Math.round(kg)])),
          geproduceerd_l: Math.round(geproduceerdVolume),
          partijen: partijenVanJaar.length,
          gebotteld_flessen: totaalFlessen,
          flessen_per_lot: Object.fromEntries(flessenPerLot),
          verlies_l: Math.round(verliesVanJaar),
          afgesloten_op: format(new Date(), "yyyy-MM-dd"),
        },
      });
    },
    onSuccess: () => {
      toast.success(`Jaar ${jaar} afgesloten en gearchiveerd ✓`);
      qc.invalidateQueries({ queryKey: ["archief", jaar] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const oogstQ = useQuery({ queryKey: ["oogst-records"], queryFn: fetchOogst });
  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });
  const bottelrondesQ = useQuery({
    queryKey: ["bottelrondes", "alle"],
    queryFn: () => fetchBottelrondes(),
  });
  const tankboekQ = useQuery({ queryKey: ["tankboek", "alle"], queryFn: () => fetchTankboek() });

  const partijenVanJaar = useMemo(
    () => (partijenQ.data ?? []).filter((p) => p.jaargang === jaar),
    [partijenQ.data, jaar],
  );
  const partijIdsVanJaar = useMemo(
    () => new Set(partijenVanJaar.map((p) => p.id)),
    [partijenVanJaar],
  );

  const oogstPerRas = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of oogstQ.data ?? []) {
      if (o.seizoen !== jaar) continue;
      m.set(o.ras, (m.get(o.ras) ?? 0) + o.kg);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [oogstQ.data, jaar]);
  const totaalKg = oogstPerRas.reduce((acc, [, kg]) => acc + kg, 0);
  const aantalRijenGeoogst = useMemo(
    () =>
      new Set((oogstQ.data ?? []).filter((o) => o.seizoen === jaar && o.rij).map((o) => o.rij))
        .size,
    [oogstQ.data, jaar],
  );

  const geproduceerdVolume = useMemo(
    () => partijenVanJaar.reduce((acc, p) => acc + (p.start_volume_l ?? 0), 0),
    [partijenVanJaar],
  );

  const bottelrondesVanJaar = useMemo(
    () => (bottelrondesQ.data ?? []).filter((b) => partijIdsVanJaar.has(b.partij)),
    [bottelrondesQ.data, partijIdsVanJaar],
  );
  const flessenPerLot = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bottelrondesVanJaar) {
      const lot = b.lotnummer || "(geen lotnummer)";
      m.set(lot, (m.get(lot) ?? 0) + b.aantal_flessen);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [bottelrondesVanJaar]);
  const totaalFlessen = flessenPerLot.reduce((acc, [, n]) => acc + n, 0);

  const verliesVanJaar = useMemo(
    () =>
      (tankboekQ.data ?? [])
        .filter((r) => r.actie === "verlies" && partijIdsVanJaar.has(r.partij))
        .reduce((acc, r) => acc + r.volume_l, 0),
    [tankboekQ.data, partijIdsVanJaar],
  );

  return (
    <>
      <AppHeader back title="Jaaroverzicht" subtitle="Kelder & wijngaard per jaargang" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4 print:max-w-none">
        <OfflineWaarschuwing wat="het jaaroverzicht" />
        <div className="flex items-center justify-between gap-2 print:hidden">
          <YearSelector />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                exporteerCsv(
                  `jaaroverzicht_${jaar}`,
                  ["Categorie", "Naam", "Waarde"],
                  [
                    ...oogstPerRas.map(([ras, kg]) => ["Oogst (kg)", ras, kg]),
                    ["Oogst (kg)", "Totaal", totaalKg],
                    ["Geproduceerd (L)", "Totaal", geproduceerdVolume],
                    ...flessenPerLot.map(([lot, n]) => ["Gebotteld (flessen)", lot, n]),
                    ["Gebotteld (flessen)", "Totaal", totaalFlessen],
                    ["Verlies (L)", "Totaal", verliesVanJaar],
                  ],
                )
              }
              className="flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium"
            >
              <Sheet className="h-4 w-4" /> Excel
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
          </div>
        </div>

        <h1 className="hidden text-xl font-bold print:block">Jaaroverzicht {jaar}</h1>

        {/* Kerncijfers */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Geoogst
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{Math.round(totaalKg)} kg</p>
            <p className="text-xs text-muted-foreground">{aantalRijenGeoogst} rijen</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Geproduceerd
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {Math.round(geproduceerdVolume)} L
            </p>
            <p className="text-xs text-muted-foreground">
              {partijenVanJaar.length} partij{partijenVanJaar.length === 1 ? "" : "en"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Gebotteld
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{totaalFlessen}</p>
            <p className="text-xs text-muted-foreground">
              {flessenPerLot.length} lot{flessenPerLot.length === 1 ? "" : "ten"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Verlies
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{Math.round(verliesVanJaar)} L</p>
            <p className="text-xs text-muted-foreground">via tankboek-actie "verlies"</p>
          </div>
        </div>

        {/* Oogst per ras */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Oogst per ras
          </h2>
          {oogstPerRas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen oogstregels voor {jaar}.</p>
          ) : (
            <ul className="space-y-1.5">
              {oogstPerRas.map(([ras, kg]) => (
                <li
                  key={ras}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm"
                >
                  <span>{ras}</span>
                  <span className="font-semibold tabular-nums">{Math.round(kg)} kg</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Gebotteld per lot */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Gebotteld per lot
          </h2>
          {flessenPerLot.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog niet gebotteld in {jaar}.</p>
          ) : (
            <ul className="space-y-1.5">
              {flessenPerLot.map(([lot, n]) => (
                <li
                  key={lot}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm"
                >
                  <span>{lot}</span>
                  <span className="font-semibold tabular-nums">{n} flessen</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Jaarafsluiting (Blok O) — append-only vastleggen in het archief */}
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4 print:hidden">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Archive className="h-4 w-4" /> Jaarafsluiting {jaar}
          </h2>
          {(archiefQ.data ?? []).length > 0 ? (
            <p className="text-sm">
              ✅ Dit jaar is afgesloten op{" "}
              {String((archiefQ.data ?? [])[0]?.["created"] ?? "").slice(0, 10)}. Het archiefrecord
              is onwijzigbaar; een correctie = een nieuwe afsluiting (de nieuwste telt).
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Legt de cijfers hierboven definitief vast in het archief (er wordt niets verwijderd
                of gewijzigd — {jaar + 1} kan gewoon doorlopen naast {jaar}-raadpleging). Print het
                overzicht eerst als PDF voor je eigen map.
              </p>
              <input
                value={afsluitNotitie}
                onChange={(e) => setAfsluitNotitie(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"
                placeholder="Notitie bij de afsluiting (optioneel)"
              />
              <button
                type="button"
                onClick={() => afsluitM.mutate()}
                disabled={afsluitM.isPending}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {afsluitM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Sluit {jaar} definitief af
              </button>
            </>
          )}
        </section>
      </div>
    </>
  );
}
