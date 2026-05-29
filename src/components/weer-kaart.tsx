import { useQuery } from "@tanstack/react-query";
import { Droplets, Wind, Thermometer, RefreshCw, CloudOff } from "lucide-react";
import { fetchWeer, isWeerGeconfigureerd, owmIconUrl, temperatuurKleur } from "@/lib/weer";

export function WeerKaart() {
  const geconfigureerd = isWeerGeconfigureerd();

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["weer"],
    queryFn: fetchWeer,
    enabled: geconfigureerd,
    staleTime: 10 * 60 * 1000,   // 10 min cache
    refetchInterval: 15 * 60 * 1000, // auto-refresh elke 15 min
    retry: 2,
  });

  if (!geconfigureerd) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Huidig weer
        </h2>
        <div className="flex items-center gap-3 text-muted-foreground">
          <CloudOff className="h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Weerfunctie niet ingesteld</p>
            <p>
              Voeg{" "}
              <code className="rounded bg-muted px-1 text-xs">VITE_OWM_API_KEY</code>,{" "}
              <code className="rounded bg-muted px-1 text-xs">VITE_WEER_LAT</code> en{" "}
              <code className="rounded bg-muted px-1 text-xs">VITE_WEER_LON</code> toe aan je{" "}
              <code className="rounded bg-muted px-1 text-xs">.env</code>-bestand.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Huidig weer
        </h2>
        <div className="animate-pulse space-y-3">
          <div className="h-10 w-32 rounded-lg bg-muted" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-14 rounded-xl bg-muted" />
            <div className="h-14 rounded-xl bg-muted" />
            <div className="h-14 rounded-xl bg-muted" />
          </div>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Huidig weer
        </h2>
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Kon weerdata niet laden."}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 flex items-center gap-1 text-xs text-muted-foreground underline"
        >
          <RefreshCw className="h-3 w-3" /> Opnieuw proberen
        </button>
      </section>
    );
  }

  if (!data) return null;

  const bijgewerkt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Huidig weer · {data.stad}
        </h2>
        <button
          type="button"
          onClick={() => refetch()}
          title="Ververs weerdata"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Temperatuur + icoon */}
      <div className="mb-4 flex items-center gap-3">
        <img
          src={owmIconUrl(data.icoon)}
          alt={data.omschrijving}
          className="h-14 w-14"
        />
        <div>
          <p className={`text-4xl font-bold tabular-nums leading-none ${temperatuurKleur(data.temperatuur)}`}>
            {data.temperatuur}°C
          </p>
          <p className="mt-0.5 text-sm capitalize text-muted-foreground">
            {data.omschrijving}
            {data.gevoelstemperatuur !== data.temperatuur && (
              <span> · voelt als {data.gevoelstemperatuur}°C</span>
            )}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <WeerStat
          icoon={<Droplets className="h-4 w-4 text-sky-500" />}
          label="Vochtigheid"
          waarde={`${data.luchtvochtigheid}%`}
        />
        <WeerStat
          icoon={<Thermometer className="h-4 w-4 text-orange-400" />}
          label="Neerslag"
          waarde={data.neerslag1u > 0 ? `${data.neerslag1u} mm` : "Geen"}
        />
        <WeerStat
          icoon={<Wind className="h-4 w-4 text-slate-400" />}
          label="Wind"
          waarde={`${data.windsnelheid} m/s`}
        />
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground/60">
          Bron: {data.bron === "openweathermap" ? "OpenWeatherMap" : "Weerstation"}
        </p>
        {bijgewerkt && (
          <p className="text-[10px] text-muted-foreground/60">Bijgewerkt om {bijgewerkt}</p>
        )}
      </div>
    </section>
  );
}

function WeerStat({
  icoon,
  label,
  waarde,
}: {
  icoon: React.ReactNode;
  label: string;
  waarde: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-muted/40 px-2 py-3 text-center">
      {icoon}
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-bold tabular-nums">{waarde}</p>
    </div>
  );
}
