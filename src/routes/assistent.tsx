import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import {
  afwijzActie,
  bevestigActie,
  bouwBronnenregel,
  createGesprek,
  createUserBericht,
  fetchActies,
  fetchBerichten,
  fetchGesprekken,
  geefAdviesFeedback,
  stuurBerichtNaarAgent,
} from "@/lib/agent-data";
import { isPbConfigured } from "@/lib/data";
import { comprimeerFoto } from "@/lib/foto-compressie";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { VerbindingBadge } from "@/components/verbinding-status";
import { useWijngaardConfig } from "@/lib/use-wijngaard-config";
import {
  AGENT_ACTIE_CONFIG,
  type AdviesOordeel,
  type AgentActie,
  type AgentBericht,
} from "@/lib/types";
import {
  Camera,
  Check,
  ChevronLeft,
  Loader2,
  MessageSquarePlus,
  Minus,
  Pencil,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

export const Route = createFileRoute("/assistent")({
  component: AssistentPage,
  head: () => ({
    meta: [
      { title: "Assistent — Tappenmars" },
      {
        name: "description",
        content: "AI-agent voor wijngaard en kelder met actuele bedrijfsdata.",
      },
    ],
  }),
});

const VOORBEELDVRAGEN = [
  "Welke rijen hebben aandacht nodig?",
  "Hoe verloopt de gisting van partij 2026-PIN-01?",
  "Wanneer was onze eerste Johanniter-oogst?",
  "Ik heb tank 3 overgeheveld naar tank 16, 300 liter",
];

function AssistentPage() {
  const { naam } = useWijngaardConfig();
  const pbActief = isPbConfigured();
  const [gesprekId, setGesprekId] = useState<string | null>(null);

  if (!pbActief) {
    return (
      <>
        <AppHeader back title="Assistent" subtitle={naam} />
        <div className="mx-auto max-w-screen-md px-3 py-4">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-semibold text-destructive">Assistent niet beschikbaar</p>
            <p className="mt-1 text-muted-foreground">
              Er is geen server geconfigureerd (
              <code className="rounded bg-muted px-1">VITE_POCKETBASE_URL</code>
              ).
            </p>
          </div>
        </div>
      </>
    );
  }

  return gesprekId ? (
    <ChatScherm gesprekId={gesprekId} onTerug={() => setGesprekId(null)} />
  ) : (
    <GesprekkenLijst naam={naam} onOpen={setGesprekId} />
  );
}

function GesprekkenLijst({ naam, onOpen }: { naam: string; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const gesprekkenQ = useQuery({ queryKey: ["agent-gesprekken"], queryFn: fetchGesprekken });

  const nieuw = useMutation({
    mutationFn: createGesprek,
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: ["agent-gesprekken"] });
      onOpen(g.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AppHeader back title="Assistent" subtitle={naam} />
      <div className="mx-auto max-w-screen-md space-y-4 px-3 py-4">
        <button
          type="button"
          onClick={() => nieuw.mutate()}
          disabled={nieuw.isPending}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground active:scale-[0.99] disabled:opacity-60"
        >
          {nieuw.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <MessageSquarePlus className="h-5 w-5" />
          )}
          Nieuw gesprek
        </button>

        {gesprekkenQ.isError && (
          <ErrorState error={gesprekkenQ.error} onRetry={() => gesprekkenQ.refetch()} />
        )}

        {gesprekkenQ.data && gesprekkenQ.data.length === 0 && (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            message="Nog geen gesprekken. Begin met een vraag of vertel wat je gedaan hebt."
          />
        )}

        <ul className="space-y-2">
          {(gesprekkenQ.data ?? []).map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onOpen(g.id)}
                className="block w-full rounded-xl border border-border bg-card p-3 text-left active:scale-[0.99]"
              >
                <p className="truncate text-sm font-semibold">{g.titel}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {format(parseISO(g.laatste_bericht_op), "d MMM yyyy HH:mm", { locale: nl })}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// welke bestaande module-route past bij het aanpassen van een voorstel — geen
// veld-voor-veld prefill (dat vergt nieuwe zoekparameters op 4 losse bestaande
// formulieren), wel direct naar de juiste plek genavigeerd. Zie DECISIONS-FASE3.md.
function aanpasBestemming(actie: AgentActie): {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
} {
  const payload = actie.payload as Record<string, unknown>;
  switch (actie.actie_type) {
    case "tankboek_boeking":
      return { to: "/kelder/overhevelen", search: { van: String(payload.van_tank ?? "") } };
    case "observatie":
    case "uitval":
      return { to: "/rij/$rijId/observatie", params: { rijId: String(payload.rij ?? "") } };
    case "kelderlog":
    case "analyse":
      return {
        to: "/kelder/partijen/$partijId",
        params: { partijId: String(payload.partij ?? "") },
      };
  }
}

function ActieKaart({
  actie,
  bezig,
  onBevestig,
  onAfwijs,
}: {
  actie: AgentActie;
  bezig: boolean;
  onBevestig: (id: string) => void;
  onAfwijs: (id: string) => void;
}) {
  const config = AGENT_ACTIE_CONFIG[actie.actie_type];
  const kanNogBeslissen = actie.status === "voorgesteld";
  const dest = aanpasBestemming(actie);

  return (
    <div className={`rounded-2xl border-2 bg-card p-3 ${config.randKlasse}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{config.emoji}</span> {config.label}
      </p>
      <p className="mt-1 text-sm leading-relaxed">{actie.samenvatting}</p>

      {actie.status === "mislukt" && actie.fout && (
        <p className="mt-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {actie.fout}
        </p>
      )}
      {actie.status === "uitgevoerd" && (
        <p className="mt-2 text-xs font-semibold text-success">✓ Uitgevoerd</p>
      )}
      {actie.status === "afgewezen" && (
        <p className="mt-2 text-xs text-muted-foreground">Afgewezen</p>
      )}

      {kanNogBeslissen && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onAfwijs(actie.id)}
            disabled={bezig}
            className="flex h-11 items-center justify-center gap-1 rounded-xl border border-input text-sm font-medium disabled:opacity-50"
          >
            <X className="h-4 w-4" /> Afwijzen
          </button>
          <Link
            to={dest.to as never}
            params={dest.params as never}
            search={dest.search as never}
            className="flex h-11 items-center justify-center gap-1 rounded-xl border border-input text-sm font-medium"
          >
            <Pencil className="h-4 w-4" /> Aanpassen
          </Link>
          <button
            type="button"
            onClick={() => onBevestig(actie.id)}
            disabled={bezig}
            className="flex h-11 items-center justify-center gap-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Bevestigen
          </button>
        </div>
      )}
    </div>
  );
}

const FEEDBACK_OPTIES: { waarde: AdviesOordeel; label: string; Icoon: typeof ThumbsUp }[] = [
  { waarde: "klopte", label: "Klopte", Icoon: ThumbsUp },
  { waarde: "deels", label: "Deels", Icoon: Minus },
  { waarde: "klopte_niet", label: "Klopte niet", Icoon: ThumbsDown },
];

function BerichtWeergave({
  bericht,
  acties,
  acterendId,
  onBevestig,
  onAfwijs,
  onFeedback,
  feedbackGegeven,
}: {
  bericht: AgentBericht;
  acties: AgentActie[];
  acterendId: string | null;
  onBevestig: (id: string) => void;
  onAfwijs: (id: string) => void;
  onFeedback: (berichtId: string, oordeel: AdviesOordeel) => void;
  feedbackGegeven: boolean;
}) {
  const isUser = bericht.rol === "user";
  const bron = !isUser ? bouwBronnenregel(bericht.tool_calls, bericht.tool_resultaten) : null;

  return (
    <div className="space-y-2">
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[85%] space-y-2 rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm border border-border bg-card text-foreground"
          }`}
        >
          {bericht.foto && (
            <img
              src={bericht.foto}
              alt="Bijgevoegde foto"
              className="max-h-48 rounded-lg object-cover"
            />
          )}
          <p className="whitespace-pre-wrap">{bericht.inhoud}</p>
        </div>
      </div>

      {!isUser && bron && <p className="pl-1 text-xs text-muted-foreground">{bron}</p>}

      {!isUser && bericht.inhoud && (
        <div className="flex items-center gap-1.5 pl-1">
          {FEEDBACK_OPTIES.map(({ waarde, label, Icoon }) => (
            <button
              key={waarde}
              type="button"
              disabled={feedbackGegeven}
              onClick={() => onFeedback(bericht.id, waarde)}
              className="flex h-8 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-medium text-muted-foreground disabled:opacity-40"
            >
              <Icoon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {acties.map((actie) => (
        <ActieKaart
          key={actie.id}
          actie={actie}
          bezig={acterendId === actie.id}
          onBevestig={onBevestig}
          onAfwijs={onAfwijs}
        />
      ))}
    </div>
  );
}

function ChatScherm({ gesprekId, onTerug }: { gesprekId: string; onTerug: () => void }) {
  const qc = useQueryClient();
  const berichtenQ = useQuery({
    queryKey: ["agent-berichten", gesprekId],
    queryFn: () => fetchBerichten(gesprekId),
  });
  const actiesQ = useQuery({
    queryKey: ["agent-acties", gesprekId],
    queryFn: () => fetchActies(gesprekId),
  });

  const [invoer, setInvoer] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [bezig, setBezig] = useState(false);
  const [acterendId, setActerendId] = useState<string | null>(null);
  const [feedbackGegeven, setFeedbackGegeven] = useState<Set<string>>(new Set());
  const bodemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodemRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [berichtenQ.data, bezig]);

  const actiesPerBericht = useMemo(() => {
    const map = new Map<string, AgentActie[]>();
    (actiesQ.data ?? []).forEach((a) => {
      const lijst = map.get(a.bericht_id) ?? [];
      lijst.push(a);
      map.set(a.bericht_id, lijst);
    });
    return map;
  }, [actiesQ.data]);

  // synthetische "tool"-systeemberichten zijn instructies voor de agent zelf,
  // niet bedoeld om aan Thomas te tonen (zie agent.pb.js) — hier weggefilterd
  const zichtbareBerichten = useMemo(
    () => (berichtenQ.data ?? []).filter((b) => b.rol !== "tool"),
    [berichtenQ.data],
  );

  function ververs() {
    qc.invalidateQueries({ queryKey: ["agent-berichten", gesprekId] });
    qc.invalidateQueries({ queryKey: ["agent-acties", gesprekId] });
    qc.invalidateQueries({ queryKey: ["agent-gesprekken"] });
  }

  async function verstuur(overrideTekst?: string) {
    const tekst = (overrideTekst ?? invoer).trim();
    if ((!tekst && !foto) || bezig) return;
    setBezig(true);
    setInvoer("");
    const fotoOmTeSturen = foto;
    setFoto(null);
    try {
      const bericht = await createUserBericht({
        gesprekId,
        inhoud: tekst || "(foto)",
        fotoFile: fotoOmTeSturen,
      });
      ververs();
      await stuurBerichtNaarAgent(bericht.id);
      ververs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Er ging iets mis");
      setInvoer(tekst);
      setFoto(fotoOmTeSturen);
    } finally {
      setBezig(false);
    }
  }

  async function bevestig(actieId: string) {
    setActerendId(actieId);
    try {
      const r = await bevestigActie(actieId);
      if (r.status === "uitgevoerd") toast.success("Geboekt ✓");
      else if (r.status === "mislukt") toast.error(r.fout || "Actie geweigerd door het systeem");
      ververs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Er ging iets mis");
    } finally {
      setActerendId(null);
    }
  }

  async function afwijs(actieId: string) {
    setActerendId(actieId);
    try {
      await afwijzActie(actieId);
      ververs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Er ging iets mis");
    } finally {
      setActerendId(null);
    }
  }

  async function feedback(berichtId: string, oordeel: AdviesOordeel) {
    try {
      await geefAdviesFeedback(berichtId, oordeel);
      toast.success("Bedankt voor je feedback");
      setFeedbackGegeven((s) => new Set(s).add(berichtId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kon feedback niet opslaan");
    }
  }

  return (
    <>
      <header
        className="sticky top-0 z-30 bg-nav text-nav-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-16 max-w-screen-md items-center gap-2 px-3">
          <button
            type="button"
            onClick={onTerug}
            aria-label="Terug naar gesprekken"
            className="-ml-1 flex h-12 w-12 items-center justify-center rounded-lg text-nav-foreground hover:bg-white/10"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="flex-1 truncate">
            <h1 className="truncate text-base font-semibold leading-tight text-nav-foreground">
              Assistent
            </h1>
          </div>
          <VerbindingBadge />
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-screen-md flex-col">
        <div className="flex-1 space-y-3 px-3 py-4 pb-40">
          {berichtenQ.isError && (
            <ErrorState error={berichtenQ.error} onRetry={() => berichtenQ.refetch()} />
          )}

          {zichtbareBerichten.length === 0 && !bezig && !berichtenQ.isLoading && (
            <div className="space-y-4 py-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary">
                <Sparkles className="h-8 w-8 text-primary-foreground" />
              </div>
              <div>
                <p className="text-lg font-semibold">Vertel wat je gedaan of gezien hebt</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Of stel een vraag over je metingen, oogst of kelder.
                </p>
              </div>
              <div className="grid gap-2">
                {VOORBEELDVRAGEN.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => verstuur(v)}
                    className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-medium active:scale-[0.99]"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {zichtbareBerichten.map((b) => (
            <BerichtWeergave
              key={b.id}
              bericht={b}
              acties={actiesPerBericht.get(b.id) ?? []}
              acterendId={acterendId}
              onBevestig={bevestig}
              onAfwijs={afwijs}
              onFeedback={feedback}
              feedbackGegeven={feedbackGegeven.has(b.id)}
            />
          ))}

          {bezig && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2.5 text-sm text-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Aan het nadenken…
              </div>
            </div>
          )}

          <div ref={bodemRef} />
        </div>

        {/* invoerveld onderaan, boven de bottom-nav */}
        <div
          className="fixed inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 4rem)" }}
        >
          {foto && (
            <div className="mx-auto flex max-w-screen-md items-center gap-2 px-3 pt-2">
              <span className="truncate rounded-lg bg-primary-soft px-2 py-1 text-xs">
                📷 {foto.name}
              </span>
              <button
                type="button"
                onClick={() => setFoto(null)}
                className="text-xs font-medium text-muted-foreground underline"
              >
                Verwijderen
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verstuur();
            }}
            className="mx-auto flex max-w-screen-md items-end gap-2 px-3 py-3"
          >
            <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-input bg-card">
              <Camera className="h-5 w-5" />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={async (e) => {
                  const gekozen = e.target.files?.[0] ?? null;
                  if (!gekozen) return;
                  const res = await comprimeerFoto(gekozen);
                  setFoto(res.file);
                  if (res.gecomprimeerdKb < res.origineelKb) {
                    toast.success(
                      `Foto verkleind: ${res.origineelKb} kB → ${res.gecomprimeerdKb} kB`,
                    );
                  }
                }}
                className="hidden"
              />
            </label>
            <textarea
              value={invoer}
              onChange={(e) => setInvoer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  verstuur();
                }
              }}
              rows={1}
              placeholder="Vertel of vraag iets…"
              disabled={bezig}
              className="max-h-32 flex-1 resize-none rounded-2xl border border-input bg-card px-4 py-3 text-base outline-none focus:ring-2 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={bezig || (!invoer.trim() && !foto)}
              aria-label="Verstuur"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-40"
            >
              {bezig ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
