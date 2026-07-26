import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_NAAM } from "@/config/app";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchTanks } from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { fetchProducenten } from "@/lib/kelder-data";
import { PARTIJ_STATUSSEN, TANK_STATUSSEN, type Partij, type Tank } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { ArrowLeftRight, BookOpen, Container, NotebookPen, Plus, Wine } from "lucide-react";

/** Onthoudt of de tanklijst op "alleen gevuld" staat (Fase 13 Blok F). */
const TANKFILTER_SLEUTEL = "wg.kelder.alleen_gevuld.v1";

export const Route = createFileRoute("/kelder/")({
  component: KelderDashboard,
  head: () => ({
    meta: [
      { title: `Kelder — ${APP_NAAM}` },
      { name: "description", content: "Kelderdashboard: tanks en partijen." },
    ],
  }),
});

function statusInfo(status: Partij["status"]) {
  return PARTIJ_STATUSSEN.find((s) => s.value === status);
}

function tankStatusInfo(status: Tank["status"]) {
  return TANK_STATUSSEN.find((s) => s.value === status);
}

function KelderDashboard() {
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });
  const producentenQ = useQuery({ queryKey: ["producenten"], queryFn: fetchProducenten });
  const [producentFilter, setProducentFilter] = useState("");

  // Fase 13 Blok F — standaard alleen de gevulde tanks.
  //
  // De kelder heeft 48 tanks en er staan er zelden meer dan een handvol vol.
  // Op een telefoonscherm betekende de oude standaard (alles tonen) dat je
  // langs tientallen lege tanks moest scrollen om te zien wat er ligt — precies
  // de vraag waarvoor je dit scherm opent. De knop blijft staan om alles te
  // zien, en de keuze wordt onthouden zodat hij niet elke keer terugspringt.
  const [alleenGevuld, setAlleenGevuld] = useState(() => {
    if (typeof localStorage === "undefined") return true;
    const bewaard = localStorage.getItem(TANKFILTER_SLEUTEL);
    return bewaard === null ? true : bewaard === "1";
  });
  const wisselAlleenGevuld = () =>
    setAlleenGevuld((v) => {
      const nieuw = !v;
      try {
        localStorage.setItem(TANKFILTER_SLEUTEL, nieuw ? "1" : "0");
      } catch {
        // privémodus of vol quotum: de keuze geldt dan alleen deze sessie
      }
      return nieuw;
    });

  const partijenById = useMemo(() => {
    const m = new Map<string, Partij>();
    partijenQ.data?.forEach((p) => m.set(p.id, p));
    return m;
  }, [partijenQ.data]);

  const actievePartijen = useMemo(
    () =>
      (partijenQ.data ?? []).filter(
        (p) =>
          p.status !== "afgevoerd" &&
          p.status !== "gebotteld" &&
          (!producentFilter || p.producent === producentFilter),
      ),
    [partijenQ.data, producentFilter],
  );

  const tanksInGebruik = useMemo(
    () => (tanksQ.data ?? []).filter((t) => t.huidig_volume_l > 0),
    [tanksQ.data],
  );
  const totaalVolume = useMemo(
    () => Math.round(tanksInGebruik.reduce((acc, t) => acc + t.huidig_volume_l, 0)),
    [tanksInGebruik],
  );

  // Staat er niets in de kelder, dan toch alle tanks tonen: anders lees je
  // "Geen tanks gevonden" terwijl er 48 zijn, en dat is een storingsmelding
  // in plaats van de waarheid ("de kelder is leeg").
  const getoondeTanks = useMemo(
    () => (alleenGevuld && tanksInGebruik.length > 0 ? tanksInGebruik : (tanksQ.data ?? [])),
    [alleenGevuld, tanksInGebruik, tanksQ.data],
  );
  const filterActief = alleenGevuld && tanksInGebruik.length > 0;

  const isError = tanksQ.isError || partijenQ.isError;

  return (
    <>
      <AppHeader title="Kelder" subtitle="Wijnmakerij" />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kelder</h1>
            <p className="text-sm text-muted-foreground">Tanks, partijen en tankboek</p>
          </div>
          <Link
            to="/kelder/partijen/nieuw"
            className="flex h-11 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            Nieuwe partij
          </Link>
        </div>

        {isError && (
          <ErrorState
            error={tanksQ.error || partijenQ.error}
            onRetry={() => {
              tanksQ.refetch();
              partijenQ.refetch();
            }}
          />
        )}

        {/* Kelderstatus */}
        <section
          className="rounded-xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
          style={{ backgroundColor: "var(--nav)" }}
        >
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--accent-gold)" }}
              >
                Actieve partijen
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                {actievePartijen.length}
              </p>
            </div>
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--accent-gold)" }}
              >
                Volume in kelder
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                {totaalVolume} <span className="text-sm font-normal">L</span>
              </p>
            </div>
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--accent-gold)" }}
              >
                Tanks in gebruik
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                {tanksInGebruik.length}/{tanksQ.data?.length ?? 0}
              </p>
            </div>
          </div>
        </section>

        {/* Snelkoppelingen */}
        <div className="grid grid-cols-4 gap-2">
          <Link
            to="/kelder/overhevelen"
            className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-primary text-xs font-semibold text-primary-foreground active:scale-[0.98]"
          >
            <ArrowLeftRight className="h-5 w-5" />
            Overhevelen
          </Link>
          <Link
            to="/kelder/tankboek"
            className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card text-xs font-semibold active:scale-[0.98]"
          >
            <BookOpen className="h-5 w-5" />
            Tankboek
          </Link>
          <Link
            to="/kelder/logboek"
            className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card text-xs font-semibold active:scale-[0.98]"
          >
            <NotebookPen className="h-5 w-5" />
            Logboek
          </Link>
          <Link
            to="/kelder/tanks"
            className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card text-xs font-semibold active:scale-[0.98]"
          >
            <Container className="h-5 w-5" />
            Tanks
          </Link>
        </div>

        {/* Actieve partijen */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Actieve partijen
            </h2>
            <Link to="/kelder/partijen" className="text-xs text-muted-foreground underline">
              Alle partijen
            </Link>
          </div>
          {(producentenQ.data ?? []).length > 1 && (
            <select
              value={producentFilter}
              onChange={(e) => setProducentFilter(e.target.value)}
              className="mb-2 h-10 w-full rounded-xl border border-input bg-card px-3 text-sm"
            >
              <option value="">Alle producenten</option>
              {(producentenQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.naam}
                </option>
              ))}
            </select>
          )}
          {partijenQ.isLoading ? (
            <ListSkeleton />
          ) : actievePartijen.length === 0 ? (
            <EmptyState
              message="Geen actieve partijen — start een nieuwe partij bij de pers."
              icon={<Wine className="h-6 w-6" />}
            />
          ) : (
            <ul className="space-y-2">
              {actievePartijen.map((p) => {
                const info = statusInfo(p.status);
                const tanksVanPartij = (tanksQ.data ?? []).filter((t) => t.huidige_partij === p.id);
                const volume = Math.round(
                  tanksVanPartij.reduce((acc, t) => acc + t.huidig_volume_l, 0),
                );
                return (
                  <li key={p.id}>
                    <Link
                      to="/kelder/partijen/$partijId"
                      params={{ partijId: p.id }}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 active:scale-[0.99]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {p.naam} <span className="text-muted-foreground">· {p.jaargang}</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {tanksVanPartij.length > 0
                            ? `Tank ${tanksVanPartij.map((t) => t.code).join(", ")} · ${volume} L`
                            : "Nog niet op tank"}
                          {p.lotnummer ? ` · lot ${p.lotnummer}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                        {info?.emoji} {info?.label ?? p.status}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Tankinventaris — zelfde overzicht als het Excel-tankboek */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Tankinventaris{" "}
              <span className="font-normal normal-case tracking-normal">
                ({getoondeTanks.length}
                {filterActief ? ` van ${(tanksQ.data ?? []).length}` : ""})
              </span>
            </h2>
            <button
              type="button"
              onClick={wisselAlleenGevuld}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                filterActief
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-card"
              }`}
            >
              {filterActief ? "Toon alle tanks" : "Alleen gevuld"}
            </button>
          </div>
          {tanksQ.isLoading ? (
            <ListSkeleton />
          ) : getoondeTanks.length === 0 ? (
            <EmptyState message="Geen tanks gevonden." icon={<Container className="h-6 w-6" />} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Tank</th>
                    <th className="px-2 py-2">Soort</th>
                    <th className="px-2 py-2">Inhoud</th>
                    <th className="px-2 py-2 text-right">Liters</th>
                  </tr>
                </thead>
                <tbody>
                  {getoondeTanks.map((t) => {
                    const partij = t.huidige_partij ? partijenById.get(t.huidige_partij) : null;
                    const info = tankStatusInfo(t.status);
                    return (
                      <tr key={t.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-semibold">
                          <Link
                            to="/kelder/tanks/$tankId"
                            params={{ tankId: t.id }}
                            className="underline-offset-2 hover:underline"
                          >
                            {t.code}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{t.soort}</td>
                        <td className="px-2 py-2">
                          {partij ? (
                            <span className="truncate">
                              {partij.naam}
                              {partij.lotnummer ? (
                                <span className="text-muted-foreground"> · {partij.lotnummer}</span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {info?.emoji} {info?.label}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {t.huidig_volume_l > 0 ? Math.round(t.huidig_volume_l) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
