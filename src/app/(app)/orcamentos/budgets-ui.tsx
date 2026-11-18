"use client";

import { useState, useTransition } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, Segmented, SubmitButton } from "@/components/finance/form-bits";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Budget } from "@/lib/finance/planning";
import type { Category } from "@/lib/finance/types";
import { centsToInput, parseBRL } from "@/lib/money";
import { copyPreviousBudgets, deleteBudget, saveBudget } from "../planning-actions";

export function BudgetDialog({
  budget,
  month,
  categories,
  hasHousehold,
  defaultScope,
}: {
  budget?: Budget;
  month: string;
  categories: Category[];
  hasHousehold: boolean;
  defaultScope: "personal" | "shared";
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [f, setF] = useState({
    scope: budget?.scope ?? (hasHousehold ? defaultScope : "personal"),
    categoryId: budget?.categoryId ?? "",
    planned: budget ? centsToInput(budget.plannedCents) : "",
  });
  const cats = categories.filter((c) => c.kind === "expense" && (c.scope === null || c.scope === f.scope));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const plannedCents = parseBRL(f.planned);
    if (!f.categoryId) return setError("Escolha a categoria");
    if (plannedCents === null || plannedCents < 0) return setError("Valor inválido, ex.: 800,00");
    start(async () => {
      const r = await saveBudget({ id: budget?.id ?? null, scope: f.scope, categoryId: f.categoryId, month, plannedCents });
      if (!r.ok) return void toast.error(r.message);
      toast.success(budget ? "Orçamento atualizado" : "Orçamento criado");
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {budget ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar orçamento de ${budget.categoryName}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus data-icon="inline-start" /> Novo orçamento
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{budget ? `Orçamento de ${budget.categoryName}` : "Novo orçamento"}</DialogTitle>
          <DialogDescription>Limite de gastos da categoria neste mês (subcategorias somam junto).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {hasHousehold && !budget && (
            <Segmented
              label="Titularidade"
              value={f.scope}
              onChange={(scope) => setF({ ...f, scope, categoryId: "" })}
              options={[
                { value: "personal", label: "Pessoal" },
                { value: "shared", label: "Compartilhado" },
              ]}
            />
          )}
          {!budget && (
            <Field id="b-cat" label="Categoria">
              <NativeSelect id="b-cat" className="w-full" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
                <NativeSelectOption value="">Escolha…</NativeSelectOption>
                {cats.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.parentId ? `↳ ${c.name}` : c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field id="b-planned" label="Limite do mês (R$)" error={error}>
            <Input id="b-planned" value={f.planned} onChange={(e) => setF({ ...f, planned: e.target.value })} inputMode="decimal" placeholder="0,00" />
          </Field>
          <SubmitButton pending={pending}>Salvar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteBudgetButton({ budget }: { budget: Budget }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Excluir orçamento de ${budget.categoryName}`}>
          <Trash2 />
        </Button>
      }
      title={`Excluir o orçamento de ${budget.categoryName}?`}
      description="Só o limite deste mês é removido. Os lançamentos continuam."
      confirmLabel="Excluir"
      destructive
      onConfirm={async () => {
        const r = await deleteBudget(budget.id);
        if (!r.ok) return void toast.error(r.message);
        toast.success("Orçamento excluído");
      }}
    />
  );
}

export function CopyPreviousButton({ month }: { month: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await copyPreviousBudgets(month);
          if (!r.ok) return void toast.error(r.message);
          toast.success(`${r.copied} orçamento(s) copiado(s) do mês anterior`);
        })
      }
    >
      <Copy data-icon="inline-start" /> Copiar do mês anterior
    </Button>
  );
}
