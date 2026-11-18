import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Amount, ScopeBadge } from "@/components/finance/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { MagicCard } from "@/components/ui/magic-card";
import { PageHeader } from "@/components/shared/page-header";
import { getCards } from "@/lib/finance/cards";
import { getViewContext } from "@/lib/finance/queries";
import { brandLabel } from "@/lib/finance/statement";
import { formatBRL } from "@/lib/money";
import { CardDialog } from "./card-dialogs";

export const metadata: Metadata = { title: "Cartões" };

export default async function CartoesPage() {
  const ctx = await getViewContext();
  const cards = await getCards(ctx);
  const hasHousehold = !!ctx.household;
  const newButton = <CardDialog hasHousehold={hasHousehold} defaultScope={ctx.view === "compartilhado" ? "shared" : "personal"} />;

  return (
    <>
      <PageHeader title="Cartões" description="Cartões de crédito, faturas e parcelamentos." actions={cards.length ? newButton : undefined} />
      {cards.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão nesta visão"
          description="Cadastre seus cartões com limite e dias de fechamento e vencimento. Nunca pedimos o número completo."
          action={newButton}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {cards.map((c) => {
            const pct = c.limitCents > 0 ? Math.min(100, Math.round((c.usedCents / c.limitCents) * 100)) : 0;
            return (
              <li key={c.id}>
                <Link href={`/cartoes/${c.id}`}>
                  <MagicCard className={`rounded-xl ${c.archived ? "opacity-60" : ""}`} gradientFrom="#7c5cff" gradientTo="#4a8ae0" gradientColor="#2a2f4a" gradientOpacity={0.6}>
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate font-medium">
                          <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? "#7c5cff" }} />
                          {c.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {brandLabel[c.brand]}
                          {c.lastFour ? ` •••• ${c.lastFour}` : ""} · fecha dia {c.closingDay} · vence dia {c.dueDay}
                          {c.archived ? " · Arquivado" : ""}
                        </p>
                      </div>
                      <ScopeBadge scope={c.scope} />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Em aberto</span>
                        <span>Limite {formatBRL(c.limitCents)}</span>
                      </div>
                      <Amount cents={c.usedCents} className="text-lg" />
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Limite usado">
                        <div className={`h-full rounded-full ${pct >= 90 ? "bg-negative" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Disponível {formatBRL(Math.max(0, c.limitCents - c.usedCents))}</p>
                    </div>
                  </div>
                </MagicCard>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
