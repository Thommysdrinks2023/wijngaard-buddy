import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setInvoerder } from "@/lib/data";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [naam, setNaam] = useState("");
  const [fout, setFout] = useState("");

  function handleInloggen(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = naam.trim();
    if (!trimmed) {
      setFout("Vul je naam in om door te gaan.");
      return;
    }
    setInvoerder(trimmed);
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🍇</div>
          <CardTitle className="text-2xl">Wijngaard Buddy</CardTitle>
          <p className="text-sm text-muted-foreground">Vul je naam in om te beginnen</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInloggen} className="space-y-4">
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
              {fout && <p className="text-sm text-destructive">{fout}</p>}
            </div>
            <Button type="submit" className="w-full">
              Doorgaan
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
