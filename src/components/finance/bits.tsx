import Link from "next/link";
import { ChevronLeft, ChevronRight, Users, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addMonthsClamped } from "@/lib/dates";
import { scopeLabel, type Scope } from "@/lib/finance/types";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Valor com cor: verde entrada, vermelho saída. `signed` mostra + / −. */
export function Amount({
  cents,
  kind,
  className,
}: {
  cents: number;
  kind?: "income" | "expense" | "neutral";
  className?: string;
}) {
  const k = kind ?? (cents < 0 ? "expense" : "neutral");
  const text = kind === "expense" ? `− ${formatBRL(Math.abs(cents))}` : kind === "income" ? `+ ${formatBRL(cents)}` : formatBRL(cents);
  return (
    <span
      className={cn(
        "tabular font-medium whitespace-nowrap",
        k === "income" && "text-positive",
        k === "expense" && "text-negative",
        className,
      )}
    >
      {text}
    </span>
  );
}

export function ScopeBadge({ scope }: { scope: Scope }) {
  const Icon = scope === "shared" ? Users : User;
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <Icon className="size-3" />
      {scopeLabel[scope]}
    </Badge>
  );
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Navegação de mês por links (?mes=AAAA-MM), preservando os outros filtros. */
export function MonthNav({ month, basePath, params = {} }: { month: string; basePath: string; params?: Record<string, string> }) {
  const href = (delta: number) => {
    const target = addMonthsClamped(`${month}-01`, delta).slice(0, 7);
    const search = new URLSearchParams({ ...params, mes: target });
    search.delete("pagina");
    return `${basePath}?${search}`;
  };
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-surface-1 p-0.5">
      <Button asChild variant="ghost" size="icon-sm">
        <Link href={href(-1)} aria-label="Mês anterior">
          <ChevronLeft />
        </Link>
      </Button>
      <span className="min-w-20 text-center text-sm font-medium capitalize">{monthLabel(month)}</span>
      <Button asChild variant="ghost" size="icon-sm">
        <Link href={href(1)} aria-label="Próximo mês">
          <ChevronRight />
        </Link>
      </Button>
    </div>
  );
}

/** Lê ?mes=AAAA-MM com segurança; cai no mês atual se vier inválido. */
export function parseMonth(raw: unknown, today: string): string {
  return typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : today.slice(0, 7);
}
