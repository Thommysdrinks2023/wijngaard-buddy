import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { getPrullenbak, verwijderUitPrullenbak, type PrullenbakItem } from "@/lib/prullenbak";
import { createFenologie } from "@/lib/data";
import {
  herstelSteekproefPlant,
  type SteekproefMeting,
  type SteekproefPlant,
} from "@/lib/steekproef";
import { logAudit } from "@/lib/audit";
import type { Fenologie } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { RotateCcw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/prullenbak")({
  component: PrullenbakPage,
  head: () => ({ meta: [{ title: "Prullenbak — Wijngaard" }] }),
});

function PrullenbakPage() {
  const qc = useQueryClient();
  const [items, setItems] = useState<PrullenbakItem[]>(() => getPrullenbak());

  const ververs = () => setItems(getPrullenbak());

  const terugzetten = async (item: PrullenbakItem) => {
    try {
      if (item.soortLabel === "Fenologie") {
        const f = item.herstelData as unknown as Fenologie;
        await createFenologie({
          rij: f.rij,
          ras: f.ras,
          moment: f.moment,
          datum: f.datum,
          notitie: f.notitie,
          ingevoerd_door: f.ingevoerd_door,
        });
        logAudit("teruggezet", "fenologie", item.omschrijving);
      } else if (item.soortLabel === "Steekproefplant") {
        const data = item.herstelData as unknown as {
          plant: SteekproefPlant;
          metingen: SteekproefMeting[];
        };
        herstelSteekproefPlant(data.plant, data.metingen);
      } else {
        toast.error("Dit type kan niet automatisch teruggezet worden");
        return;
      }
      verwijderUitPrullenbak(item.id);
      qc.invalidateQueries();
      ververs();
      toast.success("Teruggezet ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Terugzetten mislukt");
    }
  };

  return (
    <>
      <AppHeader back title="Prullenbak" subtitle="Verwijderde records (30 dagen)" />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prullenbak</h1>
          <p className="text-sm text-muted-foreground">
            Verwijderde records blijven hier 30 dagen staan en kunnen worden teruggezet. Daarna
            worden ze definitief verwijderd.
          </p>
        </div>

        {items.length === 0 ? (
          <EmptyState message="De prullenbak is leeg." />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <Trash2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {item.soortLabel} · {item.omschrijving}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    verwijderd{" "}
                    {format(parseISO(item.verwijderdOp), "d MMM yyyy HH:mm", { locale: nl })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void terugzetten(item)}
                  className="flex h-12 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold"
                  style={{ backgroundColor: "#27232a", color: "#cac176" }}
                >
                  <RotateCcw className="h-4 w-4" /> Terugzetten
                </button>
                <button
                  type="button"
                  aria-label="Definitief verwijderen"
                  onClick={() => {
                    verwijderUitPrullenbak(item.id);
                    ververs();
                    toast.success("Definitief verwijderd");
                  }}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
