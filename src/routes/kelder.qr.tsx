import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { fetchTanks } from "@/lib/kelder-data";
import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/error-state";
import { Printer } from "lucide-react";

// Fase 7 Blok E — QR-printvel: per tank een QR met de URL naar het tankdetail.
// Printen op A4 (raster, tanknaam + type onder elke code) en op de tank
// plakken; scannen gaat gewoon met de telefooncamera.
export const Route = createFileRoute("/kelder/qr")({
  component: QrPage,
  head: () => ({ meta: [{ title: "QR-codes — Kelder" }] }),
});

function QrPage() {
  const tanksQ = useQuery({ queryKey: ["tanks"], queryFn: fetchTanks });
  const [codes, setCodes] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let actueel = true;
    (async () => {
      const map = new Map<string, string>();
      for (const t of tanksQ.data ?? []) {
        const url = `${window.location.origin}/kelder/tanks/${t.id}`;
        map.set(t.id, await QRCode.toDataURL(url, { width: 220, margin: 1 }));
      }
      if (actueel) setCodes(map);
    })();
    return () => {
      actueel = false;
    };
  }, [tanksQ.data]);

  const tanks = [...(tanksQ.data ?? [])].sort((a, b) =>
    a.code.localeCompare(b.code, "nl", { numeric: true }),
  );

  return (
    <>
      <div className="print:hidden">
        <AppHeader back title="QR-codes" subtitle="Printvel voor op de tanks" />
      </div>
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4 print:max-w-none print:p-0">
        {tanksQ.isError && <ErrorState error={tanksQ.error} onRetry={() => tanksQ.refetch()} />}
        <div className="flex items-center justify-between print:hidden">
          <p className="text-sm text-muted-foreground">
            {tanks.length} tanks · scan met de telefooncamera → tankdetail met Peiling, Reiniging en
            Overhevelen.
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Printer className="h-4 w-4" /> Print (A4)
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 print:grid-cols-4 print:gap-2">
          {tanks.map((t) => (
            <div
              key={t.id}
              className="flex flex-col items-center rounded-xl border border-border bg-card p-2 text-center print:break-inside-avoid print:rounded-none print:border-black/30"
            >
              {codes.get(t.id) ? (
                <img src={codes.get(t.id)} alt={`QR tank ${t.code}`} className="w-full max-w-36" />
              ) : (
                <div className="aspect-square w-full max-w-36 animate-pulse rounded bg-muted" />
              )}
              <p className="mt-1 text-sm font-bold">Tank {t.code}</p>
              <p className="text-[10px] text-muted-foreground">{t.soort}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
