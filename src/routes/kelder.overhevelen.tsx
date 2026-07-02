import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { boekTankboek, fetchTanks } from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { foutenPerVeld, isGeldig, valideerBoeking } from "@/lib/validatie";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { ArrowDown, Loader2 } from "lucide-react";

interface OverhevelenSearch {
  van?: string;
  partij?: string;
}

export const Route = createFileRoute("/kelder/overhevelen")({
  component: OverhevelenPage,
  validateSearch: (search: Record<string, unknown>): OverhevelenSearch => ({
    van: typeof search.van === "string" ? search.van : undefined,
    partij: typeof search.partij === "string" ? search.partij : undefined,
  }),
  head: () => ({ meta: [{ title: "Overhevelen — Kelder" }] }),
});

function OverhevelenPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [invoerder, setInvoerder] = useInvoerder();
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });

  const [vanTank, setVanTank] = useState(search.van ?? "");
  const [naarTank, setNaarTank] = useState("");
  const [volume, setVolume] = useState("");
  const [datum, setDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [notitie, setNotitie] = useState("");
  const [fouten, setFouten] = useState<Record<string, string>>({});

  const bron = useMemo(() => tanksQ.data?.find((t) => t.id === vanTank), [tanksQ.data, vanTank]);
  // de partij volgt uit de brontank — overhevelen kan alleen wat er echt in zit
  const partij = useMemo(
    () => partijenQ.data?.find((p) => p.id === bron?.huidige_partij),
    [partijenQ.data, bron],
  );

  const bronTanks = useMemo(
    () => (tanksQ.data ?? []).filter((t) => t.huidig_volume_l > 0),
    [tanksQ.data],
  );
  const doelTanks = useMemo(
    () =>
      (tanksQ.data ?? []).filter(
        (t) =>
          t.id !== vanTank &&
          t.status !== "reiniging" &&
          t.status !== "defect" &&
          (!t.huidige_partij || t.huidige_partij === bron?.huidige_partij),
      ),
    [tanksQ.data, vanTank, bron],
  );

  const m = useMutation({
    mutationFn: () =>
      boekTankboek({
        datum,
        partij: partij!.id,
        producent: partij?.producent ?? undefined,
        actie: "overhevelen",
        van_tank: vanTank,
        naar_tank: naarTank,
        volume_l: Number(volume),
        verantwoordelijke: invoerder,
        notitie,
      }),
    onSuccess: (r) => {
      toast.success("Overheveling geboekt ✓");
      if (r.waarschuwing) toast.warning(r.waarschuwing);
      qc.invalidateQueries({ queryKey: ["tanks"] });
      qc.invalidateQueries({ queryKey: ["tankboek"] });
      navigate({ to: "/kelder" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSave = () => {
    if (m.isPending) return;
    const validatie = valideerBoeking({
      partij: partij?.id,
      actie: "overhevelen",
      datum,
      van_tank: vanTank,
      naar_tank: naarTank,
      volume_l: volume ? Number(volume) : undefined,
      verantwoordelijke: invoerder,
    });
    if (!partij) validatie.unshift({ veld: "van_tank", bericht: "Kies een gevulde brontank" });
    if (!isGeldig(validatie)) {
      setFouten(foutenPerVeld(validatie));
      toast.error(validatie[0].bericht);
      return;
    }
    setFouten({});
    m.mutate();
  };

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  return (
    <>
      <AppHeader back title="Overhevelen" subtitle="Tank naar tank" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Van tank</span>
            <select
              value={vanTank}
              onChange={(e) => {
                setVanTank(e.target.value);
                setNaarTank("");
              }}
              className={`${veldClass} ${fouten.van_tank ? "border-destructive" : ""}`}
            >
              <option value="">Kies brontank…</option>
              {bronTanks.map((t) => (
                <option key={t.id} value={t.id}>
                  Tank {t.code} · {Math.round(t.huidig_volume_l)} L
                </option>
              ))}
            </select>
            {fouten.van_tank && (
              <span className="mt-1 block text-sm text-destructive">{fouten.van_tank}</span>
            )}
          </label>

          {bron && partij && (
            <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm">
              {partij.naam} · {partij.jaargang} — systeem toont{" "}
              <strong>{Math.round(bron.huidig_volume_l)} L</strong> in tank {bron.code}
            </p>
          )}

          <div className="flex justify-center">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Naar tank</span>
            <select
              value={naarTank}
              onChange={(e) => setNaarTank(e.target.value)}
              className={`${veldClass} ${fouten.naar_tank ? "border-destructive" : ""}`}
            >
              <option value="">Kies doeltank…</option>
              {doelTanks.map((t) => (
                <option key={t.id} value={t.id}>
                  Tank {t.code} · {t.soort}
                  {t.capaciteit_l > 0
                    ? ` (${Math.round(t.capaciteit_l - t.huidig_volume_l)} L vrij)`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Volume (L)</span>
              <input
                type="number"
                inputMode="decimal"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className={`${veldClass} ${fouten.volume_l ? "border-destructive" : ""}`}
                placeholder={bron ? `max ${Math.round(bron.huidig_volume_l)}` : ""}
              />
              {fouten.volume_l && (
                <span className="mt-1 block text-sm text-destructive">{fouten.volume_l}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Datum</span>
              <input
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className={`${veldClass} ${fouten.datum ? "border-destructive" : ""}`}
              />
            </label>
          </div>
          {bron && volume && Number(volume) === Math.round(bron.huidig_volume_l) && (
            <p className="text-xs text-muted-foreground">
              Volledig overhevelen: tank {bron.code} komt hiermee leeg te staan.
            </p>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Verantwoordelijke</span>
            <input
              value={invoerder}
              onChange={(e) => setInvoerder(e.target.value)}
              className={`${veldClass} ${fouten.verantwoordelijke ? "border-destructive" : ""}`}
              placeholder="Je naam"
            />
            {fouten.verantwoordelijke && (
              <span className="mt-1 block text-sm text-destructive">
                {fouten.verantwoordelijke}
              </span>
            )}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Notitie / reden</span>
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
            Overheveling boeken
          </button>
          <p className="text-xs text-muted-foreground">
            De server controleert capaciteit, inhoud en partij vóór het boeken; bij een verschil
            tussen systeem en werkelijkheid wordt de boeking geweigerd met uitleg.
          </p>
        </section>
      </div>
    </>
  );
}
