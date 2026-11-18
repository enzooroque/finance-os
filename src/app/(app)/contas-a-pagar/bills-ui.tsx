"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Pencil, Plus, SkipForward, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldError, Segmented, SubmitButton } from "@/components/finance/form-bits";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { todayISO } from "@/lib/dates";
import type { Rule } from "@/lib/finance/planning";
import { frequencyLabel, type Frequency } from "@/lib/finance/planning-math";
import type { Category, EntryOptions } from "@/lib/finance/types";
import { centsToInput, formatBRL, parseBRL } from "@/lib/money";
import { deleteRule, payOccurrence, saveRule, setOccurrenceAmount, skipOccurrence } from "../planning-actions";

type Opts = Pick<EntryOptions, "accounts" | "categories" | "householdId">;
const errs = (fe?: Record<string, string[] | undefined>) => Object.fromEntries(Object.entries(fe ?? {}).map(([k, v]) => [k, v?.[0]]));

export function RuleDialog({ rule, options, defaultScope }: { rule?: Rule; options: Opts; defaultScope: "personal" | "shared" }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [e, setE] = useState<Record<string, string | undefined>>({});
  const [f, setF] = useState({
    scope: rule?.scope ?? (options.householdId ? defaultScope : "personal"),
    type: rule?.type ?? "expense",
    description: rule?.description ?? "",
    amount: rule ? centsToInput(rule.amountCents) : "",
    categoryId: rule?.categoryId ?? "",
    accountId: rule?.accountId ?? "",
    frequency: rule?.frequency ?? ("monthly" as Frequency),
    intervalCount: String(rule?.intervalCount ?? 1),
    startOn: rule?.startOn ?? todayISO(),
    endOn: rule?.endOn ?? "",
  });
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: ev.target.value });
  const accounts = options.accounts.filter((a) => a.scope === f.scope);
  const cats = options.categories.filter((c: Category) => c.kind === f.type && (c.scope === null || c.scope === f.scope));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const amountCents = parseBRL(f.amount);
    if (!amountCents || amountCents <= 0) return setE({ amount: "Informe um valor, ex.: 150,00" });
    start(async () => {
      const r = await saveRule({
        id: rule?.id ?? null,
        scope: f.scope,
        type: f.type,
        description: f.description,
        amountCents,
        categoryId: f.categoryId || null,
        accountId: f.accountId || null,
        frequency: f.frequency,
        intervalCount: Number(f.intervalCount),
        startOn: f.startOn,
        endOn: f.endOn || null,
      });
      if (!r.ok) {
        setE(errs(r.fieldErrors));
        return void toast.error(r.message);
      }
      toast.success(rule ? "Série atualizada (vale para as próximas)" : "Conta recorrente criada");
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {rule ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar série ${rule.description}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus data-icon="inline-start" /> Nova conta fixa
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Editar série" : "Nova conta fixa"}</DialogTitle>
          <DialogDescription>Aluguel, luz, assinaturas, salário… Alterações valem para as próximas ocorrências.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Segmented
            label="Tipo"
            value={f.type}
            disabled={!!rule}
            onChange={(type) => setF({ ...f, type, categoryId: "" })}
            options={[
              { value: "expense", label: "A pagar" },
              { value: "income", label: "A receber" },
            ]}
          />
          {options.householdId && (
            <Segmented
              label="Titularidade"
              value={f.scope}
              disabled={!!rule}
              onChange={(scope) => setF({ ...f, scope, accountId: "", categoryId: "" })}
              options={[
                { value: "personal", label: "Pessoal" },
                { value: "shared", label: "Compartilhado" },
              ]}
            />
          )}
          <Field id="r-desc" label="Descrição" error={e.description}>
            <Input id="r-desc" value={f.description} onChange={set("description")} maxLength={140} placeholder="Ex.: Aluguel" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="r-amount" label="Valor (R$)" error={e.amount ?? e.amountCents}>
              <Input id="r-amount" value={f.amount} onChange={set("amount")} inputMode="decimal" placeholder="0,00" />
            </Field>
            <Field id="r-freq" label="Frequência">
              <NativeSelect id="r-freq" className="w-full" value={f.frequency} onChange={set("frequency")}>
                {(Object.keys(frequencyLabel) as Frequency[]).map((k) => (
                  <NativeSelectOption key={k} value={k}>
                    {frequencyLabel[k]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="r-start" label="Primeiro vencimento" error={e.startOn}>
              <Input id="r-start" type="date" value={f.startOn} onChange={set("startOn")} />
            </Field>
            <Field id="r-end" label="Término (opcional)" error={e.endOn}>
              <Input id="r-end" type="date" value={f.endOn} onChange={set("endOn")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="r-acc" label="Conta padrão">
              <NativeSelect id="r-acc" className="w-full" value={f.accountId} onChange={set("accountId")}>
                <NativeSelectOption value="">Escolher ao pagar</NativeSelectOption>
                {accounts.map((a) => (
                  <NativeSelectOption key={a.id} value={a.id}>
                    {a.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field id="r-cat" label="Categoria">
              <NativeSelect id="r-cat" className="w-full" value={f.categoryId} onChange={set("categoryId")}>
                <NativeSelectOption value="">Sem categoria</NativeSelectOption>
                {cats.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <SubmitButton pending={pending}>Salvar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRuleButton({ rule }: { rule: Rule }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Excluir série ${rule.description}`}>
          <Trash2 />
        </Button>
      }
      title={`Excluir "${rule.description}"?`}
      description="As próximas ocorrências somem. O que já foi pago continua nas transações."
      confirmLabel="Excluir série"
      destructive
      onConfirm={async () => {
        const r = await deleteRule(rule.id);
        if (!r.ok) return void toast.error(r.message);
        toast.success("Série excluída");
      }}
    />
  );
}

/** Ações de uma ocorrência: pagar, pular/desfazer e mudar só este valor. */
export function OccurrenceActions({
  rule,
  dueOn,
  amountCents,
  status,
  accounts,
}: {
  rule: Rule;
  dueOn: string;
  amountCents: number;
  status: "pending" | "paid" | "skipped";
  accounts: EntryOptions["accounts"];
}) {
  const [pending, start] = useTransition();
  if (status === "paid") return <span className="flex items-center gap-1 text-xs text-positive"><CheckCircle2 className="size-3.5" /> {rule.type === "income" ? "Recebido" : "Pago"}</span>;
  if (status === "skipped") {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await skipOccurrence(rule.id, dueOn, true);
            if (!r.ok) return void toast.error(r.message);
          })
        }
      >
        <Undo2 data-icon="inline-start" /> Desfazer pulo
      </Button>
    );
  }
  return (
    <div className="flex gap-1">
      <PayOccurrenceDialog rule={rule} dueOn={dueOn} amountCents={amountCents} accounts={accounts} />
      <AmountDialog rule={rule} dueOn={dueOn} amountCents={amountCents} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Pular este mês"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await skipOccurrence(rule.id, dueOn);
            if (!r.ok) return void toast.error(r.message);
            toast.success("Ocorrência pulada");
          })
        }
      >
        <SkipForward />
      </Button>
    </div>
  );
}

function PayOccurrenceDialog({ rule, dueOn, amountCents, accounts }: { rule: Rule; dueOn: string; amountCents: number; accounts: EntryOptions["accounts"] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const usable = accounts.filter((a) => a.scope === rule.scope);
  const [f, setF] = useState({ accountId: rule.accountId ?? "", amount: centsToInput(amountCents), paidOn: todayISO() });

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const cents = parseBRL(f.amount);
    if (!f.accountId) return setError("Escolha a conta");
    if (!cents || cents <= 0) return setError("Valor inválido");
    start(async () => {
      const r = await payOccurrence({ ruleId: rule.id, dueOn, accountId: f.accountId, amountCents: cents, paidOn: f.paidOn });
      if (!r.ok) return void toast.error(r.message);
      toast.success(rule.type === "income" ? "Recebimento registrado" : "Pagamento registrado");
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{rule.type === "income" ? "Receber" : "Pagar"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rule.description}</DialogTitle>
          <DialogDescription>Cria o lançamento na conta escolhida.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="po-acc" label="Conta">
            <NativeSelect id="po-acc" className="w-full" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
              <NativeSelectOption value="">Escolha…</NativeSelectOption>
              {usable.map((a) => (
                <NativeSelectOption key={a.id} value={a.id}>
                  {a.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="po-amount" label="Valor (R$)">
              <Input id="po-amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" />
            </Field>
            <Field id="po-date" label="Data do pagamento">
              <Input id="po-date" type="date" value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} />
            </Field>
          </div>
          <FieldError id="po-err" message={error} />
          <SubmitButton pending={pending}>Confirmar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AmountDialog({ rule, dueOn, amountCents }: { rule: Rule; dueOn: string; amountCents: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(centsToInput(amountCents));
  const [error, setError] = useState<string>();
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const cents = parseBRL(amount);
    if (!cents || cents <= 0) return setError("Valor inválido");
    start(async () => {
      const r = await setOccurrenceAmount(rule.id, dueOn, cents);
      if (!r.ok) return void toast.error(r.message);
      toast.success(`Valor deste mês: ${formatBRL(cents)}`);
      setOpen(false);
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Mudar só este valor">
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Valor só desta ocorrência</DialogTitle>
          <DialogDescription>A série continua com {formatBRL(rule.amountCents)}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="oa-amount" label="Valor (R$)" error={error}>
            <Input id="oa-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <SubmitButton pending={pending}>Salvar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
