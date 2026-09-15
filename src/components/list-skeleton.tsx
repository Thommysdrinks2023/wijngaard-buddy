import { Skeleton } from "@/components/ui/skeleton";

// Fase 9 Blok F — gedeelde laadstaat voor lijsten/kaarten die anders tijdens
// het laden een "Geen data"-lege staat tonen (data is dan nog undefined,
// niet gewoon leeg) — dat verwart met een echt lege lijst. Toon dit zolang
// query.isLoading true is, vóór de EmptyState/lijst-vertakking.
export function ListSkeleton({ rijen = 3 }: { rijen?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: rijen }).map((_, i) => (
        <li key={i} className="rounded-xl border border-border bg-card p-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </li>
      ))}
    </ul>
  );
}
