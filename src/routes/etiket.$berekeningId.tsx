// Fase 20 — publiek e-label (EU-etiket via QR-code). Verordening (EU)
// 2021/2117 (van kracht 8 dec. 2023, wijzigt Vo. (EU) 1308/2013 art. 119)
// staat toe dat de ingrediëntenlijst en de volledige voedingswaardetabel
// "off-label" via een QR-code getoond worden — alleen de energiewaarde moet
// altijd fysiek op het etiket blijven staan. Deze pagina IS die off-label
// informatie: geen reclame, geen tracking, geen appnavigatie (zie de
// pathname-uitzondering in __root.tsx), puur de wettelijk relevante tekst
// voor wie de QR-code scant. Zie docs/marktverkenning.md en WERKLOG.md
// Fase 20 voor de regelgevingsonderbouwing.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchVoedingswaardeBerekeningById } from "@/lib/kelder-data";
import { fetchPartijById } from "@/lib/partijen-data";
import { berekenVoedingswaarde } from "@/lib/voedingswaarde";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/etiket/$berekeningId")({
  component: EtiketPagina,
  head: () => ({ meta: [{ title: "Productinformatie" }] }),
});

function Rij({ label, waarde, vet }: { label: string; waarde: string; vet?: boolean }) {
  return (
    <tr className="border-b border-neutral-200 last:border-0">
      <td className={`py-1.5 pr-3 ${vet ? "font-semibold" : ""}`}>{label}</td>
      <td className={`py-1.5 text-right tabular-nums ${vet ? "font-semibold" : ""}`}>{waarde}</td>
    </tr>
  );
}

function EtiketPagina() {
  const { berekeningId } = Route.useParams();
  const berekeningQ = useQuery({
    queryKey: ["etiket", berekeningId],
    queryFn: () => fetchVoedingswaardeBerekeningById(berekeningId),
  });
  const berekening = berekeningQ.data;
  const partijQ = useQuery({
    queryKey: ["etiket-partij", berekening?.partij],
    queryFn: () => fetchPartijById(berekening!.partij),
    enabled: !!berekening,
  });

  if (berekeningQ.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (berekeningQ.isError || (berekeningQ.isFetched && !berekening)) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center text-neutral-700">
        <p className="text-sm">Deze productinformatie is niet (meer) beschikbaar.</p>
      </div>
    );
  }
  if (!berekening) return null;

  const partij = partijQ.data;
  // Zelfde conventie als het fysieke etiket (voedingswaarde.ts/etiket_tekst):
  // vet, verzadigd vet, eiwit en zout worden bij wijn als verwaarloosbaar
  // gedeclareerd (Bijlage XV Vo. 1169/2011 staat een gecombineerde
  // "verwaarloosbaar"-vermelding toe onder de drempelwaarden).
  // Koolhydraten/suiker herberekend uit de opgeslagen ruwe g/L-invoer via
  // dezelfde geteste rekenkern als het fysieke etiket — geen apart
  // schemaveld nodig en geen risico op drift tussen twee implementaties.
  const kcal = berekening.kcal_totaal;
  const kj = berekening.kj_totaal;
  const heeftInvoer =
    berekening.alcohol_gram_liter != null &&
    berekening.restsuiker_gram_liter != null &&
    berekening.zuur_gram_liter != null &&
    berekening.glycerine_gram_liter != null;
  const herrekend = heeftInvoer
    ? berekenVoedingswaarde({
        alcohol_gram_liter: berekening.alcohol_gram_liter!,
        restsuiker_gram_liter: berekening.restsuiker_gram_liter!,
        zuur_gram_liter: berekening.zuur_gram_liter!,
        glycerine_gram_liter: berekening.glycerine_gram_liter!,
      })
    : null;

  return (
    <div className="min-h-screen bg-white px-4 py-6 text-neutral-900">
      <div className="mx-auto max-w-md space-y-5">
        <div>
          <h1 className="text-lg font-bold">
            {partij ? `${partij.naam} — ${partij.jaargang}` : "Productinformatie"}
          </h1>
          {partij?.lotnummer && <p className="text-sm text-neutral-500">Lot {partij.lotnummer}</p>}
        </div>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Voedingswaarde per 100 ml
          </h2>
          <table className="w-full text-sm">
            <tbody>
              <Rij
                label="Energie"
                waarde={kcal != null && kj != null ? `${kj} kJ / ${kcal} kcal` : "onbekend"}
                vet
              />
              <Rij label="Vet" waarde="verwaarloosbaar" />
              <Rij label="Waarvan verzadigd vet" waarde="verwaarloosbaar" />
              <Rij
                label="Koolhydraten"
                waarde={
                  herrekend ? `${herrekend.koolhydraten_totaal_per_100ml.toFixed(1)} g` : "onbekend"
                }
              />
              <Rij
                label="Waarvan suikers"
                waarde={herrekend ? `${herrekend.restsuiker_per_100ml.toFixed(1)} g` : "onbekend"}
              />
              <Rij label="Eiwit" waarde="verwaarloosbaar" />
              <Rij label="Zout" waarde="verwaarloosbaar" />
            </tbody>
          </table>
        </section>

        {berekening.ingredienten_tekst && (
          <section>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Ingrediënten
            </h2>
            <p className="text-sm">{berekening.ingredienten_tekst}</p>
          </section>
        )}

        {berekening.allergenen && (
          <section className="rounded-lg border border-neutral-300 bg-neutral-50 p-3">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Allergenen
            </h2>
            <p className="text-sm font-medium">{berekening.allergenen}</p>
          </section>
        )}

        <p className="border-t border-neutral-200 pt-3 text-[11px] leading-relaxed text-neutral-400">
          Deze pagina toont uitsluitend de wettelijk toegestane "off-label" productinformatie
          (ingrediënten en voedingswaarde, Vo. (EU) 2021/2117). Het alcoholpercentage, de oorsprong
          en overige verplichte gegevens staan op het fysieke etiket.
        </p>
      </div>
    </div>
  );
}
