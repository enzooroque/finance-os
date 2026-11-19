import type { Metadata } from "next";
import { PiggyBank } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MonthNav, parseMonth, ScopeBadge } from "@/components/finance/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { todayISO } from "@/lib/dates";
import { getBudgets } from "@/lib/finance/planning";
import { budgetLevel } from "@/lib/finance/planning-math";
import { getCategories, getViewContext } from "@/lib/finance/queries";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BudgetDialog, CopyPreviousButton, DeleteBudgetButton } from "./budgets-ui";

export const metadata: Metadata = { title: "Orçamentos" };

const barColor = { ok: "bg-positive", warning: "bg-warning", over: "bg-negative" } as const;

export default async function OrcamentosPage({ searchParams }: PageProps<"/orcamentos">) {
  const sp = await searchParams;
  const ctx = await getViewContext(); // primeiro: marca como "por requisição"
  const month = parseMonth(sp.mes, todayISO());
  const [budgets, categories] = await Promise.all([getBudgets(ctx, month), getCategories()]);
  const hasHousehold = !!ctx.household;
  const defaultScope = ctx.view === "compartilhado" ? "shared" : "personal";
  const planned = budgets.reduce((s, b) => s + b.plannedCents, 0);
  const used = budgets.reduce((s, b) => s + b.usedCents, 0);
  const alerts = budgets.filter((b) => budgetLevel(b.usedCents, b.plannedCents) !== "ok");
  const dialogProps = { month, categories, hasHousehold, defaultScope } as const;

  return (
    <>
      <PageHeader
        title="Orçamentos"
       
        actions={
          <>
            <CopyPreviousButton month={month} />
            <BudgetDialog {...dialogProps} />
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <MonthNav month={month} basePath="/orcamentos" />
        {budgets.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Usado {formatBRL(used)} de {formatBRL(planned)}
          </p>
        )}
      </div>
      {alerts.length > 0 && (
        <div role="status" className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          {alerts.map((b) => (
            <p key={b.id}>
              {budgetLevel(b.usedCents, b.plannedCents) === "over" ? "Estourou:" : "Atenção:"} {b.categoryName},{" "}
              {formatBRL(b.usedCents)} de {formatBRL(b.plannedCents)}
            </p>
          ))}
        </div>
      )}
      {budgets.length === 0 ? (
        <EmptyState icon={PiggyBank} title="Nenhum orçamento neste mês" description="Defina limites por categoria ou copie os do mês anterior." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {budgets.map((b) => {
            const level = budgetLevel(b.usedCents, b.plannedCents);
            const pct = b.plannedCents > 0 ? Math.round((b.usedCents * 100) / b.plannedCents) : b.usedCents > 0 ? 100 : 0;
            const diff = b.usedCents - b.previousUsedCents;
            return (
              <li key={b.id}>
                <Card className="gap-2 px-4">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color ?? "#64748b" }} />
                    <p className="min-w-0 flex-1 truncate font-medium">{b.categoryName}</p>
                    <ScopeBadge scope={b.scope} />
                    <BudgetDialog budget={b} {...dialogProps} />
                    <DeleteBudgetButton budget={b} />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uso de ${b.categoryName}`}>
                    <div className={cn("h-full rounded-full", barColor[level])} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className={cn(level === "over" ? "text-negative" : "text-muted-foreground")}>
                      {formatBRL(b.usedCents)} de {formatBRL(b.plannedCents)} ({pct}%)
                    </span>
                    <span className="text-muted-foreground">
                      {b.plannedCents - b.usedCents >= 0 ? `Disponível ${formatBRL(b.plannedCents - b.usedCents)}` : `Passou ${formatBRL(b.usedCents - b.plannedCents)}`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mês anterior: {formatBRL(b.previousUsedCents)}
                    {b.previousUsedCents > 0 && diff !== 0 && (
                      <span className={diff > 0 ? "text-negative" : "text-positive"}>
                        {" "}
                        ({diff > 0 ? "+" : "−"}
                        {formatBRL(Math.abs(diff))})
                      </span>
                    )}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
