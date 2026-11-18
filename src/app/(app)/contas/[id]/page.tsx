import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Amount, MonthNav, parseMonth, ScopeBadge } from "@/components/finance/bits";
import { EntryDialog } from "@/components/finance/entry-dialog";
import { TransactionList, TransferList } from "@/components/finance/transaction-list";
import { EmptyState } from "@/components/shared/empty-state";
import { daysInMonth, todayISO } from "@/lib/dates";
import { businessDays, effectiveAnnualBp, yieldCents } from "@/lib/finance/yield-math";
import { getCdiAnnualBp } from "@/lib/finance/cdi";
import { centsToInput } from "@/lib/money";
import { getAccounts, getAccountStatement, getCategories, getViewContext } from "@/lib/finance/queries";
import { accountTypeLabel } from "@/lib/finance/types";
import { AccountActions } from "../account-actions";
import { ReconcileCard } from "./reconcile-card";
import { YieldCard } from "./yield-card";

export const metadata: Metadata = { title: "Extrato" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AccountPage({ params, searchParams }: PageProps<"/contas/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const ctx = await getViewContext(); // primeiro: marca como "por requisição"
  const month = parseMonth(sp.mes, todayISO());
  // O RLS só devolve a conta se a pessoa tiver acesso; senão, 404.
  const account = (await getAccounts(ctx, { includeArchived: true, ignoreView: true })).find((a) => a.id === id);
  if (!account) notFound();
  const [{ transactions, transfers }, categories, cdi] = await Promise.all([getAccountStatement(id, month), getCategories(), getCdiAnnualBp()]);
  const today = todayISO();
  const rate = effectiveAnnualBp(account, cdi?.bp ?? null) ?? 0;
  const rateLabel = account.yieldCdiBp
    ? `${centsToInput(account.yieldCdiBp)}% do CDI (CDI de ${cdi?.date ?? "—"}: ${cdi ? centsToInput(cdi.bp) : "—"}% a.a.) ≈ ${centsToInput(rate)}% ao ano`
    : `${centsToInput(rate)}% ao ano`;
  const monthEnd = `${today.slice(0, 7)}-${String(daysInMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)))).padStart(2, "0")}`;
  const daysLeft = businessDays(today, monthEnd);
  const yieldCategory = categories.find((c) => c.scope === null && c.kind === "income" && c.name === "Rendimentos")?.id ?? null;

  const inflow =
    transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amountCents, 0) +
    transfers.filter((t) => t.toAccountId === id).reduce((s, t) => s + t.amountCents, 0);
  const outflow =
    transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amountCents, 0) +
    transfers.filter((t) => t.fromAccountId === id).reduce((s, t) => s + t.amountCents, 0);

  return (
    <>
      <Link href="/contas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Contas
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: account.color ?? "#7c5cff" }} />
            <span className="truncate">{account.name}</span>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {accountTypeLabel[account.type]}
            {account.institution ? ` · ${account.institution}` : ""}
            <ScopeBadge scope={account.scope} />
          </p>
        </div>
        <AccountActions account={account} hasHousehold={!!ctx.household} afterDelete="/contas" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <Card className="mb-4 gap-1 px-4">
            <p className="text-sm text-muted-foreground">Saldo atual</p>
            <Amount cents={account.balanceCents} className="text-3xl font-semibold" />
            {account.pendingCents !== 0 && (
              <p className="text-xs text-muted-foreground">
                Com pendentes: <Amount cents={account.balanceCents + account.pendingCents} className="text-xs" />
              </p>
            )}
          </Card>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <MonthNav month={month} basePath={`/contas/${id}`} />
            <EntryDialog>
              <Button variant="outline" size="sm">
                <Plus data-icon="inline-start" /> Lançar
              </Button>
            </EntryDialog>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            No mês: entradas <Amount cents={inflow} kind="income" className="text-sm" /> · saídas{" "}
            <Amount cents={outflow} kind="expense" className="text-sm" />
          </p>

          {transactions.length === 0 && transfers.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="Sem movimentações neste mês" description="Lançamentos e transferências desta conta aparecem aqui." />
          ) : (
            <div className="grid gap-4">
              {transactions.length > 0 && <TransactionList rows={transactions} members={ctx.household?.members ?? []} />}
              {transfers.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-medium text-muted-foreground">Transferências</h2>
                  <TransferList rows={transfers} perspectiveAccountId={id} />
                </section>
              )}
            </div>
          )}
        </div>
        <div className="grid content-start gap-4">
          {account.yieldCdiBp && !cdi && (
            <p className="rounded-xl border p-3 text-xs text-muted-foreground">Não foi possível consultar o CDI no Banco Central agora; a estimativa volta assim que ele responder.</p>
          )}
          {rate > 0 && (
            <YieldCard
              account={account}
              rateLabel={rateLabel}
              perDayCents={yieldCents(account.balanceCents, rate, 1)}
              restOfMonthCents={yieldCents(account.balanceCents, rate, daysLeft)}
              daysLeft={daysLeft}
              yearCents={yieldCents(account.balanceCents, rate, 252)}
              categoryId={yieldCategory}
            />
          )}
          <ReconcileCard balanceCents={account.balanceCents} pendingCents={account.pendingCents} />
        </div>
      </div>
    </>
  );
}
