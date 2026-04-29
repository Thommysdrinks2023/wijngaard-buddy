import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { fetchFenologie, fetchMetingen, fetchObservaties, fetchRijen } from "@/lib/data";
import { RAS_OPTIONS, type Ras } from "@/lib/seed-rijen";
import { AppHeader } from "@/components/app-header";
import { AlertTriangle, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/perceelkaart")({
  component: Perceelkaart,
  head: () => ({
    meta: [
      { title: "Perceelkaart — Wijngaard" },
      { name: "description", content: "Visueel bovenaanzicht van de wijngaard per rij." },
    ],
  }),
});

const RAS_KLEUR: Record<Ras, string> = {
  Muscaris: "#fde68a", // lichtgeel
  "Souveginier Gris": "#eab308", // goudgeel
  Johanniter: "#86efac", // lichtgroen
  Regent: "#7e22ce", // paars
  "Pinot Noir": "#7f1d1d", // donkerrood
  Chardonnay: "#bbf7d0", // lichtgroen (iets lichter dan Johanniter)
  Pinotin: "#5c1a2b", // bordeauxrood
};

function Perceelkaart() {
  const navigate = useNavigate();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const metingenQ = useQuery({ queryKey: ["metingen"], queryFn: () => fetchMetingen() });
  const obsQ = useQuery({ queryKey: ["observaties"], queryFn: () => fetchObservaties() });
  const fenQ = useQuery({ queryKey: ["fenologie"], queryFn: () => fetchFenologie() });

  const recencyByRij = useMemo(() => {
    const map = new Map<
      string,
      { recentMeting: boolean; recentZiekteSchade: boolean }
    >();
    const now = new Date();
    metingenQ.data?.forEach((m) => {
      if (differenceInDays(now, parseISO(m.datum)) < 7) {
        const cur = map.get(m.rij) ?? { recentMeting: false, recentZiekteSchade: false };
        cur.recentMeting = true;
        map.set(m.rij, cur);
      }
    });
    obsQ.data?.forEach((o) => {
      if ((o.type === "ziekte" || o.type === "schade") && differenceInDays(now, parseISO(o.datum)) < 7) {
        const cur = map.get(o.rij) ?? { recentMeting: false, recentZiekteSchade: false };
        cur.recentZiekteSchade = true;
        map.set(o.rij, cur);
      }
    });
    return map;
  }, [metingenQ.data, obsQ.data]);

  // Rijen die dit seizoen nog geen knopbreek hebben (en het is na 1 april)
  const ontbrekendKnopbreek = useMemo(() => {
    const set = new Set<string>();
    const now = new Date();
    const huidigJaar = now.getFullYear();
    const eersteApril = new Date(huidigJaar, 3, 1); // april = month 3
    if (now < eersteApril) return set;
    const knopbreekRijen = new Set<string>();
    fenQ.data?.forEach((f) => {
      try {
        if (f.moment === "Knopbreek" && parseISO(f.datum).getFullYear() === huidigJaar) {
          knopbreekRijen.add(f.rij);
        }
      } catch {
        // ignore
      }
    });
    rijenQ.data?.forEach((r) => {
      if (!knopbreekRijen.has(r.id)) set.add(r.id);
    });
    return set;
  }, [fenQ.data, rijenQ.data]);

  const rijen = useMemo(
    () => [...(rijenQ.data ?? [])].sort((a, b) => a.rijnummer - b.rijnummer),
    [rijenQ.data]
  );

  const maxPlanten = useMemo(
    () => Math.max(1, ...rijen.map((r) => r.aantal_planten)),
    [rijen]
  );

  // SVG canvas — bovenaanzicht zoals luchtfoto
  // Perceel: onregelmatige trapeziumvorm — links smal/kort, rechts breed/lang.
  // Rijen lopen diagonaal van linksonder naar rechtsboven.
  const VB_W = 820;
  const VB_H = 520;

  // Hoekpunten van het perceel (afgeleid uit luchtfoto)
  // SW (linksonder, smalle hoek) → NW (linksboven, kort) → NE (rechtsboven) → SE (rechtsonder)
  const SW = { x: 70, y: 470 };
  const NW = { x: 110, y: 380 };
  const NE = { x: 760, y: 50 };
  const SE = { x: 760, y: 270 };

  // Perceelvorm met licht gebogen onderkant (kwadratische curve via SW)
  const PERCEEL_PATH = `
    M ${NW.x} ${NW.y}
    L ${NE.x} ${NE.y}
    L ${SE.x} ${SE.y}
    Q ${(SW.x + SE.x) / 2} ${SW.y + 30} ${SW.x} ${SW.y}
    Z
  `;

  // Rij-geometrie: rijen lopen diagonaal omhoog-naar-rechts
  const ANGLE_DEG = -55; // hoek t.o.v. horizontaal
  const angleRad = (ANGLE_DEG * Math.PI) / 180;
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);

  // Onderrand: van SW (linksonder) naar SE (rechtsonder) — basis voor de rijen
  const baseDX = SE.x - SW.x;
  const baseDY = SE.y - SW.y;
  const baseLen = Math.hypot(baseDX, baseDY);
  const bUx = baseDX / baseLen;
  const bUy = baseDY / baseLen;

  // Rij-lengtes: proportioneel aan aantal planten
  const MAX_LEN = 380;
  const MIN_LEN = 24;

  const N = rijen.length;
  const startOffset = 18;
  const endOffset = 18;
  const usable = baseLen - startOffset - endOffset;

  return (
    <>
      <AppHeader title="Perceelkaart" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Perceelkaart</h1>
          <p className="text-sm text-muted-foreground">
            Bovenaanzicht · {rijen.length} rijen · lengte = aantal planten
          </p>
        </div>

        {/* Map area — SVG bovenaanzicht */}
        <div className="rounded-2xl border border-border bg-card p-3">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="w-full h-auto"
            style={{ maxHeight: "70vh" }}
            role="img"
            aria-label="Bovenaanzicht wijngaard"
          >
            {/* Achtergrond */}
            <rect x="0" y="0" width={VB_W} height={VB_H} fill="hsl(95 25% 95%)" />

            {/* Perceel omtrek */}
            <path
              d={PERCEEL_PATH}
              fill="#e8f5e9"
              stroke="#1b5e20"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              strokeLinejoin="round"
            />

            {/* Rijen */}
            {rijen.map((r, i) => {
              // Positie langs onderrand (van SW naar SE)
              const t = N === 1 ? 0.5 : i / (N - 1);
              const baseX = SW.x + bUx * (startOffset + t * usable);
              const baseY = SW.y + bUy * (startOffset + t * usable);
              // Lengte direct proportioneel aan aantal planten
              const len = MIN_LEN + (r.aantal_planten / maxPlanten) * (MAX_LEN - MIN_LEN);
              const tipX = baseX + dx * len;
              const tipY = baseY + dy * len;
              const rec = recencyByRij.get(r.id);
              const color = RAS_KLEUR[r.ras];
              const showLabel =
                r.rijnummer % 5 === 0 ||
                r.rijnummer === 1 ||
                r.rijnummer === rijen[rijen.length - 1].rijnummer;
              return (
                <g
                  key={r.id}
                  className="cursor-pointer focus:outline-none"
                  onClick={() => navigate({ to: "/rij/$rijId/planten", params: { rijId: r.id } })}
                  tabIndex={0}
                  role="button"
                  aria-label={`Rij ${r.rijnummer} – ${r.ras}, ${r.aantal_planten} planten`}
                >
                  {/* Klikbaar gebied (breder, transparant) */}
                  <line
                    x1={baseX}
                    y1={baseY}
                    x2={tipX}
                    y2={tipY}
                    stroke="transparent"
                    strokeWidth="12"
                  />
                  {/* Zichtbare rij */}
                  <line
                    x1={baseX}
                    y1={baseY}
                    x2={tipX}
                    y2={tipY}
                    stroke={color}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  {/* Indicator aan de top van de rij */}
                  {rec?.recentZiekteSchade && (
                    <circle cx={tipX} cy={tipY} r="5" fill="hsl(var(--warning, 38 92% 50%))" stroke="white" strokeWidth="1.5" />
                  )}
                  {!rec?.recentZiekteSchade && rec?.recentMeting && (
                    <circle cx={tipX} cy={tipY} r="4" fill="hsl(142 71% 45%)" stroke="white" strokeWidth="1.5" />
                  )}
                  {!rec?.recentZiekteSchade && !rec?.recentMeting && ontbrekendKnopbreek.has(r.id) && (
                    <circle cx={tipX} cy={tipY} r="4" fill="hsl(0 0% 70%)" stroke="white" strokeWidth="1.5" />
                  )}
                  {/* Rijnummer onder de basis */}
                  {showLabel && (
                    <text
                      x={baseX - bUy * 12}
                      y={baseY + bUx * 12 + 4}
                      fontSize="10"
                      fill="hsl(var(--muted-foreground))"
                      textAnchor="middle"
                      className="tabular-nums select-none"
                    >
                      {r.rijnummer}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Kompas */}
            <g transform={`translate(${VB_W - 50}, 40)`}>
              <circle r="22" fill="white" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.9" />
              <polygon points="0,-16 5,4 0,0 -5,4" fill="hsl(0 70% 45%)" />
              <polygon points="0,16 5,-4 0,0 -5,-4" fill="hsl(0 0% 50%)" />
              <text y="-24" textAnchor="middle" fontSize="9" fontWeight="600" fill="hsl(var(--foreground))">N</text>
            </g>
          </svg>
          <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            Tik op een rij om de planten te bekijken
          </p>
        </div>

        {/* Indicator legend */}
        <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-card p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            <span>Recente meting (&lt; 7 dagen)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-warning text-warning-foreground">
              <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <span>Recente ziekte / schade</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground/70">
              <HelpCircle className="h-3 w-3" strokeWidth={2.5} />
            </span>
            <span>Knopbreek nog niet geregistreerd</span>
          </div>
        </div>

        {/* Ras legend */}
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Legenda — rassen
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {RAS_OPTIONS.map((ras) => {
              const count = rijen.filter((r) => r.ras === ras).length;
              return (
                <li
                  key={ras}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                >
                  <span
                    className="h-5 w-5 shrink-0 rounded-md ring-1 ring-black/10"
                    style={{ backgroundColor: RAS_KLEUR[ras] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight">{ras}</p>
                    <p className="text-[11px] text-muted-foreground">{count} rijen</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
