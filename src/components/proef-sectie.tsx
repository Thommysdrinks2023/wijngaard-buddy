// Fase 7 Blok G — proefnotities op het partijdetail: invoerformulier + tijdlijn
// naast de analysegrafieken. Simpel model (standaardbeslissing), geen aromawielen.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { createProefnotitie, fetchProefnotities } from "@/lib/proef-data";
import { useInvoerder } from "@/lib/use-invoerder";
import { Wine } from "lucide-react";

const veld = "h-10 w-full rounded-lg border border-input bg-background px-2 text-sm";

export function ProefSectie({ partijId }: { partijId: string }) {
  const qc = useQueryClient();
  const [invoerder] = useInvoerder();
  const proevenQ = useQuery({
    queryKey: ["proefnotities", partijId],
    queryFn: () => fetchProefnotities(partijId),
  });

  const [open, setOpen] = useState(false);
  const [helderheid, setHelderheid] = useState("");
  const [kleur, setKleur] = useState("");
  const [geur, setGeur] = useState("");
  const [smaak, setSmaak] = useState("");
  const [balans, setBalans] = useState("");
  const [score, setScore] = useState("");
  const [gebotteld, setGebotteld] = useState(false);
  const [notities, setNotities] = useState("");

  const opslaanM = useMutation({
    mutationFn: () =>
      createProefnotitie({
        partij: partijId,
        datum: format(new Date(), "yyyy-MM-dd"),
        proever: invoerder || "onbekend",
        helderheid,
        kleur,
        geur,
        smaak,
        balans,
        score: score ? Number(score) : null,
        gebotteld_exemplaar: gebotteld,
        notities,
      }),
    onSuccess: () => {
      toast.success("Proefnotitie opgeslagen ✓");
      qc.invalidateQueries({ queryKey: ["proefnotities", partijId] });
      setOpen(false);
      setHelderheid("");
      setKleur("");
      setGeur("");
      setSmaak("");
      setBalans("");
      setScore("");
      setGebotteld(false);
      setNotities("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Opslaan mislukt"),
  });

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Proefnotities ({proevenQ.data?.length ?? 0})
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium"
        >
          <Wine className="h-3.5 w-3.5" /> {open ? "Annuleren" : "+ Proeven"}
        </button>
      </div>

      {open && (
        <div className="space-y-2 rounded-2xl border border-primary/40 bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              className={veld}
              placeholder="Helderheid"
              value={helderheid}
              onChange={(e) => setHelderheid(e.target.value)}
            />
            <input
              className={veld}
              placeholder="Kleur"
              value={kleur}
              onChange={(e) => setKleur(e.target.value)}
            />
            <input
              className={veld}
              placeholder="Geur"
              value={geur}
              onChange={(e) => setGeur(e.target.value)}
            />
            <input
              className={veld}
              placeholder="Smaak"
              value={smaak}
              onChange={(e) => setSmaak(e.target.value)}
            />
            <input
              className={veld}
              placeholder="Balans"
              value={balans}
              onChange={(e) => setBalans(e.target.value)}
            />
            <input
              className={veld}
              placeholder="Score 1–10"
              inputMode="numeric"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </div>
          <input
            className={veld}
            placeholder="Notities"
            value={notities}
            onChange={(e) => setNotities(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={gebotteld}
              onChange={(e) => setGebotteld(e.target.checked)}
            />
            Gebotteld exemplaar (flesrijping volgen)
          </label>
          <button
            type="button"
            disabled={opslaanM.isPending}
            onClick={() => {
              if (score && (Number(score) < 1 || Number(score) > 10)) {
                toast.error("Score moet tussen 1 en 10 zijn");
                return;
              }
              opslaanM.mutate();
            }}
            className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Proefnotitie opslaan
          </button>
        </div>
      )}

      {(proevenQ.data ?? []).length > 0 && (
        <ul className="space-y-1.5">
          {(proevenQ.data ?? []).map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-card px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">
                  {format(parseISO(p.datum), "d MMM yyyy", { locale: nl })} · {p.proever}
                  {p.gebotteld_exemplaar ? " · 🍾 fles" : ""}
                </p>
                {p.score != null && (
                  <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold tabular-nums">
                    {p.score}/10
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {[
                  p.helderheid && `helderheid: ${p.helderheid}`,
                  p.kleur && `kleur: ${p.kleur}`,
                  p.geur && `geur: ${p.geur}`,
                  p.smaak && `smaak: ${p.smaak}`,
                  p.balans && `balans: ${p.balans}`,
                  p.notities,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
