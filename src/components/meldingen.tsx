// Fase 7 Blok B — proactieve meldingen op de hub. In-app only, afvinkbaar
// (afgevinkte meldingen onthouden we per id in localStorage).
//
// Fase 10 Blok 2: alle vijf bronnen (onderhoud, backup, AGP, kelderlog-taken,
// kritieke inzichten) zijn verhuisd naar de gedeelde signalen.ts-laag. Deze
// component is nu een dunne wrapper — wordt in bouwstap 3 vervangen door de
// Vandaag-widget (met server-side snooze i.p.v. dit localStorage-mechanisme).

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { verzamelSignalen } from "@/lib/signalen";
import { X } from "lucide-react";

const LS_AFGEVINKT = "wg.meldingen.afgevinkt.v1";

function leesAfgevinkt(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_AFGEVINKT) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function Meldingen() {
  const [afgevinkt, setAfgevinkt] = useState<Set<string>>(leesAfgevinkt);

  const signalenQ = useQuery({
    queryKey: ["signalen", "meldingen"],
    queryFn: verzamelSignalen,
  });

  const zichtbaar = (signalenQ.data ?? []).filter((s) => !afgevinkt.has(s.id));
  if (zichtbaar.length === 0) return null;

  const vinkAf = (id: string) => {
    const next = new Set(afgevinkt);
    next.add(id);
    setAfgevinkt(next);
    try {
      localStorage.setItem(LS_AFGEVINKT, JSON.stringify([...next]));
    } catch {
      /* localStorage optioneel */
    }
  };

  return (
    <section className="mt-3 space-y-1.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Meldingen
      </h2>
      {zichtbaar.map((s) => (
        <div
          key={s.id}
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            s.ernst === "info"
              ? "border-border bg-card"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          {s.link ? (
            <Link to={s.link} className="min-w-0 flex-1 hover:underline">
              {s.titel}
            </Link>
          ) : (
            <span className="min-w-0 flex-1">{s.titel}</span>
          )}
          <button
            type="button"
            aria-label="Melding afvinken"
            onClick={() => vinkAf(s.id)}
            className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </section>
  );
}
