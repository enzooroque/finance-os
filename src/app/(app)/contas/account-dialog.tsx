"use client";

import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ColorSwatches, FieldError, Segmented } from "@/components/finance/form-bits";
import { accountTypeLabel, type Account } from "@/lib/finance/types";
import { centsToInput, parseBRL } from "@/lib/money";
import { ACCOUNT_TYPES, SCOPES } from "@/lib/validation/finance";
import { saveAccount } from "./actions";

const form = z.object({
  scope: z.enum(SCOPES),
  name: z.string().trim().min(1, "Informe o nome").max(60),
  institution: z.string().trim().max(60),
  type: z.enum(ACCOUNT_TYPES),
  initialBalance: z.string().refine((s) => s.trim() === "" || parseBRL(s) !== null, "Valor inválido, ex.: 1.500,00"),
  color: z.string(),
  archived: z.boolean(),
  yieldMode: z.enum(["cdi", "fixed"]),
  yieldRate: z.string().refine((s) => s.trim() === "" || ((parseBRL(s) ?? -1) >= 0 && (parseBRL(s) ?? 0) <= 50000), "Valor inválido, ex.: 102 ou 10,40"),
});
type Form = z.infer<typeof form>;

export function AccountDialog({
  account,
  hasHousehold,
  defaultScope = "personal",
  children,
}: {
  account?: Account;
  hasHousehold: boolean;
  defaultScope?: "personal" | "shared";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Editar conta" : "Nova conta"}</DialogTitle>
          <DialogDescription>O saldo é calculado a partir do saldo inicial e dos lançamentos pagos.</DialogDescription>
        </DialogHeader>
        {open && (
          <AccountForm
            account={account}
            hasHousehold={hasHousehold}
            defaultScope={hasHousehold ? defaultScope : "personal"}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AccountForm({
  account,
  hasHousehold,
  defaultScope,
  onDone,
}: {
  account?: Account;
  hasHousehold: boolean;
  defaultScope: "personal" | "shared";
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(form),
    defaultValues: {
      scope: account?.scope ?? defaultScope,
      name: account?.name ?? "",
      institution: account?.institution ?? "",
      type: account?.type ?? "checking",
      initialBalance: account ? centsToInput(account.initialBalanceCents) : "",
      color: account?.color ?? "#7c5cff",
      archived: account?.archived ?? false,
      yieldMode: account?.yieldAnnualBp && !account.yieldCdiBp ? "fixed" : "cdi",
      yieldRate: account?.yieldCdiBp ? centsToInput(account.yieldCdiBp) : account?.yieldAnnualBp ? centsToInput(account.yieldAnnualBp) : "",
    },
  });

  const yieldMode = useWatch({ control, name: "yieldMode" });

  const onSubmit = (v: Form) =>
    startTransition(async () => {
      const result = await saveAccount({
        id: account?.id ?? null,
        scope: v.scope,
        name: v.name,
        institution: v.institution,
        type: v.type,
        initialBalanceCents: v.initialBalance.trim() ? parseBRL(v.initialBalance)! : 0,
        color: v.color,
        archived: v.archived,
        // "102" (% do CDI) vira 10200 e "10,40" (% a.a.) vira 1040 pontos-base, sem float.
        yieldCdiBp: v.yieldMode === "cdi" && v.yieldRate.trim() ? parseBRL(v.yieldRate) : null,
        yieldAnnualBp: v.yieldMode === "fixed" && v.yieldRate.trim() ? parseBRL(v.yieldRate) : null,
      });
      if (!result.ok) {
        if (result.fieldErrors?.name) setError("name", { message: result.fieldErrors.name[0] });
        toast.error(result.message);
        return;
      }
      toast.success(account ? "Conta atualizada" : "Conta criada");
      onDone();
    });

  return (
    <form onSubmit={handleSubmit(onSubmit, (errs) => toast.error(`Confira: ${Object.keys(errs).join(", ")}`))} className="grid gap-4" noValidate>
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
                onChange={field.onChange}
                disabled={!!account}
                options={[
                  { value: "personal", label: "Pessoal" },
                  { value: "shared", label: "Compartilhada" },
                ]}
              />
            )}
          />
          {account && <p className="text-xs text-muted-foreground">A titularidade não muda depois de criada.</p>}
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="acc-name">Nome</Label>
        <Input id="acc-name" placeholder="Ex.: Nubank" aria-invalid={!!errors.name} aria-describedby="acc-name-err" {...register("name")} />
        <FieldError id="acc-name-err" message={errors.name?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="acc-inst">Instituição</Label>
          <Input id="acc-inst" placeholder="Opcional" {...register("institution")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="acc-type">Tipo</Label>
          <NativeSelect id="acc-type" className="w-full" {...register("type")}>
            {ACCOUNT_TYPES.map((t) => (
              <NativeSelectOption key={t} value={t}>
                {accountTypeLabel[t]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="acc-initial">Saldo inicial (R$)</Label>
        <Input
          id="acc-initial"
          inputMode="decimal"
          placeholder="0,00"
          aria-invalid={!!errors.initialBalance}
          aria-describedby="acc-initial-err"
          {...register("initialBalance")}
        />
        <FieldError id="acc-initial-err" message={errors.initialBalance?.message} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="acc-yield">Rendimento (opcional)</Label>
        <Controller
          control={control}
          name="yieldMode"
          render={({ field }) => (
            <Segmented
              label="Tipo de rendimento"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "cdi", label: "% do CDI" },
                { value: "fixed", label: "% ao ano" },
              ]}
            />
          )}
        />
        <Input
          id="acc-yield"
          inputMode="decimal"
          placeholder={yieldMode === "cdi" ? "Ex.: 102" : "Ex.: 6,17"}
          aria-invalid={!!errors.yieldRate}
          aria-describedby="acc-yield-err"
          {...register("yieldRate")}
        />
        <FieldError id="acc-yield-err" message={errors.yieldRate?.message} />
        <p className="text-xs text-muted-foreground">
          {yieldMode === "cdi"
            ? "Como aparece no banco: \"102% do CDI\" → digite 102. O CDI do dia vem do Banco Central."
            : "Taxa fixa ao ano (ex.: poupança ≈ 6% a 7%). Deixe vazio se a conta não rende."}
        </p>
      </div>
      <Controller control={control} name="color" render={({ field }) => <ColorSwatches value={field.value} onChange={field.onChange} />} />
      {account && (
        <Controller
          control={control}
          name="archived"
          render={({ field }) => (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              Arquivada (some das listas, mas mantém o histórico)
            </label>
          )}
        />
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
