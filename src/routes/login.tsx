import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPb, isPbConfigured, setInvoerder } from "@/lib/data";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
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
      navigate({ to: "/" });
    } catch {
      setFout("Inloggen mislukt. Controleer je e-mailadres en wachtwoord.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🍇</div>
          <CardTitle className="text-2xl">Wijngaard Buddy</CardTitle>
          <p className="text-sm text-muted-foreground">
            {naamModus ? "Vul je naam in om te beginnen" : "Log in met je account"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInloggen} className="space-y-4">
            {naamModus ? (
              <div className="space-y-2">
                <Label htmlFor="naam">Naam</Label>
                <Input
                  id="naam"
                  type="text"
                  placeholder="Bijv. Jan de Boer"
                  value={naam}
                  onChange={(e) => {
                    setNaam(e.target.value);
                    setFout("");
                  }}
                  autoFocus
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mailadres</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="naam@tappenmars.nl"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFout("");
                    }}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wachtwoord">Wachtwoord</Label>
                  <Input
                    id="wachtwoord"
                    type="password"
                    value={wachtwoord}
                    onChange={(e) => {
                      setWachtwoord(e.target.value);
                      setFout("");
                    }}
                  />
                </div>
              </>
            )}
            {fout && <p className="text-sm text-destructive">{fout}</p>}
            <Button type="submit" className="w-full" disabled={bezig}>
              {bezig ? "Bezig met inloggen…" : naamModus ? "Doorgaan" : "Inloggen"}
            </Button>
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
        </CardContent>
      </Card>
    </div>
  );
}
