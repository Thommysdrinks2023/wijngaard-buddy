// Blok F — CSV-export als "Excel"-alternatief zonder nieuwe dependency
// (xlsx-bibliotheken zijn zwaar en niet nodig: Excel/Google Sheets/Numbers
// openen CSV probleemloos). Puur browser-side, geen serverstaat.

function csvVeld(waarde: unknown): string {
  let tekst = waarde == null ? "" : String(waarde);
  // Numerieke waarden blijven getallen; onbetrouwbare tekst mag nooit een
  // spreadsheetformule worden, ook niet na voorloopspaties of controltekens.
  // eslint-disable-next-line no-control-regex -- Controltekens kunnen een formuleprefix verbergen.
  if (typeof waarde !== "number" && /^[\s\x00-\x1f\x7f]*[=+@-]/.test(tekst)) {
    tekst = "'" + tekst;
  }
  // Excel-conventie: veld met komma/aanhalingsteken/newline tussen dubbele
  // aanhalingstekens, interne aanhalingstekens verdubbeld.
  if (/[",\r\n]/.test(tekst)) return `"${tekst.replace(/"/g, '""')}"`;
  return tekst;
}

// Fase 7 Blok E: CSV als string (voor bundeling in het controle-pakket-ZIP)
export function csvAlsString(kolommen: string[], rijen: unknown[][]): string {
  const bom = "﻿";
  return bom + [kolommen, ...rijen].map((rij) => rij.map(csvVeld).join(",")).join("\r\n");
}

export function exporteerCsv(bestandsnaam: string, kolommen: string[], rijen: unknown[][]) {
  // BOM vooraan zodat Excel op Windows de UTF-8-tekens (bijv. °, €, ë) correct
  // toont in plaats van als rommelige tekens.
  const blob = new Blob([csvAlsString(kolommen, rijen)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = bestandsnaam.endsWith(".csv") ? bestandsnaam : `${bestandsnaam}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
