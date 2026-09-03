// Fase 16 Blok C — beheerscherm voor eigenaars. Vlakke route (trailing-
// underscore-escape): instellingen.tsx heeft geen <Outlet/>.
//
// "Eigenaar" heette tot Fase 16 "producent". Dat was het verkeerde woord: De
// Tappenmars verwerkt en bottelt ook voor andere wijngaarden en fruittelers,
// en die klanten zijn geen producent maar eigenaar van hun eigen product
// terwijl het hier in de kelder staat.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { createEigenaar, fetchEigenaars, updateEigenaar } from "@/lib/kelder-data";
import { type EigenaarSoort } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { OfflineWaarschuwing } from "@/components/offline-waarschuwing";
import { Loader2, Plus } from "lucide-react";

export const Route = createFileRoute("/instellingen_/eigenaars")({
  component: EigenaarsBeheer,
  head: () => ({ meta: [{ title: "Eigenaars — Instellingen" }] }),
});

const SOORTEN: { value: EigenaarSoort; label: string }[] = [
  { value: "eigen_wijngaard", label: "Eigen wijngaard" },
  { value: "drankproductie", label: "Drankproductie" },
  { value: "extern_klant", label: "Externe klant (loonproductie)" },
];

function EigenaarsBeheer() {
  const qc = useQueryClient();
  const eigenaarsQ = useQuery({ queryKey: ["eigenaars"], queryFn: fetchEigenaars });

  const [nieuw, setNieuw] = useState(false);
  const [naam, setNaam] = useState("");
  const [code, setCode] = useState("");
  const [soort, setSoort] = useState<EigenaarSoort>("extern_klant");
  const [notitie, setNotitie] = useState("");

  // Code aanvullen op een bestaande eigenaar die er nog geen heeft.
  const [bewerktId, setBewerktId] = useState("");
  const [bewerktCode, setBewerktCode] = useState("");

  const veldClass = "h-12 w-full rounded-xl border border-input bg-background px-3 text-base";

  const createM = useMutation({
    mutationFn: () => createEigenaar({ naam, code, soort, notitie: notitie || undefined }),
    onSuccess: () => {
      toast.success("Eigenaar aangemaakt.");
      qc.invalidateQueries({ queryKey: ["eigenaars"] });
      setNaam("");
      setCode("");
      setNotitie("");
      setNieuw(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const codeM = useMutation({
    mutationFn: () => updateEigenaar(bewerktId, { code: bewerktCode }),
    onSuccess: () => {
      toast.success("Code opgeslagen.");
      qc.invalidateQueries({ queryKey: ["eigenaars"] });
      setBewerktId("");
      setBewerktCode("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const zonderCode = (eigenaarsQ.data ?? []).filter((e) => !e.code);

  return (
    <>
      <AppHeader back title="Eigenaars" subtitle="Van wie is de partij, het vat, de botteling" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <OfflineWaarschuwing wat="de eigenaars" />
        {eigenaarsQ.isError && (
          <ErrorState error={eigenaarsQ.error} onRetry={() => eigenaarsQ.refetch()} />
        )}

        {zonderCode.length > 0 && (
          <p
            role="status"
            className="rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning"
          >
            {zonderCode.length === 1
              ? "Eén eigenaar heeft nog geen administratiecode."
              : `${zonderCode.length} eigenaars hebben nog geen administratiecode.`}{" "}
            Ze blijven gewoon bruikbaar — vul de code aan zodra je hem hebt opgezocht.
          </p>
        )}

        {!nieuw ? (
          <button
            onClick={() => setNieuw(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-semibold text-muted-foreground active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" /> Nieuwe eigenaar
          </button>
        ) : (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Naam</span>
              <input value={naam} onChange={(e) => setNaam(e.target.value)} className={veldClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Code (twee cijfers)</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={veldClass}
                placeholder="bijv. 03"
                inputMode="numeric"
                maxLength={2}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                De code uit je administratie. De Tappenmars is 01, Thommy&apos;s Drinks is 07.
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Soort</span>
              <select
                value={soort}
                onChange={(e) => setSoort(e.target.value as EigenaarSoort)}
                className={veldClass}
              >
                {SOORTEN.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
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
            <div className="flex gap-2">
              <button
                onClick={() => setNieuw(false)}
                className="h-12 flex-1 rounded-xl border border-border text-sm font-semibold"
              >
                Annuleren
              </button>
              <button
                disabled={!naam || createM.isPending}
                onClick={() => createM.mutate()}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {createM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Opslaan
              </button>
            </div>
          </div>
        )}

        {(eigenaarsQ.data ?? []).length === 0 && !eigenaarsQ.isLoading ? (
          <EmptyState message="Nog geen eigenaars." />
        ) : (
          <ul className="space-y-2">
            {(eigenaarsQ.data ?? []).map((e) => (
              <li key={e.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {e.code ? (
                        <>
                          <span className="tabular-nums">{e.code}</span> — {e.naam}
                        </>
                      ) : (
                        e.naam
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {SOORTEN.find((s) => s.value === e.soort)?.label ?? e.soort}
                      {!e.actief && " · inactief"}
                    </p>
                  </div>
                  {!e.code && (
                    <span className="shrink-0 rounded-full border border-warning/50 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                      Code ontbreekt
                    </span>
                  )}
                </div>

                {!e.code &&
                  (bewerktId === e.id ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={bewerktCode}
                        onChange={(ev) => setBewerktCode(ev.target.value)}
                        className="h-11 w-24 rounded-xl border border-input bg-background px-3 text-base"
                        placeholder="03"
                        inputMode="numeric"
                        maxLength={2}
                      />
                      <button
                        disabled={codeM.isPending}
                        onClick={() => codeM.mutate()}
                        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {codeM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Opslaan
                      </button>
                      <button
                        onClick={() => setBewerktId("")}
                        className="h-11 rounded-xl border border-border px-3 text-sm font-semibold"
                      >
                        Annuleren
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setBewerktId(e.id);
                        setBewerktCode("");
                      }}
                      className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
                    >
                      Code aanvullen
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
