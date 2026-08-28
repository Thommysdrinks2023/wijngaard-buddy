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
  fetchAnalyses,
  fetchEigenaars,
  fetchTanks,
  fetchVoedingswaardeBerekeningen,
} from "@/lib/kelder-data";
import { fetchPartijById } from "@/lib/partijen-data";
import {
  fetchAccijnsCategorieen,
  fetchFlessenStanden,
  fetchFlestypes,
  stelCategorieVoor,
} from "@/lib/flessen-data";
import { foutenPerVeld, isGeldig, valideerBottelronde } from "@/lib/validatie";
import { useInvoerder } from "@/lib/use-invoerder";
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
  const eigenaarsQ = useQuery({ queryKey: ["eigenaars"], queryFn: fetchEigenaars });
  const voedingswaardeQ = useQuery({
    queryKey: ["voedingswaarde", partijId],
    queryFn: () => fetchVoedingswaardeBerekeningen(partijId),
  });
  // Fase 15 Blok C — flestypes, hun huidige stand en de accijnscategorieën.
  const flestypesQ = useQuery({
    queryKey: ["flestypes", { alleenActief: true }],
    queryFn: () => fetchFlestypes({ alleenActief: true }),
  });
  const standenQ = useQuery({ queryKey: ["flessen-standen"], queryFn: fetchFlessenStanden });
  const categorieenQ = useQuery({
    queryKey: ["accijns-categorieen"],
    queryFn: fetchAccijnsCategorieen,
  });
  const analysesQ = useQuery({
    queryKey: ["analyses", partijId],
    queryFn: () => fetchAnalyses(partijId),
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
  const [flessenBreuk, setFlessenBreuk] = useState("");
  const [flestypeRef, setFlestypeRef] = useState("");
  const [volumeUitTank, setVolumeUitTank] = useState("");
  const [accijnsCategorie, setAccijnsCategorie] = useState("");
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
  const gekozenFlestype = (flestypesQ.data ?? []).find((t) => t.id === flestypeRef);
  const flesinhoudMl = gekozenFlestype?.inhoud_ml ?? 0;

  // Bij het kiezen van een tank het tankvolume voorstellen als "volume uit
  // tank": een bottelronde leegt normaal de tank. Blijft aanpasbaar — soms
  // wordt maar een deel gebotteld.
  const kiesTank = (id: string) => {
    setVanTank(id);
    const tank = tanksVanPartij.find((t) => t.id === id);
    if (tank && !volumeUitTank) setVolumeUitTank(String(tank.huidig_volume_l));
  };

  // Alcoholpercentage uit de meest recente analyse — alleen om een categorie
  // VOOR te stellen, nooit om er zelf een te kiezen (productiewijze bepaalt
  // wijn vs. overige gegiste drank, en dat weet de app niet).
  const laatsteAlcohol = useMemo(() => {
    const metAlcohol = (analysesQ.data ?? []).find(
      (a) => a.alcohol_pct != null && a.alcohol_pct > 0,
    );
    return metAlcohol?.alcohol_pct ?? null;
  }, [analysesQ.data]);

  const voorstelCategorie = useMemo(
    () =>
      stelCategorieVoor(categorieenQ.data ?? [], {
        alcoholPct: laatsteAlcohol,
        parelwijn,
      }),
    [categorieenQ.data, laatsteAlcohol, parelwijn],
  );

  const gebotteldL =
    aantalFlessen && flesinhoudMl ? (Number(aantalFlessen) * flesinhoudMl) / 1000 : 0;
  const uitTankL = volumeUitTank ? Number(volumeUitTank) : 0;
  const bottelverliesL = uitTankL > 0 && gebotteldL > 0 ? uitTankL - gebotteldL : 0;
  const bottelverliesPct = uitTankL > 0 ? (bottelverliesL / uitTankL) * 100 : 0;
  const resterendNaTank = gekozenTank ? gekozenTank.huidig_volume_l - uitTankL : null;

  const flessenNodig = Number(aantalFlessen || 0) + Number(flessenBreuk || 0);
  const flessenStand = flestypeRef ? (standenQ.data?.[flestypeRef] ?? 0) : null;
  const flessenTekort = flessenStand != null && flessenNodig > flessenStand;

  const m = useMutation({
    mutationFn: () =>
      createBottelrondeViaEndpoint({
        partij: partijId,
        eigenaar: partij?.eigenaar ?? undefined,
        van_tank: vanTank,
        botteldatum,
        aantal_flessen: Number(aantalFlessen),
        aantal_flessen_gevuld: Number(aantalFlessen),
        flessen_breuk: flessenBreuk ? Number(flessenBreuk) : undefined,
        volume_uit_tank_l: uitTankL,
        flesinhoud_ml: flesinhoudMl,
        flestype_ref: flestypeRef || undefined,
        accijns_categorie: accijnsCategorie || undefined,
        // De oude vrije-tekstvelden blijven gevuld met wat het flestype zegt,
        // zodat schermen die er nog op lezen niet leeglopen.
        flestype: gekozenFlestype?.vorm ?? "",
        kleur_fles: gekozenFlestype?.kleur ?? "",
        parelwijn,
        lotnummer,
        voedingswaarde_berekening: voedingswaardeId || null,
        notities,
        ingevoerd_door: invoerder,
      }),
    onSuccess: (r) => {
      toast.success("Bottelronde vastgelegd ✓");
      if (r.waarschuwing) toast.warning(r.waarschuwing, { duration: 10_000 });
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
      flesinhoud_ml: flesinhoudMl || undefined,
      ingevoerd_door: invoerder,
    });
    if (!isGeldig(validatie)) {
      setFouten(foutenPerVeld(validatie));
      toast.error(validatie[0].bericht);
      return;
    }
    if (!flestypeRef) {
      setFouten({ flestype_ref: "Kies een flestype" });
      toast.error("Kies een flestype — daarmee wordt de flessenvoorraad afgeboekt.");
      return;
    }
    if (uitTankL <= 0) {
      setFouten({ volume_uit_tank_l: "Vul het volume in dat uit de tank gaat" });
      toast.error("Vul in hoeveel liter er uit de tank gaat.");
      return;
    }
    if (bottelverliesL < 0) {
      toast.error(
        `Er kan niet meer gebotteld worden (${gebotteldL.toFixed(1)} L) dan er uit de tank gaat (${uitTankL.toFixed(1)} L).`,
      );
      return;
    }
    if (resterendNaTank != null && resterendNaTank < 0) {
      toast.error(
        `Tank ${gekozenTank?.code} heeft maar ${gekozenTank?.huidig_volume_l} L — je boekt ${uitTankL.toFixed(1)} L af, dat past niet.`,
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
                    onChange={(e) => kiesTank(e.target.value)}
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

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Flestype</span>
                <select
                  value={flestypeRef}
                  onChange={(e) => setFlestypeRef(e.target.value)}
                  className={`${veldClass} ${fouten.flestype_ref ? "border-destructive" : ""}`}
                >
                  <option value="">Kies flestype…</option>
                  {(flestypesQ.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.omschrijving || `${t.vorm} ${t.inhoud_ml} ml`} ·{" "}
                      {standenQ.data?.[t.id] ?? 0} op voorraad
                    </option>
                  ))}
                </select>
                {fouten.flestype_ref && (
                  <span className="mt-1 block text-sm text-destructive">{fouten.flestype_ref}</span>
                )}
                {(flestypesQ.data ?? []).length === 0 && !flestypesQ.isLoading && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Nog geen flestypes — voeg ze toe onder Instellingen → Flestypes.
                  </span>
                )}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Flessen gevuld</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={aantalFlessen}
                    onChange={(e) => setAantalFlessen(e.target.value)}
                    className={`${veldClass} ${fouten.aantal_flessen ? "border-destructive" : ""}`}
                    placeholder="bijv. 1980"
                  />
                  {fouten.aantal_flessen && (
                    <span className="mt-1 block text-sm text-destructive">
                      {fouten.aantal_flessen}
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Breuk (optioneel)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={flessenBreuk}
                    onChange={(e) => setFlessenBreuk(e.target.value)}
                    className={veldClass}
                    placeholder="0"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Volume uit de tank (L)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={volumeUitTank}
                  onChange={(e) => setVolumeUitTank(e.target.value)}
                  className={`${veldClass} ${fouten.volume_uit_tank_l ? "border-destructive" : ""}`}
                  placeholder="bijv. 1500"
                />
                {fouten.volume_uit_tank_l ? (
                  <span className="mt-1 block text-sm text-destructive">
                    {fouten.volume_uit_tank_l}
                  </span>
                ) : (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Wat er werkelijk uit de tank gaat. Het verschil met wat er in de flessen komt is
                    het bottelverlies.
                  </span>
                )}
              </label>

              {gebotteldL > 0 && uitTankL > 0 && (
                <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm">
                  <p>
                    In de flessen: <strong>{gebotteldL.toFixed(1)} L</strong> · uit de tank:{" "}
                    <strong>{uitTankL.toFixed(1)} L</strong>
                  </p>
                  <p className={bottelverliesL < 0 ? "text-destructive" : ""}>
                    Bottelverlies: <strong>{bottelverliesL.toFixed(1)} L</strong> (
                    {bottelverliesPct.toFixed(1)}%)
                    {bottelverliesL < 0 && " — dat kan niet, controleer de aantallen."}
                  </p>
                </div>
              )}

              {flessenTekort && (
                <p
                  role="status"
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                >
                  De flessenvoorraad toont <strong>{flessenStand}</strong> stuks, maar je hebt er{" "}
                  <strong>{flessenNodig}</strong> nodig. Dit blokkeert het bottelen niet — de
                  fysieke werkelijkheid wint — maar boek daarna een telcorrectie op dit flestype.
                </p>
              )}

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Accijnscategorie</span>
                <select
                  value={accijnsCategorie}
                  onChange={(e) => setAccijnsCategorie(e.target.value)}
                  className={veldClass}
                >
                  <option value="">Kies categorie…</option>
                  {(categorieenQ.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.naam}
                    </option>
                  ))}
                </select>
                {voorstelCategorie && accijnsCategorie !== voorstelCategorie.id && (
                  <button
                    type="button"
                    onClick={() => setAccijnsCategorie(voorstelCategorie.id)}
                    className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
                  >
                    Voorstel op basis van {laatsteAlcohol}% vol: {voorstelCategorie.naam} —
                    gebruiken
                  </button>
                )}
                <span className="mt-1 block text-xs text-muted-foreground">
                  Wijn of overige gegiste drank hangt af van de productiewijze, niet alleen van het
                  percentage — bevestig zelf.
                </span>
              </label>

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
                Er wordt <strong>{uitTankL.toFixed(1)} L</strong> afgeboekt uit{" "}
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

              {/* Fase 15 Blok C — het bottelverlies is het getal dat bij een
                  controle verklaard moet worden, dus het staat hier expliciet
                  en niet verstopt in een detailscherm. */}
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                Bottelverlies: <strong>{bottelverliesL.toFixed(1)} L</strong> (
                {bottelverliesPct.toFixed(1)}%) — {uitTankL.toFixed(1)} L uit de tank versus{" "}
                {gebotteldL.toFixed(1)} L in de flessen.
              </p>

              <p className="text-sm">
                Flessenvoorraad <strong>{gekozenFlestype?.omschrijving}</strong>: −{flessenNodig}
                {Number(flessenBreuk || 0) > 0
                  ? ` (${aantalFlessen} gevuld + ${flessenBreuk} breuk)`
                  : ""}
                {flessenStand != null
                  ? ` · van ${flessenStand} naar ${flessenStand - flessenNodig}`
                  : ""}
                .
              </p>

              <p className="text-sm">
                Accijnsplichtig volume: <strong>{gebotteldL.toFixed(1)} L</strong>
                {accijnsCategorie
                  ? ` · ${(categorieenQ.data ?? []).find((c) => c.id === accijnsCategorie)?.naam}`
                  : " · geen categorie gekozen"}
                .
              </p>
              <p className="text-xs text-muted-foreground">
                Het belastbare moment is botteling: over elke gevulde fles is na deze boeking
                accijns afgedragen. Breuk telt niet mee — die flessen komen nooit in de handel.
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
