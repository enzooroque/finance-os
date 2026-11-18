"use client";

import { Suspense, use, useState, useTransition } from "react";
import { ArrowRight, CheckCircle2, Circle, History, Pencil, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  deleteTransaction,
  deleteTransfer,
  loadHistory,
  setTransactionStatus,
} from "@/app/(app)/transacoes/actions";
import { formatDate } from "@/lib/dates";
import type { HistoryEntry } from "@/lib/finance/queries";
import { scopeLabel, type Member, type TransactionRow, type TransferRow } from "@/lib/finance/types";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Amount } from "./bits";
import { EntryDialog } from "./entry-dialog";

const FIELD_LABEL: Record<string, string> = {
  amount_cents: "valor",
  description: "descrição",
  category_id: "categoria",
  occurred_on: "data",
  account_id: "conta",
  status: "situação",
  paid_on: "data de pagamento",
  responsible_user_id: "responsável",
  is_fixed: "fixa/variável",
  notes: "observações",
  owner_user_id: "titularidade",
  household_id: "titularidade",
  type: "tipo",
  from_account_id: "conta de origem",
  to_account_id: "conta de destino",
};

const ACTION_LABEL = { INSERT: "Criado", UPDATE: "Alterado", DELETE: "Excluído" } as const;

function HistoryList({ promise }: { promise: Promise<HistoryEntry[]> }) {
  const entries = use(promise);
  if (!entries.length) return <p className="text-sm text-muted-foreground">Sem registros.</p>;
  return (
    <ol className="grid gap-2 text-sm">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-col">
          <span>
            <span className="font-medium">{ACTION_LABEL[e.action]}</span> por {e.actorName}
            {e.changed.length > 0 && (
              <span className="text-muted-foreground">
                {" "}· {[...new Set(e.changed.map((c) => FIELD_LABEL[c] ?? c))].join(", ")}
              </span>
            )}
          </span>
          <time className="text-xs text-muted-foreground" dateTime={e.at}>
            {new Date(e.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
          </time>
        </li>
      ))}
    </ol>
  );
}

function HistorySection({ promise }: { promise: Promise<HistoryEntry[]> | null }) {
  if (!promise) return null;
  return (
    <section className="grid gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <History className="size-4" /> Histórico de alterações
      </h3>
      <Suspense fallback={<Skeleton className="h-12 w-full" />}>
        <HistoryList promise={promise} />
      </Suspense>
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

function TransactionItem({ row, members }: { row: TransactionRow; members: Member[] }) {
  const [history, setHistory] = useState<Promise<HistoryEntry[]> | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.displayName ?? "Membro";
  const source = row.accountName ?? row.creditCardName ?? "Conta de outra pessoa";

  const toggleStatus = () =>
    startTransition(async () => {
      const next = row.status === "paid" ? "pending" : "paid";
      const result = await setTransactionStatus(row.id, next);
      if (!result.ok) return void toast.error(result.message);
      toast.success(next === "paid" ? "Marcado como pago" : "Marcado como pendente");
      setOpen(false);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setHistory(loadHistory("transactions", row.id));
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.categoryColor ?? "#64748b" }} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 truncate text-sm font-medium">
              {row.description}
              {row.installment && <span className="shrink-0 text-xs font-normal text-muted-foreground">({row.installment})</span>}
              {row.isFixed && <Repeat className="size-3 shrink-0 text-muted-foreground" aria-label="Fixa" />}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {formatDate(row.occurredOn)} · {row.categoryName ?? "Sem categoria"} · {source}
            </span>
          </span>
          <span className="flex flex-col items-end gap-0.5">
            <Amount cents={row.amountCents} kind={row.type} className="text-sm" />
            {row.status === "pending" && !row.creditCardName && (
              <Badge variant="outline" className="text-[10px] text-warning">
                Pendente
              </Badge>
            )}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">{row.description}</DialogTitle>
          <DialogDescription>
            <Amount cents={row.amountCents} kind={row.type} className="text-xl" />
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2">
          <Detail label="Data">{formatDate(row.occurredOn)}</Detail>
          <Detail label={row.creditCardName ? "Cartão" : "Conta"}>{source}</Detail>
          <Detail label="Categoria">{row.categoryName ?? "Sem categoria"}</Detail>
          <Detail label="Situação">
            {row.status === "paid" ? (row.type === "income" ? "Recebido" : "Pago") : "Pendente"}
            {row.paidOn && row.paidOn !== row.occurredOn ? ` em ${formatDate(row.paidOn)}` : ""}
          </Detail>
          <Detail label="Titularidade">{scopeLabel[row.scope]}</Detail>
          {row.responsibleName && <Detail label="Responsável">{row.responsibleName}</Detail>}
          <Detail label="Registrado por">{row.createdByName}</Detail>
          <Detail label="Tipo">{row.isFixed ? "Fixa" : "Variável"}</Detail>
          {row.splits.length > 0 &&
            row.splits.map((s) => (
              <Detail key={s.userId} label={`Parte de ${nameOf(s.userId)}`}>
                <span className="tabular">{formatBRL(s.amountCents)}</span>
              </Detail>
            ))}
        </dl>
        {row.notes && <p className="rounded-lg bg-surface-1 p-3 text-sm whitespace-pre-wrap">{row.notes}</p>}

        {row.editable ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={toggleStatus} disabled={pending}>
              {row.status === "paid" ? <Circle data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}
              {row.status === "paid" ? "Marcar pendente" : row.type === "income" ? "Marcar recebido" : "Marcar pago"}
            </Button>
            <EntryDialog initial={{ kind: "transaction", row }}>
              <Button variant="outline">
                <Pencil data-icon="inline-start" />
                Editar
              </Button>
            </EntryDialog>
            <ConfirmDialog
              trigger={
                <Button variant="destructive">
                  <Trash2 data-icon="inline-start" />
                  Excluir
                </Button>
              }
              title="Excluir este lançamento?"
              description="O saldo é recalculado. A exclusão fica registrada no histórico."
              confirmLabel="Excluir"
              destructive
              onConfirm={async () => {
                const result = await deleteTransaction(row.id);
                if (!result.ok) return void toast.error(result.message);
                toast.success("Lançamento excluído");
                setOpen(false);
              }}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Compra no cartão{row.installment ? ` · parcela ${row.installment}` : ""}: edite ou exclua pela tela do cartão.
          </p>
        )}
        <Separator />
        <HistorySection promise={history} />
      </DialogContent>
    </Dialog>
  );
}

export function TransactionList({ rows, members }: { rows: TransactionRow[]; members: Member[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {rows.map((r) => (
        <li key={r.id}>
          <TransactionItem row={r} members={members} />
        </li>
      ))}
    </ul>
  );
}

function TransferItem({ row, perspectiveAccountId }: { row: TransferRow; perspectiveAccountId?: string }) {
  const [history, setHistory] = useState<Promise<HistoryEntry[]> | null>(null);
  const [open, setOpen] = useState(false);
  const from = row.fromName ?? "Conta de outra pessoa";
  const to = row.toName ?? "Conta de outra pessoa";
  const canManage = row.fromName !== null && row.toName !== null;
  const direction = perspectiveAccountId === row.toAccountId ? "income" : perspectiveAccountId === row.fromAccountId ? "expense" : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setHistory(loadHistory("transfers", row.id));
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-info" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 truncate text-sm font-medium">
              {from} <ArrowRight className="size-3 shrink-0" /> {to}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {formatDate(row.occurredOn)} · Transferência{row.description ? ` · ${row.description}` : ""}
            </span>
          </span>
          <Amount cents={row.amountCents} kind={direction} className={cn("text-sm", !direction && "text-info")} />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferência</DialogTitle>
          <DialogDescription>Não conta como receita nem despesa: só move dinheiro entre contas.</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2">
          <Detail label="Valor">
            <span className="tabular">{formatBRL(row.amountCents)}</span>
          </Detail>
          <Detail label="Data">{formatDate(row.occurredOn)}</Detail>
          <Detail label="De">{from}</Detail>
          <Detail label="Para">{to}</Detail>
          {row.description && <Detail label="Descrição">{row.description}</Detail>}
          <Detail label="Registrado por">{row.createdByName}</Detail>
        </dl>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <EntryDialog initial={{ kind: "transfer", row }}>
              <Button variant="outline">
                <Pencil data-icon="inline-start" />
                Editar
              </Button>
            </EntryDialog>
            <ConfirmDialog
              trigger={
                <Button variant="destructive">
                  <Trash2 data-icon="inline-start" />
                  Excluir
                </Button>
              }
              title="Excluir esta transferência?"
              description="Os saldos das duas contas são recalculados."
              confirmLabel="Excluir"
              destructive
              onConfirm={async () => {
                const result = await deleteTransfer(row.id);
                if (!result.ok) return void toast.error(result.message);
                toast.success("Transferência excluída");
                setOpen(false);
              }}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Só quem acessa as duas contas pode editar ou excluir.</p>
        )}
        <Separator />
        <HistorySection promise={history} />
      </DialogContent>
    </Dialog>
  );
}

export function TransferList({ rows, perspectiveAccountId }: { rows: TransferRow[]; perspectiveAccountId?: string }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {rows.map((r) => (
        <li key={r.id}>
          <TransferItem row={r} perspectiveAccountId={perspectiveAccountId} />
        </li>
      ))}
    </ul>
  );
}
