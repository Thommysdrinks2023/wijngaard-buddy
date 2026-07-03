// Trailing-underscore-escape ($partijId_): deze route hangt bewust NIET onder
// kelder.partijen.$partijId.tsx (dat heeft geen <Outlet/> en is zelf al een
// volledige pagina) — zie CLAUDE.md, "TanStack Router — routes onder een
// bestaande pagina nesten automatisch".
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  createBottelrondeViaEndpoint,
  fetchProducenten,
  fetchTanks,
  fetchVoedingswaardeBerekeningen,
} from "@/lib/kelder-data";
import { fetchPartijById } from "@/lib/partijen-data";
import { foutenPerVeld, isGeldig, valideerBottelronde } from "@/lib/validatie";
import { useInvoerder } from "@/lib/use-invoerder";
import {
  VEELGEBRUIKTE_FLESINHOUD_ML,
  VEELGEBRUIKTE_FLESKLEUREN,
  VEELGEBRUIKTE_FLESTYPES,
} from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/error-state";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/kelder/partijen/$partijId_/bottelen")({
  component: BottelenPage,
  head: () => ({ meta: [{ title: "Bottelen — Kelder" }] }),
});

function BottelenPage() {
  const { partijId } = Route.useParams();
  const navigate = useNavigate();
  const [invoerder, setInvoerder] = useInvoerder();

  const partijQ = useQuery({
    queryKey: ["partij", partijId],
    queryFn: () => fetchPartijById(partijId),
  });
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const producentenQ = useQuery({ queryKey: ["producenten"], queryFn: fetchProducenten });
  const voedingswaardeQ = useQuery({
    queryKey: ["voedingswaarde", partijId],
    queryFn: () => fetchVoedingswaardeBerekeningen(partijId),
  });

  const partij = partijQ.data;
  const tanksVanPartij = useMemo(
    () => (tanksQ.data ?? []).filter((t) => t.huidige_partij === partijId),
    [tanksQ.data, partijId],
  );

  const [stap, setStap] = useState<"formulier" | "bevestiging">("formulier");
  const [botteldatum, setBotteldatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [vanTank, setVanTank] = useState("");
  const [aantalFlessen, setAantalFlessen] = useState("");
  const [flesinhoudMl, setFlesinhoudMl] = useState("750");
  const [flestype, setFlestype] = useState("");
  const [kleurFles, setKleurFles] = useState("");
  const [parelwijn, setParelwijn] = useState(false);
  const [lotnummer, setLotnummer] = useState(() => partij?.lotnummer ?? "");
  const [voedingswaardeId, setVoedingswaardeId] = useState("");
  const [notities, setNotities] = useState("");
  const [fouten, setFouten] = useState<Record<string, string>>({});

  // lotnummer pas invullen zodra de partij geladen is (query kan later klaar zijn dan de eerste render)
  useMemo(() => {
    if (partij?.lotnummer && !lotnummer) setLotnummer(partij.lotnummer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partij]);

  const gekozenTank = tanksVanPartij.find((t) => t.id === vanTank);
  const volumeL =
    aantalFlessen && flesinhoudMl ? (Number(aantalFlessen) * Number(flesinhoudMl)) / 1000 : 0;
  const resterendNaTank = gekozenTank ? gekozenTank.huidig_volume_l - volumeL : null;

  const m = useMutation({
    mutationFn: () =>
      createBottelrondeViaEndpoint({
        partij: partijId,
        producent: partij?.producent ?? undefined,
        van_tank: vanTank,
        botteldatum,
        aantal_flessen: Number(aantalFlessen),
        flesinhoud_ml: Number(flesinhoudMl),
        flestype,
        kleur_fles: kleurFles,
        parelwijn,
        lotnummer,
        voedingswaarde_berekening: voedingswaardeId || null,
        notities,
        ingevoerd_door: invoerder,
      }),
    onSuccess: (r) => {
      toast.success("Bottelronde vastgelegd ✓");
      if (r.waarschuwing) toast.warning(r.waarschuwing);
      navigate({ to: "/voorraad/$voorraadId", params: { voorraadId: r.voorraad_id } });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setStap("formulier");
    },
  });

  const naarBevestiging = () => {
    const validatie = valideerBottelronde({
      partij: partijId,
      van_tank: vanTank,
      botteldatum,
      aantal_flessen: aantalFlessen ? Number(aantalFlessen) : undefined,
      flesinhoud_ml: flesinhoudMl ? Number(flesinhoudMl) : undefined,
      ingevoerd_door: invoerder,
    });
    if (!isGeldig(validatie)) {
      setFouten(foutenPerVeld(validatie));
      toast.error(validatie[0].bericht);
      return;
    }
    if (resterendNaTank != null && resterendNaTank < 0) {
      toast.error(
        `Tank ${gekozenTank?.code} heeft maar ${gekozenTank?.huidig_volume_l} L — dit bottelt ${volumeL.toFixed(1)} L, dat past niet.`,
      );
      return;
    }
    setFouten({});
    setStap("bevestiging");
  };

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  if (partijQ.isError || (partijQ.isFetched && !partij)) {
    return (
      <>
        <AppHeader back title="Bottelen" />
        <div className="mx-auto max-w-screen-md px-3 py-4">
          <ErrorState
            message="Partij niet gevonden of geen verbinding."
            onRetry={() => partijQ.refetch()}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader
        back
        title="Bottelen"
        subtitle={partij ? `${partij.naam} · ${partij.jaargang}` : ""}
      />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        {stap === "formulier" && (
          <>
            <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Botteldatum</span>
                  <input
                    type="date"
                    value={botteldatum}
                    onChange={(e) => setBotteldatum(e.target.value)}
                    className={veldClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Van tank</span>
                  <select
                    value={vanTank}
                    onChange={(e) => setVanTank(e.target.value)}
                    className={`${veldClass} ${fouten.van_tank ? "border-destructive" : ""}`}
                  >
                    <option value="">Kies tank…</option>
                    {tanksVanPartij.map((t) => (
                      <option key={t.id} value={t.id}>
                        Tank {t.code} · {t.soort} ({t.huidig_volume_l} L)
                      </option>
                    ))}
                  </select>
                  {fouten.van_tank && (
                    <span className="mt-1 block text-sm text-destructive">{fouten.van_tank}</span>
                  )}
                  {tanksVanPartij.length === 0 && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Deze partij staat momenteel op geen enkele tank.
                    </span>
                  )}
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Aantal flessen</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={aantalFlessen}
                    onChange={(e) => setAantalFlessen(e.target.value)}
                    className={`${veldClass} ${fouten.aantal_flessen ? "border-destructive" : ""}`}
                    placeholder="bijv. 300"
                  />
                  {fouten.aantal_flessen && (
                    <span className="mt-1 block text-sm text-destructive">
                      {fouten.aantal_flessen}
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Flesinhoud (ml)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    list="flesinhoud-suggesties"
                    value={flesinhoudMl}
                    onChange={(e) => setFlesinhoudMl(e.target.value)}
                    className={`${veldClass} ${fouten.flesinhoud_ml ? "border-destructive" : ""}`}
                  />
                  <datalist id="flesinhoud-suggesties">
                    {VEELGEBRUIKTE_FLESINHOUD_ML.map((ml) => (
                      <option key={ml} value={ml} />
                    ))}
                  </datalist>
                  {fouten.flesinhoud_ml && (
                    <span className="mt-1 block text-sm text-destructive">
                      {fouten.flesinhoud_ml}
                    </span>
                  )}
                </label>
              </div>

              {volumeL > 0 && (
                <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm">
                  Dit is {volumeL.toFixed(1)} L wijn
                  {gekozenTank
                    ? ` — tank ${gekozenTank.code} heeft nu ${gekozenTank.huidig_volume_l} L`
                    : ""}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Flestype</span>
                  <input
                    list="flestype-suggesties"
                    value={flestype}
                    onChange={(e) => setFlestype(e.target.value)}
                    className={veldClass}
                    placeholder="bijv. Bordeaux-fles"
                  />
                  <datalist id="flestype-suggesties">
                    {VEELGEBRUIKTE_FLESTYPES.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Kleur fles</span>
                  <input
                    list="fleskleur-suggesties"
                    value={kleurFles}
                    onChange={(e) => setKleurFles(e.target.value)}
                    className={veldClass}
                    placeholder="bijv. Antiek groen"
                  />
                  <datalist id="fleskleur-suggesties">
                    {VEELGEBRUIKTE_FLESKLEUREN.map((k) => (
                      <option key={k} value={k} />
                    ))}
                  </datalist>
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={parelwijn}
                  onChange={(e) => setParelwijn(e.target.checked)}
                  className="h-5 w-5 rounded border-input"
                />
                Parelwijn
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Lotnummer</span>
                <input
                  value={lotnummer}
                  onChange={(e) => setLotnummer(e.target.value)}
                  className={veldClass}
                  placeholder="Optioneel…"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Voedingswaarde-etiket</span>
                {(voedingswaardeQ.data ?? []).length > 0 ? (
                  <select
                    value={voedingswaardeId}
                    onChange={(e) => setVoedingswaardeId(e.target.value)}
                    className={veldClass}
                  >
                    <option value="">Geen koppelen</option>
                    {(voedingswaardeQ.data ?? []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.berekening_datum} · {v.kcal_totaal} kcal
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    Nog geen voedingswaarde berekend voor deze partij — dat hoeft niet nu, maar kan
                    straks op{" "}
                    <Link
                      to="/kelder/partijen/$partijId"
                      params={{ partijId }}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      partijdetail → Voedingswaarde berekenen
                    </Link>
                    .
                  </p>
                )}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Notities</span>
                <input
                  value={notities}
                  onChange={(e) => setNotities(e.target.value)}
                  className={veldClass}
                  placeholder="Optioneel…"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Ingevoerd door</span>
                <input
                  value={invoerder}
                  onChange={(e) => setInvoerder(e.target.value)}
                  className={`${veldClass} ${fouten.ingevoerd_door ? "border-destructive" : ""}`}
                />
                {fouten.ingevoerd_door && (
                  <span className="mt-1 block text-sm text-destructive">
                    {fouten.ingevoerd_door}
                  </span>
                )}
              </label>
            </section>

            <button
              type="button"
              onClick={naarBevestiging}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground"
            >
              Controleren
            </button>
          </>
        )}

        {stap === "bevestiging" && gekozenTank && (
          <>
            <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Controleer vóór het boeken
              </h2>
              <p className="text-sm">
                Er wordt <strong>{volumeL.toFixed(1)} L</strong> afgeboekt uit{" "}
                <strong>tank {gekozenTank.code}</strong> (nu {gekozenTank.huidig_volume_l} L).
              </p>
              <p className="text-sm">
                Resterend in tank {gekozenTank.code} na deze boeking:{" "}
                <strong>{resterendNaTank?.toFixed(1)} L</strong>
                {resterendNaTank != null && resterendNaTank <= 0
                  ? " — tank wordt daarna leeg gemeld."
                  : ""}
              </p>
              <p className="text-sm">
                Er komt een voorraadrecord van <strong>{aantalFlessen} flessen</strong> ×{" "}
                {flesinhoudMl} ml bij ({partij?.naam} {partij?.jaargang}).
              </p>
            </section>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStap("formulier")}
                disabled={m.isPending}
                className="h-14 flex-1 rounded-2xl border border-border bg-card text-base font-semibold disabled:opacity-50"
              >
                Terug
              </button>
              <button
                type="button"
                onClick={() => m.mutate()}
                disabled={m.isPending}
                className="flex h-14 flex-[2] items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
              >
                {m.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                Bevestig en bottel
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
