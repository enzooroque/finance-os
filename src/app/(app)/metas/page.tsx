import type { Metadata } from "next";
import { Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScopeBadge } from "@/components/finance/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatDate, todayISO } from "@/lib/dates";
import { getGoals } from "@/lib/finance/planning";
import { monthlyNeeded, monthsToFinish } from "@/lib/finance/planning-math";
import { getViewContext } from "@/lib/finance/queries";
import { formatBRL } from "@/lib/money";
import { DeleteGoalButton, GoalDialog, MovementDialog } from "./goals-ui";

export const metadata: Metadata = { title: "Metas" };

export default async function MetasPage() {
  const ctx = await getViewContext(); // primeiro: marca a página como "por requisição"
  const today = todayISO();
  const goals = await getGoals(ctx, today);
  const hasHousehold = !!ctx.household;
  const defaultScope = ctx.view === "compartilhado" ? "shared" : "personal";
  const newButton = <GoalDialog hasHousehold={hasHousehold} defaultScope={defaultScope} />;
  const totalSaved = goals.reduce((s, g) => s + g.savedCents, 0);

  return (
    <>
      <PageHeader
        title="Metas"
        description={goals.length ? `Reservado em metas: ${formatBRL(totalSaved)}` : "Objetivos individuais e do casal."}
        actions={goals.length ? newButton : undefined}
      />
      {goals.length === 0 ? (
        <EmptyState icon={Target} title="Nenhuma meta ainda" description="Crie uma meta e acompanhe quanto falta e quanto guardar por mês." action={newButton} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {goals.map((g) => {
            const remaining = Math.max(0, g.targetCents - g.savedCents);
            const pct = Math.min(100, Math.floor((g.savedCents * 100) / g.targetCents));
            const need = monthlyNeeded(remaining, today, g.deadline);
            const eta = monthsToFinish(remaining, g.avgMonthlyCents);
            return (
              <li key={g.id}>
                <Card className="gap-3 px-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBRL(g.savedCents)} de {formatBRL(g.targetCents)}
                        {g.deadline ? ` · até ${formatDate(g.deadline)}` : ""}
                      </p>
                    </div>
                    <ScopeBadge scope={g.scope} />
                    <GoalDialog goal={g} hasHousehold={hasHousehold} defaultScope={defaultScope} />
                    <DeleteGoalButton goal={g} />
                  </div>
                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${g.name}`}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: g.color ?? "#10b981" }} />
                    </div>
                    <p className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span>{pct}%</span>
                      <span>{remaining > 0 ? `Faltam ${formatBRL(remaining)}` : "Meta atingida"}</span>
                    </p>
                  </div>
                  {remaining > 0 && (
                    <ul className="grid gap-0.5 text-xs text-muted-foreground">
                      {need !== null && <li>Para chegar no prazo: {formatBRL(need)}/mês</li>}
                      <li>
                        {eta !== null
                          ? `No ritmo atual (${formatBRL(g.avgMonthlyCents)}/mês), faltam cerca de ${eta} ${eta === 1 ? "mês" : "meses"}`
                          : "Sem aportes nos últimos 3 meses para estimar"}
                      </li>
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <MovementDialog goal={g} kind="deposit" />
                    <MovementDialog goal={g} kind="withdrawal" />
                  </div>
                  {g.recent.length > 0 && (
                    <ul className="grid gap-0.5 border-t pt-2 text-xs text-muted-foreground">
                      {g.recent.map((m) => (
                        <li key={m.id} className="flex justify-between">
                          <span>
                            {m.kind === "deposit" ? "Aporte" : "Retirada"} · {formatDate(m.occurredOn)}
                          </span>
                          <span className={m.kind === "deposit" ? "text-positive" : "text-negative"}>
                            {m.kind === "deposit" ? "+" : "−"} {formatBRL(m.amountCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
