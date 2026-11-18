"use client";

import { Suspense, use, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { useFinanceView } from "@/components/layout/use-finance-view";
import { loadEntryOptions, saveTransaction, saveTransfer } from "@/app/(app)/transacoes/actions";
import { todayISO } from "@/lib/dates";
import type { Category, EntryOptions, TransactionRow, TransferRow } from "@/lib/finance/types";
import { centsToInput, formatBRL, parseBRL } from "@/lib/money";
import { computeSplits, entryForm, toTransactionInput, toTransferInput, type EntryForm } from "@/lib/validation/finance";
import { FieldError, Segmented } from "./form-bits";

export type EntryInitial =
  | { kind: "transaction"; row: TransactionRow }
  | { kind: "transfer"; row: TransferRow };

/** Modal de lançamento (despesa, receita ou transferência), para criar ou editar. `children` é o botão que abre. */
export function EntryDialog({
  initial,
  defaultKind,
  children,
}: {
  initial?: EntryInitial;
  /** Atalhos "Gasto"/"Receita" já abrem no tipo certo. */
  defaultKind?: "expense" | "income";
  children: React.ReactNode;
}) {
  const [open, setOpenState] = useState(false);
  const [optionsPromise, setOptionsPromise] = useState<Promise<EntryOptions> | null>(null);

  const setOpen = (next: boolean) => {
    // As opções (contas, categorias) são buscadas no servidor a cada abertura: sempre atuais.
    if (next) setOptionsPromise(loadEntryOptions());
    setOpenState(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>Valores em reais. Despesa ou receita mexe no saldo quando está paga.</DialogDescription>
        </DialogHeader>
        {open && optionsPromise && (
          <Suspense fallback={<FormSkeleton />}>
            <EntryFormLoader optionsPromise={optionsPromise} initial={initial} defaultKind={defaultKind} onDone={() => setOpen(false)} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormSkeleton() {
  return (
    <div className="grid gap-4" aria-label="Carregando">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function EntryFormLoader(props: { optionsPromise: Promise<EntryOptions>; initial?: EntryInitial; defaultKind?: "expense" | "income"; onDone: () => void }) {
  const options = use(props.optionsPromise);
  if (options.accounts.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Cadastre uma conta primeiro"
        description="Todo lançamento sai de (ou entra em) uma conta."
        className="py-8"
        action={
          <DialogClose asChild>
            <Button asChild>
              <Link href="/contas">Ir para Contas</Link>
            </Button>
          </DialogClose>
        }
      />
    );
  }
  return <EntryFormBody {...props} options={options} />;
}

function defaults(initial: EntryInitial | undefined, options: EntryOptions, preferShared: boolean, defaultKind: "expense" | "income" = "expense"): EntryForm {
  const scope = preferShared && options.householdId ? "shared" : "personal";
  const inScope = options.accounts.filter((a) => a.scope === scope);
  const base: EntryForm = {
    kind: defaultKind,
    scope,
    amount: "",
    description: "",
    categoryId: "",
    occurredOn: todayISO(),
    // Uma conta só nessa titularidade: já vem escolhida (menos toques).
    accountId: inScope.length === 1 ? inScope[0].id : "",
    toAccountId: "",
    status: "paid",
    responsibleUserId: options.userId,
    isFixed: false,
    notes: "",
    splitMode: "none",
    splitShare: "",
  };
  if (initial?.kind === "transfer") {
    const r = initial.row;
    return { ...base, kind: "transfer", amount: centsToInput(r.amountCents), description: r.description ?? "", occurredOn: r.occurredOn, accountId: r.fromAccountId, toAccountId: r.toAccountId };
  }
  if (initial?.kind === "transaction") {
    const r = initial.row;
    const first = options.members[0]?.userId;
    const firstSplit = r.splits.find((s) => s.userId === first);
    return {
      ...base,
      kind: r.type,
      scope: r.scope,
      amount: centsToInput(r.amountCents),
      description: r.description,
      categoryId: r.categoryId ?? "",
      occurredOn: r.occurredOn,
      accountId: r.accountId ?? "",
      status: r.status,
      responsibleUserId: r.responsibleUserId ?? options.userId,
      isFixed: r.isFixed,
      notes: r.notes ?? "",
      splitMode: firstSplit ? "amount" : "none",
      splitShare: firstSplit ? centsToInput(firstSplit.amountCents) : "",
    };
  }
  return base;
}

function categoryOptions(categories: Category[], kind: "income" | "expense", scope: "personal" | "shared") {
  // Vale: categoria do sistema, ou da mesma titularidade do lançamento.
  const usable = categories.filter((c) => c.kind === kind && (c.scope === null || c.scope === scope));
  const parents = usable.filter((c) => !c.parentId);
  return parents.map((p) => ({ parent: p, children: usable.filter((c) => c.parentId === p.id) }));
}

function EntryFormBody({
  options,
  initial,
  defaultKind,
  onDone,
}: {
  options: EntryOptions;
  initial?: EntryInitial;
  defaultKind?: "expense" | "income";
  onDone: () => void;
}) {
  const view = useFinanceView();
  const [pending, startTransition] = useTransition();
  // Uma chave por formulário aberto: reenviar (duplo clique, rede instável) não duplica.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const hasHousehold = !!options.householdId;
  const isEdit = !!initial;

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<EntryForm>({
    resolver: zodResolver(entryForm),
    defaultValues: defaults(initial, options, view === "compartilhado", defaultKind),
  });
  const [kind, scope, amount, splitMode, splitShare] = useWatch({
    control,
    name: ["kind", "scope", "amount", "splitMode", "splitShare"],
  });

  const isTransfer = kind === "transfer";
  const accounts = isTransfer ? options.accounts : options.accounts.filter((a) => a.scope === scope);
  const cats = useMemo(
    () => (isTransfer ? [] : categoryOptions(options.categories, kind === "income" ? "income" : "expense", scope)),
    [options.categories, kind, scope, isTransfer],
  );
  const canSplit = !isTransfer && kind === "expense" && scope === "shared" && options.members.length === 2;

  const splitPreview = (() => {
    if (!canSplit || splitMode === "none") return null;
    const total = parseBRL(amount);
    if (!total || total <= 0) return null;
    try {
      return computeSplits(total, splitMode, splitShare, options.members);
    } catch {
      return null;
    }
  })();

  const onSubmit = (form: EntryForm) => {
    if (!form.accountId) return setError("accountId", { message: "Escolha a conta" });
    if (isTransfer && !form.toAccountId) return setError("toAccountId", { message: "Escolha a conta de destino" });
    if (!isTransfer && !form.description.trim()) return setError("description", { message: "Informe a descrição" });

    let payload;
    try {
      payload = isTransfer
        ? toTransferInput(form, { id: initial?.row.id ?? null, idempotencyKey })
        : toTransactionInput(
            { ...form, splitMode: canSplit ? form.splitMode : "none", responsibleUserId: form.scope === "shared" ? form.responsibleUserId : options.userId },
            { id: initial?.row.id ?? null, idempotencyKey, members: options.members },
          );
    } catch (e) {
      return setError("splitShare", { message: e instanceof Error ? e.message : "Divisão inválida" });
    }

    startTransition(async () => {
      const result = isTransfer ? await saveTransfer(payload) : await saveTransaction(payload);
      if (!result.ok) {
        const fe = result.fieldErrors ?? {};
        if (fe.toAccountId) setError("toAccountId", { message: fe.toAccountId[0] });
        if (fe.amountCents) setError("amount", { message: fe.amountCents[0] });
        toast.error(result.message);
        return;
      }
      toast.success(isEdit ? "Lançamento atualizado" : isTransfer ? "Transferência registrada" : "Lançamento registrado");
      onDone();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit, (errs) => toast.error(`Confira: ${Object.keys(errs).join(", ")}`))} className="grid gap-4" noValidate>
      <Controller
        control={control}
        name="kind"
        render={({ field }) => (
          <Segmented
            label="Tipo de lançamento"
            value={field.value}
            disabled={isEdit}
            onChange={(v) => {
              field.onChange(v);
              setValue("categoryId", "");
            }}
            options={[
              { value: "expense", label: "Despesa" },
              { value: "income", label: "Receita" },
              { value: "transfer", label: "Transferência" },
            ]}
          />
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="e-amount">Valor (R$)</Label>
          <Input id="e-amount" autoFocus={!initial} inputMode="decimal" placeholder="0,00" autoComplete="off" aria-invalid={!!errors.amount} aria-describedby="e-amount-err" {...register("amount")} />
          <FieldError id="e-amount-err" message={errors.amount?.message} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="e-date">Data</Label>
          <Input id="e-date" type="date" aria-invalid={!!errors.occurredOn} {...register("occurredOn")} />
          <FieldError id="e-date-err" message={errors.occurredOn?.message} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="e-desc">Descrição{isTransfer && " (opcional)"}</Label>
        <Input id="e-desc" maxLength={140} placeholder={isTransfer ? "Ex.: Reserva do mês" : "Ex.: Mercado"} aria-invalid={!!errors.description} aria-describedby="e-desc-err" {...register("description")} />
        <FieldError id="e-desc-err" message={errors.description?.message} />
      </div>

      {isTransfer ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <AccountSelect id="e-from" label="De" register={register("accountId")} accounts={accounts} error={errors.accountId?.message} />
          <AccountSelect id="e-to" label="Para" register={register("toAccountId")} accounts={accounts} error={errors.toAccountId?.message} />
        </div>
      ) : (
        <>
          {hasHousehold && (
            <div className="grid gap-1.5">
              <Label>Titularidade</Label>
              <Controller
                control={control}
                name="scope"
                render={({ field }) => (
                  <Segmented
                    label="Titularidade"
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      setValue("accountId", "");
                      setValue("categoryId", "");
                    }}
                    options={[
                      { value: "personal", label: "Pessoal" },
                      { value: "shared", label: "Compartilhado" },
                    ]}
                  />
                )}
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <AccountSelect id="e-account" label="Conta" register={register("accountId")} accounts={accounts} error={errors.accountId?.message} />
            <div className="grid gap-1.5">
              <Label htmlFor="e-cat">Categoria</Label>
              <NativeSelect id="e-cat" className="w-full" {...register("categoryId")}>
                <NativeSelectOption value="">Sem categoria</NativeSelectOption>
                {cats.map(({ parent, children }) =>
                  children.length ? (
                    <NativeSelectOptGroup key={parent.id} label={parent.name}>
                      <NativeSelectOption value={parent.id}>{parent.name}</NativeSelectOption>
                      {children.map((c) => (
                        <NativeSelectOption key={c.id} value={c.id}>
                          {parent.name} › {c.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelectOptGroup>
                  ) : (
                    <NativeSelectOption key={parent.id} value={parent.id}>
                      {parent.name}
                    </NativeSelectOption>
                  ),
                )}
              </NativeSelect>
            </div>
          </div>
          {accounts.length === 0 && (
            <p className="text-xs text-warning">Nenhuma conta {scope === "shared" ? "compartilhada" : "pessoal"} ativa. Cadastre uma em Contas.</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Situação</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Segmented
                    label="Situação"
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: "paid", label: kind === "income" ? "Recebido" : "Pago" },
                      { value: "pending", label: "Pendente" },
                    ]}
                  />
                )}
              />
            </div>
            {scope === "shared" && options.members.length > 0 && (
              <div className="grid gap-1.5">
                <Label htmlFor="e-resp">Responsável</Label>
                <NativeSelect id="e-resp" className="w-full" {...register("responsibleUserId")}>
                  {options.members.map((m) => (
                    <NativeSelectOption key={m.userId} value={m.userId}>
                      {m.displayName}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>

          {canSplit && (
            <div className="grid gap-2 rounded-xl border bg-surface-1 p-3">
              <Label htmlFor="e-split">Divisão da despesa</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <NativeSelect id="e-split" className="w-full" {...register("splitMode")}>
                  <NativeSelectOption value="none">Não dividir</NativeSelectOption>
                  <NativeSelectOption value="equal">Meio a meio</NativeSelectOption>
                  <NativeSelectOption value="percent">Por percentual</NativeSelectOption>
                  <NativeSelectOption value="amount">Por valor</NativeSelectOption>
                </NativeSelect>
                {(splitMode === "percent" || splitMode === "amount") && (
                  <Input
                    inputMode="decimal"
                    aria-label={splitMode === "percent" ? `Percentual de ${options.members[0].displayName}` : `Valor de ${options.members[0].displayName}`}
                    placeholder={splitMode === "percent" ? `% de ${options.members[0].displayName}` : `R$ de ${options.members[0].displayName}`}
                    aria-invalid={!!errors.splitShare}
                    {...register("splitShare")}
                  />
                )}
              </div>
              <FieldError id="e-split-err" message={errors.splitShare?.message} />
              {splitPreview && (
                <ul className="grid gap-1 text-xs text-muted-foreground">
                  {splitPreview.map((s) => (
                    <li key={s.userId} className="flex justify-between">
                      <span>{options.members.find((m) => m.userId === s.userId)?.displayName}</span>
                      <span className="tabular text-foreground">{formatBRL(s.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Controller
            control={control}
            name="isFixed"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                {kind === "income" ? "Receita fixa (todo mês)" : "Despesa fixa (todo mês)"}
              </label>
            )}
          />

          <div className="grid gap-1.5">
            <Label htmlFor="e-notes">Observações</Label>
            <Textarea id="e-notes" rows={2} maxLength={1000} placeholder="Opcional" {...register("notes")} />
          </div>
        </>
      )}

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}

function AccountSelect({
  id,
  label,
  register,
  accounts,
  error,
}: {
  id: string;
  label: string;
  register: ReturnType<ReturnType<typeof useForm<EntryForm>>["register"]>;
  accounts: EntryOptions["accounts"];
  error?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} className="w-full" aria-invalid={!!error} aria-describedby={`${id}-err`} {...register}>
        <NativeSelectOption value="">Escolha…</NativeSelectOption>
        {accounts.map((a) => (
          <NativeSelectOption key={a.id} value={a.id}>
            {a.name}
            {a.scope === "shared" ? " (compartilhada)" : ""}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <FieldError id={`${id}-err`} message={error} />
    </div>
  );
}
