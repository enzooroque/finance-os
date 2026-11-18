import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card as UICard } from "@/components/ui/card";
import { Amount, monthLabel, ScopeBadge } from "@/components/finance/bits";
import { TransactionList } from "@/components/finance/transaction-list";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, todayISO } from "@/lib/dates";
import { getCards, getStatementPayments, getStatements } from "@/lib/finance/cards";
import { getEntryOptions, getStatementTransactions, getViewContext } from "@/lib/finance/queries";
import { brandLabel, statementState, statementStateLabel } from "@/lib/finance/statement";
import { formatBRL } from "@/lib/money";
import { CardDialog, DeleteCardButton, DeletePaymentButton, DeletePurchaseButton, PayDialog, PurchaseDialog } from "../card-dialogs";

export const metadata: Metadata = { title: "Cartão" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CardPage({ params, searchParams }: PageProps<"/cartoes/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const ctx = await getViewContext();
  const card = (await getCards(ctx, { ignoreView: true })).find((c) => c.id === id);
  if (!card) notFound(); // o RLS esconde cartões de outras pessoas

  const today = todayISO();
  const [statements, options] = await Promise.all([getStatements(id), getEntryOptions()]);
  // Padrão: a fatura aberta mais próxima; senão, a última.
  const wanted = typeof sp.fatura === "string" ? sp.fatura : null;
  const idx = Math.max(
    0,
    wanted
      ? statements.findIndex((s) => s.referenceMonth.startsWith(wanted))
      : (() => {
          const open = statements.findIndex((s) => s.closingDate > today);
          return open >= 0 ? open : statements.length - 1;
        })(),
  );
  const current = statements[idx];
  const [items, payments] = current
    ? await Promise.all([getStatementTransactions(current.id), getStatementPayments(current.id)])
    : [[], []];
  const state = current ? statementState(current, today) : null;
  const remaining = current ? current.totalCents - current.paidCents : 0;
  const hrefFor = (i: number) => `/cartoes/${id}?fatura=${statements[i].referenceMonth.slice(0, 7)}`;

  return (
    <>
      <Link href="/cartoes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Cartões
      </Link>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: card.color ?? "#7c5cff" }} />
            <span className="truncate">{card.name}</span>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {brandLabel[card.brand]}
            {card.lastFour ? ` •••• ${card.lastFour}` : ""}
            <ScopeBadge scope={card.scope} />
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <CardDialog card={card} hasHousehold={!!ctx.household} />
          <DeleteCardButton card={card} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <UICard className="gap-1 px-4">
          <p className="text-xs text-muted-foreground">Em aberto</p>
          <Amount cents={card.usedCents} className="text-lg" />
        </UICard>
        <UICard className="gap-1 px-4">
          <p className="text-xs text-muted-foreground">Disponível</p>
          <Amount cents={Math.max(0, card.limitCents - card.usedCents)} className="text-lg" />
        </UICard>
      </div>

      <div className="mb-4">
        <PurchaseDialog card={card} categories={options.categories} />
      </div>

      {!current ? (
        <EmptyState icon={Receipt} title="Nenhuma fatura ainda" description="As faturas aparecem quando você registra a primeira compra." />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button asChild variant="ghost" size="icon-sm" className={idx === 0 ? "invisible" : ""}>
              <Link href={idx > 0 ? hrefFor(idx - 1) : "#"} aria-label="Fatura anterior">
                <ChevronLeft />
              </Link>
            </Button>
            <div className="text-center">
              <p className="font-medium">Fatura de {monthLabel(current.referenceMonth.slice(0, 7))}</p>
              <p className="text-xs text-muted-foreground">
                Fecha {formatDate(current.closingDate)} · vence {formatDate(current.dueDate)}
              </p>
            </div>
            <Button asChild variant="ghost" size="icon-sm" className={idx === statements.length - 1 ? "invisible" : ""}>
              <Link href={idx < statements.length - 1 ? hrefFor(idx + 1) : "#"} aria-label="Próxima fatura">
                <ChevronRight />
              </Link>
            </Button>
          </div>

          <UICard className="mb-4 gap-3 px-4">
            <div className="flex items-center justify-between gap-2">
              <Amount cents={current.totalCents} className="text-2xl font-semibold" />
              {state && (
                <Badge variant={state === "paid" ? "secondary" : "outline"} className={state === "closed" ? "text-warning" : state === "paid" ? "text-positive" : ""}>
                  {statementStateLabel[state]}
                </Badge>
              )}
            </div>
            {current.paidCents > 0 && (
              <p className="text-sm text-muted-foreground">
                Pago {formatBRL(current.paidCents)} · falta {formatBRL(remaining)}
              </p>
            )}
            {payments.length > 0 && (
              <ul className="grid gap-1 text-xs text-muted-foreground">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span>
                      Pagamento de {formatBRL(p.amountCents)} em {formatDate(p.paidOn)}
                      {p.accountName ? ` · ${p.accountName}` : ""}
                    </span>
                    <DeletePaymentButton paymentId={p.id} label={`Pagamento de ${formatBRL(p.amountCents)}`} />
                  </li>
                ))}
              </ul>
            )}
            {remaining > 0 && <PayDialog statementId={current.id} remainingCents={remaining} accounts={options.accounts} />}
          </UICard>

          {items.length === 0 ? (
            <EmptyState icon={Receipt} title="Fatura sem compras" />
          ) : (
            <div className="grid gap-2">
              <TransactionList rows={items} members={ctx.household?.members ?? []} />
              <details className="rounded-xl border bg-surface-1/60 p-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Excluir uma compra inteira</summary>
                <ul className="mt-2 grid gap-1">
                  {items
                    .filter((t) => t.purchaseId)
                    .map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {t.description}
                          {t.installment ? ` (${t.installment})` : ""}
                        </span>
                        <DeletePurchaseButton purchaseId={t.purchaseId!} label={t.description} />
                      </li>
                    ))}
                </ul>
              </details>
            </div>
          )}
        </>
      )}
    </>
  );
}
