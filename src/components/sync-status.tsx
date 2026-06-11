import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { flushSyncQueue, isPbConfigured } from "@/lib/data";
import { SYNC_CHANGED_EVENT, syncQueueCount } from "@/lib/sync";

// Toont een zwevend balkje wanneer er offline aangemaakte records
// wachten op synchronisatie met de server.
export function SyncStatus() {
  const queryClient = useQueryClient();
  const [aantal, setAantal] = useState(0);
  const [bezig, setBezig] = useState(false);

  const probeerSync = useCallback(async () => {
    if (!isPbConfigured() || syncQueueCount() === 0) return;
    setBezig(true);
    try {
      const res = await flushSyncQueue();
      if (res.verzonden > 0) {
        toast.success(
          res.verzonden === 1
            ? "1 record gesynchroniseerd"
            : `${res.verzonden} records gesynchroniseerd`,
        );
        queryClient.invalidateQueries();
      }
    } finally {
      setBezig(false);
      setAantal(syncQueueCount());
    }
  }, [queryClient]);

  useEffect(() => {
    setAantal(syncQueueCount());
    const upd = () => setAantal(syncQueueCount());
    const onOnline = () => void probeerSync();
    window.addEventListener(SYNC_CHANGED_EVENT, upd);
    window.addEventListener("online", onOnline);
    const timer = setInterval(onOnline, 60_000);
    return () => {
      window.removeEventListener(SYNC_CHANGED_EVENT, upd);
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [probeerSync]);

  if (aantal === 0 || !isPbConfigured()) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2">
      <button
        type="button"
        onClick={() => void probeerSync()}
        disabled={bezig}
        className="flex items-center gap-2 rounded-full border border-warning/40 bg-card px-4 py-2 text-sm font-medium shadow-lg"
      >
        {bezig ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <CloudUpload className="h-4 w-4 text-warning-foreground" />
        )}
        {aantal === 1 ? "1 record wacht op sync" : `${aantal} records wachten op sync`}
        {!bezig && <span className="text-xs text-muted-foreground">· tik om te syncen</span>}
      </button>
    </div>
  );
}
