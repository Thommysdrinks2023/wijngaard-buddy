import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { fetchFenologie } from "@/lib/data";
import { FENOLOGIE_MOMENTEN, type FenologieMoment } from "@/lib/types";
import { RAS_OPTIONS, type Ras } from "@/lib/seed-rijen";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/seizoen")({
  component: SeizoenPage,
  head: () => ({
    meta: [
      { title: "Seizoen — Wijngaard" },
      { name: "description", content: "Fenologie-overzicht per ras en moment." },
    ],
  }),
});

function SeizoenPage() {
  const fenQ = useQuery({ queryKey: ["fenologie"], queryFn: () => fetchFenologie() });
  const huidigJaar = new Date().getFullYear();
  const [jaar, setJaar] = useState<number>(huidigJaar);

  const beschikbareJaren = useMemo(() => {
    const set = new Set<number>([huidigJaar]);
    fenQ.data?.forEach((f) => {
      try {
        set.add(parseISO(f.datum).getFullYear());
      } catch {
        // ignore
      }
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [fenQ.data, huidigJaar]);

  // earliest entry per ras x moment for selected year (with id for edit link)
  const grid = useMemo(() => {
    const map = new Map<string, { id: string; datum: string }>();
    fenQ.data?.forEach((f) => {
      try {
        const d = parseISO(f.datum);
        if (d.getFullYear() !== jaar) return;
      } catch {
        return;
      }
      const key = `${f.ras}|${f.moment}`;
      const existing = map.get(key);
      if (!existing || f.datum < existing.datum) {
        map.set(key, { id: f.id, datum: f.datum });
      }
    });
    return map;
  }, [fenQ.data, jaar]);

  return (
    <>
      <AppHeader title="Seizoen" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Seizoensoverzicht</h1>
          <p className="text-sm text-muted-foreground">
            Vroegste fenologie-datum per ras en moment.
          </p>
        </div>

        {/* Jaarselector */}
        <div className="flex items-center gap-2">
          <label htmlFor="jaar" className="text-sm font-medium text-foreground">
            Jaar
          </label>
          <select
            id="jaar"
            value={jaar}
            onChange={(e) => setJaar(Number(e.target.value))}
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
          >
            {beschikbareJaren.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </div>

        {/* Tabel */}
        <div className="rounded-2xl border border-border bg-card p-2">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Ras
                  </th>
                  {FENOLOGIE_MOMENTEN.map((m) => (
                    <th
                      key={m.value}
                      className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-base">{m.emoji}</span>
                        <span>{m.value}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RAS_OPTIONS.map((ras: Ras) => (
                  <tr key={ras}>
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-2 text-left text-sm font-semibold text-foreground">
                      {ras}
                    </th>
                    {FENOLOGIE_MOMENTEN.map((m: { value: FenologieMoment }) => {
                      const entry = grid.get(`${ras}|${m.value}`);
                      if (entry) {
                        return (
                          <td key={m.value} className="px-1 py-1">
                            <Link
                              to="/fenologie/$fenId/bewerken"
                              params={{ fenId: entry.id }}
                              className="flex h-12 min-w-[70px] items-center justify-center rounded-lg bg-success px-2 text-center text-xs font-semibold text-success-foreground active:scale-[0.97] transition"
                              title={`${ras} — ${m.value}: ${entry.datum} (tik om te bewerken)`}
                            >
                              {format(parseISO(entry.datum), "d MMM", { locale: nl })}
                            </Link>
                          </td>
                        );
                      }
                      return (
                        <td key={m.value} className="px-1 py-1">
                          <div className="flex h-12 min-w-[70px] items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                            —
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            ← scroll horizontaal →
          </p>
        </div>

        <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-4 w-6 rounded bg-success" />
            <span>Geregistreerd</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-4 w-6 rounded bg-muted" />
            <span>Nog niet geregistreerd</span>
          </div>
        </div>
      </div>
    </>
  );
}
