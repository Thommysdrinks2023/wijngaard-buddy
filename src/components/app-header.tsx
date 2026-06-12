import { Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Search } from "lucide-react";
import { VerbindingBadge } from "@/components/verbinding-status";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
}

export function AppHeader({ title, subtitle, back, right }: AppHeaderProps) {
  const router = useRouter();
  return (
    <header
      className="sticky top-0 z-30 border-b border-[#cac176]/40 bg-[#27232a] text-white"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-16 max-w-screen-md items-center gap-2 px-3">
        {back ? (
          <button
            onClick={() => router.history.back()}
            aria-label="Terug"
            className="-ml-1 flex h-12 w-12 items-center justify-center rounded-xl text-[#cac176] hover:bg-[#cac176]/10"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : (
          <Link to="/perceelkaart" className="flex h-12 items-center gap-2 px-1">
            <img src="/logo-icon.png" alt="De Tappenmars" className="h-9 w-9 object-contain" />
            <span className="text-base font-semibold tracking-tight text-white">De Tappenmars</span>
          </Link>
        )}
        <div className="flex-1 truncate">
          {back && (
            <>
              <h1 className="truncate text-base font-semibold leading-tight text-white">{title}</h1>
              {subtitle && <p className="truncate text-xs text-[#cac176]">{subtitle}</p>}
            </>
          )}
        </div>
        <Link
          to="/zoeken"
          aria-label="Zoeken in alle registraties"
          className="flex h-12 w-10 items-center justify-center text-[#cac176]"
        >
          <Search className="h-5 w-5" />
        </Link>
        <VerbindingBadge />
        {right}
      </div>
    </header>
  );
}
