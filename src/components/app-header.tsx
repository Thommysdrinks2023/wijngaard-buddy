import { Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Search } from "lucide-react";
import { VerbindingBadge } from "@/components/verbinding-status";
import { useWijngaardConfig } from "@/lib/use-wijngaard-config";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
}

export function AppHeader({ title, subtitle, back, right }: AppHeaderProps) {
  const router = useRouter();
  const { naam } = useWijngaardConfig();
  return (
    <header
      className="sticky top-0 z-30 bg-nav text-nav-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-16 max-w-screen-md items-center gap-2 px-3">
        {back ? (
          <button
            onClick={() => router.history.back()}
            aria-label="Terug"
            className="-ml-1 flex h-12 w-12 items-center justify-center rounded-lg text-nav-foreground hover:bg-white/10"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : (
          <Link to="/perceelkaart" className="flex h-12 items-center gap-2 px-1">
            <img src="/logo-icon.png" alt={naam} className="h-9 w-9 object-contain" />
            <span className="text-base font-semibold tracking-tight text-nav-foreground">
              {naam}
            </span>
          </Link>
        )}
        <div className="flex-1 truncate">
          {back && (
            <>
              <h1 className="truncate text-base font-semibold leading-tight text-nav-foreground">
                {title}
              </h1>
              {subtitle && <p className="truncate text-xs text-nav-muted">{subtitle}</p>}
            </>
          )}
        </div>
        <Link
          to="/zoeken"
          aria-label="Zoeken in alle registraties"
          className="flex h-12 w-10 items-center justify-center text-nav-foreground"
        >
          <Search className="h-5 w-5" />
        </Link>
        <VerbindingBadge />
        {right}
      </div>
    </header>
  );
}
