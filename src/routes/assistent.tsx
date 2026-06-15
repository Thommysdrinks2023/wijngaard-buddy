import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  isAssistentBeschikbaar,
  verzamelContext,
  vraagAssistent,
  type ChatBericht,
} from "@/lib/assistent";
import { bewaarGesprek, nieuwGesprek, type Gesprek } from "@/lib/ai-gesprekken";
import { AppHeader } from "@/components/app-header";
import { useVerbinding } from "@/components/verbinding-status";
import { ChevronDown, Loader2, Send, Sparkles, WifiOff } from "lucide-react";

export const Route = createFileRoute("/assistent")({
  component: AssistentPage,
  head: () => ({
    meta: [
      { title: "Assistent — Wijngaard" },
      { name: "description", content: "AI-wijngaardassistent met actuele bedrijfsdata." },
    ],
  }),
});

// Huisstijl
const GROEN = "#b6cfb3";
const GOUD = "#cac176";
const DONKER = "#27232a";

const VOORBEELDVRAGEN = [
  "Welke rijen hebben aandacht nodig?",
  "Hoe staat de rijpheid ervoor?",
  "Is er kans op vorst deze week?",
  "Wanneer kan ik gaan oogsten?",
];

function AssistentPage() {
  const verbinding = useVerbinding();
  const beschikbaar = isAssistentBeschikbaar();
  const [gesprek, setGesprek] = useState<Gesprek>(() => nieuwGesprek());
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [bronnen, setBronnen] = useState<string[]>([]);
  const [bronnenOpen, setBronnenOpen] = useState(false);
  const bodemRef = useRef<HTMLDivElement>(null);

  // automatisch naar beneden scrollen bij nieuw bericht
  useEffect(() => {
    bodemRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gesprek.berichten, bezig]);

  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  async function verstuur(vraag: string) {
    const tekst = vraag.trim();
    if (!tekst || bezig) return;
    if (!online) {
      toast.error("AI assistent heeft internet nodig");
      return;
    }

    const nieuweBerichten: ChatBericht[] = [...gesprek.berichten, { rol: "user", tekst }];
    setGesprek((g) => ({ ...g, berichten: nieuweBerichten }));
    setInvoer("");
    setBezig(true);

    try {
      // actuele bedrijfsdata ophalen en als context meesturen
      const context = await verzamelContext();
      setBronnen(context.bronnen);
      const antwoord = await vraagAssistent(nieuweBerichten, context.tekst);
      const compleet: ChatBericht[] = [...nieuweBerichten, { rol: "assistant", tekst: antwoord }];
      const bewaard = await bewaarGesprek({ ...gesprek, berichten: compleet });
      setGesprek(bewaard);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Er ging iets mis");
      // de vraag laten staan zodat de gebruiker opnieuw kan proberen
      setGesprek((g) => ({ ...g, berichten: gesprek.berichten }));
      setInvoer(tekst);
    } finally {
      setBezig(false);
    }
  }

  return (
    <>
      <AppHeader
        back
        title="Wijngaard Assistent"
        subtitle="De Tappenmars"
        right={
          <button
            type="button"
            onClick={() => {
              setGesprek(nieuwGesprek());
              setBronnen([]);
              setBronnenOpen(false);
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: GOUD, color: DONKER }}
          >
            Nieuw gesprek
          </button>
        }
      />

      {/* berichtenlijst */}
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-screen-md flex-col">
        <div className="flex-1 space-y-3 px-3 py-4 pb-40">
          {!beschikbaar && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-semibold text-destructive">AI-assistent niet ingesteld</p>
              <p className="mt-1 text-muted-foreground">
                Voeg <code className="rounded bg-muted px-1">VITE_ANTHROPIC_API_KEY</code> toe aan
                je <code className="rounded bg-muted px-1">.env</code> en herstart de app.
              </p>
            </div>
          )}

          {!online && (
            <div className="flex items-center gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm font-medium">
              <WifiOff className="h-5 w-5 shrink-0" />
              AI assistent heeft internet nodig
            </div>
          )}

          {beschikbaar && gesprek.berichten.length === 0 && (
            <div className="space-y-4 py-6 text-center">
              <div
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: DONKER }}
              >
                <Sparkles className="h-8 w-8" style={{ color: GOUD }} />
              </div>
              <div>
                <p className="text-lg font-semibold">Vraag het de wijngaardassistent</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Hij kent je actuele metingen, observaties, het weer en de warmtesom.
                </p>
              </div>
              <div className="grid gap-2">
                {VOORBEELDVRAGEN.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => verstuur(v)}
                    disabled={!online}
                    className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-medium active:scale-[0.99] disabled:opacity-50"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gesprek.berichten.map((b, i) => (
            <div key={i} className={`flex ${b.rol === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  b.rol === "user" ? "rounded-br-sm" : "rounded-bl-sm border border-border"
                }`}
                style={
                  b.rol === "user"
                    ? { backgroundColor: DONKER, color: "#ffffff" }
                    : { backgroundColor: GROEN, color: DONKER }
                }
              >
                {b.tekst}
              </div>
            </div>
          ))}

          {bezig && (
            <div className="flex justify-start">
              <div
                className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border px-4 py-2.5 text-sm"
                style={{ backgroundColor: GROEN, color: DONKER }}
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Aan het nadenken…
              </div>
            </div>
          )}

          {/* welke data is gebruikt (inklapbaar) */}
          {bronnen.length > 0 && (
            <div className="rounded-xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setBronnenOpen((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground"
              >
                <span>Gebruikte data ({bronnen.length})</span>
                <ChevronDown className={`h-4 w-4 transition ${bronnenOpen ? "rotate-180" : ""}`} />
              </button>
              {bronnenOpen && (
                <ul className="space-y-1 px-3 pb-3 text-xs text-muted-foreground">
                  {bronnen.map((b) => (
                    <li key={b}>• {b}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div ref={bodemRef} />
        </div>

        {/* invoerveld onderaan, boven de bottom-nav */}
        <div
          className="fixed inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 4rem)" }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verstuur(invoer);
            }}
            className="mx-auto flex max-w-screen-md items-end gap-2 px-3 py-3"
          >
            <textarea
              value={invoer}
              onChange={(e) => setInvoer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  verstuur(invoer);
                }
              }}
              rows={1}
              placeholder={online ? "Stel een vraag…" : "Geen internet"}
              disabled={!beschikbaar || !online || bezig}
              className="max-h-32 flex-1 resize-none rounded-2xl border border-input bg-card px-4 py-3 text-base outline-none focus:ring-2 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!beschikbaar || !online || bezig || !invoer.trim()}
              aria-label="Verstuur"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl disabled:opacity-40"
              style={{ backgroundColor: DONKER, color: GOUD }}
            >
              {bezig ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
