import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { getPbStatus, isPbConfigured, pingPb } from "@/lib/data";

// INLOGGEN WEER VERWIJDERD (besluit Thomas, 22 augustus 2026): de badge toonde
// eerder drie toestanden (offline / niet ingelogd / ingelogd als <naam>). De
// middelste bestaat niet meer. `ingelogd` blijft wél in het Verbinding-type
// staan en is altijd true: formulieren gebruiken hem voor de
// foto-waarschuwing, en die aanroepen hoeven niet allemaal te wijzigen voor
// een waarde die nu constant is.
export interface Verbinding {
  online: boolean;
  ingelogd: boolean;
}

// Hook: volgt de PocketBase-verbinding.
// Gebruikt door de header-badge en door formulieren (foto-waarschuwing).
export function useVerbinding(): Verbinding {
  const [staat, setStaat] = useState<Verbinding>({ online: false, ingelogd: true });

  useEffect(() => {
    if (!isPbConfigured()) return;
    const update = () => setStaat({ online: getPbStatus() === "online", ingelogd: true });

    update();
    void pingPb().then(update);

    window.addEventListener("wg.pbstatus.changed", update);
    window.addEventListener("online", () => void pingPb().then(update));
    // elke 30s opnieuw controleren zodat de status actueel blijft
    const timer = setInterval(() => void pingPb().then(update), 30_000);
    return () => {
      window.removeEventListener("wg.pbstatus.changed", update);
      clearInterval(timer);
    };
  }, []);

  return staat;
}

// Compacte badge voor in de app-header: offline of online
export function VerbindingBadge() {
  const { online } = useVerbinding();
  if (!isPbConfigured()) return null;

  if (!online) {
    return (
      <span
        className="flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-2.5 text-[11px] font-semibold text-nav-foreground"
        title="Geen verbinding met de server. Wijngaard-invoer (metingen, observaties, oogst) wordt lokaal bewaard en later gesynchroniseerd; kelder, voorraad en verkoop werken alleen online en tonen mogelijk onvolledige lijsten."
      >
        <WifiOff className="h-3.5 w-3.5" />
        Offline
      </span>
    );
  }

  return (
    <span
      className="flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-2.5 text-[11px] font-semibold text-nav-foreground"
      title="Verbonden met de server"
    >
      <Wifi className="h-3.5 w-3.5 shrink-0" />
      Online
    </span>
  );
}
