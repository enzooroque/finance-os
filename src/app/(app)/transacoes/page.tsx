import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Plus, Scale, Search, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { MonthNav, parseMonth } from "@/components/finance/bits";
import { EntryDialog } from "@/components/finance/entry-dialog";
import { TransactionList, TransferList } from "@/components/finance/transaction-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { todayISO } from "@/lib/dates";
import {
  getAccounts,
  getCategories,
  getMonthSummary,
  getTransactions,
  getTransfers,
  getViewContext,
  PAGE_SIZE,
  type TransactionFilters,
} from "@/lib/finance/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Transações" };

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
const UUID = /^[0-9a-f-]{36}$/i;

export default async function TransacoesPage({ searchParams }: PageProps<"/transacoes">) {
  const sp = await searchParams;
  const ctx = await getViewContext(); // primeiro: marca como "por requisição"
  const month = parseMonth(sp.mes, todayISO());
  const tab = sp.aba === "transferencias" ? "transferencias" : "lancamentos";
  const filters: TransactionFilters = {
    month,
    q: typeof sp.q === "string" ? sp.q.trim().slice(0, 100) || undefined : undefined,
    type: pick(sp.tipo, ["income", "expense"] as const),
    status: pick(sp.situacao, ["paid", "pending"] as const),
    fixed: pick(sp.fixa, ["fixed", "variable"] as const),
    accountId: typeof sp.conta === "string" && UUID.test(sp.conta) ? sp.conta : undefined,
    categoryId: typeof sp.categoria === "string" && UUID.test(sp.categoria) ? sp.categoria : undefined,
    sort: pick(sp.ordem, ["date_desc", "date_asc", "amount_desc", "amount_asc"] as const),
    page: Math.min(1000, Math.max(1, Number(sp.pagina) || 1)),
  };

  const [summary, accounts, categories] = await Promise.all([
    getMonthSummary(ctx, month),
    getAccounts(ctx, { includeArchived: true }),
    getCategories(),
  ]);
  const members = ctx.household?.members ?? [];

  const keep: Record<string, string> = Object.fromEntries(
    Object.entries({
      aba: tab === "transferencias" ? "transferencias" : "",
      q: filters.q ?? "",
      tipo: filters.type ?? "",
      situacao: filters.status ?? "",
      fixa: filters.fixed ?? "",
      conta: filters.accountId ?? "",
      categoria: filters.categoryId ?? "",
      ordem: filters.sort ?? "",
    }).filter(([, v]) => v),
  );
  const tabHref = (t: string) => `/transacoes?${new URLSearchParams({ mes: month, ...(t === "transferencias" ? { aba: t } : {}) })}`;

  const newButton = (
    <EntryDialog>
      <Button>
        <Plus data-icon="inline-start" />
        Novo lançamento
      </Button>
    </EntryDialog>
  );

  return (
    <>
      <PageHeader
        title="Transações"
        description="Receitas, despesas e transferências."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/transacoes/categorias">
                <Tags data-icon="inline-start" />
                Categorias
              </Link>
            </Button>
            {newButton}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} basePath="/transacoes" params={keep} />
        <nav aria-label="Tipo de lista" className="inline-flex rounded-lg border bg-surface-1 p-0.5 text-sm">
          {(["lancamentos", "transferencias"] as const).map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              aria-current={tab === t ? "page" : undefined}
              className={cn("rounded-md px-3 py-1", tab === t ? "bg-surface-3 font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {t === "lancamentos" ? "Lançamentos" : "Transferências"}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Receitas" cents={summary.incomeCents} icon={ArrowUpRight} tone="positive" />
        <StatCard label="Despesas" cents={summary.expenseCents} icon={ArrowDownRight} tone="negative" />
        <StatCard label="Resultado" cents={summary.resultCents} icon={Scale} tone={summary.resultCents < 0 ? "negative" : "positive"} />
      </div>

      {tab === "transferencias" ? (
        <TransfersTab month={month} newButton={newButton} accountIds={accounts.map((a) => a.id)} />
      ) : (
        <>
          {/* Filtros por GET: funcionam sem JavaScript e ficam no endereço (dá para favoritar). */}
          <form method="get" action="/transacoes" className="mb-4 grid gap-2 rounded-xl border bg-surface-1/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="mes" value={month} />
            <div className="relative sm:col-span-2 lg:col-span-4">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={filters.q} placeholder="Buscar pela descrição" aria-label="Buscar pela descrição" className="pl-8" />
            </div>
            <NativeSelect name="tipo" defaultValue={filters.type ?? ""} aria-label="Tipo" className="w-full">
              <NativeSelectOption value="">Receitas e despesas</NativeSelectOption>
              <NativeSelectOption value="income">Só receitas</NativeSelectOption>
              <NativeSelectOption value="expense">Só despesas</NativeSelectOption>
            </NativeSelect>
            <NativeSelect name="situacao" defaultValue={filters.status ?? ""} aria-label="Situação" className="w-full">
              <NativeSelectOption value="">Pagas e pendentes</NativeSelectOption>
              <NativeSelectOption value="paid">Pagas/recebidas</NativeSelectOption>
              <NativeSelectOption value="pending">Pendentes / futuras</NativeSelectOption>
            </NativeSelect>
            <NativeSelect name="conta" defaultValue={filters.accountId ?? ""} aria-label="Conta" className="w-full">
              <NativeSelectOption value="">Todas as contas</NativeSelectOption>
              {accounts.map((a) => (
                <NativeSelectOption key={a.id} value={a.id}>
                  {a.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect name="categoria" defaultValue={filters.categoryId ?? ""} aria-label="Categoria" className="w-full">
              <NativeSelectOption value="">Todas as categorias</NativeSelectOption>
              {categories.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.parentId ? `↳ ${c.name}` : c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect name="fixa" defaultValue={filters.fixed ?? ""} aria-label="Fixas ou variáveis" className="w-full">
              <NativeSelectOption value="">Fixas e variáveis</NativeSelectOption>
              <NativeSelectOption value="fixed">Só fixas</NativeSelectOption>
              <NativeSelectOption value="variable">Só variáveis</NativeSelectOption>
            </NativeSelect>
            <NativeSelect name="ordem" defaultValue={filters.sort ?? "date_desc"} aria-label="Ordenação" className="w-full">
              <NativeSelectOption value="date_desc">Mais recentes</NativeSelectOption>
              <NativeSelectOption value="date_asc">Mais antigas</NativeSelectOption>
              <NativeSelectOption value="amount_desc">Maior valor</NativeSelectOption>
              <NativeSelectOption value="amount_asc">Menor valor</NativeSelectOption>
            </NativeSelect>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-2 lg:justify-end">
              <Button type="submit" className="flex-1 lg:flex-none">
                Filtrar
              </Button>
              <Button asChild variant="ghost">
                <Link href={`/transacoes?mes=${month}`}>Limpar</Link>
              </Button>
            </div>
          </form>
          <TransactionsTab ctx={ctx} filters={filters} members={members} keep={keep} newButton={newButton} />
        </>
      )}
    </>
  );
}

async function TransactionsTab({
  ctx,
  filters,
  members,
  keep,
  newButton,
}: {
  ctx: Awaited<ReturnType<typeof getViewContext>>;
  filters: TransactionFilters;
  members: { userId: string; displayName: string; avatarColor: string }[];
  keep: Record<string, string>;
  newButton: React.ReactNode;
}) {
  const { rows, total } = await getTransactions(ctx, filters);
  const page = filters.page ?? 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (!rows.length) {
    const filtered = Object.keys(keep).length > 0;
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title={filtered ? "Nada encontrado com esses filtros" : "Nenhum lançamento neste mês"}
        description={filtered ? "Tente outros filtros ou limpe a busca." : "Registre receitas e despesas para acompanhar seu mês."}
        action={filtered ? undefined : newButton}
      />
    );
  }
  const pageHref = (p: number) => `/transacoes?${new URLSearchParams({ ...keep, mes: filters.month, pagina: String(p) })}`;
  return (
    <>
      <p className="mb-2 text-xs text-muted-foreground">
        {total} lançamento{total === 1 ? "" : "s"}
      </p>
      <TransactionList rows={rows} members={members} />
      {pages > 1 && (
        <nav aria-label="Paginação" className="mt-4 flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page - 1)}>Anterior</Link>
            </Button>
          )}
          <span className="text-muted-foreground">
            Página {page} de {pages}
          </span>
          {page < pages && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page + 1)}>Próxima</Link>
            </Button>
          )}
        </nav>
      )}
    </>
  );
}

async function TransfersTab({ month, newButton, accountIds }: { month: string; newButton: React.ReactNode; accountIds: string[] }) {
  // Mostra só transferências que tocam contas da visão atual.
  const inView = new Set(accountIds);
  const transfers = (await getTransfers(month)).filter((t) => inView.has(t.fromAccountId) || inView.has(t.toAccountId));
  if (!transfers.length) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title="Nenhuma transferência neste mês"
        description="Transferências movem dinheiro entre suas contas sem contar como receita ou despesa."
        action={newButton}
      />
    );
  }
  return <TransferList rows={transfers} />;
}
