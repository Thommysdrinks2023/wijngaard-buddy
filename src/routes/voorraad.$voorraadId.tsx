import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import {
  boekVoorraadMutatie,
  fetchBottelrondeById,
  fetchTanks,
  fetchVoorraadFlesById,
  fetchVoorraadMutaties,
} from "@/lib/kelder-data";
import { fetchPartijById } from "@/lib/partijen-data";
import { fetchOogst } from "@/lib/extra-data";
import { foutenPerVeld, isGeldig, valideerVoorraadMutatie } from "@/lib/validatie";
import { useInvoerder } from "@/lib/use-invoerder";
import { VOORRAAD_MUTATIE_TYPES, VOORRAAD_STATUSSEN, type VoorraadMutatieType } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Loader2, Plus, Printer } from "lucide-react";

export const Route = createFileRoute("/voorraad/$voorraadId")({
  component: VoorraadDetailPage,
  head: () => ({ meta: [{ title: "Voorraad — Wijn" }] }),
});

function VoorraadDetailPage() {
  const { voorraadId } = Route.useParams();
  const qc = useQueryClient();
  const [invoerder, setInvoerder] = useInvoerder();

  const voorraadQ = useQuery({
    queryKey: ["voorraad-fles", voorraadId],
    queryFn: () => fetchVoorraadFlesById(voorraadId),
  });
  const voorraad = voorraadQ.data;

  const bottelrondeQ = useQuery({
    queryKey: ["bottelronde", voorraad?.bottelronde],
    queryFn: () => fetchBottelrondeById(voorraad!.bottelronde),
    enabled: !!voorraad?.bottelronde,
  });
  const partijQ = useQuery({
    queryKey: ["partij", voorraad?.partij],
    queryFn: () => fetchPartijById(voorraad!.partij),
    enabled: !!voorraad?.partij,
  });
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const oogstQ = useQuery({ queryKey: ["oogst-records"], queryFn: fetchOogst });
  const mutatiesQ = useQuery({
    queryKey: ["voorraad-mutaties", voorraadId],
    queryFn: () => fetchVoorraadMutaties(voorraadId),
  });

  const tank = useMemo(
    () => (tanksQ.data ?? []).find((t) => t.id === bottelrondeQ.data?.van_tank),
    [tanksQ.data, bottelrondeQ.data],
  );
  // Blok F — traceerbaarheidsrapport: alle oogstregels van deze partij, niet
  // alleen de eerste (een partij kan uit meerdere rijen/rassen bestaan).
  const oogstVanPartij = useMemo(
    () => (oogstQ.data ?? []).filter((o) => o.partij === voorraad?.partij),
    [oogstQ.data, voorraad],
  );

  const [toonMutatie, setToonMutatie] = useState(false);
  const [mDatum, setMDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [mType, setMType] = useState<VoorraadMutatieType>("verkocht");
  const [mAantal, setMAantal] = useState("");
  const [mAfnemer, setMAfnemer] = useState("");
  const [mNotities, setMNotities] = useState("");
  const [mFouten, setMFouten] = useState<Record<string, string>>({});

  const mutatieM = useMutation({
    mutationFn: () =>
      boekVoorraadMutatie({
        voorraad: voorraadId,
        mutatie_type: mType,
        aantal: Number(mAantal),
        datum: mDatum,
        afnemer_of_reden: mAfnemer,
        notities: mNotities,
        ingevoerd_door: invoerder,
      }),
    onSuccess: (r) => {
      toast.success(`Mutatie opgeslagen ✓ — aantal_huidig nu ${r.aantal_huidig}`);
      if (r.waarschuwing) toast.warning(r.waarschuwing);
      qc.invalidateQueries({ queryKey: ["voorraad-fles", voorraadId] });
      qc.invalidateQueries({ queryKey: ["voorraad-mutaties", voorraadId] });
      qc.invalidateQueries({ queryKey: ["voorraad"] });
      setMAantal("");
      setMAfnemer("");
      setMNotities("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bewaarMutatie = () => {
    if (mutatieM.isPending) return;
    const validatie = valideerVoorraadMutatie({
      voorraad: voorraadId,
      mutatie_type: mType,
      aantal: mAantal ? Number(mAantal) : undefined,
      datum: mDatum,
      ingevoerd_door: invoerder,
    });
    if (!isGeldig(validatie)) {
      setMFouten(foutenPerVeld(validatie));
      toast.error(validatie[0].bericht);
      return;
    }
    setMFouten({});
    mutatieM.mutate();
  };

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";
  const statusInfo = voorraad ? VOORRAAD_STATUSSEN.find((s) => s.value === voorraad.status) : null;

  if (voorraadQ.isError || (voorraadQ.isFetched && !voorraad)) {
    return (
      <>
        <AppHeader back title="Voorraad" />
        <div className="mx-auto max-w-screen-md px-3 py-4">
          <ErrorState
            message="Voorraadrecord niet gevonden of geen verbinding."
            onRetry={() => voorraadQ.refetch()}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader
        back
        title={voorraad?.wijnnaam ?? "Voorraad"}
        subtitle={voorraad ? `${voorraad.jaargang ?? ""}` : ""}
      />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4 print:max-w-none">
        <div className="flex justify-end print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium"
          >
            <Printer className="h-4 w-4" /> Traceerbaarheidsrapport printen
          </button>
        </div>
        {/* Statuspaneel */}
        <section
          className="rounded-xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] print:border print:bg-white print:text-black"
          style={{ backgroundColor: "var(--nav)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-white print:text-black">
                {voorraad?.wijnnaam}
              </p>
              <p className="text-xs text-white/80 print:text-black/70">
                {voorraad?.locatie || "Geen locatie ingesteld"}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ backgroundColor: "var(--accent-gold)", color: "#1a1a1a" }}
            >
              {statusInfo?.emoji} {statusInfo?.label}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--accent-gold)" }}
              >
                Nu op voorraad
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-white print:text-black">
                {voorraad?.aantal_huidig}
              </p>
            </div>
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--accent-gold)" }}
              >
                Beginvoorraad
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-white print:text-black">
                {voorraad?.aantal_beginvoorraad}
              </p>
            </div>
          </div>
        </section>

        {/* Herkomst: voorraad -> bottelronde -> partij -> tank -> rij */}
        <section className="rounded-2xl border border-border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Herkomst
          </h2>
          <ul className="space-y-1.5 text-sm">
            {bottelrondeQ.data && (
              <li>
                Gebotteld{" "}
                {format(parseISO(bottelrondeQ.data.botteldatum), "d MMM yyyy", { locale: nl })} ·{" "}
                {bottelrondeQ.data.aantal_flessen} flessen × {bottelrondeQ.data.flesinhoud_ml} ml
                {bottelrondeQ.data.lotnummer ? ` · lot ${bottelrondeQ.data.lotnummer}` : ""}
              </li>
            )}
            {partijQ.data && (
              <li>
                Partij:{" "}
                <Link
                  to="/kelder/partijen/$partijId"
                  params={{ partijId: partijQ.data.id }}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {partijQ.data.naam} ({partijQ.data.jaargang})
                </Link>
              </li>
            )}
            {tank && (
              <li>
                Gebotteld vanuit tank:{" "}
                <Link
                  to="/kelder/tanks/$tankId"
                  params={{ tankId: tank.id }}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Tank {tank.code}
                </Link>
              </li>
            )}
            {oogstVanPartij.map((o) => (
              <li key={o.id}>
                Geoogst: {o.kg} kg {o.ras} op{" "}
                {format(parseISO(o.datum), "d MMM yyyy", { locale: nl })}
                {o.rij ? (
                  <>
                    {" "}
                    ·{" "}
                    <Link
                      to="/rij/$rijId"
                      params={{ rijId: o.rij }}
                      className="text-primary underline-offset-2 hover:underline print:text-black print:no-underline"
                    >
                      rij bekijken
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {/* Mutatie toevoegen */}
        <button
          type="button"
          onClick={() => setToonMutatie((v) => !v)}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold active:scale-[0.98] print:hidden ${
            toonMutatie
              ? "border border-primary bg-primary-soft text-primary"
              : "bg-primary text-primary-foreground"
          }`}
        >
          <Plus className="h-4 w-4" />
          Mutatie toevoegen
        </button>

        {toonMutatie && (
          <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4 print:hidden">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Type</span>
                <select
                  value={mType}
                  onChange={(e) => setMType(e.target.value as VoorraadMutatieType)}
                  className={veldClass}
                >
                  {VOORRAAD_MUTATIE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.emoji} {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  Aantal {mType === "correctie" ? "(± getal)" : ""}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={mAantal}
                  onChange={(e) => setMAantal(e.target.value)}
                  className={`${veldClass} ${mFouten.aantal ? "border-destructive" : ""}`}
                  placeholder="bijv. 12"
                />
                {mFouten.aantal && (
                  <span className="mt-1 block text-xs text-destructive">{mFouten.aantal}</span>
                )}
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Datum</span>
                <input
                  type="date"
                  value={mDatum}
                  onChange={(e) => setMDatum(e.target.value)}
                  className={veldClass}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Afnemer / reden</span>
                <input
                  value={mAfnemer}
                  onChange={(e) => setMAfnemer(e.target.value)}
                  className={veldClass}
                  placeholder="Optioneel…"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Notities</span>
              <input
                value={mNotities}
                onChange={(e) => setMNotities(e.target.value)}
                className={veldClass}
                placeholder="Optioneel…"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Ingevoerd door</span>
              <input
                value={invoerder}
                onChange={(e) => setInvoerder(e.target.value)}
                className={`${veldClass} ${mFouten.ingevoerd_door ? "border-destructive" : ""}`}
              />
            </label>
            <button
              type="button"
              onClick={bewaarMutatie}
              disabled={mutatieM.isPending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {mutatieM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Mutatie opslaan
            </button>
          </section>
        )}

        {/* Mutatiehistorie */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Mutaties ({mutatiesQ.data?.length ?? 0})
          </h2>
          {(mutatiesQ.data ?? []).length === 0 ? (
            <EmptyState message="Nog geen mutaties." />
          ) : (
            <ul className="space-y-1.5">
              {(mutatiesQ.data ?? []).map((m) => {
                const info = VOORRAAD_MUTATIE_TYPES.find((t) => t.value === m.mutatie_type);
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {info?.emoji} {info?.label ?? m.mutatie_type}
                        {m.afnemer_of_reden ? ` · ${m.afnemer_of_reden}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(m.datum), "d MMM yyyy", { locale: nl })}
                        {m.notities ? ` · ${m.notities}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        m.aantal > 0 ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {m.aantal > 0 ? "+" : ""}
                      {m.aantal}
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
