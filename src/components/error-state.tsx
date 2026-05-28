import { Link } from "@tanstack/react-router";
import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  error?: unknown;
  onRetry?: () => void;
  invoerHref?: string;
  invoerLabel?: string;
  className?: string;
}

function errorMessage(e: unknown): string | undefined {
  if (!e) return undefined;
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return undefined;
}

export function ErrorState({
  message = "Gegevens konden niet worden geladen of gelezen.",
  error,
  onRetry,
  invoerHref,
  invoerLabel = "Ga naar invoer",
  className = "",
}: ErrorStateProps) {
  const detail = errorMessage(error);
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-6 text-center ${className}`}
    >
      <AlertCircle className="h-6 w-6 text-destructive" />
      <div>
        <p className="text-sm font-medium text-destructive">{message}</p>
        {detail && (
          <p className="mt-1 text-xs text-muted-foreground break-words">{detail}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-medium hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Opnieuw proberen
          </button>
        )}
        {invoerHref && (
          <Link
            to={invoerHref as never}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            {invoerLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
