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
    const update = () =>
      setStaat({ online: getPbStatus() === "online", ingelogd: isIngelogd() });

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
        className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold"
        style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "#ffffff" }}
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
        className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold"
        style={{ backgroundColor: "#cac176", color: "#27232a" }}
        title="Je bent niet ingelogd — invoer synct pas na inloggen"
      >
        <UserX className="h-3.5 w-3.5" />
        Niet ingelogd
      </Link>
    );
  }

  return (
    <span
      className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold"
      style={{ backgroundColor: "rgba(202,193,118,0.18)", color: "#cac176" }}
      title="Verbonden met de server en ingelogd"
    >
      <Wifi className="h-3.5 w-3.5" />
      Online
    </span>
  );
}
