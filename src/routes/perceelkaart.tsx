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
  Muscaris: "#fde68a",
  "Souveginier Gris": "#eab308",
  Johanniter: "#86efac",
  Regent: "#7e22ce",
  "Pinot Noir": "#7f1d1d",
  Chardonnay: "#bbf7d0",
  Pinotin: "#5c1a2b",
};

function Perceelkaart() {
  const navigate = useNavigate();
  const rijenQ = useQuery({ queryKey: ["rijen"], queryFn: fetchRijen });
  const metingenQ = useQuery({ queryKey: ["metingen"], queryFn: () => fetchMetingen() });
  const obsQ = useQuery({ queryKey: ["observaties"], queryFn: () => fetchObservaties() });
  const fenQ = useQuery({ queryKey: ["fenologie"], queryFn: () => fetchFenologie() });

  const recencyByRij = useMemo(() => {
    const map = new Map<string, { recentMeting: boolean; recentZiekteSchade: boolean }>();
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

  const ontbrekendKnopbreek = useMemo(() => {
    const set = new Set<string>();
    const now = new Date();
    const huidigJaar = now.getFullYear();
    const eersteApril = new Date(huidigJaar, 3, 1);
    if (now < eersteApril) return set;
    const knopbreekRijen = new Set<string>();
    fenQ.data?.forEach((f) => {
      try {
        if (f.moment === "Knopbreek" && parseISO(f.datum).getFullYear() === huidigJaar) {
          knopbreekRijen.add(f.rij);
        }
      } catch {}
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

  // SVG canvas
  const VB_W = 800;
  const VB_H = 500;

  // Inset margins binnen het perceel
  const MARGIN_X = 40;
  const MARGIN_TOP = 50; // ruimte voor rijnummers boven
  const MARGIN_BOTTOM = 30;

  const innerW = VB_W - MARGIN_X * 2;
  const innerTop = MARGIN_TOP;
  const innerBottom = VB_H - MARGIN_BOTTOM;
  const innerH = innerBottom - innerTop;

  // Rij-lengtes (proportioneel aan aantal planten)
  const MIN_LEN = 30;
  const MAX_LEN = innerH;

  const N = rijen.length;

  // Alle rijen starten bovenaan op dezelfde horizontale lijn (yTop = innerTop)
  // en hangen naar beneden. Bottom-rand volgt dus de rij-tips (licht gebogen).

  // Maximum length op basis van een "vol" rij (bv. 91 planten) zodat de onderlijn vast ligt
  const FULL_PLANTEN = maxPlanten;

  // Pre-compute rij geometry
  const rijGeom = rijen.map((r, i) => {
    const t = N === 1 ? 0.5 : i / (N - 1);
    const x = MARGIN_X + 8 + t * (innerW - 16);
    const len = MIN_LEN + (r.aantal_planten / FULL_PLANTEN) * (MAX_LEN - MIN_LEN);
    const fullLen = MIN_LEN + (MAX_LEN - MIN_LEN); // lengte van volle rij = onderlijn perceel
    const perceelBottom = innerTop + fullLen;
    // Uitzondering: rij 68 groeit van onderkant omhoog
    const groeitVanOnder = r.rijnummer === 68;
    const yTop = groeitVanOnder ? perceelBottom - len : innerTop;
    const yBottom = groeitVanOnder ? perceelBottom : innerTop + len;
    return { r, t, x, yTop, yBottom, len, groeitVanOnder, perceelBottom };
  });

  // Perceelvorm: rechte bovenrand, diagonale onderrand die de tips volgt
  const PERCEEL_PATH_2 = (() => {
    if (rijGeom.length === 0) return "";
    const leftX = MARGIN_X;
    const rightX = VB_W - MARGIN_X;
    const topY = innerTop - 6;
    const first = rijGeom[0];
    const last = rijGeom[rijGeom.length - 1];
    // Volg tips van rechts naar links
    const reversed = [...rijGeom].reverse();
    const tipsPath = reversed.map((g) => `L ${g.x.toFixed(1)} ${(g.yBottom + 6).toFixed(1)}`).join(" ");
    return `
      M ${leftX} ${topY}
      L ${rightX} ${topY}
      L ${rightX} ${(last.yBottom + 6).toFixed(1)}
      ${tipsPath}
      L ${leftX} ${(first.yBottom + 6).toFixed(1)}
      Z
    `;
  })();

  return (
    <>
      <AppHeader title="Perceelkaart" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Perceelkaart</h1>
          <p className="text-sm text-muted-foreground">
            Bovenaanzicht · {rijen.length} rijen · hoogte = aantal planten
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card p-3">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            width={VB_W}
            className="h-auto"
            style={{ maxWidth: "100%", minWidth: 600 }}
            role="img"
            aria-label="Bovenaanzicht wijngaard"
          >
            <rect x="0" y="0" width={VB_W} height={VB_H} fill="hsl(95 25% 95%)" />

            {/* Perceel omtrek */}
            <path
              d={PERCEEL_PATH_2}
              fill="#E8F5E9"
              stroke="#2E7D32"
              strokeWidth="2"
              strokeDasharray="6 4"
              strokeLinejoin="round"
            />

            {/* Rijen — verticaal, hangen vanaf de bovenrand */}
            {rijGeom.map(({ r, x, yTop, yBottom }) => {
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
                  {/* Tap target */}
                  <line x1={x} y1={yTop} x2={x} y2={yBottom} stroke="transparent" strokeWidth="10" />
                  {/* Zichtbare rij */}
                  <line
                    x1={x}
                    y1={yTop}
                    x2={x}
                    y2={yBottom}
                    stroke={color}
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  {/* Status indicator aan de tip (onderkant) */}
                  {rec?.recentZiekteSchade && (
                    <circle cx={x} cy={yBottom} r="4" fill="hsl(var(--warning, 38 92% 50%))" stroke="white" strokeWidth="1.5" />
                  )}
                  {!rec?.recentZiekteSchade && rec?.recentMeting && (
                    <circle cx={x} cy={yBottom} r="3.5" fill="hsl(142 71% 45%)" stroke="white" strokeWidth="1.5" />
                  )}
                  {!rec?.recentZiekteSchade && !rec?.recentMeting && ontbrekendKnopbreek.has(r.id) && (
                    <circle cx={x} cy={yBottom} r="3.5" fill="hsl(0 0% 70%)" stroke="white" strokeWidth="1.5" />
                  )}
                  {/* Rijnummer boven de bovenrand */}
                  {showLabel && (
                    <text
                      x={x}
                      y={yTop - 10}
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
