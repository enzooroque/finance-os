"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField, FormMessage } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import type { FormState } from "@/lib/validation/auth";
import { acceptInvite, changePassword, createHousehold, createInvite, updateProfile } from "./actions";

const AVATAR_COLORS = ["#7c5cff", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

/** Mostra um toast quando a ação termina com sucesso. */
function useSuccessToast(state: FormState) {
  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={pending} className="justify-self-start">
      {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
      {children}
    </Button>
  );
}

export function ProfileForm({ displayName, avatarColor }: { displayName: string; avatarColor: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, {});
  const [color, setColor] = useState(avatarColor);
  useSuccessToast(state);
  return (
    <form action={action} className="grid gap-4">
      <FormField label="Nome" name="displayName" defaultValue={displayName} maxLength={60} errors={state.fieldErrors?.displayName} />
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">Cor do avatar</legend>
        <input type="hidden" name="avatarColor" value={color} />
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={c === color}
              onClick={() => setColor(c)}
              className={cn(
                "grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-card transition",
                c === color && "ring-2 ring-foreground",
              )}
              style={{ backgroundColor: c }}
            >
              {c === color && <Check className="size-4 text-white" />}
            </button>
          ))}
        </div>
      </fieldset>
      <FormMessage message={state.ok ? undefined : state.message} />
      <Submit pending={pending}>Salvar perfil</Submit>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  const formRef = useRef<HTMLFormElement>(null);
  useSuccessToast(state);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="grid gap-4">
      <FormField label="Senha atual" name="currentPassword" type="password" autoComplete="current-password" errors={state.fieldErrors?.currentPassword} />
      <FormField label="Nova senha" name="newPassword" type="password" autoComplete="new-password" errors={state.fieldErrors?.newPassword} />
      <FormField label="Confirmar nova senha" name="confirmPassword" type="password" autoComplete="new-password" errors={state.fieldErrors?.confirmPassword} />
      <FormMessage message={state.ok ? undefined : state.message} />
      <Submit pending={pending}>Alterar senha</Submit>
    </form>
  );
}

export function CreateHouseholdForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createHousehold, {});
  useSuccessToast(state);
  return (
    <form action={action} className="grid gap-4">
      <FormField label="Nome do espaço" name="name" placeholder="Ex.: Nossa casa" maxLength={60} errors={state.fieldErrors?.name} />
      <FormMessage message={state.ok ? undefined : state.message} />
      <Submit pending={pending}>Criar espaço</Submit>
    </form>
  );
}

export function AcceptInviteForm({ readFromHash = false }: { readFromHash?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvite, {});
  const inputRef = useRef<HTMLInputElement>(null);
  useSuccessToast(state);
  useEffect(() => {
    // O código vem depois do "#" no link: essa parte nunca é enviada ao servidor pela URL.
    if (readFromHash && inputRef.current && window.location.hash.length > 1) {
      inputRef.current.value = window.location.hash.slice(1);
      history.replaceState(null, "", window.location.pathname);
    }
  }, [readFromHash]);
  return (
    <form action={action} className="grid gap-4">
      <FormField
        ref={inputRef}
        label="Código do convite"
        name="token"
        autoComplete="off"
        spellCheck={false}
        placeholder="Cole aqui o código recebido"
        errors={state.fieldErrors?.token}
      />
      <FormMessage message={state.message} ok={state.ok} />
      <Submit pending={pending}>Entrar no espaço</Submit>
    </form>
  );
}

export function InviteGenerator() {
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  function generate() {
    startTransition(async () => {
      const result = await createInvite();
      if (!result.token) {
        toast.error(result.message ?? "Não foi possível gerar o convite.");
        return;
      }
      setLink(`${window.location.origin}/convite#${result.token}`);
      toast.success("Convite gerado");
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  return (
    <div className="grid gap-3">
      {link ? (
        <>
          <Label htmlFor="invite-link">Envie este link para a outra pessoa</Label>
          <div className="flex gap-2">
            <Input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon-lg" onClick={copy} aria-label="Copiar link">
              <Copy />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Vale uma única vez, por 72 horas. Ele aparece só agora: gerar outro invalida este.
          </p>
        </>
      ) : null}
      <Button type="button" variant={link ? "outline" : "default"} onClick={generate} disabled={pending} className="justify-self-start">
        {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Link2 data-icon="inline-start" />}
        {link ? "Gerar novo convite" : "Gerar convite"}
      </Button>
    </div>
  );
}
