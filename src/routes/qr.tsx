import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { fetchRijen } from "@/lib/data";
import { AppHeader } from "@/components/app-header";
import { Printer, ScanLine } from "lucide-react";

export const Route = createFileRoute("/qr")({
  component: QrPage,
  head: () => ({ meta: [{ title: "QR-codes — Wijngaard" }] }),
});

// QR-inhoud per rij: apparaat-onafhankelijk via het rijnummer
// (de scanner op /scan herkent dit patroon: WG-RIJ-<nummer>)
function qrInhoud(rijnummer: number): string {
  return `WG-RIJ-${rijnummer}`;
}

function QrPage() {
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const [codes, setCodes] = useState<Record<number, string>>({});

  useEffect(() => {
    let actief = true;
    (async () => {
      const map: Record<number, string> = {};
      for (const r of rijenQ.data ?? []) {
        map[r.rijnummer] = await QRCode.toDataURL(qrInhoud(r.rijnummer), {
          width: 220,
          margin: 1,
          color: { dark: "#1a1a1a", light: "#ffffff" },
        });
      }
      if (actief) setCodes(map);
    })();
    return () => {
      actief = false;
    };
  }, [rijenQ.data]);

  const rijen = rijenQ.data ?? [];

  return (
    <>
      {/* bij afdrukken alleen het QR-vel tonen */}
      <style>{`
        @media print {
          header, nav, .geen-print { display: none !important; }
          .print-vel { padding: 0 !important; }
          .qr-kaartje { break-inside: avoid; }
          body { background: white !important; }
        }
      `}</style>
      <AppHeader back title="QR-codes" subtitle="Printbaar vel per rij" />
      <div className="print-vel mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <div className="geen-print flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">QR-codes</h1>
            <p className="text-sm text-muted-foreground">
              Print dit vel, lamineer de codes en hang ze aan de rijpalen. Scannen opent direct de
              juiste rij.
            </p>
          </div>
        </div>

        <div className="geen-print grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
          >
            <Printer className="h-4 w-4" /> Afdrukken (A4)
          </button>
          <Link
            to="/scan"
            className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-semibold text-foreground"
          >
            <ScanLine className="h-4 w-4" /> Naar de scanner
          </Link>
        </div>

        {rijen.length === 0 ? (
          <p className="text-sm text-muted-foreground">Rijen laden…</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 print:grid-cols-5">
            {rijen.map((r) => (
              <div
                key={r.id}
                className="qr-kaartje flex flex-col items-center rounded-xl border border-border bg-white p-2 text-center"
              >
                {codes[r.rijnummer] ? (
                  <img src={codes[r.rijnummer]} alt={`QR rij ${r.rijnummer}`} className="w-full" />
                ) : (
                  <div className="aspect-square w-full animate-pulse rounded bg-muted" />
                )}
                <p className="mt-1 text-sm font-bold leading-tight text-foreground">
                  Rij {r.rijnummer}
                </p>
                <p className="text-[10px] leading-tight text-muted-foreground">{r.ras}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
