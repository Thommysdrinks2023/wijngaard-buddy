// Fase 19 — een onbereikbare server zag er op de kelder-, voorraad- en
// verkoopschermen precies zo uit als "er is nog niets": de lijsten vielen
// terug op hun lege staat ("Nog geen tanks.", "0 flessen") zonder dat er
// ergens een fout verscheen. Op het accijnsscherm leverde dat een compleet
// nul-overzicht op — een nieuwe medewerker leest dat als een echte
// nul-aangifte. Deze balk maakt het verschil expliciet.
//
// Bewust op useVerbinding() gebaseerd en niet op de query-status: de
// verbindingsstatus is één bron van waarheid die niet afhangt van hoeveel
// pogingen een afzonderlijke query nog openstaan heeft.
import { WifiOff } from "lucide-react";
import { useVerbinding } from "./verbinding-status";

interface OfflineWaarschuwingProps {
  /** Waar dit scherm over gaat, bijv. "de tanks" of "het accijnsoverzicht". */
  wat?: string;
}

export function OfflineWaarschuwing({ wat = "deze gegevens" }: OfflineWaarschuwingProps) {
  const { online } = useVerbinding();
  if (online) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <p>
        <span className="font-semibold">Geen verbinding met de server.</span> Hierdoor kon {wat}{" "}
        niet worden opgehaald — wat je hieronder ziet is <strong>niet compleet</strong> en mag je
        niet als kloppend overzicht gebruiken. Zoek bereik en ververs de pagina.
      </p>
    </div>
  );
}
