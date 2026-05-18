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
      className="sticky top-0 z-30 border-b border-[#cac176]/40 bg-[#27232a] text-[#fbeecc]"
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
          <Link
            to="/perceelkaart"
            className="flex h-12 items-center gap-2 px-1"
          >
            <img
              src="/logo-icon.png"
              alt="De Tappenmars"
              className="h-9 w-9 object-contain"
            />
            <span className="text-base font-semibold tracking-tight text-[#fbeecc]">
              De Tappenmars
            </span>
          </Link>
        )}
        <div className="flex-1 truncate">
          {back && (
            <>
              <h1 className="truncate text-base font-semibold leading-tight text-[#fbeecc]">
                {title}
              </h1>
              {subtitle && (
                <p className="truncate text-xs text-[#e2d294]">{subtitle}</p>
              )}
            </>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}
