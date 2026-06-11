import { useQuery } from "@tanstack/react-query";
import { Droplets, Wind, CloudRain, RefreshCw, CloudOff } from "lucide-react";
import { fetchWeer, isWeerGeconfigureerd, owmIconUrl } from "@/lib/weer";

// Huisstijl De Tappenmars
const GROEN = "#b6cfb3";
const GOUD = "#cac176";
const DONKER = "#27232a";

interface WeerKaartProps {
  // compact: één horizontale strook (voor de perceelkaart)
  compact?: boolean;
}

export function WeerKaart({ compact = false }: WeerKaartProps) {
  const geconfigureerd = isWeerGeconfigureerd();

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["weer"],
    queryFn: fetchWeer,
    enabled: geconfigureerd,
    staleTime: 10 * 60 * 1000, // 10 min cache
    refetchInterval: 15 * 60 * 1000, // auto-refresh elke 15 min
    retry: 2,
  });

  if (!geconfigureerd) {
    if (compact) return null;
    return (
      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: GROEN, borderColor: GOUD, color: DONKER }}
      >
        <div className="flex items-center gap-3">
          <CloudOff className="h-5 w-5 shrink-0" style={{ color: DONKER }} />
          <div className="text-sm">
            <p className="font-semibold">Weerfunctie niet ingesteld</p>
            <p className="opacity-80">
              Voeg <code className="rounded bg-white/40 px-1 text-xs">VITE_OWM_API_KEY</code>,{" "}
              <code className="rounded bg-white/40 px-1 text-xs">VITE_WEER_LAT</code> en{" "}
              <code className="rounded bg-white/40 px-1 text-xs">VITE_WEER_LON</code> toe aan{" "}
              <code className="rounded bg-white/40 px-1 text-xs">.env</code> en herstart de app.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section
        className="animate-pulse rounded-2xl border p-4"
        style={{ backgroundColor: GROEN, borderColor: GOUD }}
      >
        <div className="h-8 w-40 rounded-lg bg-white/40" />
        {!compact && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="h-14 rounded-xl bg-white/40" />
            <div className="h-14 rounded-xl bg-white/40" />
            <div className="h-14 rounded-xl bg-white/40" />
          </div>
        )}
      </section>
    );
  }

  if (isError) {
    if (compact) return null;
    return (
      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: GROEN, borderColor: GOUD, color: DONKER }}
      >
        <p className="text-sm font-semibold">Weer kon niet geladen worden</p>
        <p className="text-xs opacity-80">
          {error instanceof Error ? error.message : "Onbekende fout."}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 flex items-center gap-1 text-xs underline"
        >
          <RefreshCw className="h-3 w-3" /> Opnieuw proberen
        </button>
      </section>
    );
  }

  if (!data) return null;

  if (compact) {
    return (
      <section
        className="flex items-center gap-3 rounded-2xl border px-3 py-2"
        style={{ backgroundColor: GROEN, borderColor: GOUD, color: DONKER }}
      >
        <img src={owmIconUrl(data.icoon)} alt={data.omschrijving} className="-my-1 h-10 w-10" />
        <span className="text-xl font-bold tabular-nums">{data.temperatuur}°</span>
        <span className="flex items-center gap-1 text-sm">
          <CloudRain className="h-4 w-4" style={{ color: DONKER }} />
          {data.neerslag1u > 0 ? `${data.neerslag1u} mm` : "Droog"}
        </span>
        <span className="flex items-center gap-1 text-sm">
          <Wind className="h-4 w-4" style={{ color: DONKER }} />
          {data.windsnelheid} m/s
        </span>
        <span className="flex items-center gap-1 text-sm">
          <Droplets className="h-4 w-4" style={{ color: DONKER }} />
          {data.luchtvochtigheid}%
        </span>
      </section>
    );
  }

  const bijgewerkt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <section
      className="rounded-2xl border p-4"
      style={{ backgroundColor: GROEN, borderColor: GOUD, color: DONKER }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h2
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: DONKER }}
        >
          Huidig weer · {data.stad}
        </h2>
        <button
          type="button"
          onClick={() => refetch()}
          title="Ververs weerdata"
          className="opacity-60 transition-opacity hover:opacity-100"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Temperatuur + icoon */}
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: DONKER }}
        >
          <img src={owmIconUrl(data.icoon)} alt={data.omschrijving} className="h-12 w-12" />
        </div>
        <div>
          <p className="text-4xl font-bold tabular-nums leading-none">{data.temperatuur}°C</p>
          <p className="mt-0.5 text-sm capitalize opacity-80">
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
          icoon={<CloudRain className="h-4 w-4" />}
          label="Neerslag"
          waarde={data.neerslag1u > 0 ? `${data.neerslag1u} mm` : "Droog"}
        />
        <WeerStat
          icoon={<Wind className="h-4 w-4" />}
          label="Wind"
          waarde={`${data.windsnelheid} m/s`}
        />
        <WeerStat
          icoon={<Droplets className="h-4 w-4" />}
          label="Vochtigheid"
          waarde={`${data.luchtvochtigheid}%`}
        />
      </div>

      {/* Footer */}
      {bijgewerkt && (
        <p className="mt-3 text-right text-[10px] opacity-60">Bijgewerkt om {bijgewerkt}</p>
      )}
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
    <div
      className="flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center"
      style={{ backgroundColor: "rgba(255,255,255,0.35)", borderColor: GOUD, color: DONKER }}
    >
      {icoon}
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-sm font-bold tabular-nums">{waarde}</p>
    </div>
  );
}
