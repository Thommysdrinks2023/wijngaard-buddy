// Blok F — CSV-export als "Excel"-alternatief zonder nieuwe dependency
// (xlsx-bibliotheken zijn zwaar en niet nodig: Excel/Google Sheets/Numbers
// openen CSV probleemloos). Puur browser-side, geen serverstaat.

function csvVeld(waarde: unknown): string {
  const tekst = waarde == null ? "" : String(waarde);
  // Excel-conventie: veld met komma/aanhalingsteken/newline tussen dubbele
  // aanhalingstekens, interne aanhalingstekens verdubbeld.
  if (/[",\n]/.test(tekst)) return `"${tekst.replace(/"/g, '""')}"`;
  return tekst;
}

export function exporteerCsv(bestandsnaam: string, kolommen: string[], rijen: unknown[][]) {
  // BOM vooraan zodat Excel op Windows de UTF-8-tekens (bijv. °, €, ë) correct
  // toont in plaats van als rommelige tekens.
  const bom = "﻿";
  const inhoud = [kolommen, ...rijen].map((rij) => rij.map(csvVeld).join(",")).join("\r\n");
  const blob = new Blob([bom + inhoud], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = bestandsnaam.endsWith(".csv") ? bestandsnaam : `${bestandsnaam}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
