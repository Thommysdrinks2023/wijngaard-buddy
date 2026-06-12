import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { createLab, fetchLab, LAB_SOORTEN, type LabSoort } from "@/lib/extra-data";
import { useInvoerder } from "@/lib/use-invoerder";
import { useSeizoen } from "@/lib/seizoen";
import { AppHeader } from "@/components/app-header";
import { YearSelector } from "@/components/year-selector";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useVerbinding } from "@/components/verbinding-status";
import { comprimeerFoto } from "@/lib/foto-compressie";
import { FlaskConical, FileText, Loader2, Paperclip } from "lucide-react";

export const Route = createFileRoute("/lab")({
  component: LabPage,
  head: () => ({
    meta: [
      { title: "Lab — Wijngaard" },
      { name: "description", content: "Bodem- en sapanalyses met rapportupload per seizoen." },
    ],
  }),
});

function jaarOf(item: { seizoen?: number; datum: string }): number {
  return item.seizoen ?? parseISO(item.datum).getFullYear();
}

function LabPage() {
  const qc = useQueryClient();
  const [jaar] = useSeizoen();
  const [invoerder, setInvoerder] = useInvoerder();
  const verbinding = useVerbinding();
  const labQ = useQuery({ queryKey: ["lab"], queryFn: fetchLab });

  const [soort, setSoort] = useState<LabSoort>("Bodemanalyse");
  const [datum, setDatum] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [waarden, setWaarden] = useState<Record<string, string>>({});
  const [notitie, setNotitie] = useState("");
  const [bestand, setBestand] = useState<File | null>(null);
  const [fouten, setFouten] = useState<Record<string, string>>({});

  const num = (sleutel: string) => (waarden[sleutel] ? Number(waarden[sleutel]) : null);
  const setWaarde = (sleutel: string, v: string) => setWaarden((w) => ({ ...w, [sleutel]: v }));

  const m = useMutation({
    mutationFn: async () =>
      createLab({
        datum,
        seizoen: new Date(datum).getFullYear(),
        soort,
        ph: num("ph"),
        organische_stof: num("organische_stof"),
        n: num("n"),
        p: num("p"),
        k: num("k"),
        yan: num("yan"),
        nh4: num("nh4"),
        nopa: num("nopa"),
        notitie,
        ingevoerd_door: invoerder,
        bestandFile: bestand,
      }),
    onSuccess: () => {
      toast.success("Labresultaat opgeslagen ✓");
      qc.invalidateQueries({ queryKey: ["lab"] });
      setWaarden({});
      setNotitie("");
      setBestand(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSave = () => {
    if (m.isPending) return;
    const nieuweFouten: Record<string, string> = {};
    if (!datum) nieuweFouten.datum = "Datum is verplicht";
    else if (new Date(datum) > new Date())
      nieuweFouten.datum = "Datum kan niet in de toekomst liggen";
    const ph = num("ph");
    if (ph != null && (ph < 0 || ph > 14)) nieuweFouten.ph = "pH moet tussen 0 en 14 liggen";
    if (!invoerder.trim()) nieuweFouten.ingevoerd_door = "Invoerder is verplicht";
    if (Object.keys(nieuweFouten).length > 0) {
      setFouten(nieuweFouten);
      toast.error(Object.values(nieuweFouten)[0]);
      return;
    }
    setFouten({});
    m.mutate();
  };

  const seizoenResultaten = useMemo(
    () => (labQ.data ?? []).filter((l) => jaarOf(l) === jaar),
    [labQ.data, jaar],
  );

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  const bodemVelden = [
    { sleutel: "ph", label: "pH" },
    { sleutel: "organische_stof", label: "Org. stof (%)" },
    { sleutel: "n", label: "N (stikstof)" },
    { sleutel: "p", label: "P (fosfor)" },
    { sleutel: "k", label: "K (kalium)" },
  ];
  const sapVelden = [
    { sleutel: "yan", label: "YAN (mg/L)" },
    { sleutel: "nh4", label: "NH₄ (mg/L)" },
    { sleutel: "nopa", label: "NOPA (mg/L)" },
  ];
  const actieveVelden =
    soort === "Bodemanalyse" ? bodemVelden : soort === "Sapanalyse" ? sapVelden : [];

  return (
    <>
      <AppHeader back title="Lab" subtitle="Bodem- en sapanalyses" />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Labresultaten</h1>
            <p className="text-sm text-muted-foreground">Analyses en rapporten per seizoen</p>
          </div>
          <YearSelector />
        </div>

        {/* Invoer */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <FlaskConical className="h-4 w-4" /> Nieuw resultaat
          </h2>

          <div className="grid grid-cols-3 gap-2">
            {LAB_SOORTEN.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSoort(s)}
                className={`h-12 rounded-xl border-2 text-sm font-semibold transition ${
                  soort === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Datum</span>
            <input
              type="date"
              value={datum}
              onChange={(e) => {
                setDatum(e.target.value);
                setFouten((f) => ({ ...f, datum: "" }));
              }}
              className={`${veldClass} ${fouten.datum ? "border-destructive" : ""}`}
            />
            {fouten.datum && (
              <span className="mt-1 block text-sm text-destructive">{fouten.datum}</span>
            )}
          </label>

          {actieveVelden.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {actieveVelden.map((v) => (
                <label key={v.sleutel} className="block">
                  <span className="mb-1.5 block text-sm font-medium">{v.label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={waarden[v.sleutel] ?? ""}
                    onChange={(e) => {
                      setWaarde(v.sleutel, e.target.value);
                      setFouten((f) => ({ ...f, [v.sleutel]: "" }));
                    }}
                    className={`${veldClass} ${fouten[v.sleutel] ? "border-destructive" : ""}`}
                    placeholder="—"
                  />
                  {fouten[v.sleutel] && (
                    <span className="mt-1 block text-sm text-destructive">{fouten[v.sleutel]}</span>
                  )}
                </label>
              ))}
            </div>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Rapport (PDF of foto)</span>
            <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-background text-sm font-medium">
              <Paperclip className="h-5 w-5" />
              {bestand ? bestand.name : "Kies bestand…"}
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={async (e) => {
                  const gekozen = e.target.files?.[0] ?? null;
                  if (!gekozen) {
                    setBestand(null);
                    return;
                  }
                  // foto's verkleinen; PDF's blijven ongemoeid
                  const res = await comprimeerFoto(gekozen);
                  setBestand(res.file);
                }}
                className="hidden"
              />
            </label>
            {bestand && (!verbinding.online || !verbinding.ingelogd) && (
              <p className="mt-1.5 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
                ⚠️ {!verbinding.online ? "Geen verbinding" : "Niet ingelogd"} — het bestand kan
                alleen mét verbinding geüpload worden. De cijfers worden wél bewaard.
              </p>
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

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Ingevoerd door</span>
            <input
              value={invoerder}
              onChange={(e) => {
                setInvoerder(e.target.value);
                setFouten((f) => ({ ...f, ingevoerd_door: "" }));
              }}
              className={`${veldClass} ${fouten.ingevoerd_door ? "border-destructive" : ""}`}
              placeholder="Je naam"
            />
            {fouten.ingevoerd_door && (
              <span className="mt-1 block text-sm text-destructive">{fouten.ingevoerd_door}</span>
            )}
          </label>

          <button
            type="button"
            onClick={handleSave}
            disabled={m.isPending}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {m.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Resultaat opslaan
          </button>
        </section>

        {labQ.isError && <ErrorState error={labQ.error} onRetry={() => labQ.refetch()} />}

        {/* Overzicht per seizoen */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Resultaten {jaar}
          </h2>
          {seizoenResultaten.length === 0 ? (
            <EmptyState message="Nog geen labresultaten dit seizoen." />
          ) : (
            <ul className="space-y-2">
              {seizoenResultaten.map((l) => (
                <li key={l.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-semibold">{l.soort}</p>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(l.datum), "d MMM yyyy", { locale: nl })}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[
                      l.ph != null ? `pH ${l.ph}` : null,
                      l.organische_stof != null ? `org. stof ${l.organische_stof}%` : null,
                      l.n != null ? `N ${l.n}` : null,
                      l.p != null ? `P ${l.p}` : null,
                      l.k != null ? `K ${l.k}` : null,
                      l.yan != null ? `YAN ${l.yan}` : null,
                      l.nh4 != null ? `NH₄ ${l.nh4}` : null,
                      l.nopa != null ? `NOPA ${l.nopa}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Geen meetwaarden"}
                  </p>
                  {l.notitie && <p className="mt-1 text-xs text-muted-foreground">{l.notitie}</p>}
                  {l.bestand && (
                    <a
                      href={l.bestand}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                      style={{ backgroundColor: "#27232a", color: "#cac176" }}
                    >
                      <FileText className="h-3.5 w-3.5" /> Rapport bekijken
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
