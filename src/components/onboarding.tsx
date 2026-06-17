import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getWijngaardConfig } from "@/lib/wijngaard-config";

const LS_GEZIEN = "wg.onboarding.gezien.v1";

const STAPPEN = [
  {
    logo: true,
    emoji: "",
    titel: "Welkom bij Wijngaard Buddy",
    tekst: `De veld-app van ${getWijngaardConfig().naam}. Alles wat je in de wijngaard registreert — metingen, observaties, oogst — staat veilig op één plek en werkt ook zonder bereik.`,
  },
  {
    logo: false,
    emoji: "🗺️",
    titel: "Zo werkt het",
    tekst:
      "De perceelkaart is je startpunt: tik op een rij en je ziet alles van die rij. Daar registreer je metingen en observaties. Gekleurde stippen tonen wat aandacht nodig heeft.",
  },
  {
    logo: false,
    emoji: "🧪",
    titel: "Begin met een meting",
    tekst:
      "Open de kaart, kies een rij en tik op Meting. Datum en je naam worden automatisch ingevuld — jij hoeft alleen de waarden in te voeren.",
  },
];

// Drie welkomstschermen bij het allereerste gebruik
export function Onboarding() {
  const [stap, setStap] = useState(0);
  const [tonen, setTonen] = useState(false);

  useEffect(() => {
    setTonen(!localStorage.getItem(LS_GEZIEN));
  }, []);

  if (!tonen) return null;

  const sluit = () => {
    localStorage.setItem(LS_GEZIEN, "1");
    setTonen(false);
  };

  const huidige = STAPPEN[stap];
  const laatste = stap === STAPPEN.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-sm rounded-3xl border-2 p-6 text-center"
        style={{ backgroundColor: "#27232a", borderColor: "#cac176" }}
      >
        {huidige.logo ? (
          <img
            src="/logo-icon.png"
            alt={getWijngaardConfig().naam}
            className="mx-auto h-24 w-24 object-contain"
          />
        ) : (
          <div className="text-5xl">{huidige.emoji}</div>
        )}
        <h2 className="mt-3 text-xl font-bold text-white">{huidige.titel}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/80">{huidige.tekst}</p>

        {/* stappenindicator */}
        <div className="mt-4 flex justify-center gap-1.5">
          {STAPPEN.map((_, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: i === stap ? "#cac176" : "#ffffff33" }}
            />
          ))}
        </div>

        <div className="mt-5 space-y-2">
          {laatste ? (
            <Link
              to="/dashboard"
              onClick={sluit}
              className="flex h-12 w-full items-center justify-center rounded-xl text-base font-semibold"
              style={{ backgroundColor: "#cac176", color: "#27232a" }}
            >
              Naar het dashboard
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setStap((s) => s + 1)}
              className="h-12 w-full rounded-xl text-base font-semibold"
              style={{ backgroundColor: "#cac176", color: "#27232a" }}
            >
              Volgende
            </button>
          )}
          <button
            type="button"
            onClick={sluit}
            className="h-10 w-full text-sm text-white/60 underline"
          >
            Overslaan
          </button>
        </div>
      </div>
    </div>
  );
}
