// Fase 10 Blok 3 — de Vandaag-widget: vervangt meldingen.tsx.
// Toont de gesorteerde signalen (ernst -> recentheid) met een plafond uit
// app_instellingen, een uitklapbare "waarom" (staat al in het signaal, geen
// extra call en dus gratis), en server-side snooze/dismiss.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { verzamelSignalen } from "@/lib/signalen";
import {
  fetchSignaalStatussen,
  isVerborgen,
  migreerOudeAfvinkStatus,
  ruimVerlopenSnoozesOp,
  zetSignaalStatus,
} from "@/lib/signaal-status-data";
import {
  APP_INSTELLING_SLEUTELS,
  fetchAppInstellingen,
  vindWaarde,
} from "@/lib/app-instellingen-data";
import { ChevronDown, Clock, X } from "lucide-react";
import { addDays, format } from "date-fns";

const SNOOZE_DAGEN = 7;

export function VandaagWidget() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Set<string>>(new Set());

  const signalenQ = useQuery({ queryKey: ["signalen"], queryFn: verzamelSignalen });
  const statusQ = useQuery({
    queryKey: ["signaal-status"],
    queryFn: async () => {
      // Eenmalige overname van de oude localStorage-afvinkstate, zodat
      // eerder weggeklikte meldingen niet terugkomen (§6 datamodel).
      await migreerOudeAfvinkStatus();
      const statussen = await fetchSignaalStatussen();
      // Verlopen snoozes opruimen bij het laden (geen los achtergrondproces,
      // zie ONTWERP-2-DATAMODEL.md §7).
      await ruimVerlopenSnoozesOp(statussen);
      return statussen.filter(
        (s) =>
          !(
            s.actie === "gesnoozed" &&
            s.snooze_tot &&
            s.snooze_tot < new Date().toISOString().slice(0, 10)
          ),
      );
    },
  });
  const instellingenQ = useQuery({
    queryKey: ["app-instellingen", "vandaag"],
    queryFn: fetchAppInstellingen,
  });

  const statusM = useMutation({
    mutationFn: ({
      signaalId,
      actie,
      snoozeTot,
    }: {
      signaalId: string;
      actie: "gesnoozed" | "genegeerd";
      snoozeTot?: string;
    }) => zetSignaalStatus(signaalId, actie, snoozeTot),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signaal-status"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Kon dit niet opslaan"),
  });

  const statussen = statusQ.data ?? [];
  const zichtbaar = (signalenQ.data ?? []).filter((s) => !isVerborgen(s.id, statussen));
  const maxZichtbaar = vindWaarde(
    instellingenQ.data ?? [],
    APP_INSTELLING_SLEUTELS.signaalMaxZichtbaar,
    6,
  );
  const getoond = zichtbaar.slice(0, maxZichtbaar);
  const rest = zichtbaar.length - getoond.length;

  if (zichtbaar.length === 0) return null;

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  return (
    <section className="mt-3 space-y-1.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Vandaag
      </h2>
      {getoond.map((s) => (
        <div
          key={s.id}
          className={`rounded-xl border px-3 py-2 text-sm ${
            s.ernst === "kritiek"
              ? "border-red-300 bg-red-50 text-red-900"
              : s.ernst === "waarschuwing"
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-border bg-card"
          }`}
        >
          <div className="flex items-start gap-2">
            {s.link ? (
              <Link to={s.link} className="min-w-0 flex-1 hover:underline">
                {s.titel}
              </Link>
            ) : (
              <span className="min-w-0 flex-1">{s.titel}</span>
            )}
            <button
              type="button"
              aria-label="Waarom zie ik dit?"
              onClick={() => toggle(s.id)}
              className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-black/5"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open.has(s.id) ? "rotate-180" : ""}`}
              />
            </button>
            <button
              type="button"
              aria-label={`Uitstellen tot over ${SNOOZE_DAGEN} dagen`}
              disabled={statusM.isPending}
              onClick={() =>
                statusM.mutate({
                  signaalId: s.id,
                  actie: "gesnoozed",
                  snoozeTot: format(addDays(new Date(), SNOOZE_DAGEN), "yyyy-MM-dd"),
                })
              }
              className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-black/5 disabled:opacity-50"
            >
              <Clock className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Niet meer tonen"
              disabled={statusM.isPending}
              onClick={() => statusM.mutate({ signaalId: s.id, actie: "genegeerd" })}
              className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-black/5 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {open.has(s.id) && (
            <p className="mt-1.5 border-t border-current/15 pt-1.5 text-xs opacity-80">
              {s.waarom}
            </p>
          )}
        </div>
      ))}
      {rest > 0 && <p className="px-1 text-xs text-muted-foreground">en nog {rest} meer</p>}
    </section>
  );
}
