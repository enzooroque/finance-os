import { Skeleton } from "@/components/ui/skeleton";
import { StatCardSkeleton } from "./stat-card";

/** Esqueleto genérico de página, usado nos loading.tsx enquanto os dados carregam. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Carregando" className="animate-in fade-in-0">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
    </div>
  );
}
