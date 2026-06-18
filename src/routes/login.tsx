import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getPb, isPbConfigured, setInvoerder } from "@/lib/data";
import { useWijngaardConfig } from "@/lib/use-wijngaard-config";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Inloggen — Wijngaard" }] }),
});

function LoginPage() {
  const navigate = useNavigate();
  const { naam: wijngaardNaam } = useWijngaardConfig();
  // PocketBase-login wanneer een server is geconfigureerd, anders alleen naam
  const pbActief = isPbConfigured();
  const [offlineModus, setOfflineModus] = useState(false);
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [naam, setNaam] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  const naamModus = !pbActief || offlineModus;

  async function handleInloggen(e: React.FormEvent) {
    e.preventDefault();
    setFout("");

    if (naamModus) {
      const trimmed = naam.trim();
      if (!trimmed) {
        setFout("Vul je naam in om door te gaan.");
        return;
      }
      setInvoerder(trimmed);
      // expliciete keuze om zonder account te werken (data blijft dan lokaal
      // tot er wordt ingelogd) — bewust, geen stille fallback
      localStorage.setItem("wg.offline.keuze.v1", "1");
      navigate({ to: "/" });
      return;
    }

    if (!email.trim() || !wachtwoord) {
      setFout("Vul je e-mailadres en wachtwoord in.");
      return;
    }
    setBezig(true);
    try {
      const pb = getPb()!;
      const auth = await pb.collection("users").authWithPassword(email.trim(), wachtwoord);
      const record = auth.record as { name?: string };
      setInvoerder(record.name || email.trim().split("@")[0]);
      localStorage.removeItem("wg.offline.keuze.v1");
      navigate({ to: "/" });
    } catch {
      setFout("Inloggen mislukt. Controleer je e-mailadres en wachtwoord.");
    } finally {
      setBezig(false);
    }
  }

  const inputClass =
    "h-12 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
        {/* Kop met logo */}
        <div className="flex flex-col items-center bg-nav px-6 pb-6 pt-8 text-center">
          <img src="/logo-icon.png" alt={wijngaardNaam} className="h-20 w-20 object-contain" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-nav-foreground">
            {wijngaardNaam}
          </h1>
          <p className="mt-1 text-sm text-nav-muted">
            {naamModus ? "Vul je naam in om te beginnen" : "Log in met je account"}
          </p>
        </div>

        {/* Formulier op lichte ondergrond */}
        <div className="bg-card px-6 pb-8 pt-6">
          <form onSubmit={handleInloggen} className="space-y-4">
            {naamModus ? (
              <label className="block">
                {pbActief && (
                  <p className="mb-3 rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
                    ⚠️ Zonder account blijft je invoer alleen op dit apparaat staan totdat je
                    inlogt. Log in zodra je weer verbinding hebt.
                  </p>
                )}
                <span className="mb-1.5 block text-sm font-medium text-foreground">Naam</span>
                <input
                  type="text"
                  placeholder="Bijv. Jan de Boer"
                  value={naam}
                  onChange={(e) => {
                    setNaam(e.target.value);
                    setFout("");
                  }}
                  autoFocus
                  className={inputClass}
                />
              </label>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-foreground">
                    E-mailadres
                  </span>
                  <input
                    type="email"
                    placeholder="naam@tappenmars.nl"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFout("");
                    }}
                    autoFocus
                    autoComplete="username"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-foreground">
                    Wachtwoord
                  </span>
                  <input
                    type="password"
                    value={wachtwoord}
                    onChange={(e) => {
                      setWachtwoord(e.target.value);
                      setFout("");
                    }}
                    autoComplete="current-password"
                    className={inputClass}
                  />
                </label>
              </>
            )}

            {fout && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {fout}
              </p>
            )}

            <button
              type="submit"
              disabled={bezig}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-60"
            >
              {bezig && <Loader2 className="h-5 w-5 animate-spin" />}
              {bezig ? "Bezig met inloggen…" : naamModus ? "Doorgaan" : "Inloggen"}
            </button>

            {pbActief && (
              <button
                type="button"
                onClick={() => {
                  setOfflineModus((v) => !v);
                  setFout("");
                }}
                className="w-full text-center text-xs text-muted-foreground underline"
              >
                {offlineModus ? "Inloggen met account" : "Geen verbinding? Ga offline verder"}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
