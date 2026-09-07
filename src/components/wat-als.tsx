// Fase 21 — gedeelde presentatie voor wat-als-simulaties.
//
// Harde eis uit het ontwerp (ONTWERP-SIMULATIE-1, 1c "Presentatie"): een
// gebruiker mag een simulatie NOOIT per ongeluk voor een meting aanzien. Dat
// is te makkelijk mis te gaan als elk scherm zijn eigen manier verzint om
// "dit is een aanname" te tonen — vandaar één component in plaats van een
// afspraak die je per scherm moet onthouden.
//
// Waarom een balk en niet alleen een kleurverschil: op telefoonformaat (het
// enige formaat waarop deze app echt gebruikt wordt) is een stippellijn of
// een afwijkende lijnkleur in een grafiek zonder meer te missen.
import { AlertTriangle, FlaskConical } from "lucide-react";
import type { SimulatieResultaat } from "@/lib/simulatie";

interface WatAlsBadgeProps {
  /** Waar de simulatie over gaat, bijv. "een pasteurisatierun die nog niet gedraaid is". */
  wat?: string;
  /**
   * Tekst over het onderliggende rekenmodel wanneer dat zelf nog niet is
   * nagemeten (bijv. DRUKVEILIGHEID_NIET_GEVALIDEERD). Verschijnt NAAST de
   * simulatiemelding, nooit in plaats daarvan: een simulatie op een
   * ongevalideerd model is dubbel onzeker (zie ONTWERP-SIMULATIE-2, risico 1).
   */
  nietGevalideerdTekst?: string;
  className?: string;
}

export function WatAlsBadge({ wat, nietGevalideerdTekst, className = "" }: WatAlsBadgeProps) {
  return (
    <div
      className={`space-y-1.5 rounded-xl border-2 border-dashed border-warning/60 bg-warning/10 p-3 ${className}`}
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
        Simulatie — geen meting
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Dit is een doorrekening van {wat ?? "een hypothetische situatie"}. Er is niets gemeten en
        niets opgeslagen; de uitkomst verandert zodra je de invoer hierboven aanpast.
      </p>
      {nietGevalideerdTekst && (
        <p className="flex items-start gap-1.5 border-t border-warning/40 pt-1.5 text-xs leading-relaxed">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
          <span>
            <span className="font-medium">Let op, dubbel onzeker:</span> {nietGevalideerdTekst}
          </span>
        </p>
      )}
    </div>
  );
}

interface AannamesProps {
  aannames: string[];
  className?: string;
}

/** Toont de aannames van een SimulatieResultaat. Niets tonen als er geen zijn. */
export function SimulatieAannames({ aannames, className = "" }: AannamesProps) {
  if (aannames.length === 0) return null;
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Waar deze doorrekening van uitgaat
      </p>
      <ul className="mt-1 space-y-0.5">
        {aannames.map((a) => (
          <li key={a} className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <span aria-hidden>·</span>
            <span>{a}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface OnvoldoendeDataMeldingProps {
  resultaat: Pick<SimulatieResultaat<unknown>, "status" | "reden">;
  className?: string;
}

/**
 * Toont het eerlijke "dit kan ik niet berekenen"-antwoord. Onderscheidt
 * bewust twee gevallen die anders op één hoop belanden: te weinig data
 * (wachten helpt) versus een ontbrekend model (wachten helpt niet, er moet
 * eerst een formule bij). Rendert niets bij status "ok".
 */
export function OnvoldoendeDataMelding({ resultaat, className = "" }: OnvoldoendeDataMeldingProps) {
  if (resultaat.status === "ok") return null;
  const modelOntbreekt = resultaat.status === "model_ontbreekt";
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="leading-relaxed">
        <span className="font-semibold">
          {modelOntbreekt
            ? "Deze vraag is nog niet te berekenen."
            : "Nog te weinig gegevens om dit door te rekenen."}
        </span>{" "}
        {resultaat.reden}
      </p>
    </div>
  );
}
