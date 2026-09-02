// Fase 18 Blok B — generieke statistiek-tegel voor dashboardoverzichten.
// Bewust hier (niet in een specifieke module-map): geschikt voor hergebruik
// op andere dashboards (kelder, voorraad, verkoop) zodra die ook een
// overzichtsherontwerp krijgen.
import type { ReactNode } from "react";

type StatTileToon = "neutraal" | "success" | "warning" | "destructive" | "info";

const TOON_KLASSEN: Record<StatTileToon, string> = {
  neutraal: "border-border bg-card text-foreground",
  success: "border-success/30 bg-success/10 text-foreground",
  warning: "border-warning/40 bg-warning/10 text-foreground",
  destructive: "border-destructive/30 bg-destructive/10 text-foreground",
  info: "border-primary/30 bg-primary-soft text-foreground",
};

interface StatTileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  toon?: StatTileToon;
  className?: string;
}

export function StatTile({
  label,
  value,
  sub,
  icon,
  toon = "neutraal",
  className = "",
}: StatTileProps) {
  return (
    <div
      className={`flex min-h-[76px] flex-col justify-center gap-0.5 rounded-xl border p-3 ${TOON_KLASSEN[toon]} ${className}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
