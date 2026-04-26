import { Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

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
      className="sticky top-0 z-30 border-b border-primary/20 bg-primary text-primary-foreground"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-14 max-w-screen-md items-center gap-2 px-3">
        {back ? (
          <button
            onClick={() => router.history.back()}
            aria-label="Terug"
            className="-ml-1 flex h-12 w-12 items-center justify-center rounded-full hover:bg-primary-foreground/10"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : (
          <Link
            to="/perceelkaart"
            className="flex h-12 items-center gap-2 px-1 text-base font-semibold tracking-tight"
          >
            🍇 Wijngaard
          </Link>
        )}
        <div className="flex-1 truncate">
          {back && (
            <>
              <h1 className="truncate text-base font-semibold leading-tight">{title}</h1>
              {subtitle && (
                <p className="truncate text-xs opacity-80">{subtitle}</p>
              )}
            </>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}
