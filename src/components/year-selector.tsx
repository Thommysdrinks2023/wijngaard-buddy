import { ChevronLeft, ChevronRight } from "lucide-react";
import { useBeschikbareJaren, useSeizoen } from "@/lib/seizoen";

interface YearSelectorProps {
  extra?: number[];
  className?: string;
}

export function YearSelector({ extra = [], className = "" }: YearSelectorProps) {
  const [jaar, setJaar] = useSeizoen();
  const opties = useBeschikbareJaren(extra);
  const all = Array.from(new Set([jaar, ...opties])).sort((a, b) => b - a);
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-lg border border-input bg-card ${className}`}
      aria-label="Seizoen kiezen"
    >
      <button
        type="button"
        onClick={() => setJaar(jaar - 1)}
        className="flex h-9 w-9 items-center justify-center rounded-l-lg hover:bg-muted"
        aria-label="Vorig seizoen"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <select
        value={jaar}
        onChange={(e) => setJaar(Number(e.target.value))}
        className="h-9 bg-transparent px-1 text-sm font-semibold outline-none"
      >
        {all.map((j) => (
          <option key={j} value={j}>
            {j}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setJaar(jaar + 1)}
        className="flex h-9 w-9 items-center justify-center rounded-r-lg hover:bg-muted"
        aria-label="Volgend seizoen"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
