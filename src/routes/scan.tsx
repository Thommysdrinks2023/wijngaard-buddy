import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchRijen } from "@/lib/data";
import { AppHeader } from "@/components/app-header";
import { Camera, FlaskConical, Keyboard } from "lucide-react";

export const Route = createFileRoute("/scan")({
  component: ScanPage,
  head: () => ({ meta: [{ title: "QR scannen — Wijngaard" }] }),
});

// Minimale typedeclaratie voor de (Chrome/Android) BarcodeDetector API
interface BarcodeDetectorachtig {
  detect: (bron: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opties?: { formats: string[] }) => BarcodeDetectorachtig;
  }
}

function parseRijnummer(tekst: string): number | null {
  const match = /^WG-RIJ-(\d+)$/.exec(tekst.trim());
  if (!match) return null;
  const nr = Number(match[1]);
  return Number.isInteger(nr) && nr > 0 ? nr : null;
}

function ScanPage() {
  const navigate = useNavigate();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scannerActief, setScannerActief] = useState(false);
  const [scannerBeschikbaar, setScannerBeschikbaar] = useState<boolean | null>(null);
  const [naarMeting, setNaarMeting] = useState(false);
  const [handmatig, setHandmatig] = useState("");
  // refs zodat de scan-loop altijd de actuele waarden ziet
  const naarMetingRef = useRef(false);
  naarMetingRef.current = naarMeting;
  const rijenRef = useRef(rijenQ.data);
  rijenRef.current = rijenQ.data;

  useEffect(() => {
    setScannerBeschikbaar(typeof window !== "undefined" && Boolean(window.BarcodeDetector));
  }, []);

  const openRij = (rijnummer: number, viaMeting: boolean) => {
    const rij = (rijenRef.current ?? []).find((r) => r.rijnummer === rijnummer);
    if (!rij) {
      toast.error(`Rij ${rijnummer} niet gevonden`);
      return;
    }
    toast.success(`Rij ${rijnummer} · ${rij.ras}`);
    if (viaMeting) {
      navigate({ to: "/rij/$rijId/meting", params: { rijId: rij.id } });
    } else {
      navigate({ to: "/rij/$rijId", params: { rijId: rij.id } });
    }
  };

  // camera + detectielus
  useEffect(() => {
    if (!scannerActief) return;
    let stream: MediaStream | null = null;
    let gestopt = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (gestopt || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            for (const code of codes) {
              const nr = parseRijnummer(code.rawValue);
              if (nr != null) {
                setScannerActief(false);
                openRij(nr, naarMetingRef.current);
                return;
              }
            }
          } catch {
            // detectiefout in dit frame — volgende frame opnieuw
          }
        }, 350);
      } catch {
        toast.error("Camera niet beschikbaar. Gebruik het rijnummer hieronder.");
        setScannerActief(false);
      }
    })();

    return () => {
      gestopt = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerActief]);

  return (
    <>
      <AppHeader back title="QR scannen" subtitle="Scan een rijcode" />
      <div className="mx-auto max-w-screen-md space-y-5 px-3 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scan een rij</h1>
          <p className="text-sm text-muted-foreground">
            Richt de camera op de QR-code aan de rijpaal.
          </p>
        </div>

        {/* na scannen: rijpagina of direct meten */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setNaarMeting(false)}
            className={`flex h-12 items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold ${
              !naarMeting
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card"
            }`}
          >
            Rij openen
          </button>
          <button
            type="button"
            onClick={() => setNaarMeting(true)}
            className={`flex h-12 items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold ${
              naarMeting
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card"
            }`}
          >
            <FlaskConical className="h-4 w-4" /> Direct meten
          </button>
        </div>

        {scannerBeschikbaar ? (
          <section className="overflow-hidden rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            {scannerActief ? (
              <div className="relative">
                <video
                  ref={videoRef}
                  className="h-72 w-full bg-black object-cover"
                  playsInline
                  muted
                />
                <button
                  type="button"
                  onClick={() => setScannerActief(false)}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-foreground"
                >
                  Stop scanner
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setScannerActief(true)}
                className="flex h-72 w-full flex-col items-center justify-center gap-3"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                <Camera className="h-12 w-12" />
                <span className="text-base font-semibold">Start camera</span>
              </button>
            )}
          </section>
        ) : scannerBeschikbaar === false ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            QR-scannen via de camera werkt in deze browser niet (alleen Chrome op Android
            ondersteunt dit). Gebruik het rijnummer hieronder — net zo snel.
          </p>
        ) : null}

        {/* handmatige invoer als alternatief */}
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Keyboard className="h-4 w-4" /> Of typ het rijnummer
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const nr = Number(handmatig);
              if (!Number.isInteger(nr) || nr <= 0) {
                toast.error("Vul een geldig rijnummer in");
                return;
              }
              openRij(nr, naarMeting);
            }}
            className="flex gap-2"
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={68}
              value={handmatig}
              onChange={(e) => setHandmatig(e.target.value)}
              placeholder="Bijv. 12"
              className="h-12 flex-1 rounded-xl border border-input bg-background px-3 text-base"
            />
            <button
              type="submit"
              className="h-12 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
            >
              Ga
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
