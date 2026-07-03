import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { createTank, fetchTanks, herberekenTanks } from "@/lib/kelder-data";
import { fetchPartijen } from "@/lib/partijen-data";
import { foutenPerVeld, isGeldig, valideerTank } from "@/lib/validatie";
import { TANK_STATUSSEN, type TankStatus } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Container, Loader2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/kelder/tanks/")({
  component: TanksPage,
  head: () => ({
    meta: [{ title: "Tanks — Kelder" }, { name: "description", content: "Tankbeheer." }],
  }),
});

function TanksPage() {
  const qc = useQueryClient();
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const partijenQ = useQuery({ queryKey: ["partijen"], queryFn: fetchPartijen });

  const [toonNieuw, setToonNieuw] = useState(false);
  const [code, setCode] = useState("");
  const [soort, setSoort] = useState("");
  const [capaciteit, setCapaciteit] = useState("");
  const [locatie, setLocatie] = useState("");
  const [fouten, setFouten] = useState<Record<string, string>>({});

  const createM = useMutation({
    mutationFn: () =>
      createTank({
        code,
        soort,
        capaciteit_l: capaciteit ? Number(capaciteit) : 0,
        status: "leeg",
        locatie,
      }),
    onSuccess: () => {
      toast.success("Tank toegevoegd ✓");
      qc.invalidateQueries({ queryKey: ["tanks"] });
      setCode("");
      setSoort("");
      setCapaciteit("");
      setLocatie("");
      setToonNieuw(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const herberekenM = useMutation({
    mutationFn: herberekenTanks,
    onSuccess: (r) => {
      toast.success(`Tankinhoud herberekend uit het tankboek (${r.tanks_bijgewerkt} tanks) ✓`);
      qc.invalidateQueries({ queryKey: ["tanks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSave = () => {
    if (createM.isPending) return;
    const validatie = valideerTank({
      code,
      capaciteit_l: capaciteit ? Number(capaciteit) : 0,
      status: "leeg",
    });
    if (!isGeldig(validatie)) {
      setFouten(foutenPerVeld(validatie));
      toast.error(validatie[0].bericht);
      return;
    }
    setFouten({});
    createM.mutate();
  };

  const partijNaam = new Map<string, string>();
  partijenQ.data?.forEach((p) => partijNaam.set(p.id, p.naam));

  const veldClass = "h-12 w-full rounded-xl border border-input bg-card px-3 text-base";

  return (
    <>
      <AppHeader back title="Tanks" subtitle="Kelderinventaris" />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setToonNieuw((v) => !v)}
            className="h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
          >
            {toonNieuw ? "Annuleren" : "+ Nieuwe tank"}
          </button>
          <button
            type="button"
            onClick={() => herberekenM.mutate()}
            disabled={herberekenM.isPending}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium disabled:opacity-50"
            title="Reconstrueert tankinhoud uit het tankboek"
          >
            {herberekenM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Herbereken
          </button>
        </div>

        {toonNieuw && (
          <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Code</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={`${veldClass} ${fouten.code ? "border-destructive" : ""}`}
                  placeholder="bijv. 48 of IBC2"
                />
                {fouten.code && (
                  <span className="mt-1 block text-sm text-destructive">{fouten.code}</span>
                )}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Soort</span>
                <input
                  value={soort}
                  onChange={(e) => setSoort(e.target.value)}
                  className={veldClass}
                  placeholder="bijv. IM530"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Capaciteit (L)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={capaciteit}
                  onChange={(e) => setCapaciteit(e.target.value)}
                  className={`${veldClass} ${fouten.capaciteit_l ? "border-destructive" : ""}`}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Locatie</span>
                <input
                  value={locatie}
                  onChange={(e) => setLocatie(e.target.value)}
                  className={veldClass}
                  placeholder="Optioneel…"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={createM.isPending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {createM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Tank toevoegen
            </button>
          </section>
        )}

        {tanksQ.isError && <ErrorState error={tanksQ.error} onRetry={() => tanksQ.refetch()} />}

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Alle tanks ({tanksQ.data?.length ?? 0})
          </h2>
          {(tanksQ.data ?? []).some((t) => t.soort?.toUpperCase().startsWith("IM")) && (
            <p className="mb-2 text-xs text-muted-foreground">
              <span className="font-medium">IM</span> = zwemdekseltank
            </p>
          )}
          {(tanksQ.data ?? []).length === 0 ? (
            <EmptyState message="Nog geen tanks." icon={<Container className="h-6 w-6" />} />
          ) : (
            <ul className="space-y-1.5">
              {(tanksQ.data ?? []).map((t) => {
                const info = TANK_STATUSSEN.find((s) => s.value === t.status);
                return (
                  <li key={t.id}>
                    <Link
                      to="/kelder/tanks/$tankId"
                      params={{ tankId: t.id }}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 active:scale-[0.99]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          Tank {t.code}
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {t.soort} · {t.capaciteit_l > 0 ? `${t.capaciteit_l} L` : "cap. ?"}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.huidige_partij
                            ? `${partijNaam.get(t.huidige_partij) ?? "…"} · ${Math.round(t.huidig_volume_l)} L`
                            : `${info?.emoji} ${info?.label}`}
                          {t.locatie ? ` · ${t.locatie}` : ""}
                        </p>
                      </div>
                      <span className="text-muted-foreground">→</span>
                    </Link>
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
