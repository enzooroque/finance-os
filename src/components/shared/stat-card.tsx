import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyTicker } from "@/components/finance/money-ticker";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "positive" | "negative";

const toneClass: Record<Tone, string> = {
  neutral: "text-foreground",
  positive: "text-positive",
  negative: "text-negative",
};

/**
 * Card de indicador. `cents = null` significa "sem dados" e mostra um traço:
 * nunca exibimos R$ 0,00 inventado quando o dado ainda não existe.
 */
export function StatCard({
  label,
  cents,
  icon: Icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  cents: number | null;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <Card className="gap-3 px-4 transition-colors hover:bg-surface-2/60">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="truncate">{label}</span>
        <Icon className="size-4 shrink-0" />
      </div>
      <p className={cn("tabular truncate text-lg font-semibold sm:text-2xl tracking-tight", cents !== null && toneClass[tone])}>
        {cents === null ? <span className="text-muted-foreground">—</span> : <MoneyTicker cents={cents} />}
      </p>
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="gap-3 px-4" aria-hidden>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-full max-w-32" />
      <Skeleton className="h-3 w-20" />
    </Card>
  );
}
