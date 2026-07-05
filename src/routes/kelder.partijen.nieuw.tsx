import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { createPartijViaEndpoint, fetchProducenten, fetchTanks } from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { foutenPerVeld, isGeldig, valideerPartij } from "@/lib/validatie";
import { vanBrix, vanOechsle } from "@/lib/dichtheid";
import { genereerLotnummer } from "@/lib/lotnummer";
import { useInvoerder } from "@/lib/use-invoerder";
import { useSeizoen } from "@/lib/seizoen";
import {
  OPDRACHT_TYPES,
  PARTIJ_STATUSSEN,
  PARTIJ_TYPES,
  type OpdrachtType,
  type PartijStatus,
  type PartijType,
} from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/kelder/partijen/nieuw")({
  component: NieuwePartijPage,
  head: () => ({ meta: [{ title: "Nieuwe partij — Kelder" }] }),
});

function NieuwePartijPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [jaar] = useSeizoen();
  const [invoerder, setInvoerder] = useInvoerder();
  const producentenQ = useQuery({ queryKey: ["producenten"], queryFn: fetchProducenten });
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });

  const [naam, setNaam] = useState("");
  const [jaargang, setJaargang] = useState(String(jaar));
  const [type, setType] = useState<PartijType>("wit");
  const [status, setStatus] = useState<PartijStatus>("most");
  const [producent, setProducent] = useState("");
  const [opdrachtType, setOpdrachtType] = useState<OpdrachtType>("eigen_wijn");
  const [lotnummer, setLotnummer] = useState("");
  const [samenstelling, setSamenstelling] = useState("");
  const [gist, setGist] = useState("");
  const [persDatum, setPersDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [ontstelen, setOntstelen] = useState(false);
  const [voorklaren, setVoorklaren] = useState(false);
  const [phBijAanmaak, setPhBijAanmaak] = useState("");
  const [totaalZuurBijAanmaak, setTotaalZuurBijAanmaak] = useState("");
  const [standtijd, setStandtijd] = useState("");
  const [koeling, setKoeling] = useState("");
  const [oechsle, setOechsle] = useState("");
  const [brixInvoer, setBrixInvoer] = useState("");
  const [startTank, setStartTank] = useState("");
  const [startVolume, setStartVolume] = useState("");
  const [notitie, setNotitie] = useState("");
  const [fouten, setFouten] = useState<Record<string, string>>({});

  // °Oe is leidend; wie Brix invoert krijgt °Oe automatisch (en andersom)
  const dichtheid = useMemo(() => {
    if (oechsle) return vanOechsle(Number(oechsle));
    if (brixInvoer) return vanBrix(Number(brixInvoer));
    return null;
  }, [oechsle, brixInvoer]);

  // Blok E — lotnummer-autosuggestie (ARCHITECTURE.md v1.1, besluit A2).
  // Alleen een voorstel: overschrijft nooit wat de gebruiker al intypte.
  const lotnummerSuggestie = useMemo(() => {
    if (!naam.trim() || !jaargang) return "";
    const bestaande = (partijenQ.data ?? [])
      .map((p) => p.lotnummer)
      .filter((l): l is string => !!l);
    return genereerLotnummer(naam, Number(jaargang), bestaande);
  }, [naam, jaargang, partijenQ.data]);

  const wisFout = (veld: string) =>
    setFouten((f) => {
      if (!f[veld]) return f;
      const kopie = { ...f };
      delete kopie[veld];
      return kopie;
    });

  const m = useMutation({
    mutationFn: () =>
      createPartijViaEndpoint({
        naam,
        jaargang: Number(jaargang),
        type,
        status,
        producent: producent || null,
        opdracht_type: opdrachtType,
        lotnummer,
        samenstelling,
        gist,
        pers_datum: persDatum,
        ontstelen,
        voorklaren,
        ph_bij_aanmaak: phBijAanmaak ? Number(phBijAanmaak) : null,
        totaal_zuur_bij_aanmaak: totaalZuurBijAanmaak ? Number(totaalZuurBijAanmaak) : null,
        standtijd,
        koeling,
        start_dichtheid_oechsle: dichtheid?.oechsle ?? null,
        start_dichtheid_brix: dichtheid?.brix ?? null,
        start_dichtheid_sg: dichtheid?.sg ?? null,
        start_volume_l: startVolume ? Number(startVolume) : null,
        start_tank: startTank || undefined,
        verantwoordelijke: invoerder,
        notitie,
      }),
    onSuccess: (r) => {
      toast.success("Partij aangemaakt ✓");
      if (r.waarschuwing) toast.warning(r.waarschuwing);
      qc.invalidateQueries({ queryKey: ["partijen"] });
      qc.invalidateQueries({ queryKey: ["tanks"] });
      qc.invalidateQueries({ queryKey: ["tankboek"] });
      navigate({ to: "/kelder/partijen/$partijId", params: { partijId: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSave = () => {
    if (m.isPending) return;
    const validatie = valideerPartij({
      naam,
      jaargang: jaargang ? Number(jaargang) : undefined,
      type,
      status,
      start_volume_l: startVolume ? Number(startVolume) : undefined,
    });
    if (!producent) validatie.push({ veld: "producent", bericht: "Kies een producent" });
    if (startTank && !startVolume)
      validatie.push({ veld: "start_volume_l", bericht: "Vul het startvolume in (liter)" });
    if (!invoerder.trim())
      validatie.push({ veld: "verantwoordelijke", bericht: "Invoerder is verplicht" });
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
      <AppHeader back title="Nieuwe partij" subtitle="Kelder" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Producent</span>
              <select
                value={producent}
                onChange={(e) => {
                  setProducent(e.target.value);
                  wisFout("producent");
                }}
                className={`${veldClass} ${fouten.producent ? "border-destructive" : ""}`}
              >
                <option value="">Kies producent…</option>
                {(producentenQ.data ?? [])
                  .filter((p) => p.actief)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.naam}
                    </option>
                  ))}
              </select>
              {fouten.producent && (
                <span className="mt-1 block text-sm text-destructive">{fouten.producent}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Opdracht</span>
              <select
                value={opdrachtType}
                onChange={(e) => setOpdrachtType(e.target.value as OpdrachtType)}
                className={veldClass}
              >
                {OPDRACHT_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Naam</span>
              <input
                value={naam}
                onChange={(e) => {
                  setNaam(e.target.value);
                  wisFout("naam");
                }}
                className={`${veldClass} ${fouten.naam ? "border-destructive" : ""}`}
                placeholder="bijv. Johanniter 2026"
              />
              {fouten.naam && (
                <span className="mt-1 block text-sm text-destructive">{fouten.naam}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Jaargang</span>
              <input
                type="number"
                inputMode="numeric"
                value={jaargang}
                onChange={(e) => {
                  setJaargang(e.target.value);
                  wisFout("jaargang");
                }}
                className={`${veldClass} ${fouten.jaargang ? "border-destructive" : ""}`}
              />
              {fouten.jaargang && (
                <span className="mt-1 block text-sm text-destructive">{fouten.jaargang}</span>
              )}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as PartijType)}
                className={veldClass}
              >
                {PARTIJ_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PartijStatus)}
                className={veldClass}
              >
                {PARTIJ_STATUSSEN.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.emoji} {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Lotnummer</span>
              <input
                value={lotnummer}
                onChange={(e) => setLotnummer(e.target.value)}
                className={veldClass}
                placeholder="bijv. L26-JOH-01"
              />
              {!lotnummer && lotnummerSuggestie && (
                <button
                  type="button"
                  onClick={() => setLotnummer(lotnummerSuggestie)}
                  className="mt-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Voorstel: {lotnummerSuggestie} — gebruiken
                </button>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Persdatum</span>
              <input
                type="date"
                value={persDatum}
                onChange={(e) => setPersDatum(e.target.value)}
                className={veldClass}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Samenstelling / rassen</span>
            <input
              value={samenstelling}
              onChange={(e) => setSamenstelling(e.target.value)}
              className={veldClass}
              placeholder="bijv. 70% Johanniter, 30% Souvignier Gris"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Gist</span>
            <input
              value={gist}
              onChange={(e) => setGist(e.target.value)}
              className={veldClass}
              placeholder="Optioneel…"
            />
          </label>
        </section>

        {/* Dichtheid: °Oe leidend, Brix/SG rekenen live mee */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Startdichtheid
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">°Oechsle</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={oechsle}
                onChange={(e) => {
                  setOechsle(e.target.value);
                  if (e.target.value) setBrixInvoer("");
                }}
                className={veldClass}
                placeholder="bijv. 75"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">of Brix</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={brixInvoer}
                onChange={(e) => {
                  setBrixInvoer(e.target.value);
                  if (e.target.value) setOechsle("");
                }}
                className={veldClass}
                placeholder="bijv. 18.2"
              />
            </label>
          </div>
          {dichtheid && (
            <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm">
              {dichtheid.oechsle} °Oe · {dichtheid.brix} °Bx · SG {dichtheid.sg} — alle drie worden
              opgeslagen
            </p>
          )}
        </section>

        {/* Verwerking: velden uit Logboek_leeg.xlsx die vóór de eerste analyse al ingevuld worden */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Verwerking
          </h2>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={ontstelen}
                onChange={(e) => setOntstelen(e.target.checked)}
                className="h-5 w-5 rounded border-input"
              />
              Ontstelen
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={voorklaren}
                onChange={(e) => setVoorklaren(e.target.checked)}
                className="h-5 w-5 rounded border-input"
              />
              Voorklaren
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">pH (bij aanmaak)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={phBijAanmaak}
                onChange={(e) => setPhBijAanmaak(e.target.value)}
                className={veldClass}
                placeholder="Optioneel…"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Totaal zuur (bij aanmaak)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={totaalZuurBijAanmaak}
                onChange={(e) => setTotaalZuurBijAanmaak(e.target.value)}
                className={veldClass}
                placeholder="Optioneel…"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Standtijd</span>
              <input
                value={standtijd}
                onChange={(e) => setStandtijd(e.target.value)}
                className={veldClass}
                placeholder="bijv. 24 uur"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Koeling</span>
              <input
                value={koeling}
                onChange={(e) => setKoeling(e.target.value)}
                className={veldClass}
                placeholder="Optioneel…"
              />
            </label>
          </div>
        </section>

        {/* Starttank + volume → eerste vullen-boeking in het tankboek */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Eerste vulling (optioneel)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Starttank</span>
              <select
                value={startTank}
                onChange={(e) => setStartTank(e.target.value)}
                className={veldClass}
              >
                <option value="">Nog geen tank</option>
                {(tanksQ.data ?? [])
                  .filter((t) => t.status === "leeg" || t.huidige_partij === null)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      Tank {t.code} · {t.soort} ({t.capaciteit_l} L)
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Startvolume (L)</span>
              <input
                type="number"
                inputMode="decimal"
                value={startVolume}
                onChange={(e) => {
                  setStartVolume(e.target.value);
                  wisFout("start_volume_l");
                }}
                className={`${veldClass} ${fouten.start_volume_l ? "border-destructive" : ""}`}
              />
              {fouten.start_volume_l && (
                <span className="mt-1 block text-sm text-destructive">{fouten.start_volume_l}</span>
              )}
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Met starttank en volume wordt automatisch de eerste "vullen"-regel in het tankboek
            geboekt — alles of niets.
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Ingevoerd door</span>
            <input
              value={invoerder}
              onChange={(e) => {
                setInvoerder(e.target.value);
                wisFout("verantwoordelijke");
              }}
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
            Partij aanmaken
          </button>
        </section>
      </div>
    </>
  );
}
