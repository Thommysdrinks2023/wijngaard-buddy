import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const LS_AFGEWEZEN = "wg.installbanner.afgewezen.v1";

// Toont een "Installeer app"-banner zodra de browser dat toestaat
// (Chrome/Edge/Android). Na afwijzen 30 dagen niet meer tonen.
export function InstalleerBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const afgewezen = localStorage.getItem(LS_AFGEWEZEN);
      if (afgewezen && Date.now() - Number(afgewezen) < 30 * 24 * 60 * 60 * 1000) return;
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!promptEvent) return null;

  return (
    <div className="fixed bottom-36 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2">
      <div
        className="flex items-center gap-3 rounded-2xl border-2 p-3 shadow-xl"
        style={{ backgroundColor: "#27232a", borderColor: "#cac176" }}
      >
        <img src="/logo-icon.png" alt="" className="h-10 w-10 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Installeer Wijngaard Buddy</p>
          <p className="text-xs" style={{ color: "#cac176" }}>
            Als app op je beginscherm — ook offline
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await promptEvent.prompt();
            setPromptEvent(null);
          }}
          className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold"
          style={{ backgroundColor: "#cac176", color: "#27232a" }}
        >
          <Download className="h-4 w-4" /> Installeer
        </button>
        <button
          type="button"
          aria-label="Sluiten"
          onClick={() => {
            localStorage.setItem(LS_AFGEWEZEN, String(Date.now()));
            setPromptEvent(null);
          }}
          className="text-white/60"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
