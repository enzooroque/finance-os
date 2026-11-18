import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Amount, ScopeBadge } from "@/components/finance/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { MagicCard } from "@/components/ui/magic-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { getAccounts, getViewContext } from "@/lib/finance/queries";
import { accountTypeLabel } from "@/lib/finance/types";
import { effectiveAnnualBp, yieldCents } from "@/lib/finance/yield-math";
import { getCdiAnnualBp } from "@/lib/finance/cdi";
import { formatBRL } from "@/lib/money";
import { AccountActions } from "./account-actions";
import { AccountDialog } from "./account-dialog";

export const metadata: Metadata = { title: "Contas" };

export default async function ContasPage() {
  const ctx = await getViewContext();
  const [accounts, cdi] = await Promise.all([getAccounts(ctx, { includeArchived: true }), getCdiAnnualBp()]);
  const active = accounts.filter((a) => !a.archived);
  const total = active.reduce((s, a) => s + a.balanceCents, 0);
  const pending = active.reduce((s, a) => s + a.pendingCents, 0);
  const hasHousehold = !!ctx.household;
  const defaultScope = ctx.view === "compartilhado" ? "shared" : "personal";

  const newButton = (
    <AccountDialog hasHousehold={hasHousehold} defaultScope={defaultScope}>
      <Button>
        <Plus data-icon="inline-start" />
        Nova conta
      </Button>
    </AccountDialog>
  );

  return (
    <>
      <PageHeader title="Contas" description="Contas bancárias, carteiras e saldos." actions={accounts.length ? newButton : undefined} />
      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhuma conta nesta visão"
          description="Cadastre sua conta corrente, poupança, carteira digital ou dinheiro em espécie para começar."
          action={newButton}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Saldo atual" cents={total} icon={Wallet} tone={total < 0 ? "negative" : "neutral"} hint="Contas ativas, só valores pagos" />
            <StatCard
              label="Pendentes"
              cents={pending}
              icon={Wallet}
              tone={pending < 0 ? "negative" : pending > 0 ? "positive" : "neutral"}
              hint="A receber − a pagar"
            />
          </div>
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {accounts.map((a) => (
              <li key={a.id}>
                <MagicCard className={`rounded-xl ${a.archived ? "opacity-60" : ""}`} gradientFrom="#7c5cff" gradientTo="#4a8ae0" gradientColor="#2a2f4a" gradientOpacity={0.6}>
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="mt-1 size-3 shrink-0 rounded-full" style={{ backgroundColor: a.color ?? "#7c5cff" }} />
                    <Link href={`/contas/${a.id}`} className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {accountTypeLabel[a.type]}
                        {a.institution ? ` · ${a.institution}` : ""}
                        {a.archived ? " · Arquivada" : ""}
                        {(() => {
                          const rate = effectiveAnnualBp(a, cdi?.bp ?? null);
                          return rate && a.balanceCents > 0 ? ` · rende ~${formatBRL(yieldCents(a.balanceCents, rate, 1))}/dia útil` : "";
                        })()}
                      </p>
                    </Link>
                    <AccountActions account={a} hasHousehold={hasHousehold} />
                  </div>
                  <Link href={`/contas/${a.id}`} className="flex items-end justify-between gap-2">
                    <ScopeBadge scope={a.scope} />
                    <Amount cents={a.balanceCents} className="text-lg" />
                  </Link>
                  </div>
                </MagicCard>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
