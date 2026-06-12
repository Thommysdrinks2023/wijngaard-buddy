import { Inbox } from "lucide-react";

export const SEIZOEN_LEEG_MSG =
  "Geen data beschikbaar voor dit seizoen — voer je eerste meting in om te beginnen.";

interface EmptyStateProps {
  message?: string;
  className?: string;
  icon?: React.ReactNode;
}

export function EmptyState({ message = SEIZOEN_LEEG_MSG, className = "", icon }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center ${className}`}
    >
      <div className="text-muted-foreground/70">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
