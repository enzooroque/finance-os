"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ColorSwatches, Field, FieldError, Segmented, SubmitButton } from "@/components/finance/form-bits";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Card } from "@/lib/finance/cards";
import { brandLabel, CARD_BRANDS } from "@/lib/finance/statement";
import { centsToInput, formatBRL, parseBRL, splitCents } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import type { Category, EntryOptions } from "@/lib/finance/types";
import { createPurchase, deleteCard, deletePayment, deletePurchase, payStatement, saveCard } from "./actions";

type Errors = Record<string, string | undefined>;

// ------------------------------------------------------------------ Cartão
export function CardDialog({ card, hasHousehold, defaultScope = "personal" }: { card?: Card; hasHousehold: boolean; defaultScope?: "personal" | "shared" }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Errors>({});
  const [f, setF] = useState({
    scope: card?.scope ?? (hasHousehold ? defaultScope : "personal"),
    name: card?.name ?? "",
    institution: card?.institution ?? "",
    brand: card?.brand ?? "visa",
    lastFour: card?.lastFour ?? "",
    limit: card ? centsToInput(card.limitCents) : "",
    closingDay: String(card?.closingDay ?? ""),
    dueDay: String(card?.dueDay ?? ""),
    color: card?.color ?? "#7c5cff",
    archived: card?.archived ?? false,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const limitCents = parseBRL(f.limit || "0");
    if (limitCents === null || limitCents < 0) return setErrors({ limit: "Valor inválido, ex.: 5.000,00" });
    start(async () => {
      const r = await saveCard({
        id: card?.id ?? null,
        scope: f.scope,
        name: f.name,
        institution: f.institution,
        brand: f.brand,
        lastFour: f.lastFour,
        limitCents,
        closingDay: Number(f.closingDay),
        dueDay: Number(f.dueDay),
        color: f.color,
        archived: f.archived,
      });
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        return void toast.error(r.message);
      }
      toast.success(card ? "Cartão atualizado" : "Cartão criado");
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {card ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${card.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus data-icon="inline-start" /> Novo cartão
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{card ? "Editar cartão" : "Novo cartão"}</DialogTitle>
          <DialogDescription>Nunca pedimos o número completo, CVV ou senha do cartão.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {hasHousehold && (
            <Segmented
              label="Titularidade"
              value={f.scope}
              disabled={!!card}
              onChange={(v) => setF({ ...f, scope: v })}
              options={[
                { value: "personal", label: "Pessoal" },
                { value: "shared", label: "Compartilhado" },
              ]}
            />
          )}
          <Field id="c-name" label="Nome" error={errors.name}>
            <Input id="c-name" value={f.name} onChange={set("name")} maxLength={60} placeholder="Ex.: Nubank Roxinho" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="c-brand" label="Bandeira">
              <NativeSelect id="c-brand" className="w-full" value={f.brand} onChange={set("brand")}>
                {CARD_BRANDS.map((b) => (
                  <NativeSelectOption key={b} value={b}>
                    {brandLabel[b]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field id="c-last" label="4 últimos dígitos" error={errors.lastFour}>
              <Input id="c-last" value={f.lastFour} onChange={set("lastFour")} inputMode="numeric" maxLength={4} placeholder="Opcional" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="c-inst" label="Instituição">
              <Input id="c-inst" value={f.institution} onChange={set("institution")} maxLength={60} placeholder="Opcional" />
            </Field>
            <Field id="c-limit" label="Limite (R$)" error={errors.limit ?? errors.limitCents}>
              <Input id="c-limit" value={f.limit} onChange={set("limit")} inputMode="decimal" placeholder="0,00" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="c-close" label="Dia do fechamento" error={errors.closingDay}>
              <Input id="c-close" value={f.closingDay} onChange={set("closingDay")} inputMode="numeric" maxLength={2} placeholder="Ex.: 5" />
            </Field>
            <Field id="c-due" label="Dia do vencimento" error={errors.dueDay}>
              <Input id="c-due" value={f.dueDay} onChange={set("dueDay")} inputMode="numeric" maxLength={2} placeholder="Ex.: 12" />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">Compras a partir do dia do fechamento entram na fatura seguinte.</p>
          <ColorSwatches value={f.color} onChange={(color) => setF({ ...f, color })} />
          {card && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={f.archived} onCheckedChange={(v) => setF({ ...f, archived: v === true })} />
              Arquivado (não aceita novas compras)
            </label>
          )}
          <SubmitButton pending={pending}>Salvar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCardButton({ card }: { card: Card }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${card.name}`}>
          <Trash2 />
        </Button>
      }
      title={`Excluir o cartão "${card.name}"?`}
      description="Só cartões sem compras podem ser excluídos. Com histórico, arquive em vez de excluir."
      confirmLabel="Excluir"
      destructive
      onConfirm={async () => {
        const r = await deleteCard(card.id);
        if (!r.ok) return void toast.error(r.message);
        toast.success("Cartão excluído");
        router.push("/cartoes");
      }}
    />
  );
}

// ------------------------------------------------------------------ Compra
function categoryOptions(categories: Category[], scope: "personal" | "shared") {
  return categories.filter((c) => c.kind === "expense" && (c.scope === null || c.scope === scope));
}

export function PurchaseDialog({ card, categories }: { card: Card; categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Errors>({});
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [f, setF] = useState({ description: "", total: "", installments: "1", date: todayISO(), categoryId: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const totalCents = parseBRL(f.total);
  const n = Number(f.installments);
  const parts = totalCents && totalCents > 0 && n >= 1 && n <= 72 ? splitCents(totalCents, n) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!totalCents || totalCents <= 0) return setErrors({ total: "Informe um valor, ex.: 1.200,00" });
    start(async () => {
      const r = await createPurchase({
        cardId: card.id,
        description: f.description,
        totalCents,
        installments: n,
        purchasedOn: f.date,
        categoryId: f.categoryId || null,
        idempotencyKey: key,
      });
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        return void toast.error(r.message);
      }
      toast.success(n > 1 ? `Compra registrada em ${n}x` : "Compra registrada");
      setOpen(false);
      setKey(crypto.randomUUID());
      setF({ description: "", total: "", installments: "1", date: todayISO(), categoryId: "" });
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={card.archived}>
          <Plus data-icon="inline-start" /> Nova compra
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova compra no {card.name}</DialogTitle>
          <DialogDescription>Parcelas vão automaticamente para as faturas certas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="p-desc" label="Descrição" error={errors.description}>
            <Input id="p-desc" value={f.description} onChange={set("description")} maxLength={140} placeholder="Ex.: Geladeira" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="p-total" label="Valor total (R$)" error={errors.total ?? errors.totalCents}>
              <Input id="p-total" value={f.total} onChange={set("total")} inputMode="decimal" placeholder="0,00" />
            </Field>
            <Field id="p-n" label="Parcelas" error={errors.installments}>
              <NativeSelect id="p-n" className="w-full" value={f.installments} onChange={set("installments")}>
                {Array.from({ length: 24 }, (_, i) => i + 1).map((i) => (
                  <NativeSelectOption key={i} value={String(i)}>
                    {i === 1 ? "À vista" : `${i}x`}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
          {parts && n > 1 && (
            <p className="-mt-2 text-xs text-muted-foreground">
              {parts[0] === parts[n - 1]
                ? `${n}x de ${formatBRL(parts[0])}`
                : `1ª de ${formatBRL(parts[0])} e as demais de ${formatBRL(parts[n - 1])}`}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field id="p-date" label="Data da compra" error={errors.purchasedOn}>
              <Input id="p-date" type="date" value={f.date} onChange={set("date")} />
            </Field>
            <Field id="p-cat" label="Categoria">
              <NativeSelect id="p-cat" className="w-full" value={f.categoryId} onChange={set("categoryId")}>
                <NativeSelectOption value="">Sem categoria</NativeSelectOption>
                {categoryOptions(categories, card.scope).map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <SubmitButton pending={pending}>Salvar compra</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePurchaseButton({ purchaseId, label }: { purchaseId: string; label: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Excluir compra ${label}`}>
          <Trash2 />
        </Button>
      }
      title="Excluir esta compra?"
      description="Todas as parcelas, em todas as faturas, são removidas. Não é possível se alguma fatura dela já tiver pagamento."
      confirmLabel="Excluir compra"
      destructive
      onConfirm={async () => {
        const r = await deletePurchase(purchaseId);
        if (!r.ok) return void toast.error(r.message);
        toast.success("Compra excluída");
      }}
    />
  );
}

// ------------------------------------------------------------------ Pagamento
export function PayDialog({
  statementId,
  remainingCents,
  accounts,
}: {
  statementId: string;
  remainingCents: number;
  accounts: EntryOptions["accounts"];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [f, setF] = useState({ accountId: "", amount: centsToInput(remainingCents), date: todayISO() });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = parseBRL(f.amount);
    if (!f.accountId) return setError("Escolha a conta de onde sai o dinheiro");
    if (!amountCents || amountCents <= 0 || amountCents > remainingCents) {
      return setError(`Valor entre R$ 0,01 e ${formatBRL(remainingCents)}`);
    }
    start(async () => {
      const r = await payStatement({ statementId, accountId: f.accountId, amountCents, paidOn: f.date, idempotencyKey: key });
      if (!r.ok) return void toast.error(r.message);
      toast.success(amountCents === remainingCents ? "Fatura paga" : "Pagamento parcial registrado");
      setOpen(false);
      setKey(crypto.randomUUID());
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setF((prev) => ({ ...prev, amount: centsToInput(remainingCents) }));
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          Pagar fatura
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagar fatura</DialogTitle>
          <DialogDescription>Falta pagar {formatBRL(remainingCents)}. Pode pagar só uma parte. Não conta como nova despesa.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="pay-acc" label="Pagar com a conta">
            <NativeSelect id="pay-acc" className="w-full" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
              <NativeSelectOption value="">Escolha…</NativeSelectOption>
              {accounts.map((a) => (
                <NativeSelectOption key={a.id} value={a.id}>
                  {a.name}
                  {a.scope === "shared" ? " (compartilhada)" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="pay-amount" label="Valor (R$)">
              <Input id="pay-amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" />
            </Field>
            <Field id="pay-date" label="Data">
              <Input id="pay-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </Field>
          </div>
          <FieldError id="pay-err" message={error} />
          <SubmitButton pending={pending}>Confirmar pagamento</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePaymentButton({ paymentId, label }: { paymentId: string; label: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-xs" aria-label={`Desfazer ${label}`}>
          <Trash2 />
        </Button>
      }
      title="Desfazer este pagamento?"
      description={`${label}. O valor volta para a conta e para o "falta pagar" da fatura.`}
      confirmLabel="Desfazer"
      destructive
      onConfirm={async () => {
        const r = await deletePayment(paymentId);
        if (!r.ok) return void toast.error(r.message);
        toast.success("Pagamento desfeito");
      }}
    />
  );
}
