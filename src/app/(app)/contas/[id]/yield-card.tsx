"use client";

import { useState, useTransition } from "react";
import { TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, SubmitButton } from "@/components/finance/form-bits";
import { saveTransaction } from "@/app/(app)/transacoes/actions";
import { todayISO } from "@/lib/dates";
import type { Account } from "@/lib/finance/types";
import { centsToInput, formatBRL, parseBRL } from "@/lib/money";

/** Estimativa de rendimento (calculada no servidor) + lançamento do valor real pago pelo banco. */
export function YieldCard({
  account,
  rateLabel,
  perDayCents,
  restOfMonthCents,
  daysLeft,
  yearCents,
  categoryId,
}: {
  account: Account;
  rateLabel: string;
  perDayCents: number;
  restOfMonthCents: number;
  daysLeft: number;
  yearCents: number;
  categoryId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [f, setF] = useState({ amount: centsToInput(perDayCents), date: todayISO() });
  const [error, setError] = useState<string>();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseBRL(f.amount);
    if (!cents || cents <= 0) return setError("Informe o valor que o banco pagou");
    start(async () => {
      const r = await saveTransaction({
        id: null,
        scope: account.scope,
        type: "income",
        amountCents: cents,
        description: `Rendimento ${account.name}`,
        categoryId,
        occurredOn: f.date,
        accountId: account.id,
        status: "paid",
        responsibleUserId: null,
        isFixed: false,
        notes: "",
        splits: [],
        idempotencyKey: key,
      });
      if (!r.ok) return void toast.error(r.message);
      toast.success(`Rendimento de ${formatBRL(cents)} lançado`);
      setOpen(false);
      setKey(crypto.randomUUID());
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="size-4 text-positive" /> Rendimento estimado
        </CardTitle>
        <CardDescription>
          {rateLabel}, só em dias úteis. Valor bruto (antes de IR), estimado sobre o saldo atual.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <dl className="grid gap-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Por dia útil</dt>
            <dd className="tabular font-medium text-positive">+ {formatBRL(perDayCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Até o fim do mês ({daysLeft} dias úteis)</dt>
            <dd className="tabular">+ {formatBRL(restOfMonthCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Em 12 meses</dt>
            <dd className="tabular">+ {formatBRL(yearCents)}</dd>
          </div>
        </dl>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            if (o) setF({ amount: centsToInput(perDayCents), date: todayISO() });
            setOpen(o);
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline">Lançar rendimento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Lançar rendimento</DialogTitle>
              <DialogDescription>Confira no app do banco quanto rendeu e ajuste o valor. Entra como receita paga nesta conta.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="grid gap-4" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <Field id="y-amount" label="Valor (R$)" error={error}>
                  <Input id="y-amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" />
                </Field>
                <Field id="y-date" label="Data">
                  <Input id="y-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
                </Field>
              </div>
              <SubmitButton pending={pending}>Lançar</SubmitButton>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
