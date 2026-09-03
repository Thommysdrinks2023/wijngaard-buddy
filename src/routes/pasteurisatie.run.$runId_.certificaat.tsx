// Fase 17 Blok G — certificaat genereren en historie. Vlakke route
// (trailing-underscore-escape): pasteurisatie.run.$runId.tsx heeft geen
// <Outlet/> en is zelf al een volledige pagina.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { fetchEigenaars } from "@/lib/kelder-data";
import { fetchPartijById } from "@/lib/partijen-data";
import { fetchFlestypes } from "@/lib/flessen-data";
import {
  fetchCertificatenVoorRun,
  fetchPasteurisatieMetingen,
  fetchPasteurisatieRunById,
  fetchSluitingen,
  maakCertificaatRecord,
} from "@/lib/pasteurisatie-data";
import { genereerPuCertificaat } from "@/lib/pasteurisatie-certificaat";
import { eigenaarLabel } from "@/lib/types";
import { useInvoerder } from "@/lib/use-invoerder";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";
import { Loader2, FileText } from "lucide-react";

export const Route = createFileRoute("/pasteurisatie/run/$runId_/certificaat")({
  component: CertificaatPagina,
  head: () => ({ meta: [{ title: "Certificaat — Pasteurisatie" }] }),
});

function CertificaatPagina() {
  const { runId } = Route.useParams();
  const qc = useQueryClient();
  const [invoerder] = useInvoerder();
  const [laatsteBlobUrl, setLaatsteBlobUrl] = useState<string | null>(null);

  const runQ = useQuery({
    queryKey: ["pasteurisatie-run", runId],
    queryFn: () => fetchPasteurisatieRunById(runId),
  });
  const metingenQ = useQuery({
    queryKey: ["pasteurisatie-metingen", runId],
    queryFn: () => fetchPasteurisatieMetingen(runId),
  });
  const eigenaarsQ = useQuery({ queryKey: ["eigenaars"], queryFn: fetchEigenaars });
  const partijQ = useQuery({
    queryKey: ["partij", runQ.data?.partij],
    queryFn: () => fetchPartijById(runQ.data!.partij),
    enabled: !!runQ.data,
  });
  const flestypesQ = useQuery({ queryKey: ["flestypes"], queryFn: () => fetchFlestypes() });
  const sluitingenQ = useQuery({ queryKey: ["sluitingen"], queryFn: () => fetchSluitingen() });
  const certificatenQ = useQuery({
    queryKey: ["certificaten", runId],
    queryFn: () => fetchCertificatenVoorRun(runId),
  });

  const genererenM = useMutation({
    mutationFn: async () => {
      if (!runQ.data) throw new Error("Run nog niet geladen.");
      const referentieLabel = runQ.data.sensor_positie || "referentiefles";
      const metingen = (metingenQ.data ?? [])
        .filter((m) => m.sensorLabel === referentieLabel)
        .map((m) => ({ tijdstip: m.tijdstip, temperatuurC: m.temperatuurC }));
      const eigenaar = eigenaarsQ.data?.find((e) => e.id === runQ.data!.eigenaar);
      const flestype = flestypesQ.data?.find((f) => f.id === runQ.data!.flestype);
      const sluiting = sluitingenQ.data?.find((s) => s.id === runQ.data!.sluiting);
      const versienummer =
        (certificatenQ.data ?? []).length > 0
          ? Math.max(...certificatenQ.data!.map((c) => c.versienummer)) + 1
          : 1;
      const blob = genereerPuCertificaat({
        run: runQ.data,
        eigenaarNaam: eigenaar ? eigenaarLabel(eigenaar) : "",
        partijNaam: partijQ.data?.naam ?? "",
        flestypeNaam: flestype?.omschrijving ?? "",
        sluitingNaam: sluiting?.naam ?? "",
        metingen,
        uitgevoerdDoorNaam: invoerder,
        versienummer,
      });
      const bestandsnaam = `pasteurisatiecertificaat-${runQ.data.lotnummer || runId}-v${versienummer}.pdf`;
      await maakCertificaatRecord(runId, invoerder, blob, bestandsnaam);
      setLaatsteBlobUrl(URL.createObjectURL(blob));
      return bestandsnaam;
    },
    onSuccess: (naam) => {
      toast.success(`Certificaat gegenereerd: ${naam}`);
      qc.invalidateQueries({ queryKey: ["certificaten", runId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (runQ.isError || (runQ.isFetched && !runQ.data)) {
    return (
      <>
        <AppHeader back title="Certificaat" />
        <div className="mx-auto max-w-screen-md px-3 py-4">
          <ErrorState message="Run niet gevonden." onRetry={() => runQ.refetch()} />
        </div>
      </>
    );
  }

  const magGenereren = runQ.data?.status === "afgerond";

  return (
    <>
      <AppHeader
        back
        title="Certificaat"
        subtitle={runQ.data ? `Lot ${runQ.data.lotnummer}` : ""}
      />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <OfflineWaarschuwing wat="de certificaatgegevens" />
        {!magGenereren && (
          <p className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm">
            Deze run is nog niet afgerond — er kan pas een certificaat gegenereerd worden na
            afronden.
          </p>
        )}

        {runQ.data?.veiligheidsoordeel && (
          <div className="flex items-center gap-2">
            <StatusBadge
              label={
                runQ.data.veiligheidsoordeel === "veilig"
                  ? "Veilig"
                  : runQ.data.veiligheidsoordeel === "marginaal"
                    ? "Marginaal"
                    : "Onveilig"
              }
              emoji={
                runQ.data.veiligheidsoordeel === "veilig"
                  ? "✅"
                  : runQ.data.veiligheidsoordeel === "marginaal"
                    ? "⚠️"
                    : "🛑"
              }
              toon={
                runQ.data.veiligheidsoordeel === "veilig"
                  ? "success"
                  : runQ.data.veiligheidsoordeel === "marginaal"
                    ? "warning"
                    : "destructive"
              }
            />
            {runQ.data.totale_pu != null && (
              <span className="text-sm font-semibold tabular-nums">
                {runQ.data.totale_pu.toFixed(1)} PU
              </span>
            )}
          </div>
        )}

        <button
          disabled={!magGenereren || genererenM.isPending}
          onClick={() => genererenM.mutate()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {genererenM.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <FileText className="h-5 w-5" />
          )}
          Certificaat genereren (nieuwe versie)
        </button>

        {laatsteBlobUrl && (
          <a
            href={laatsteBlobUrl}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-primary bg-primary-soft p-3 text-center text-sm font-semibold"
          >
            Zojuist gegenereerd certificaat bekijken →
          </a>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Eerder uitgegeven versies
          </h2>
          {(certificatenQ.data ?? []).length === 0 ? (
            <EmptyState
              message={
                magGenereren
                  ? "Nog geen certificaat uitgegeven voor deze run — genereer de eerste versie hierboven."
                  : "Nog geen certificaat uitgegeven — dat kan pas nadat de run is afgerond."
              }
              icon={<FileText className="h-6 w-6" />}
            />
          ) : (
            <ul className="space-y-2">
              {(certificatenQ.data ?? []).map((c) => (
                <li
                  key={c.id}
                  className="flex min-h-11 items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
                >
                  <span>
                    Versie {c.versienummer} — {c.uitgiftedatum} ({c.uitgegeven_door})
                  </span>
                  {c.bestand && (
                    <a
                      href={c.bestand}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Openen
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
