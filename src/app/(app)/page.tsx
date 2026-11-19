import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, CreditCard, Gauge, LayoutDashboard, Minus, PiggyBank, Plus, Repeat, Scale, Target, Wallet } from "lucide-react";
import { EntryDialog } from "@/components/finance/entry-dialog";
import { MonthInOne, SpendRing } from "@/components/finance/spend-ring";
import { InstallCard } from "@/components/pwa/install-card";
import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Amount, MonthNav, monthLabel, parseMonth } from "@/components/finance/bits";
import { BalanceChart, CategoryBars, IncomeExpenseChart } from "@/components/finance/charts";
import { TransactionList } from "@/components/finance/transaction-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { formatDate, todayISO } from "@/lib/dates";
import { getDashboardData } from "@/lib/finance/analytics";
import { percentChange } from "@/lib/finance/analytics-math";
import { getViewContext } from "@/lib/finance/queries";
import { formatBRL } from "@/lib/money";

const quick =
  "flex flex-col items-center gap-1 rounded-xl border bg-surface-1 py-3 text-xs font-medium transition-colors hover:bg-surface-2 active:scale-95";

function vsLastMonth(cur: number, prev: number) {
  const p = percentChange(cur, prev);
  return p === null ? "Sem dado no mês anterior" : `${p > 0 ? "+" : ""}${p}% vs. mês anterior`;
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const ctx = await getViewContext(); // primeiro: marca como "por requisição"
  const today = todayISO();
  const month = parseMonth(sp.mes, today);
  const d = await getDashboardData(ctx, month, today);
  const result = d.current.income - d.current.expense;
  const prevResult = d.previous.income - d.previous.expense;
  const isCurrentMonth = month === today.slice(0, 7);

  return (
    <>
      <PageHeader title="Dashboard" description={`Resumo de ${monthLabel(month)}.`} actions={<MonthNav month={month} basePath="/" />} />

      {!d.hasAccounts ? (
        <EmptyState
          icon={LayoutDashboard}
          title="Comece cadastrando uma conta"
          description="Com uma conta cadastrada, o resumo do mês aparece aqui."
          action={
            <Link href="/contas" className="text-sm text-primary underline-offset-4 hover:underline">
              Ir para Contas
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4">
          <InstallCard />
          <BlurFade delay={0.05}>
          <nav aria-label="Atalhos" className="grid grid-cols-4 gap-2">
            <EntryDialog defaultKind="expense">
              <button type="button" className={quick}>
                <Minus className="size-5 text-negative" /> Gasto
              </button>
            </EntryDialog>
            <EntryDialog defaultKind="income">
              <button type="button" className={quick}>
                <Plus className="size-5 text-positive" /> Receita
              </button>
            </EntryDialog>
            <Link href="/contas-a-pagar" className={quick}>
              <Repeat className="size-5 text-info" /> Fixos
            </Link>
            <Link href={`/orcamentos?mes=${month}`} className={quick}>
              <Gauge className="size-5 text-primary" /> Limites
            </Link>
          </nav>
          </BlurFade>

          <BlurFade delay={0.12}>
          <div className="grid gap-4 md:grid-cols-2">
            <SpendRing limitCents={d.limitCents} spentCents={d.variableCents} month={month} today={today} />
            <MonthInOne {...d.monthInOne} />
          </div>
          </BlurFade>

          <BlurFade delay={0.2}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Saldo atual" cents={d.totalBalance} icon={Wallet} tone={d.totalBalance < 0 ? "negative" : "neutral"} hint={isCurrentMonth ? `Previsto fim do mês: ${formatBRL(d.projectedBalance)}` : "Contas ativas"} />
            <StatCard label="Receitas" cents={d.current.income} icon={ArrowUpRight} tone="positive" hint={vsLastMonth(d.current.income, d.previous.income)} />
            <StatCard label="Despesas" cents={d.current.expense} icon={ArrowDownRight} tone="negative" hint={vsLastMonth(d.current.expense, d.previous.expense)} />
            <StatCard label="Resultado" cents={result} icon={Scale} tone={result < 0 ? "negative" : "positive"} hint={vsLastMonth(result, prevResult)} />
          </div>
          </BlurFade>

          {(d.overdue.length > 0 || d.budgetAlerts.length > 0) && (
            <div role="status" className="grid gap-1 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
              {d.overdue.length > 0 && (
                <Link href="/contas-a-pagar" className="flex items-center gap-2 hover:underline">
                  <AlertTriangle className="size-4 text-warning" /> {d.overdue.length} conta(s) em atraso
                </Link>
              )}
              {d.budgetAlerts.map((b) => (
                <Link key={b.id} href={`/orcamentos?mes=${month}`} className="flex items-center gap-2 hover:underline">
                  <AlertTriangle className="size-4 text-warning" /> Orçamento de {b.categoryName}: {formatBRL(b.usedCents)} de {formatBRL(b.plannedCents)}
                </Link>
              ))}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Receitas x despesas</CardTitle>
              </CardHeader>
              <CardContent>
                <IncomeExpenseChart data={d.series} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Despesas por categoria</CardTitle>
              </CardHeader>
              <CardContent>
                {d.byCategory.length ? <CategoryBars data={d.byCategory} /> : <p className="text-sm text-muted-foreground">Nenhuma despesa neste mês.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Evolução do saldo</CardTitle>
              </CardHeader>
              <CardContent>
                <BalanceChart data={d.series} />
                <p className="mt-1 text-[11px] text-muted-foreground">Estimada pelos lançamentos pagos; o saldo de hoje é exato.</p>
              </CardContent>
            </Card>
            <div className="grid content-start gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarClock className="size-4" /> Próximos 7 dias
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {d.upcoming.length ? (
                    <ul className="grid gap-1.5 text-sm">
                      {d.upcoming.map((o) => (
                        <li key={`${o.ruleId}|${o.dueOn}`} className="flex justify-between gap-2">
                          <span className="truncate">
                            {formatDate(o.dueOn).slice(0, 5)} · {o.rule.description}
                          </span>
                          <Amount cents={o.amountCents} kind={o.rule.type} className="text-sm" />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nada vence nos próximos dias.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="grid gap-2 text-sm">
                  {d.openStatements.map((s) => (
                    <Link key={s.cardId} href={`/cartoes/${s.cardId}`} className="flex justify-between gap-2 hover:underline">
                      <span className="flex items-center gap-2 truncate">
                        <CreditCard className="size-4 shrink-0" /> {s.cardName} · vence {formatDate(s.dueDate).slice(0, 5)}
                      </span>
                      <span className="tabular">{formatBRL(s.remainingCents)}</span>
                    </Link>
                  ))}
                  <Link href="/metas" className="flex justify-between gap-2 hover:underline">
                    <span className="flex items-center gap-2">
                      <Target className="size-4" /> Reservado em metas
                    </span>
                    <span className="tabular">{formatBRL(d.reservedCents)}</span>
                  </Link>
                  <Link href={`/orcamentos?mes=${month}`} className="flex items-center gap-2 text-muted-foreground hover:underline">
                    <PiggyBank className="size-4" /> Ver orçamentos do mês
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Últimas movimentações</h2>
              <Link href={`/transacoes?mes=${month}`} className="text-xs text-primary hover:underline">
                Ver todas
              </Link>
            </div>
            {d.recent.length ? (
              <TransactionList rows={d.recent} members={ctx.household?.members ?? []} />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum lançamento neste mês.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
