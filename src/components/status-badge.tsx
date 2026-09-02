// Fase 18 Blok B — generieke statuspil (emoji + label, gekleurd op toon).
// Hier geplaatst i.p.v. in de pasteurisatie-map omdat elk dashboard met een
// status/oordeel-kolom (kelder, voorraad, verkoop) dit patroon kan hergebruiken.
type StatusBadgeToon = "neutraal" | "success" | "warning" | "destructive" | "info";

const TOON_KLASSEN: Record<StatusBadgeToon, string> = {
  neutraal: "border-border bg-muted/40 text-foreground",
  success: "border-success/40 bg-success/15 text-foreground",
  warning: "border-warning/50 bg-warning/15 text-foreground",
  destructive: "border-destructive/40 bg-destructive/15 text-foreground",
  info: "border-primary/40 bg-primary-soft text-foreground",
};

interface StatusBadgeProps {
  label: string;
  emoji?: string;
  toon?: StatusBadgeToon;
  className?: string;
}

export function StatusBadge({ label, emoji, toon = "neutraal", className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${TOON_KLASSEN[toon]} ${className}`}
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      {label}
    </span>
  );
}
