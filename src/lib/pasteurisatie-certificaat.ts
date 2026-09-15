// Fase 17 Blok G — PU-certificaat als PDF. Geen bestaande PDF-met-grafiek-
// generator in de codebase (Blok 0-bevinding), dus jsPDF toegevoegd
// (vectortekening, geen HTML-canvas-afhankelijkheid). De temperatuurcurve
// wordt met eigen lijnstukken getekend — bewust géén losse chart-library,
// dit is de enige plek in de app die dit nodig heeft.
import { jsPDF } from "jspdf";
import { APP_NAAM, BEDRIJFSNAAM } from "@/config/app";
import { PASTEURISATIE_FORMULE_VERSIE, type TemperatuurMeting } from "./pasteurisatie";
import type { PasteurisatieRun } from "./types";

export interface CertificaatContext {
  run: PasteurisatieRun;
  eigenaarNaam: string;
  partijNaam: string;
  flestypeNaam: string;
  sluitingNaam: string;
  metingen: TemperatuurMeting[]; // referentiefles, volledige curve
  uitgevoerdDoorNaam: string;
  versienummer: number;
}

function tekenCurve(
  doc: jsPDF,
  metingen: TemperatuurMeting[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  doc.setDrawColor(200);
  doc.rect(x, y, w, h);
  if (metingen.length < 2) {
    doc.setFontSize(9);
    doc.text("Onvoldoende metingen voor een grafiek.", x + 4, y + h / 2);
    return;
  }
  const temps = metingen.map((m) => m.temperatuurC);
  const minT = Math.min(...temps, 0);
  const maxT = Math.max(...temps, 10);
  const t0 = metingen[0].tijdstip.getTime();
  const tEnd = metingen[metingen.length - 1].tijdstip.getTime();
  const duur = Math.max(1, tEnd - t0);

  const px = (t: number) => x + ((t - t0) / duur) * w;
  const py = (temp: number) => y + h - ((temp - minT) / (maxT - minT || 1)) * h;

  // Assen: 4 horizontale hulplijnen met temperatuurlabel.
  doc.setFontSize(7);
  doc.setTextColor(120);
  for (let i = 0; i <= 4; i++) {
    const temp = minT + (i / 4) * (maxT - minT);
    const yy = py(temp);
    doc.setDrawColor(230);
    doc.line(x, yy, x + w, yy);
    doc.text(`${temp.toFixed(0)}°C`, x - 2, yy, { align: "right" });
  }

  doc.setDrawColor(74, 140, 92); // --primary
  doc.setLineWidth(0.5);
  for (let i = 1; i < metingen.length; i++) {
    doc.line(
      px(metingen[i - 1].tijdstip.getTime()),
      py(metingen[i - 1].temperatuurC),
      px(metingen[i].tijdstip.getTime()),
      py(metingen[i].temperatuurC),
    );
  }
  doc.setTextColor(0);
}

export function genereerPuCertificaat(ctx: CertificaatContext): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marge = 18;
  let y = marge;

  doc.setFillColor(74, 140, 92); // --primary
  doc.rect(0, 0, 210, 4, "F");
  y += 3;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Pasteurisatiecertificaat", marge, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${BEDRIJFSNAAM} — ${APP_NAAM}`, marge, y);
  y += 10;

  const regel = (label: string, waarde: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, marge, y);
    doc.setFont("helvetica", "normal");
    doc.text(waarde, marge + 45, y);
    y += 6;
  };

  regel("Klant/eigenaar:", ctx.eigenaarNaam || "—");
  regel("Partij:", ctx.partijNaam || "—");
  regel("Lotnummer:", ctx.run.lotnummer || "—");
  regel("Datum:", ctx.run.datum);
  regel(
    "Tijden:",
    `${ctx.run.starttijd ? new Date(ctx.run.starttijd).toLocaleTimeString("nl-NL") : "?"} – ${
      ctx.run.eindtijd ? new Date(ctx.run.eindtijd).toLocaleTimeString("nl-NL") : "?"
    }`,
  );
  regel("Flestype:", ctx.flestypeNaam || "—");
  regel("Sluiting:", ctx.sluitingNaam || "—");
  regel("Aantal flessen:", ctx.run.aantal_flessen != null ? String(ctx.run.aantal_flessen) : "—");
  regel("Uitgevoerd door:", ctx.uitgevoerdDoorNaam || "—");

  y += 4;
  doc.setDrawColor(200);
  doc.line(marge, y, 210 - marge, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Pasteurisatie-eenheden (PU)", marge, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  regel("Totale PU:", ctx.run.totale_pu != null ? ctx.run.totale_pu.toFixed(1) : "—");
  regel(
    "Verdeling:",
    `opwarm ${ctx.run.pu_opwarm?.toFixed(1) ?? "?"} / houd ${ctx.run.pu_houd?.toFixed(1) ?? "?"} / afkoel ${ctx.run.pu_afkoel?.toFixed(1) ?? "?"}`,
  );
  regel("Doelbereik:", `${ctx.run.doel_pu_min}–${ctx.run.doel_pu_max} PU`);
  regel(
    "Piektemperatuur:",
    ctx.run.piektemperatuur_c != null ? `${ctx.run.piektemperatuur_c} °C` : "—",
  );
  regel("Formule:", `PU/min = 10^((T-60)/7), versie ${PASTEURISATIE_FORMULE_VERSIE}`);

  if (ctx.run.veiligheidsoordeel) {
    const oordeelKleur: Record<string, [number, number, number]> = {
      veilig: [74, 140, 92],
      marginaal: [230, 168, 23],
      onveilig: [214, 68, 68],
    };
    const oordeelTekst: Record<string, string> = {
      veilig: "Veilig",
      marginaal: "Marginaal",
      onveilig: "Onveilig",
      onbekend: "Onvoldoende gegevens — geen veiligheidsbeoordeling",
    };
    const [r, g, b] = oordeelKleur[ctx.run.veiligheidsoordeel] ?? [0, 0, 0];
    doc.setFont("helvetica", "bold");
    doc.setTextColor(r, g, b);
    doc.text(
      `Drukveiligheidsoordeel: ${oordeelTekst[ctx.run.veiligheidsoordeel] ?? ctx.run.veiligheidsoordeel}`,
      marge,
      y,
    );
    doc.setTextColor(0);
    y += 6;
  }

  y += 4;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  const positieText = `PU is bepaald aan een referentiefles op positie "${ctx.run.sensor_positie || "onbekend"}" in de lading — dit getal geldt voor die positie, niet als gemiddelde over de hele lading.`;
  const positieLines = doc.splitTextToSize(positieText, 210 - 2 * marge);
  doc.text(positieLines, marge, y);
  y += positieLines.length * 4 + 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Temperatuurcurve (referentiefles)", marge, y);
  y += 4;
  tekenCurve(doc, ctx.metingen, marge, y, 210 - 2 * marge, 55);
  y += 62;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(150, 100, 0);
  const validatieText =
    "Dit PU-rekenmodel is nog niet gevalideerd tegen een echte, nagemeten run — zie rekenmodel_validaties.";
  doc.text(doc.splitTextToSize(validatieText, 210 - 2 * marge), marge, y);
  doc.setTextColor(0);

  y = 297 - 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Uitgegeven op ${new Date().toLocaleDateString("nl-NL")} · versie ${ctx.versienummer}`,
    marge,
    y,
  );

  return doc.output("blob");
}
