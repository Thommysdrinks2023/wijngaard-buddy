// Fase 7 Blok B — proactieve meldingen op de hub. In-app only, afvinkbaar
// (afgevinkte meldingen onthouden we per id in localStorage). Bronnen:
// kritieke inzichten (gistingsstagnatie, uitvalcluster), AGP-drempel,
// onderhoud binnen 30 dagen en de backup-waarschuwing uit Blok A.

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { getPb, isIngelogd } from "@/lib/data";
import { fetchPartijen } from "@/lib/partijen-data";
import { fetchMaterieel, fetchOnderhoud, onderhoudBinnenkort } from "@/lib/materieel-data";
import { fetchKelderlog } from "@/lib/kelder-data";
import { fetchRegelgevingInstellingen, REGELGEVING_SLEUTELS } from "@/lib/regelgeving-data";
import { X } from "lucide-react";
import { addDays, format } from "date-fns";

const LS_AFGEVINKT = "wg.meldingen.afgevinkt.v1";

interface Melding {
  id: string; // stabiel per onderwerp, zodat afvinken blijft plakken
  tekst: string;
  ernst: "waarschuwing" | "info";
  link?: string;
}

function leesAfgevinkt(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_AFGEVINKT) ?? "[]"));
  } catch {
    return new Set();
  }
}

const KRITIEKE_INZICHTEN = new Set(["gisting_snelheid", "uitval_cluster"]);

async function fetchKritiekeInzichten() {
  const pb = getPb();
  if (!pb) return [];
  try {
    const records = await pb.collection("inzichten").getFullList({
      filter: "deleted != true",
      sort: "-berekend_op",
    });
    return records
      .filter((r) => KRITIEKE_INZICHTEN.has(r["inzicht_type"]))
      .slice(0, 5)
      .map((r) => ({
        id: `inzicht-${r.id}`,
        tekst: r["samenvatting_nl"] as string,
        type: r["inzicht_type"] as string,
      }));
  } catch {
    return []; // niet ingelogd of offline — geen meldingen
  }
}

export function Meldingen() {
  const [afgevinkt, setAfgevinkt] = useState<Set<string>>(leesAfgevinkt);

  const inzichtenQ = useQuery({
    queryKey: ["meldingen", "inzichten"],
    queryFn: fetchKritiekeInzichten,
  });
  // De hub is publiek; deze bronnen zijn auth-only en zouden zonder sessie
  // een fout gooien (Fase 8) — dus alleen bevragen mét sessie.
  const ingelogd = isIngelogd();
  const partijenQ = useQuery({
    queryKey: ["partijen", "meldingen"],
    queryFn: fetchPartijen,
    enabled: ingelogd,
  });
  const materieelQ = useQuery({
    queryKey: ["materieel", "meldingen"],
    queryFn: fetchMaterieel,
    enabled: ingelogd,
  });
  const onderhoudQ = useQuery({
    queryKey: ["onderhoud", "meldingen"],
    queryFn: () => fetchOnderhoud(),
    enabled: ingelogd,
  });
  const regelgevingQ = useQuery({
    queryKey: ["regelgeving", "meldingen"],
    queryFn: fetchRegelgevingInstellingen,
    enabled: ingelogd,
  });
  const kelderlogQ = useQuery({
    queryKey: ["kelderlog", "meldingen"],
    queryFn: () => fetchKelderlog(),
    enabled: ingelogd,
  });

  const meldingen: Melding[] = [];

  // Kelderlog-taken (Fase 7 Blok C: na-meting SO₂, gistvoedingsschema).
  // Conventie: notitie begint met "TAAK:"; tonen zodra de datum binnen 7 dagen
  // ligt of verstreken is. Afvinken gebeurt via het meldingenkruisje.
  const taakGrens = format(addDays(new Date(), 7), "yyyy-MM-dd");
  for (const r of kelderlogQ.data ?? []) {
    if (!r.notitie?.startsWith("TAAK:")) continue;
    if (r.datum > taakGrens) continue;
    meldingen.push({
      id: `taak-${r.id}`,
      tekst: `${r.datum}: ${r.notitie.slice(5).trim()}`,
      ernst: r.datum <= format(new Date(), "yyyy-MM-dd") ? "waarschuwing" : "info",
      link: "/kelder",
    });
  }

  for (const i of inzichtenQ.data ?? []) {
    meldingen.push({ id: i.id, tekst: i.tekst, ernst: "waarschuwing", link: "/assistent" });
  }

  // AGP-drempel: jaarproductie (som startvolumes huidige jaargang) vs drempel
  const drempel = (regelgevingQ.data ?? []).find(
    (r) => r.sleutel === REGELGEVING_SLEUTELS.agpDrempel,
  )?.waarde;
  if (drempel) {
    const jaar = new Date().getFullYear();
    const productie = (partijenQ.data ?? [])
      .filter((p) => p.jaargang === jaar)
      .reduce((acc, p) => acc + (p.start_volume_l ?? 0), 0);
    if (productie > drempel * 0.8) {
      meldingen.push({
        id: `agp-${jaar}`,
        tekst: `Jaarproductie ${jaar} (${Math.round(productie)} L) nadert of overschrijdt de AGP-drempel (${drempel} L) — controleer je accijnspositie.`,
        ernst: "waarschuwing",
        link: "/kelder/accijns",
      });
    }
  }

  // Onderhoud binnen 30 dagen
  const binnenkort = onderhoudBinnenkort(onderhoudQ.data ?? []);
  const materieelNaam = new Map((materieelQ.data ?? []).map((m) => [m.id, m.naam]));
  for (const r of binnenkort) {
    meldingen.push({
      id: `onderhoud-${r.materieel}-${r.volgende_keer}`,
      tekst: `Onderhoud gepland: ${materieelNaam.get(r.materieel) ?? "machine"} vóór ${r.volgende_keer}.`,
      ernst: "info",
      link: "/materieel",
    });
  }

  // Backup >2 dagen (zelfde bron als de widget in index.tsx)
  const backup = (regelgevingQ.data ?? []).find((r) => r.sleutel === "laatste_backup");
  if (backup?.laatst_gecontroleerd) {
    const laatst = new Date(backup.laatst_gecontroleerd.replace(" ", "T"));
    const dagen = Math.floor((Date.now() - laatst.getTime()) / 86400000);
    if (!isNaN(dagen) && dagen > 2) {
      meldingen.push({
        id: `backup-${backup.laatst_gecontroleerd}`,
        tekst: `Laatste geslaagde backup is ${dagen} dagen oud — controleer de backuptaak.`,
        ernst: "waarschuwing",
      });
    }
  }

  const zichtbaar = meldingen.filter((m) => !afgevinkt.has(m.id));
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
      {zichtbaar.map((m) => (
        <div
          key={m.id}
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            m.ernst === "waarschuwing"
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-border bg-card"
          }`}
        >
          {m.link ? (
            <Link to={m.link} className="min-w-0 flex-1 hover:underline">
              {m.tekst}
            </Link>
          ) : (
            <span className="min-w-0 flex-1">{m.tekst}</span>
          )}
          <button
            type="button"
            aria-label="Melding afvinken"
            onClick={() => vinkAf(m.id)}
            className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </section>
  );
}
