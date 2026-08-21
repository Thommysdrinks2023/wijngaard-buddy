import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Wifi, WifiOff, UserX } from "lucide-react";
import { getPb, getPbStatus, isIngelogd, isPbConfigured, pingPb } from "@/lib/data";

export interface Verbinding {
  online: boolean;
  ingelogd: boolean;
}

// Hook: volgt de PocketBase-verbinding en login-status.
// Gebruikt door de header-badge en door formulieren (foto-waarschuwing).
export function useVerbinding(): Verbinding {
  const [staat, setStaat] = useState<Verbinding>({ online: false, ingelogd: false });

  useEffect(() => {
    if (!isPbConfigured()) return;
    const update = () => setStaat({ online: getPbStatus() === "online", ingelogd: isIngelogd() });

    update();
    void pingPb().then(update);

    window.addEventListener("wg.pbstatus.changed", update);
    window.addEventListener("online", () => void pingPb().then(update));
    const unsubscribeAuth = getPb()?.authStore.onChange(update);
    // elke 30s opnieuw controleren zodat de status actueel blijft
    const timer = setInterval(() => void pingPb().then(update), 30_000);
    return () => {
      window.removeEventListener("wg.pbstatus.changed", update);
      clearInterval(timer);
      unsubscribeAuth?.();
    };
  }, []);

  return staat;
}

// Compacte badge voor in de app-header: offline / niet ingelogd / online
export function VerbindingBadge() {
  const { online, ingelogd } = useVerbinding();
  if (!isPbConfigured()) return null;

  if (!online) {
    return (
      <span
        className="flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-2.5 text-[11px] font-semibold text-nav-foreground"
        title="Geen verbinding met de server — invoer wordt lokaal bewaard en later gesynchroniseerd"
      >
        <WifiOff className="h-3.5 w-3.5" />
        Offline
      </span>
    );
  }

  if (!ingelogd) {
    return (
      <Link
        to="/login"
        className="flex h-8 items-center gap-1.5 rounded-full bg-warning px-2.5 text-[11px] font-semibold text-warning-foreground"
        title="Je bent niet ingelogd — invoer synct pas na inloggen"
      >
        <UserX className="h-3.5 w-3.5" />
        Niet ingelogd
      </Link>
    );
  }

  const record = getPb()?.authStore.record as { name?: string; email?: string } | null;
  const naam = record?.name || record?.email?.split("@")[0] || "Online";

  return (
    <span
      className="flex h-8 max-w-32 items-center gap-1.5 rounded-full bg-white/15 px-2.5 text-[11px] font-semibold text-nav-foreground"
      title={`Verbonden en ingelogd als ${naam}`}
    >
      <Wifi className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{naam}</span>
    </span>
  );
}
