// Fase 14 Blok C — gistingsprogramma instellen en bewerken op partijdetail.
// Zie src/lib/temperatuurprogramma.ts voor waarom er twee ankertypes zijn
// (dag en dichtheid) en hoe ze naar grafiekpunten worden omgerekend.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { updatePartij } from "@/lib/partijen-data";
import {
  sorteerPunten,
  valideerProgrammaPunt,
  type ProgrammaAnker,
  type ProgrammaPunt,
  type TemperatuurProgramma,
} from "@/lib/temperatuurprogramma";
import { Plus, Thermometer, Trash2 } from "lucide-react";

const veld = "h-10 w-full rounded-lg border border-input bg-background px-2 text-sm";

function omschrijfAnker(p: ProgrammaPunt): string {
  return p.anker === "dag" ? `Dag ${p.dag}` : `${p.oechsle} °Oe`;
}

export function TemperatuurProgrammaSectie({
  partijId,
  programma,
}: {
  partijId: string;
  programma: TemperatuurProgramma | null | undefined;
}) {
  const qc = useQueryClient();
  const punten = programma?.punten ?? [];

  const [anker, setAnker] = useState<ProgrammaAnker>("dag");
  const [dag, setDag] = useState("");
  const [oechsle, setOechsle] = useState("");
  const [temp, setTemp] = useState("");

  const opslaanM = useMutation({
    mutationFn: (nieuwePunten: ProgrammaPunt[]) =>
      updatePartij(partijId, {
        temperatuur_programma:
          nieuwePunten.length > 0 ? { punten: nieuwePunten, notitie: programma?.notitie } : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partij", partijId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const voegToe = () => {
    const nieuw: ProgrammaPunt = {
      anker,
      dag: anker === "dag" ? Number(dag) : undefined,
      oechsle: anker === "dichtheid" ? Number(oechsle) : undefined,
      temperatuur_c: Number(temp),
    };
    const fout = valideerProgrammaPunt(nieuw);
    if (fout) {
      toast.error(fout);
      return;
    }
    const bijgewerkt = sorteerPunten([...punten, nieuw]);
    opslaanM.mutate(bijgewerkt, {
      onSuccess: () => {
        toast.success("Programmapunt toegevoegd ✓");
        setDag("");
        setOechsle("");
        setTemp("");
      },
    });
  };

  const verwijder = (index: number) => {
    const bijgewerkt = punten.filter((_, i) => i !== index);
    opslaanM.mutate(bijgewerkt, {
      onSuccess: () => toast.success("Programmapunt verwijderd"),
    });
  };

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Thermometer className="h-4 w-4" />
        Gistingsprogramma
      </h2>
      <p className="text-xs text-muted-foreground">
        Een gewenste temperatuur per moment (op dag of op dichtheidsniveau) — verschijnt als lijn
        naast de werkelijke temperatuur zodra die gemeten wordt.
      </p>

      {punten.length > 0 && (
        <ul className="space-y-1.5">
          {sorteerPunten(punten).map((p, i) => (
            <li
              key={`${p.anker}-${p.dag ?? p.oechsle}-${i}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
            >
              <span className="text-sm">
                {omschrijfAnker(p)} → <strong>{p.temperatuur_c} °C</strong>
              </span>
              <button
                type="button"
                onClick={() => verwijder(punten.indexOf(p))}
                disabled={opslaanM.isPending}
                aria-label="Verwijder programmapunt"
                className="text-muted-foreground active:scale-95"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-xl border border-border bg-card p-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Anker</span>
          <select
            value={anker}
            onChange={(e) => setAnker(e.target.value as ProgrammaAnker)}
            className={veld}
          >
            <option value="dag">Op dag</option>
            <option value="dichtheid">Op °Oechsle</option>
          </select>
        </label>
        {anker === "dag" ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Dag</span>
            <input
              type="number"
              value={dag}
              onChange={(e) => setDag(e.target.value)}
              placeholder="bijv. 3"
              className={veld}
            />
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-medium">°Oechsle</span>
            <input
              type="number"
              value={oechsle}
              onChange={(e) => setOechsle(e.target.value)}
              placeholder="bijv. 40"
              className={veld}
            />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Temp. (°C)</span>
          <input
            type="number"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            placeholder="bijv. 22"
            className={veld}
          />
        </label>
        <button
          type="button"
          onClick={voegToe}
          disabled={opslaanM.isPending}
          aria-label="Stap toevoegen"
          className="flex h-11 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
