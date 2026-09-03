import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import {
  createKlant,
  createOrder,
  fetchKlanten,
  fetchOrders,
  leverOrder,
  omzetPerSleutel,
  updateOrderStatus,
  verweesdeKlanten,
  verwijderConceptOrder,
  verwijderKlant,
} from "@/lib/verkoop-data";
import { fetchRegelgevingInstellingen } from "@/lib/regelgeving-data";
import { fetchVoorraadFlessen } from "@/lib/kelder-data";
import { exporteerCsv } from "@/lib/csv-export";
import { useInvoerder } from "@/lib/use-invoerder";
import { KLANT_TYPES, ORDER_STATUSSEN, type KlantType, type OrderRegel } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";
import { Loader2, Plus, Sheet, ShoppingCart, Trash2, Truck, UserPlus } from "lucide-react";

// Eindsprint Blok L — verkoop licht. Bewust géén facturatie/btw: dat blijft
// in de boekhouding (zie de melding onderaan de pagina). Leveren loopt via
// het atomische order-leveren-endpoint; de voorraadmutatie is de bron van
// waarheid, dit scherm is de administratie eromheen.
export const Route = createFileRoute("/verkoop")({
  component: VerkoopPage,
  head: () => ({ meta: [{ title: "Verkoop — De Tappenmars Buddy" }] }),
});

const veldClass = "h-11 w-full rounded-xl border border-input bg-card px-3 text-sm";

// Fase 7 Blok A (AVG): klanten zonder orders ouder dan de bewaartermijn.
// Alleen een voorstel — verwijderen is altijd een bewuste klik per klant.
function OpschoonLijst() {
  const qc = useQueryClient();
  const klantenQ = useQuery({ queryKey: ["klanten"], queryFn: fetchKlanten });
  const ordersQ = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const regelgevingQ = useQuery({
    queryKey: ["regelgeving", "verkoop"],
    queryFn: fetchRegelgevingInstellingen,
  });
  const verwijderM = useMutation({
    mutationFn: ({ id, naam }: { id: string; naam: string }) => verwijderKlant(id, naam),
    onSuccess: () => {
      toast.success("Klant verwijderd");
      qc.invalidateQueries({ queryKey: ["klanten"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Verwijderen mislukt"),
  });

  const termijn =
    (regelgevingQ.data ?? []).find((r) => r.sleutel === "klant_bewaartermijn_maanden")?.waarde ??
    24;
  const verweesd = verweesdeKlanten(klantenQ.data ?? [], ordersQ.data ?? [], termijn);
  if (verweesd.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Opschoonlijst (AVG)
      </h2>
      <p className="text-xs text-muted-foreground">
        Deze klanten hebben geen enkele order en staan langer dan {termijn} maanden in het systeem.
        Verwijderen is een voorstel — niets gebeurt automatisch.
      </p>
      <ul className="space-y-1">
        {verweesd.map((k) => (
          <li
            key={k.id}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            <span className="truncate">{k.naam}</span>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Klant "${k.naam}" definitief verwijderen?`))
                  verwijderM.mutate({ id: k.id, naam: k.naam });
              }}
              className="flex h-11 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 text-xs font-medium text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" /> Verwijderen
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VerkoopPage() {
  const qc = useQueryClient();
  const [invoerder, setInvoerder] = useInvoerder();
  const klantenQ = useQuery({ queryKey: ["klanten"], queryFn: fetchKlanten });
  const ordersQ = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const voorraadQ = useQuery({
    queryKey: ["voorraad", "verkoop"],
    queryFn: () => fetchVoorraadFlessen(),
  });

  const klantNaam = useMemo(() => {
    const m = new Map<string, string>();
    klantenQ.data?.forEach((k) => m.set(k.id, k.naam));
    return m;
  }, [klantenQ.data]);
  const klantType = useMemo(() => {
    const m = new Map<string, string>();
    klantenQ.data?.forEach((k) => m.set(k.id, k.type ?? "particulier"));
    return m;
  }, [klantenQ.data]);
  const wijnNaam = useMemo(() => {
    const m = new Map<string, string>();
    voorraadQ.data?.forEach((v) =>
      m.set(v.id, `${v.wijnnaam}${v.jaargang ? ` ${v.jaargang}` : ""}`),
    );
    return m;
  }, [voorraadQ.data]);

  // ---------- nieuwe klant ----------
  const [toonKlant, setToonKlant] = useState(false);
  const [kNaam, setKNaam] = useState("");
  const [kType, setKType] = useState<KlantType>("particulier");
  const [kContact, setKContact] = useState("");
  const klantM = useMutation({
    mutationFn: () => createKlant({ naam: kNaam, type: kType, contact: kContact }),
    onSuccess: () => {
      toast.success("Klant toegevoegd ✓");
      qc.invalidateQueries({ queryKey: ["klanten"] });
      setKNaam("");
      setKContact("");
      setToonKlant(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------- nieuwe order ----------
  const [toonOrder, setToonOrder] = useState(false);
  const [oKlant, setOKlant] = useState("");
  const [oDatum, setODatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [oRegels, setORegels] = useState<OrderRegel[]>([{ voorraad: "", aantal: 6, prijs: 0 }]);
  const zetRegel = (i: number, deel: Partial<OrderRegel>) =>
    setORegels((r) => r.map((regel, idx) => (idx === i ? { ...regel, ...deel } : regel)));

  const orderM = useMutation({
    mutationFn: () =>
      createOrder({
        klant: oKlant,
        datum: oDatum,
        regels: oRegels.filter((r) => r.voorraad && r.aantal > 0),
        ingevoerd_door: invoerder,
      }),
    onSuccess: () => {
      toast.success("Order aangemaakt (concept) ✓");
      qc.invalidateQueries({ queryKey: ["orders"] });
      setORegels([{ voorraad: "", aantal: 6, prijs: 0 }]);
      setToonOrder(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bewaarOrder = () => {
    if (orderM.isPending) return;
    if (!oKlant) return void toast.error("Kies een klant");
    if (!oRegels.some((r) => r.voorraad && r.aantal > 0))
      return void toast.error("Minstens één orderregel met wijn en aantal");
    orderM.mutate();
  };

  // ---------- leveren / betalen / verwijderen ----------
  const leverM = useMutation({
    mutationFn: (id: string) => leverOrder(id, invoerder),
    onSuccess: () => {
      toast.success("Order geleverd — voorraad bijgewerkt ✓");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["voorraad"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const betaaldM = useMutation({
    mutationFn: (id: string) => updateOrderStatus(id, "betaald"),
    onSuccess: () => {
      toast.success("Order op betaald gezet ✓");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const verwijderM = useMutation({
    mutationFn: (id: string) => verwijderConceptOrder(id),
    onSuccess: () => {
      toast.success("Concept-order verwijderd");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------- verkoopoverzicht ----------
  const omzetPerWijn = useMemo(
    () => omzetPerSleutel(ordersQ.data ?? [], (_o, r) => wijnNaam.get(r.voorraad) ?? "Onbekend"),
    [ordersQ.data, wijnNaam],
  );
  const omzetPerKlanttype = useMemo(
    () =>
      omzetPerSleutel(
        ordersQ.data ?? [],
        (o) => KLANT_TYPES.find((t) => t.value === klantType.get(o.klant))?.label ?? "Onbekend",
      ),
    [ordersQ.data, klantType],
  );
  const totaalOmzet = omzetPerWijn.reduce((acc, r) => acc + r.omzet, 0);
  const totaalFlessen = omzetPerWijn.reduce((acc, r) => acc + r.flessen, 0);

  const euro = (n: number) =>
    n.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

  return (
    <>
      <AppHeader back title="Verkoop" subtitle="Klanten en orders" />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <OfflineWaarschuwing wat="klanten en orders" />
        {/* Kerncijfers */}
        <section
          className="rounded-xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
          style={{ backgroundColor: "var(--nav)" }}
        >
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--accent-gold)" }}
              >
                Omzet (geleverd)
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">{euro(totaalOmzet)}</p>
            </div>
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--accent-gold)" }}
              >
                Flessen verkocht
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">{totaalFlessen}</p>
            </div>
          </div>
        </section>

        {(klantenQ.isError || ordersQ.isError) && (
          <ErrorState
            error={klantenQ.error || ordersQ.error}
            onRetry={() => {
              klantenQ.refetch();
              ordersQ.refetch();
            }}
          />
        )}

        {/* Acties */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setToonOrder((v) => !v)}
            className={`flex h-14 items-center justify-center gap-2 rounded-2xl text-sm font-semibold active:scale-[0.98] ${
              toonOrder
                ? "border border-primary bg-primary-soft text-primary"
                : "bg-primary text-primary-foreground"
            }`}
          >
            <Plus className="h-4 w-4" /> Nieuwe order
          </button>
          <button
            type="button"
            onClick={() => setToonKlant((v) => !v)}
            className={`flex h-14 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold active:scale-[0.98] ${
              toonKlant ? "border-primary bg-primary-soft text-primary" : "border-border bg-card"
            }`}
          >
            <UserPlus className="h-4 w-4" /> Nieuwe klant
          </button>
        </div>

        {/* Nieuwe klant */}
        {toonKlant && (
          <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Nieuwe klant
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Naam</span>
                <input
                  value={kNaam}
                  onChange={(e) => setKNaam(e.target.value)}
                  className={veldClass}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Type</span>
                <select
                  value={kType}
                  onChange={(e) => setKType(e.target.value as KlantType)}
                  className={veldClass}
                >
                  {KLANT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.emoji} {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Contact</span>
              <input
                value={kContact}
                onChange={(e) => setKContact(e.target.value)}
                className={veldClass}
                placeholder="Telefoon of e-mail, optioneel"
              />
            </label>
            <button
              type="button"
              onClick={() => (kNaam.trim() ? klantM.mutate() : toast.error("Naam is verplicht"))}
              disabled={klantM.isPending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {klantM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Klant opslaan
            </button>
          </section>
        )}

        {/* Nieuwe order */}
        {toonOrder && (
          <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Nieuwe order (concept)
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Klant</span>
                <select
                  value={oKlant}
                  onChange={(e) => setOKlant(e.target.value)}
                  className={veldClass}
                >
                  <option value="">Kies klant…</option>
                  {(klantenQ.data ?? []).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.naam}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Datum</span>
                <input
                  type="date"
                  value={oDatum}
                  onChange={(e) => setODatum(e.target.value)}
                  className={veldClass}
                />
              </label>
            </div>
            {oRegels.map((regel, i) => (
              <div key={i} className="grid grid-cols-[1fr_72px_84px] gap-2">
                <select
                  value={regel.voorraad}
                  onChange={(e) => zetRegel(i, { voorraad: e.target.value })}
                  className={veldClass}
                >
                  <option value="">Kies wijn…</option>
                  {(voorraadQ.data ?? [])
                    .filter((v) => v.aantal_huidig > 0)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.wijnnaam} {v.jaargang ?? ""} ({v.aantal_huidig} op voorraad)
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  inputMode="numeric"
                  value={regel.aantal || ""}
                  onChange={(e) => zetRegel(i, { aantal: Number(e.target.value) })}
                  className={veldClass}
                  placeholder="aantal"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  value={regel.prijs || ""}
                  onChange={(e) => zetRegel(i, { prijs: Number(e.target.value) })}
                  className={veldClass}
                  placeholder="€/fles"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setORegels((r) => [...r, { voorraad: "", aantal: 6, prijs: 0 }])}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              + regel toevoegen
            </button>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Ingevoerd door</span>
              <input
                value={invoerder}
                onChange={(e) => setInvoerder(e.target.value)}
                className={veldClass}
              />
            </label>
            <button
              type="button"
              onClick={bewaarOrder}
              disabled={orderM.isPending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {orderM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Order opslaan als concept
            </button>
            <p className="text-xs text-muted-foreground">
              Pas bij "Leveren" wordt de voorraad afgeboekt — alles of niets, met dezelfde controles
              als een handmatige mutatie.
            </p>
          </section>
        )}

        {/* Orders */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Orders ({ordersQ.data?.length ?? 0})
          </h2>
          {(ordersQ.data ?? []).length === 0 ? (
            <EmptyState
              message="Nog geen orders — maak eerst een klant en een order aan."
              icon={<ShoppingCart className="h-6 w-6" />}
            />
          ) : (
            <ul className="space-y-1.5">
              {(ordersQ.data ?? []).map((o) => {
                const info = ORDER_STATUSSEN.find((s) => s.value === o.status);
                const bedrag = o.regels.reduce((acc, r) => acc + r.aantal * (r.prijs || 0), 0);
                return (
                  <li key={o.id} className="rounded-xl border border-border bg-card px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {klantNaam.get(o.klant) ?? "…"} · {euro(bedrag)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(o.datum), "d MMM yyyy", { locale: nl })} ·{" "}
                          {o.regels
                            .map((r) => `${r.aantal}× ${wijnNaam.get(r.voorraad) ?? "?"}`)
                            .join(", ")}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs">
                        {info?.emoji} {info?.label}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      {o.status === "concept" && (
                        <>
                          <button
                            type="button"
                            onClick={() => leverM.mutate(o.id)}
                            disabled={leverM.isPending}
                            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-50"
                          >
                            <Truck className="h-3.5 w-3.5" /> Leveren
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm("Concept-order definitief verwijderen?"))
                                verwijderM.mutate(o.id);
                            }}
                            disabled={verwijderM.isPending}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-destructive disabled:opacity-50"
                            aria-label="Concept verwijderen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      {o.status === "geleverd" && (
                        <button
                          type="button"
                          onClick={() => betaaldM.mutate(o.id)}
                          disabled={betaaldM.isPending}
                          className="h-11 flex-1 rounded-lg border border-primary text-xs font-semibold text-primary"
                        >
                          Markeer als betaald
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Verkoopoverzicht */}
        {omzetPerWijn.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Verkoopoverzicht
              </h2>
              <button
                type="button"
                onClick={() =>
                  exporteerCsv(
                    `verkoop_${format(new Date(), "yyyy-MM-dd")}`,
                    ["Groep", "Naam", "Flessen", "Omzet EUR"],
                    [
                      ...omzetPerWijn.map((r) => [
                        "Per wijn",
                        r.sleutel,
                        r.flessen,
                        r.omzet.toFixed(2),
                      ]),
                      ...omzetPerKlanttype.map((r) => [
                        "Per klanttype",
                        r.sleutel,
                        r.flessen,
                        r.omzet.toFixed(2),
                      ]),
                    ],
                  )
                }
                className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium"
              >
                <Sheet className="h-3.5 w-3.5" /> Excel
              </button>
            </div>
            {[
              { titel: "Per wijn", regels: omzetPerWijn },
              { titel: "Per klanttype", regels: omzetPerKlanttype },
            ].map((groep) => (
              <ul key={groep.titel} className="space-y-1">
                <li className="text-xs font-semibold text-muted-foreground">{groep.titel}</li>
                {groep.regels.map((r) => (
                  <li
                    key={r.sleutel}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
                  >
                    <span className="truncate">{r.sleutel}</span>
                    <span className="shrink-0 tabular-nums">
                      {r.flessen} fl · {euro(r.omzet)}
                    </span>
                  </li>
                ))}
              </ul>
            ))}
          </section>
        )}

        <OpschoonLijst />

        <p className="text-xs text-muted-foreground">
          Dit overzicht is géén vervanging van je boekhouding — facturatie en btw blijven daar. Zie{" "}
          <Link to="/voorraad" className="text-primary underline-offset-2 hover:underline">
            Voorraad
          </Link>{" "}
          voor de mutatiehistorie per wijn.
        </p>
      </div>
    </>
  );
}
