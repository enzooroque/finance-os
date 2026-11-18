"use client";

import { useState, useTransition } from "react";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ColorSwatches, Field, Segmented, SubmitButton } from "@/components/finance/form-bits";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { todayISO } from "@/lib/dates";
import type { Goal } from "@/lib/finance/planning";
import { centsToInput, formatBRL, parseBRL } from "@/lib/money";
import { addGoalMovement, deleteGoal, saveGoal } from "../planning-actions";

export function GoalDialog({ goal, hasHousehold, defaultScope }: { goal?: Goal; hasHousehold: boolean; defaultScope: "personal" | "shared" }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [e, setE] = useState<Record<string, string | undefined>>({});
  const [f, setF] = useState({
    scope: goal?.scope ?? (hasHousehold ? defaultScope : "personal"),
    name: goal?.name ?? "",
    target: goal ? centsToInput(goal.targetCents) : "",
    deadline: goal?.deadline ?? "",
    color: goal?.color ?? "#10b981",
  });

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const targetCents = parseBRL(f.target);
    if (!targetCents || targetCents <= 0) return setE({ target: "Informe o valor da meta, ex.: 10.000,00" });
    start(async () => {
      const r = await saveGoal({ id: goal?.id ?? null, scope: f.scope, name: f.name, targetCents, deadline: f.deadline || null, color: f.color });
      if (!r.ok) {
        setE(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        return void toast.error(r.message);
      }
      toast.success(goal ? "Meta atualizada" : "Meta criada");
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {goal ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${goal.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus data-icon="inline-start" /> Nova meta
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{goal ? "Editar meta" : "Nova meta"}</DialogTitle>
          <DialogDescription>Ex.: reserva de emergência, viagem, troca de carro.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {hasHousehold && (
            <Segmented
              label="Titularidade"
              value={f.scope}
              disabled={!!goal}
              onChange={(scope) => setF({ ...f, scope })}
              options={[
                { value: "personal", label: "Individual" },
                { value: "shared", label: "Do casal" },
              ]}
            />
          )}
          <Field id="g-name" label="Nome" error={e.name}>
            <Input id="g-name" value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} maxLength={60} placeholder="Ex.: Viagem" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="g-target" label="Valor da meta (R$)" error={e.target ?? e.targetCents}>
              <Input id="g-target" value={f.target} onChange={(ev) => setF({ ...f, target: ev.target.value })} inputMode="decimal" placeholder="0,00" />
            </Field>
            <Field id="g-deadline" label="Prazo (opcional)" error={e.deadline}>
              <Input id="g-deadline" type="date" value={f.deadline} onChange={(ev) => setF({ ...f, deadline: ev.target.value })} />
            </Field>
          </div>
          <ColorSwatches value={f.color} onChange={(color) => setF({ ...f, color })} />
          <SubmitButton pending={pending}>Salvar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MovementDialog({ goal, kind }: { goal: Goal; kind: "deposit" | "withdrawal" }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();
  const [f, setF] = useState({ amount: "", date: todayISO(), notes: "" });
  const deposit = kind === "deposit";

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const cents = parseBRL(f.amount);
    if (!cents || cents <= 0) return setError("Informe um valor maior que zero");
    if (!deposit && cents > goal.savedCents) return setError(`No máximo ${formatBRL(goal.savedCents)}`);
    start(async () => {
      const r = await addGoalMovement({ goalId: goal.id, kind, amountCents: cents, occurredOn: f.date, notes: f.notes, idempotencyKey: key });
      if (!r.ok) return void toast.error(r.message);
      toast.success(deposit ? "Aporte registrado" : "Retirada registrada");
      setOpen(false);
      setKey(crypto.randomUUID());
      setF({ amount: "", date: todayISO(), notes: "" });
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={deposit ? "default" : "outline"} size="sm" disabled={!deposit && goal.savedCents <= 0}>
          {deposit ? <Plus data-icon="inline-start" /> : <Minus data-icon="inline-start" />}
          {deposit ? "Aportar" : "Retirar"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {deposit ? "Aportar em" : "Retirar de"} {goal.name}
          </DialogTitle>
          <DialogDescription>Dinheiro reservado: não conta como despesa nem muda o saldo das contas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field id="m-amount" label="Valor (R$)" error={error}>
              <Input id="m-amount" value={f.amount} onChange={(ev) => setF({ ...f, amount: ev.target.value })} inputMode="decimal" placeholder="0,00" />
            </Field>
            <Field id="m-date" label="Data">
              <Input id="m-date" type="date" value={f.date} onChange={(ev) => setF({ ...f, date: ev.target.value })} />
            </Field>
          </div>
          <Field id="m-notes" label="Observação">
            <Input id="m-notes" value={f.notes} onChange={(ev) => setF({ ...f, notes: ev.target.value })} maxLength={280} placeholder="Opcional" />
          </Field>
          <SubmitButton pending={pending}>Confirmar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteGoalButton({ goal }: { goal: Goal }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${goal.name}`}>
          <Trash2 />
        </Button>
      }
      title={`Excluir a meta "${goal.name}"?`}
      description="Os aportes e retiradas desta meta também são removidos. Os saldos das contas não mudam."
      confirmLabel="Excluir"
      destructive
      onConfirm={async () => {
        const r = await deleteGoal(goal.id);
        if (!r.ok) return void toast.error(r.message);
        toast.success("Meta excluída");
      }}
    />
  );
}
