import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppHeader } from "@/components/app-header";
import {
  getAutoStartModule,
  getLaatsteModule,
  MODULE_ROUTES,
  setLaatsteModule,
} from "@/lib/module-keuze";

export const Route = createFileRoute("/")({
  component: ModuleHub,
  head: () => ({ meta: [{ title: "Tappenmars Buddy" }] }),
});

const TEGELS = [
  {
    key: "wijngaard",
    to: "/wijngaard",
    emoji: "🌿",
    label: "Wijngaard",
    omschrijving: "Rijen, metingen en veldwerk",
  },
  {
    key: "kelder",
    to: "/kelder",
    emoji: "🍷",
    label: "Kelder",
    omschrijving: "Tanks, partijen en tankboek",
  },
  {
    key: "assistent",
    to: "/assistent",
    emoji: "✨",
    label: "Assistent",
    omschrijving: "AI-hulp met je actuele data",
  },
] as const;

function ModuleHub() {
  const navigate = useNavigate();

  // Client-only: localStorage bestaat niet tijdens SSR, dus deze check kan
  // niet in beforeLoad (die draait ook server-side bij een verse paginalaad).
  useEffect(() => {
    if (!getAutoStartModule()) return;
    const laatste = getLaatsteModule();
    if (laatste) navigate({ to: MODULE_ROUTES[laatste], replace: true });
  }, [navigate]);

  return (
    <>
      <AppHeader title="Tappenmars Buddy" subtitle="Kies een module" />
      <div className="mx-auto max-w-screen-md px-3 py-4">
        <div className="grid grid-cols-2 gap-3">
          {TEGELS.map((tegel) => (
            <Link
              key={tegel.key}
              to={tegel.to}
              onClick={() => setLaatsteModule(tegel.key)}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition active:scale-[0.98]"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-3xl">
                {tegel.emoji}
              </span>
              <span className="text-base font-semibold">{tegel.label}</span>
              <span className="text-xs text-muted-foreground">{tegel.omschrijving}</span>
            </Link>
          ))}
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-6 text-center opacity-50">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-3xl">
              🍾
            </span>
            <span className="text-base font-semibold">Voorraad</span>
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Binnenkort
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
