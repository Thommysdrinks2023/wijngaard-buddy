import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchRijen } from "@/lib/data";
import { createRijLocatie, fetchRijLocaties, nieuwsteLocaties } from "@/lib/extra-data";
import { useInvoerder } from "@/lib/use-invoerder";
import { getWijngaardConfig } from "@/lib/wijngaard-config";
import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/error-state";
import { Crosshair, Loader2, MapPin, Satellite } from "lucide-react";

export const Route = createFileRoute("/kaart")({
  component: KaartPage,
  head: () => ({
    meta: [
      { title: "GPS-kaart — Wijngaard" },
      { name: "description", content: "Echte kaart met GPS-locaties per rij." },
    ],
  }),
});

function KaartPage() {
  const qc = useQueryClient();
  const [invoerder] = useInvoerder();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const locatiesQ = useQuery({ queryKey: ["rij_locaties"], queryFn: fetchRijLocaties });

  const kaartDivRef = useRef<HTMLDivElement>(null);
  const kaartRef = useRef<Leaflet.Map | null>(null);
  const markersRef = useRef<Leaflet.LayerGroup | null>(null);
  const eigenLocatieRef = useRef<Leaflet.Marker | null>(null);
  const lRef = useRef<typeof Leaflet | null>(null);
  const [kaartKlaar, setKaartKlaar] = useState(false);
  const [satelliet, setSatelliet] = useState(true);
  const lagenRef = useRef<{ straat: Leaflet.TileLayer; satelliet: Leaflet.TileLayer } | null>(null);

  const [gekozenRij, setGekozenRij] = useState("");

  const locatiePerRij = useMemo(() => nieuwsteLocaties(locatiesQ.data ?? []), [locatiesQ.data]);

  // Kaart initialiseren (alleen in de browser — Leaflet kan niet op de server)
  useEffect(() => {
    let gestopt = false;
    (async () => {
      if (!kaartDivRef.current || kaartRef.current) return;
      const L = (await import("leaflet")).default;
      if (gestopt || !kaartDivRef.current) return;
      lRef.current = L;

      // middelpunt uit de wijngaard-configuratie (lat/lon)
      const cfg = getWijngaardConfig();
      const kaart = L.map(kaartDivRef.current, { zoomControl: true }).setView(
        [cfg.lat, cfg.lon],
        17,
      );
      const straat = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      });
      const sat = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "© Esri", maxZoom: 19 },
      );
      sat.addTo(kaart); // satelliet is voor een wijngaard het nuttigst
      lagenRef.current = { straat, satelliet: sat };
      markersRef.current = L.layerGroup().addTo(kaart);
      kaartRef.current = kaart;
      setKaartKlaar(true);
    })();
    return () => {
      gestopt = true;
      kaartRef.current?.remove();
      kaartRef.current = null;
    };
  }, []);

  // Laag wisselen
  useEffect(() => {
    const kaart = kaartRef.current;
    const lagen = lagenRef.current;
    if (!kaart || !lagen) return;
    if (satelliet) {
      kaart.removeLayer(lagen.straat);
      lagen.satelliet.addTo(kaart);
    } else {
      kaart.removeLayer(lagen.satelliet);
      lagen.straat.addTo(kaart);
    }
  }, [satelliet, kaartKlaar]);

  // Markers tekenen
  useEffect(() => {
    const L = lRef.current;
    const groep = markersRef.current;
    if (!L || !groep || !kaartKlaar) return;
    groep.clearLayers();
    const rijenById = new Map((rijenQ.data ?? []).map((r) => [r.rijnummer, r]));
    locatiePerRij.forEach((loc, rijnummer) => {
      const rij = rijenById.get(rijnummer);
      const icoon = L.divIcon({
        className: "",
        html: `<div style="background:#4a8c5c;border:2px solid #ffffff;border-radius:9999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.3)">${rijnummer}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([loc.lat, loc.lon], { icon: icoon })
        .bindPopup(
          `<strong>Rij ${rijnummer}</strong>${rij ? `<br/>${rij.ras} · ${rij.aantal_planten} planten` : ""}<br/><small>vastgelegd ${loc.datum}</small>${rij ? `<br/><a href="/rij/${rij.id}">→ Rij openen</a>` : ""}`,
        )
        .addTo(groep);
    });
  }, [locatiePerRij, rijenQ.data, kaartKlaar]);

  const toonEigenLocatie = () => {
    const L = lRef.current;
    const kaart = kaartRef.current;
    if (!L || !kaart) return;
    if (!navigator.geolocation) {
      toast.error("GPS niet beschikbaar op dit apparaat");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const punt: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        eigenLocatieRef.current?.remove();
        const icoon = L.divIcon({
          className: "",
          html: `<div style="background:#2563eb;border:3px solid white;border-radius:9999px;width:18px;height:18px;box-shadow:0 0 0 2px #2563eb55"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        eigenLocatieRef.current = L.marker(punt, { icon: icoon }).addTo(kaart);
        kaart.setView(punt, 18);
      },
      () => toast.error("Locatie ophalen mislukt — staat GPS aan?"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const vastleggen = useMutation({
    mutationFn: async () => {
      const rij = (rijenQ.data ?? []).find((r) => r.id === gekozenRij);
      if (!rij) throw new Error("Kies eerst een rij");
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("GPS niet beschikbaar op dit apparaat"));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          resolve,
          () => reject(new Error("Locatie ophalen mislukt — staat GPS aan?")),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      });
      return createRijLocatie({
        rijnummer: rij.rijnummer,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        datum: format(new Date(), "yyyy-MM-dd"),
        ingevoerd_door: invoerder,
      });
    },
    onSuccess: (loc) => {
      toast.success(`Locatie van rij ${loc.rijnummer} vastgelegd ✓`);
      qc.invalidateQueries({ queryKey: ["rij_locaties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AppHeader back title="GPS-kaart" subtitle="Locaties per rij" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">GPS-kaart</h1>
            <p className="text-sm text-muted-foreground">
              {locatiePerRij.size} van {rijenQ.data?.length ?? 0} rijen vastgelegd
            </p>
          </div>
        </div>

        {/* Kaart */}
        <div className="overflow-hidden rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <div ref={kaartDivRef} className="h-80 w-full" />
          <div className="flex divide-x divide-border border-t border-border bg-card">
            <button
              type="button"
              onClick={() => setSatelliet((v) => !v)}
              className="flex h-12 flex-1 items-center justify-center gap-2 text-sm font-semibold"
            >
              <Satellite className="h-4 w-4" />
              {satelliet ? "Naar stratenkaart" : "Naar satelliet"}
            </button>
            <button
              type="button"
              onClick={toonEigenLocatie}
              className="flex h-12 flex-1 items-center justify-center gap-2 text-sm font-semibold"
            >
              <Crosshair className="h-4 w-4" />
              Mijn locatie
            </button>
          </div>
        </div>

        {locatiesQ.isError && (
          <ErrorState error={locatiesQ.error} onRetry={() => locatiesQ.refetch()} />
        )}

        {/* GPS vastleggen */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <MapPin className="h-4 w-4" /> Rijlocatie vastleggen
          </h2>
          <p className="text-xs text-muted-foreground">
            Ga bij de rijpaal staan, kies de rij en druk op vastleggen. Opnieuw vastleggen
            overschrijft de oude locatie.
          </p>
          <div className="flex gap-2">
            <select
              value={gekozenRij}
              onChange={(e) => setGekozenRij(e.target.value)}
              className="h-12 flex-1 rounded-xl border border-input bg-background px-3 text-base"
            >
              <option value="">Kies rij…</option>
              {(rijenQ.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  Rij {r.rijnummer} · {r.ras}
                  {locatiePerRij.has(r.rijnummer) ? " ✓" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => vastleggen.mutate()}
              disabled={vastleggen.isPending || !gekozenRij}
              className="flex h-12 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {vastleggen.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
              Vastleggen
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
